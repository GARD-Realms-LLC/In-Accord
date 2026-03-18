import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, member, MemberRole, message } from "@/lib/db";
import { computeChannelPermissionForMember, resolveMemberContext } from "@/lib/channel-permissions";
import { emitChannelWebhookEvent, getChannelFeatureSettings } from "@/lib/channel-feature-settings";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { parseMentionSegments } from "@/lib/mentions";
import { publishRealtimeEvent } from "@/lib/realtime-events-server";
import {
  REALTIME_CHANNEL_MESSAGE_DELETED_EVENT,
  REALTIME_CHANNEL_MESSAGE_UPDATED_EVENT,
} from "@/lib/realtime-events";

type RouteParams = { messageId: string };

const resolveIds = (req: Request) => {
  const { searchParams } = new URL(req.url);
  return {
    serverId: searchParams.get("serverId")?.trim() ?? "",
    channelId: searchParams.get("channelId")?.trim() ?? "",
  };
};

const sanitizeRoleMentions = async (content: string, serverId: string) => {
  if (!content) {
    return content;
  }

  const segments = parseMentionSegments(content);
  const roleMentionIds = Array.from(
    new Set(
      segments
        .filter((segment) => segment.kind === "mention" && segment.entityType === "role")
        .map((segment) => (segment.kind === "mention" ? String(segment.entityId ?? "").trim() : ""))
        .filter(Boolean)
    )
  );

  if (!roleMentionIds.length) {
    return content;
  }

  const mentionableRoleRows = await db.execute(sql`
    select "id"
    from "ServerRole"
    where "serverId" = ${serverId}
      and "isMentionable" = true
      and "id" in (${sql.join(roleMentionIds.map((id) => sql`${id}`), sql`, `)})
  `);

  const mentionableRoleIds = new Set(
    ((mentionableRoleRows as unknown as { rows?: Array<{ id: string }> }).rows ?? [])
      .map((row) => String(row.id ?? "").trim())
      .filter(Boolean)
  );

  return segments
    .map((segment) => {
      if (segment.kind === "text") {
        return segment.value;
      }

      if (segment.entityType === "role" && !mentionableRoleIds.has(String(segment.entityId ?? "").trim())) {
        return `@${segment.label}`;
      }

      return segment.raw;
    })
    .join("");
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const applyBlockedWordModeration = ({
  content,
  blockedWords,
  action,
}: {
  content: string;
  blockedWords: string[];
  action: "warn" | "block";
}) => {
  let nextContent = content;
  const matchedWords = blockedWords.filter((word) => {
    const normalized = String(word ?? "").trim();
    if (!normalized) {
      return false;
    }

    return new RegExp(escapeRegExp(normalized), "i").test(content);
  });

  if (matchedWords.length === 0) {
    return { nextContent, matchedWords };
  }

  if (action === "warn") {
    for (const word of matchedWords) {
      nextContent = nextContent.replace(new RegExp(escapeRegExp(word), "gi"), "[blocked]");
    }
  }

  return { nextContent, matchedWords };
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { messageId } = await params;
    const { serverId, channelId } = resolveIds(req);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!messageId) {
      return new NextResponse("Message ID missing", { status: 400 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    if (!content) {
      return new NextResponse("Content is required", { status: 400 });
    }

    const currentMember = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
    });

    if (!currentMember) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const currentChannel = await db.query.channel.findFirst({
      where: and(eq(channel.id, channelId), eq(channel.serverId, serverId)),
    });

    if (!currentChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    const memberContext = await resolveMemberContext({
      profileId: profile.id,
      serverId,
    });

    if (!memberContext) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const permissions = await computeChannelPermissionForMember({
      serverId,
      channelId,
      memberContext,
    });

    if (!permissions.allowView) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const currentMessage = await db.query.message.findFirst({
      where: and(eq(message.id, messageId), eq(message.channelId, channelId)),
    });

    if (!currentMessage) {
      return new NextResponse("Message not found", { status: 404 });
    }

    if (currentMessage.memberId !== currentMember.id) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    if (currentMessage.deleted) {
      return new NextResponse("Message is already deleted", { status: 400 });
    }

    if (currentMessage.fileUrl) {
      return new NextResponse("Attachment messages cannot be edited", { status: 400 });
    }

    const featureSettings = await getChannelFeatureSettings({ serverId, channelId });

    if (featureSettings.moderation.requireVerifiedEmail && !String(profile.email ?? "").trim()) {
      return new NextResponse("This channel requires an account email before you can participate.", { status: 403 });
    }

    const sanitizedContent = await sanitizeRoleMentions(content, serverId);
    const moderated = applyBlockedWordModeration({
      content: sanitizedContent,
      blockedWords: featureSettings.moderation.blockedWords,
      action: featureSettings.moderation.flaggedWordsAction,
    });

    if (moderated.matchedWords.length > 0 && featureSettings.moderation.flaggedWordsAction === "block") {
      return new NextResponse("This message contains blocked words for this channel.", { status: 400 });
    }

    if (!moderated.nextContent) {
      return new NextResponse("Content is required", { status: 400 });
    }

    const now = new Date();

    const updated = await db
      .update(message)
      .set({
        content: moderated.nextContent,
        updatedAt: now,
      })
      .where(and(eq(message.id, messageId), eq(message.channelId, channelId)))
      .returning();

    await publishRealtimeEvent(
      REALTIME_CHANNEL_MESSAGE_UPDATED_EVENT,
      {
        serverId,
        channelId,
        threadId: currentMessage.threadId,
      },
      {
        entity: "message",
        action: "updated",
        message: {
          id: updated[0]?.id ?? messageId,
          content: updated[0]?.content ?? moderated.nextContent,
          fileUrl: updated[0]?.fileUrl ?? currentMessage.fileUrl ?? null,
          deleted: Boolean(updated[0]?.deleted),
          isUpdated: true,
        },
      }
    );

    await emitChannelWebhookEvent({
      serverId,
      channelId,
      channelName: currentChannel.name,
      eventType: "MESSAGE_UPDATED",
      actorProfileId: profile.id,
      payload: {
        messageId,
        content: moderated.nextContent,
        blockedWordMatches: moderated.matchedWords,
        threadId: currentMessage.threadId,
      },
    });

    return NextResponse.json(updated[0] ?? null);
  } catch (error) {
    console.error("[SOCKET_MESSAGES_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { messageId } = await params;
    const { serverId, channelId } = resolveIds(req);

    if (!messageId) {
      return new NextResponse("Message ID missing", { status: 400 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    const currentMember = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
    });

    if (!currentMember) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const currentChannel = await db.query.channel.findFirst({
      where: and(eq(channel.id, channelId), eq(channel.serverId, serverId)),
    });

    if (!currentChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    const memberContext = await resolveMemberContext({
      profileId: profile.id,
      serverId,
    });

    if (!memberContext) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const permissions = await computeChannelPermissionForMember({
      serverId,
      channelId,
      memberContext,
    });

    if (!permissions.allowView) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const currentMessage = await db.query.message.findFirst({
      where: and(eq(message.id, messageId), eq(message.channelId, channelId)),
    });

    if (!currentMessage) {
      return new NextResponse("Message not found", { status: 404 });
    }

    const isOwner = currentMessage.memberId === currentMember.id;
    const isServerOwner = Boolean(memberContext.isServerOwner);
    const isAdministrator = currentMember.role === MemberRole.ADMIN;
    const isInAccordStaff = hasInAccordAdministrativeAccess(profile.role);
    const canModerate = isServerOwner || isAdministrator || currentMember.role === MemberRole.MODERATOR || isInAccordStaff;

    if (!isOwner && !canModerate) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    if (currentMessage.deleted && (isServerOwner || isAdministrator || isInAccordStaff)) {
      const threadStarterRow = await db.execute(sql`
        select "id"
        from "ChannelThread"
        where "sourceMessageId" = ${messageId}
        limit 1
      `);

      const starterThreadId = String(
        (threadStarterRow as unknown as { rows?: Array<{ id: string | null }> }).rows?.[0]?.id ?? ""
      ).trim();

      if (starterThreadId) {
        const replyRows = await db.execute(sql`
          select "id"
          from "Message"
          where "threadId" = ${starterThreadId}
        `);

        const replyIds = ((replyRows as unknown as { rows?: Array<{ id: string | null }> }).rows ?? [])
          .map((row) => String(row.id ?? "").trim())
          .filter(Boolean);

        if (replyIds.length) {
          await db.execute(sql`
            delete from "MessageReaction"
            where "messageId" in (${sql.join(replyIds.map((id) => sql`${id}`), sql`, `)})
          `);

          await db
            .delete(message)
            .where(sql`${message.id} in (${sql.join(replyIds.map((id) => sql`${id}`), sql`, `)})`);
        }

        await db.execute(sql`
          delete from "ThreadReadState"
          where "threadId" = ${starterThreadId}
        `);

        await db.execute(sql`
          delete from "ChannelThread"
          where "id" = ${starterThreadId}
        `);
      }

      await db.execute(sql`
        delete from "MessageReaction"
        where "messageId" = ${messageId}
      `);

      await db
        .delete(message)
        .where(and(eq(message.id, messageId), eq(message.channelId, channelId)));

      await publishRealtimeEvent(
        REALTIME_CHANNEL_MESSAGE_DELETED_EVENT,
        {
          serverId,
          channelId,
          threadId: currentMessage.threadId,
        },
        {
          entity: "message",
          action: "deleted",
          hardDelete: true,
          messageId,
        }
      );

      await emitChannelWebhookEvent({
        serverId,
        channelId,
        channelName: currentChannel.name,
        eventType: "MESSAGE_DELETED",
        actorProfileId: profile.id,
        payload: {
          messageId,
          hardDeleted: true,
          threadId: currentMessage.threadId,
        },
      });

      return NextResponse.json({ ok: true, hardDeleted: true });
    }

    const now = new Date();

    const updated = await db
      .update(message)
      .set({
        content: "This message has been deleted.",
        fileUrl: null,
        deleted: true,
        updatedAt: now,
      })
      .where(and(eq(message.id, messageId), eq(message.channelId, channelId)))
      .returning();

    await publishRealtimeEvent(
      REALTIME_CHANNEL_MESSAGE_DELETED_EVENT,
      {
        serverId,
        channelId,
        threadId: currentMessage.threadId,
      },
      {
        entity: "message",
        action: "deleted",
        hardDelete: false,
        message: {
          id: updated[0]?.id ?? messageId,
          content: updated[0]?.content ?? "This message has been deleted.",
          fileUrl: null,
          deleted: true,
          isUpdated: true,
        },
      }
    );

    await emitChannelWebhookEvent({
      serverId,
      channelId,
      channelName: currentChannel.name,
      eventType: "MESSAGE_DELETED",
      actorProfileId: profile.id,
      payload: {
        messageId,
        hardDeleted: false,
        threadId: currentMessage.threadId,
      },
    });

    return NextResponse.json(updated[0] ?? null);
  } catch (error) {
    console.error("[SOCKET_MESSAGES_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
