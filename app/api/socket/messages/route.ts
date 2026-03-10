import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, member, message } from "@/lib/db";
import { ensureChannelThreadSchema, markThreadRead, touchThreadActivity } from "@/lib/channel-threads";
import { computeChannelPermissionForRole } from "@/lib/channel-permissions";
import { executeServerSlashCommand } from "@/lib/slash-commands";
import { parseMentionSegments } from "@/lib/mentions";

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

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();
    const { content, fileUrl } = await req.json();
    const { searchParams } = new URL(req.url);

    const serverId = searchParams.get("serverId");
    const channelId = searchParams.get("channelId");
    const threadId = searchParams.get("threadId");

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    const normalizedThreadId = typeof threadId === "string" && threadId.trim().length > 0
      ? threadId.trim()
      : null;

    const currentMember = await db.query.member.findFirst({
      where: and(
        eq(member.serverId, serverId),
        eq(member.profileId, profile.id)
      ),
    });

    if (!currentMember) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const currentChannel = await db.query.channel.findFirst({
      where: and(
        eq(channel.id, channelId),
        eq(channel.serverId, serverId)
      ),
    });

    if (!currentChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    const permissions = await computeChannelPermissionForRole({
      serverId,
      channelId,
      role: currentMember.role,
      isServerOwner: profile.id === currentChannel.profileId,
    });

    if (!permissions.allowView) {
      return new NextResponse("You cannot view this channel", { status: 403 });
    }

    if (!permissions.allowSend) {
      return new NextResponse("You cannot send messages in this channel", { status: 403 });
    }

    if (normalizedThreadId) {
      await ensureChannelThreadSchema();

      const threadResult = await db.execute(sql`
        select "id", "archived"
        from "ChannelThread"
        where "id" = ${normalizedThreadId}
          and "channelId" = ${currentChannel.id}
          and "serverId" = ${serverId}
        limit 1
      `);

      const threadRow = (threadResult as unknown as {
        rows?: Array<{ id: string; archived: boolean }>;
      }).rows?.[0];

      if (!threadRow) {
        return new NextResponse("Thread not found", { status: 404 });
      }

      if (threadRow.archived) {
        return new NextResponse("Thread is archived", { status: 400 });
      }
    }

    const normalizedContent = typeof content === "string" ? content.trim() : "";
    const sanitizedContent = normalizedContent
      ? await sanitizeRoleMentions(normalizedContent, serverId)
      : normalizedContent;

    if (!sanitizedContent && !fileUrl) {
      return new NextResponse("Content is required", { status: 400 });
    }

    const now = new Date();

    const inserted = await db
      .insert(message)
      .values({
        id: uuidv4(),
        content: sanitizedContent || "[attachment]",
        fileUrl: fileUrl ?? null,
        memberId: currentMember.id,
        channelId: currentChannel.id,
        threadId: normalizedThreadId,
        deleted: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (sanitizedContent.startsWith("/") && !fileUrl) {
      const commandResult = await executeServerSlashCommand({
        serverId,
        rawInput: sanitizedContent,
      });

      if (commandResult.handled) {
        const responderMemberId =
          typeof commandResult.responseMemberId === "string" && commandResult.responseMemberId.trim().length > 0
            ? commandResult.responseMemberId.trim()
            : currentMember.id;

        const responderMembership = await db.query.member.findFirst({
          where: and(eq(member.id, responderMemberId), eq(member.serverId, serverId)),
        });

        await db.insert(message).values({
          id: uuidv4(),
          content: commandResult.responseContent,
          fileUrl: null,
          memberId: responderMembership?.id ?? currentMember.id,
          channelId: currentChannel.id,
          threadId: normalizedThreadId,
          deleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    if (normalizedThreadId) {
      await touchThreadActivity({
        threadId: normalizedThreadId,
      });

      await markThreadRead({
        threadId: normalizedThreadId,
        profileId: profile.id,
      });
    }

    return NextResponse.json(inserted[0]);
  } catch (error) {
    console.error("[SOCKET_MESSAGES_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
