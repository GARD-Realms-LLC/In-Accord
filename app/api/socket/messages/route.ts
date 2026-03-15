import { NextResponse } from "next/server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, member, message } from "@/lib/db";
import { ensureChannelThreadSchema, markThreadRead, touchThreadActivity } from "@/lib/channel-threads";
import { computeChannelPermissionForRole } from "@/lib/channel-permissions";
import { executeServerSlashCommand } from "@/lib/slash-commands";
import { parseMentionSegments } from "@/lib/mentions";
import { publishRealtimeEvent, publishRealtimeRefresh } from "@/lib/realtime-events-server";
import { getUserProfileNameMap } from "@/lib/user-profile";
import { listThreadsForMessages } from "@/lib/channel-threads";

const CHANNEL_MESSAGE_CREATED_EVENT = "inaccord:message-created";

const formatTimestamp = (value: Date | string) => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
};

const normalizeIsoDate = (value: Date | string | null | undefined) => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(value ?? 0).toISOString();
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

const serializeChannelMessage = async (item: {
  id: string;
  content: string;
  fileUrl: string | null;
  deleted: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  member?: {
    id?: string;
    profileId?: string;
    role?: string | null;
    profile?: {
      id?: string;
      userId?: string | null;
      name?: string | null;
      email?: string | null;
      imageUrl?: string | null;
      createdAt?: Date | string | null;
      updatedAt?: Date | string | null;
    } | null;
  } | null;
}) => {
  const fallbackProfileId = item.member?.profileId ?? `missing-member-${item.id}`;
  const profileNameMap = await getUserProfileNameMap([fallbackProfileId]);
  const profileRoleRows = fallbackProfileId
    ? await db.execute(sql`
        select "userId", "role"
        from "Users"
        where "userId" = ${fallbackProfileId}
        limit 1
      `)
    : { rows: [] };

  const profileRole = ((profileRoleRows as unknown as {
    rows?: Array<{ userId: string; role: string | null }>;
  }).rows ?? [])[0]?.role ?? null;
  const sourceProfile = item.member?.profile;

  return {
    id: item.id,
    content: item.content,
    fileUrl: item.fileUrl,
    deleted: item.deleted,
    timestamp: formatTimestamp(item.createdAt),
    isUpdated: new Date(item.updatedAt).getTime() !== new Date(item.createdAt).getTime(),
    member: {
      ...(item.member ?? {}),
      id: item.member?.id ?? `missing-member-${item.id}`,
      profileId: item.member?.profileId ?? fallbackProfileId,
      role: item.member?.role ?? "GUEST",
      profile: {
        id: sourceProfile?.id ?? fallbackProfileId,
        userId: sourceProfile?.userId ?? sourceProfile?.id ?? fallbackProfileId,
        name: profileNameMap.get(fallbackProfileId) ?? sourceProfile?.name ?? sourceProfile?.email ?? "Deleted User",
        imageUrl: sourceProfile?.imageUrl ?? "/in-accord-steampunk-logo.png",
        email: sourceProfile?.email ?? "",
        role: profileRole,
        createdAt: normalizeIsoDate(sourceProfile?.createdAt),
        updatedAt: normalizeIsoDate(sourceProfile?.updatedAt),
      },
    },
  };
};

const getSerializedChannelMessageById = async (messageId: string) => {
  const row = await db.query.message.findFirst({
    where: eq(message.id, messageId),
    with: {
      member: {
        with: {
          profile: true,
        },
      },
    },
  });

  if (!row) {
    return null;
  }

  return serializeChannelMessage(row);
};

export async function GET(req: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const serverId = String(searchParams.get("serverId") ?? "").trim();
    const channelId = String(searchParams.get("channelId") ?? "").trim();
    const threadId = String(searchParams.get("threadId") ?? "").trim() || null;

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

    const permissions = await computeChannelPermissionForRole({
      serverId,
      channelId,
      role: currentMember.role,
      isServerOwner: profile.id === currentChannel.profileId,
    });

    if (!permissions.allowView) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const rows = await db.query.message.findMany({
      where: threadId
        ? and(eq(message.channelId, channelId), eq(message.threadId, threadId))
        : and(eq(message.channelId, channelId), isNull(message.threadId)),
      orderBy: [asc(message.createdAt)],
      with: {
        member: {
          with: {
            profile: true,
          },
        },
      },
    });

    if (threadId) {
      await markThreadRead({ threadId, profileId: profile.id });
    }

    const reactionRows = rows.length
      ? await db.execute(sql`
          select "messageId", "emoji", "count"
          from "MessageReaction"
          where "scope" = 'channel'
            and "messageId" in (${sql.join(rows.map((item) => sql`${item.id}`), sql`, `)})
        `)
      : { rows: [] };

    const reactionsByMessageId: Record<string, Array<{ emoji: string; count: number }>> = {};
    for (const row of ((reactionRows as unknown as {
      rows?: Array<{ messageId: string; emoji: string; count: number }>;
    }).rows ?? [])) {
      const key = String(row.messageId ?? "").trim();
      if (!key) {
        continue;
      }

      const bucket = reactionsByMessageId[key] ?? [];
      bucket.push({ emoji: row.emoji, count: Number(row.count ?? 0) });
      reactionsByMessageId[key] = bucket;
    }

    const messageProfileIds = rows
      .map((item) => item.member?.profileId)
      .filter((value): value is string => Boolean(value));
    const profileNameMap = await getUserProfileNameMap(messageProfileIds);
    const uniqueMessageProfileIds = Array.from(new Set(messageProfileIds));

    const profileRoleRows = uniqueMessageProfileIds.length
      ? await db.execute(sql`
          select "userId", "role"
          from "Users"
          where "userId" in (${sql.join(uniqueMessageProfileIds.map((id) => sql`${id}`), sql`, `)})
        `)
      : { rows: [] };

    const profileRoleMap = new Map<string, string | null>(
      ((profileRoleRows as unknown as {
        rows?: Array<{ userId: string; role: string | null }>;
      }).rows ?? []).map((row) => [row.userId, row.role ?? null])
    );

    const hydratedMessages = rows.map((item) => {
      const fallbackProfileId = item.member?.profileId ?? `missing-member-${item.id}`;
      const profileName = profileNameMap.get(fallbackProfileId);
      const sourceProfile = item.member?.profile;

      return {
        id: item.id,
        content: item.content,
        fileUrl: item.fileUrl,
        deleted: item.deleted,
        timestamp: formatTimestamp(item.createdAt),
        isUpdated: new Date(item.updatedAt).getTime() !== new Date(item.createdAt).getTime(),
        member: {
          ...(item.member ?? {}),
          id: item.member?.id ?? `missing-member-${item.id}`,
          profileId: item.member?.profileId ?? fallbackProfileId,
          role: item.member?.role ?? "GUEST",
          profile: {
            id: sourceProfile?.id ?? fallbackProfileId,
            userId: sourceProfile?.userId ?? sourceProfile?.id ?? fallbackProfileId,
            name: profileName ?? sourceProfile?.name ?? sourceProfile?.email ?? "Deleted User",
            imageUrl: sourceProfile?.imageUrl ?? "/in-accord-steampunk-logo.png",
            email: sourceProfile?.email ?? "",
            role: profileRoleMap.get(fallbackProfileId) ?? null,
            createdAt: (sourceProfile?.createdAt ?? new Date(0)).toISOString(),
            updatedAt: (sourceProfile?.updatedAt ?? new Date(0)).toISOString(),
          },
        },
      };
    });

    const threadsBySourceMessageId = threadId
      ? {}
      : Object.fromEntries(
          Array.from(
            (await listThreadsForMessages({
              serverId,
              channelId,
              sourceMessageIds: hydratedMessages.map((item) => item.id),
              viewerProfileId: profile.id,
            })).entries()
          ).map(([key, value]) => [
            key,
            value
              ? {
                  id: value.id,
                  title: value.title,
                  replyCount: value.replyCount,
                  archived: value.archived,
                  participantCount: value.participantCount,
                  unreadCount: value.unreadCount,
                }
              : null,
          ])
        );

    return NextResponse.json({
      messages: hydratedMessages,
      reactionsByMessageId,
      threadsBySourceMessageId,
    });
  } catch (error) {
    console.error("[SOCKET_MESSAGES_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

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

    const createMessage = async ({
      content,
      fileUrl,
      memberId,
    }: {
      content: string;
      fileUrl: string | null;
      memberId: string;
    }) => {
      const now = new Date();
      const insertedRows = await db
        .insert(message)
        .values({
          id: uuidv4(),
          content,
          fileUrl,
          memberId,
          channelId: currentChannel.id,
          threadId: normalizedThreadId,
          deleted: false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return insertedRows[0];
    };

    const isSlashCommandInput = sanitizedContent.startsWith("/") && !fileUrl;

    if (isSlashCommandInput) {
      const commandResult = await executeServerSlashCommand({
        serverId,
        rawInput: sanitizedContent,
        channelId: currentChannel.id,
        actorProfileId: profile.id,
      });

      if (commandResult.handled) {
        const responderMemberId =
          typeof commandResult.responseMemberId === "string" && commandResult.responseMemberId.trim().length > 0
            ? commandResult.responseMemberId.trim()
            : currentMember.id;

        const responderMembership = await db.query.member.findFirst({
          where: and(eq(member.id, responderMemberId), eq(member.serverId, serverId)),
        });

        const insertedResponse = await createMessage({
          content: commandResult.responseContent,
          fileUrl: null,
          memberId: responderMembership?.id ?? currentMember.id,
        });

        if (normalizedThreadId) {
          await touchThreadActivity({
            threadId: normalizedThreadId,
          });

          await markThreadRead({
            threadId: normalizedThreadId,
            profileId: profile.id,
          });
        }

        await publishRealtimeRefresh(
          {
            serverId,
            channelId: currentChannel.id,
            threadId: normalizedThreadId,
          },
          { entity: "message", action: "created" }
        );

        return NextResponse.json(insertedResponse);
      }
    }

    const inserted = await createMessage({
      content: sanitizedContent || "[attachment]",
      fileUrl: fileUrl ?? null,
      memberId: currentMember.id,
    });

    if (sanitizedContent.startsWith("/") && !fileUrl) {
      const commandResult = await executeServerSlashCommand({
        serverId,
        rawInput: sanitizedContent,
        channelId: currentChannel.id,
        actorProfileId: profile.id,
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

    try {
      const serializedInserted = await getSerializedChannelMessageById(inserted.id);

      if (serializedInserted) {
        await publishRealtimeEvent(
          CHANNEL_MESSAGE_CREATED_EVENT,
          {
            serverId,
            channelId: currentChannel.id,
            threadId: normalizedThreadId,
          },
          {
            entity: "message",
            action: "created",
            message: serializedInserted,
            thread: normalizedThreadId
              ? {
                  id: normalizedThreadId,
                }
              : null,
          }
        );
      } else {
        await publishRealtimeRefresh(
          {
            serverId,
            channelId: currentChannel.id,
            threadId: normalizedThreadId,
          },
          { entity: "message", action: "created" }
        );
      }
    } catch (realtimeError) {
      console.error("[SOCKET_MESSAGES_POST_REALTIME]", realtimeError);
      await publishRealtimeRefresh(
        {
          serverId,
          channelId: currentChannel.id,
          threadId: normalizedThreadId,
        },
        { entity: "message", action: "created" }
      );
    }

    return NextResponse.json(inserted);
  } catch (error) {
    console.error("[SOCKET_MESSAGES_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
