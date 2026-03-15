import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, member, MemberRole, message, server } from "@/lib/db";
import { computeChannelPermissionForRole, resolveMemberContext } from "@/lib/channel-permissions";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { parseMentionSegments } from "@/lib/mentions";
import { publishRealtimeRefresh } from "@/lib/realtime-events-server";

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

    const sanitizedContent = await sanitizeRoleMentions(content, serverId);

    if (!sanitizedContent) {
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

    const permissions = await computeChannelPermissionForRole({
      serverId,
      channelId,
      role: currentMember.role,
      isServerOwner: memberContext?.isServerOwner ?? false,
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
    if (!isOwner) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    if (currentMessage.deleted) {
      return new NextResponse("Message is already deleted", { status: 400 });
    }

    if (currentMessage.fileUrl) {
      return new NextResponse("Attachment messages cannot be edited", { status: 400 });
    }

    const now = new Date();

    const updated = await db
      .update(message)
      .set({
        content: sanitizedContent,
        updatedAt: now,
      })
      .where(and(eq(message.id, messageId), eq(message.channelId, channelId)))
      .returning();

    await publishRealtimeRefresh(
      {
        serverId,
        channelId,
        threadId: currentMessage.threadId,
      },
      { entity: "message", action: "updated" }
    );

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

    const permissions = await computeChannelPermissionForRole({
      serverId,
      channelId,
      role: currentMember.role,
      isServerOwner: memberContext?.isServerOwner ?? false,
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
    const isServerOwner = Boolean(memberContext?.isServerOwner);
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

      await publishRealtimeRefresh(
        {
          serverId,
          channelId,
          threadId: currentMessage.threadId,
        },
        { entity: "message", action: "deleted" }
      );

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

    await publishRealtimeRefresh(
      {
        serverId,
        channelId,
        threadId: currentMessage.threadId,
      },
      { entity: "message", action: "deleted" }
    );

    return NextResponse.json(updated[0] ?? null);
  } catch (error) {
    console.error("[SOCKET_MESSAGES_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
