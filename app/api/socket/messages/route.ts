import { NextResponse } from "next/server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { currentProfile } from "@/lib/current-profile";
import { channel, ChannelType, db, member, MemberRole, message, server } from "@/lib/db";
import { ensureChannelThreadSchema, markThreadRead, touchThreadActivity } from "@/lib/channel-threads";
import { markChannelRead } from "@/lib/channel-read-state";
import {
  createDefaultServerCountingState,
  getServerCountingSnapshot,
  saveServerCountingSnapshot,
  type ServerCountingState,
} from "@/lib/server-counting";
import { computeChannelPermissionForMember, resolveMemberContext } from "@/lib/channel-permissions";
import { emitChannelWebhookEvent, getChannelFeatureSettings } from "@/lib/channel-feature-settings";
import { addMessageReaction, ensureMessageReactionSchema } from "@/lib/message-reactions";
import { executeServerSlashCommand } from "@/lib/slash-commands";
import { parseMentionSegments } from "@/lib/mentions";
import { publishRealtimeEvent } from "@/lib/realtime-events-server";
import {
  REALTIME_CHANNEL_MESSAGE_CREATED_EVENT,
} from "@/lib/realtime-events";
import { getUserProfileNameMap } from "@/lib/user-profile";
import { listThreadsForMessages } from "@/lib/channel-threads";

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

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const countingIntegerPattern = /^\d+$/;

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

const buildCountingFailureMessage = ({
  actorProfileId,
  actorLabel,
  expectedNumber,
  submittedNumber,
  resetNumber,
  sameUserViolation,
}: {
  actorProfileId: string;
  actorLabel: string;
  expectedNumber: number;
  submittedNumber: number;
  resetNumber: number;
  sameUserViolation: boolean;
}) => {
  const safeLabel = actorLabel.replace(/[\[\]\(\)]/g, "").trim() || "That member";
  const mention = `@[${safeLabel}](user:${actorProfileId})`;

  if (sameUserViolation) {
    return `${mention} broke the count by going twice in a row. The next number is ${resetNumber}.`;
  }

  return `${mention} broke the count. Expected ${expectedNumber}, got ${submittedNumber}. The next number is ${resetNumber}.`;
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

const getSerializedChannelMessageByIdFromD1 = async (messageId: string) => {
  const normalizedMessageId = String(messageId ?? "").trim();
  if (!normalizedMessageId) {
    return null;
  }

  const result = await db.execute(sql`
    select
      msg."id" as "id",
      msg."content" as "content",
      msg."fileUrl" as "fileUrl",
      msg."deleted" as "deleted",
      msg."createdAt" as "createdAt",
      msg."updatedAt" as "updatedAt",
      m."id" as "memberId",
      m."profileId" as "memberProfileId",
      m."role" as "memberRole",
      u."userId" as "profileUserId",
      u."name" as "profileName",
      u."email" as "profileEmail",
      coalesce(u."avatarUrl", u."avatar", u."icon") as "profileImageUrl",
      u."account.created" as "profileCreatedAt",
      u."lastLogin" as "profileUpdatedAt"
    from "Message" msg
    left join "Member" m on m."id" = msg."memberId"
    left join "Users" u on u."userId" = m."profileId"
    where msg."id" = ${normalizedMessageId}
    limit 1
  `);

  const row = ((result as unknown as {
    rows?: Array<{
      id: string | null;
      content: string | null;
      fileUrl: string | null;
      deleted: boolean | null;
      createdAt: Date | string;
      updatedAt: Date | string;
      memberId: string | null;
      memberProfileId: string | null;
      memberRole: string | null;
      profileUserId: string | null;
      profileName: string | null;
      profileEmail: string | null;
      profileImageUrl: string | null;
      profileCreatedAt: Date | string | null;
      profileUpdatedAt: Date | string | null;
    }>;
  }).rows ?? [])[0];

  if (!row?.id) {
    return null;
  }

  return serializeChannelMessage({
    id: String(row.id).trim(),
    content: String(row.content ?? ""),
    fileUrl: typeof row.fileUrl === "string" ? row.fileUrl : null,
    deleted: Boolean(row.deleted),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    member: row.memberId
      ? {
          id: String(row.memberId).trim(),
          profileId: String(row.memberProfileId ?? "").trim(),
          role: String(row.memberRole ?? "").trim() || MemberRole.GUEST,
          profile: {
            id: String(row.memberProfileId ?? row.profileUserId ?? "").trim(),
            userId: String(row.profileUserId ?? row.memberProfileId ?? "").trim(),
            name: String(row.profileName ?? row.profileEmail ?? "Deleted User").trim() || "Deleted User",
            email: String(row.profileEmail ?? "").trim(),
            imageUrl: String(row.profileImageUrl ?? "/in-accord-steampunk-logo.png").trim() || "/in-accord-steampunk-logo.png",
            createdAt: row.profileCreatedAt,
            updatedAt: row.profileUpdatedAt,
          },
        }
      : null,
  });
};

export async function GET(req: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const legacyProfile = profile as NonNullable<typeof profile>;
    const legacyProfileId = String(legacyProfile.id ?? "").trim();
    const legacyProfileRole = legacyProfile.role;
    const legacyProfileEmail = String(legacyProfile.email ?? "").trim();
    const legacyProfileName = String(legacyProfile.name ?? "").trim();

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

    const memberContext = await resolveMemberContext({ profileId: profile.id, serverId });

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

    const messageRows = await db.execute(
      threadId
        ? sql`
            select
              msg."id" as "id",
              msg."content" as "content",
              msg."fileUrl" as "fileUrl",
              msg."deleted" as "deleted",
              msg."createdAt" as "createdAt",
              msg."updatedAt" as "updatedAt",
              m."id" as "memberId",
              m."profileId" as "memberProfileId",
              m."role" as "memberRole",
              u."userId" as "profileUserId",
              u."name" as "profileName",
              u."email" as "profileEmail",
              coalesce(u."avatarUrl", u."avatar", u."icon") as "profileImageUrl",
              u.[account.created] as "profileCreatedAt",
              u."lastLogin" as "profileUpdatedAt",
              u."role" as "profileRole"
            from "Message" msg
            left join "Member" m on m."id" = msg."memberId"
            left join "Users" u on u."userId" = m."profileId"
            where msg."channelId" = ${channelId}
              and msg."threadId" = ${threadId}
            order by msg."createdAt" asc
          `
        : sql`
            select
              msg."id" as "id",
              msg."content" as "content",
              msg."fileUrl" as "fileUrl",
              msg."deleted" as "deleted",
              msg."createdAt" as "createdAt",
              msg."updatedAt" as "updatedAt",
              m."id" as "memberId",
              m."profileId" as "memberProfileId",
              m."role" as "memberRole",
              u."userId" as "profileUserId",
              u."name" as "profileName",
              u."email" as "profileEmail",
              coalesce(u."avatarUrl", u."avatar", u."icon") as "profileImageUrl",
              u.[account.created] as "profileCreatedAt",
              u."lastLogin" as "profileUpdatedAt",
              u."role" as "profileRole"
            from "Message" msg
            left join "Member" m on m."id" = msg."memberId"
            left join "Users" u on u."userId" = m."profileId"
            where msg."channelId" = ${channelId}
              and msg."threadId" is null
            order by msg."createdAt" asc
          `
    );

    const rows = ((messageRows as unknown as {
      rows?: Array<{
        id: string;
        content: string | null;
        fileUrl: string | null;
        deleted: boolean | null;
        createdAt: Date | string;
        updatedAt: Date | string;
        memberId: string | null;
        memberProfileId: string | null;
        memberRole: string | null;
        profileUserId: string | null;
        profileName: string | null;
        profileEmail: string | null;
        profileImageUrl: string | null;
        profileCreatedAt: Date | string | null;
        profileUpdatedAt: Date | string | null;
        profileRole: string | null;
      }>;
    }).rows ?? []);

    if (threadId) {
      await markThreadRead({ threadId, profileId: profile.id });
    } else if (currentChannel.type === ChannelType.ANNOUNCEMENT) {
      await markChannelRead({ channelId, profileId: profile.id });
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
      .map((item) => String(item.memberProfileId ?? "").trim())
      .filter((value): value is string => Boolean(value));
    const profileNameMap = await getUserProfileNameMap(messageProfileIds);

    const hydratedMessages = rows.map((item) => {
      const fallbackProfileId = String(item.memberProfileId ?? "").trim() || `missing-member-${item.id}`;
      const profileName = profileNameMap.get(fallbackProfileId);

      return {
        id: item.id,
        content: String(item.content ?? ""),
        fileUrl: typeof item.fileUrl === "string" ? item.fileUrl : null,
        deleted: Boolean(item.deleted),
        timestamp: formatTimestamp(item.createdAt),
        isUpdated: new Date(item.updatedAt).getTime() !== new Date(item.createdAt).getTime(),
        member: {
          id: String(item.memberId ?? "").trim() || `missing-member-${item.id}`,
          profileId: fallbackProfileId,
          role: String(item.memberRole ?? "").trim() || "GUEST",
          profile: {
            id: fallbackProfileId,
            userId: String(item.profileUserId ?? fallbackProfileId).trim() || fallbackProfileId,
            name:
              profileName ??
              (String(item.profileName ?? item.profileEmail ?? "Deleted User").trim() || "Deleted User"),
            imageUrl:
              String(item.profileImageUrl ?? "/in-accord-steampunk-logo.png").trim() ||
              "/in-accord-steampunk-logo.png",
            email: String(item.profileEmail ?? "").trim(),
            role: item.profileRole ?? null,
            createdAt: normalizeIsoDate(item.profileCreatedAt),
            updatedAt: normalizeIsoDate(item.profileUpdatedAt),
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
    const liveProfile = await currentProfile();
    if (!liveProfile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const requestBody = await req.json().catch(() => ({}));
    const liveSearchParams = new URL(req.url).searchParams;
    const liveServerId = String(liveSearchParams.get("serverId") ?? "").trim();
    const liveChannelId = String(liveSearchParams.get("channelId") ?? "").trim();
    const liveThreadId = String(liveSearchParams.get("threadId") ?? "").trim() || null;
    const liveClientMutationId =
      typeof requestBody?.clientMutationId === "string" && requestBody.clientMutationId.trim().length > 0
        ? requestBody.clientMutationId.trim()
        : undefined;
    const liveFileUrl =
      typeof requestBody?.fileUrl === "string" && requestBody.fileUrl.trim().length > 0
        ? requestBody.fileUrl.trim()
        : null;
    const liveContent =
      typeof requestBody?.content === "string"
        ? requestBody.content.trim()
        : "";

    if (!liveServerId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!liveChannelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    if (!liveContent && !liveFileUrl) {
      return new NextResponse("Content is required", { status: 400 });
    }

    const liveMemberContext = await resolveMemberContext({
      profileId: liveProfile.id,
      serverId: liveServerId,
    });

    if (!liveMemberContext?.memberId) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const liveChannelResult = await db.execute(sql`
      select
        c."id" as "id",
        c."serverId" as "serverId",
        c."name" as "name",
        c."type" as "type"
      from "Channel" c
      where c."id" = ${liveChannelId}
        and c."serverId" = ${liveServerId}
      limit 1
    `);

    const liveChannel = ((liveChannelResult as unknown as {
      rows?: Array<{
        id: string | null;
        serverId: string | null;
        name: string | null;
        type: ChannelType | null;
      }>;
    }).rows ?? [])[0];

    if (!liveChannel?.id || !liveChannel.serverId) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    const livePermissions = await computeChannelPermissionForMember({
      serverId: liveServerId,
      channelId: String(liveChannel.id).trim(),
      memberContext: liveMemberContext,
    });

    if (!livePermissions.allowView) {
      return new NextResponse("You cannot view this channel", { status: 403 });
    }

    if (!livePermissions.allowSend) {
      return new NextResponse("You cannot send messages in this channel", { status: 403 });
    }

    if (liveChannel.type === ChannelType.ANNOUNCEMENT && liveMemberContext.role === MemberRole.GUEST) {
      return new NextResponse("Only moderators can publish in announcement channels.", {
        status: 403,
      });
    }

    if (liveThreadId) {
      await ensureChannelThreadSchema();

      const liveThreadResult = await db.execute(sql`
        select "id", "archived"
        from "ChannelThread"
        where "id" = ${liveThreadId}
          and "channelId" = ${liveChannelId}
          and "serverId" = ${liveServerId}
        limit 1
      `);

      const liveThreadRow = ((liveThreadResult as unknown as {
        rows?: Array<{ id: string | null; archived: boolean | null }>;
      }).rows ?? [])[0];

      if (!liveThreadRow?.id) {
        return new NextResponse("Thread not found", { status: 404 });
      }

      if (Boolean(liveThreadRow.archived)) {
        return new NextResponse("Thread is archived", { status: 400 });
      }
    }

    const liveSanitizedContent = liveContent
      ? await sanitizeRoleMentions(liveContent, liveServerId)
      : "";

    if (!liveSanitizedContent && !liveFileUrl) {
      return new NextResponse("Content is required", { status: 400 });
    }

    const insertedMessageId = uuidv4();
    const liveInsertedAt = new Date();
    const liveStoredContent = liveSanitizedContent || "[attachment]";

    await db.execute(sql`
      insert into "Message" (
        "id",
        "content",
        "fileUrl",
        "memberId",
        "channelId",
        "threadId",
        "deleted",
        "createdAt",
        "updatedAt"
      )
      values (
        ${insertedMessageId},
        ${liveStoredContent},
        ${liveFileUrl},
        ${liveMemberContext.memberId},
        ${liveChannelId},
        ${liveThreadId},
        ${0},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `);

    if (liveThreadId) {
      await touchThreadActivity({ threadId: liveThreadId });
      await markThreadRead({ threadId: liveThreadId, profileId: liveProfile.id });
    } else if (liveChannel.type === ChannelType.ANNOUNCEMENT) {
      await markChannelRead({
        channelId: liveChannelId,
        profileId: liveProfile.id,
      });
    }

    const liveSerializedInserted = {
      id: insertedMessageId,
      content: liveStoredContent,
      fileUrl: liveFileUrl,
      deleted: false,
      timestamp: formatTimestamp(liveInsertedAt),
      isUpdated: false,
      member: {
        id: liveMemberContext.memberId,
        profileId: liveProfile.id,
        role: liveMemberContext.role,
        profile: {
          id: liveProfile.id,
          userId: String((liveProfile as { userId?: string | null }).userId ?? liveProfile.id).trim() || liveProfile.id,
          name: String(liveProfile.name ?? liveProfile.email ?? "User").trim() || "User",
          imageUrl: String(liveProfile.imageUrl ?? "/in-accord-steampunk-logo.png").trim() || "/in-accord-steampunk-logo.png",
          email: String(liveProfile.email ?? "").trim(),
          role: liveProfile.role ?? null,
          createdAt: normalizeIsoDate(liveProfile.createdAt),
          updatedAt: normalizeIsoDate(liveProfile.updatedAt),
        },
      },
    };

    try {
      await publishRealtimeEvent(
        REALTIME_CHANNEL_MESSAGE_CREATED_EVENT,
        {
          serverId: liveServerId,
          channelId: liveChannelId,
          threadId: liveThreadId,
        },
        {
          entity: "message",
          action: "created",
          message: {
            ...liveSerializedInserted,
            clientMutationId: liveClientMutationId,
          },
          thread: liveThreadId
            ? {
                id: liveThreadId,
              }
            : null,
        }
      );
    } catch (realtimeError) {
      console.error("[SOCKET_MESSAGES_POST_REALTIME_EMERGENCY]", realtimeError);
    }

    return NextResponse.json(
      {
        ...liveSerializedInserted,
        clientMutationId: liveClientMutationId,
      }
    );

    const profile = await currentProfile();
    const { content, fileUrl, clientMutationId } = await req.json();
    const { searchParams } = new URL(req.url);

    const serverId = String(searchParams.get("serverId") ?? "").trim();
    const channelId = String(searchParams.get("channelId") ?? "").trim();
    const threadId = String(searchParams.get("threadId") ?? "").trim();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const legacyProfile = profile as NonNullable<typeof profile>;
    const legacyProfileId = String(legacyProfile.id ?? "").trim();
    const legacyProfileRole = legacyProfile.role;
    const legacyProfileEmail = String(legacyProfile.email ?? "").trim();
    const legacyProfileName = String(legacyProfile.name ?? "").trim();

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    const normalizedThreadId = threadId || null;

    const currentMember = await db.query.member.findFirst({
      where: and(
        eq(member.serverId, serverId),
        eq(member.profileId, legacyProfileId)
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

    const memberContextResult = await resolveMemberContext({ profileId: legacyProfileId, serverId });

    if (!memberContextResult) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const legacyMemberContext = memberContextResult as NonNullable<typeof memberContextResult>;

    const permissions = await computeChannelPermissionForMember({
      serverId,
      channelId,
      memberContext: legacyMemberContext,
    });

    if (!permissions.allowView) {
      return new NextResponse("You cannot view this channel", { status: 403 });
    }

    if (!permissions.allowSend) {
      return new NextResponse("You cannot send messages in this channel", { status: 403 });
    }

    const featureSettings = await getChannelFeatureSettings({ serverId, channelId: currentChannel.id });

    if (featureSettings.moderation.requireVerifiedEmail && !legacyProfileEmail) {
      return new NextResponse("This channel requires an account email before you can participate.", { status: 403 });
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

      if (!threadRow?.id) {
        return new NextResponse("Thread not found", { status: 404 });
      }

      if (Boolean(threadRow?.archived)) {
        return new NextResponse("Thread is archived", { status: 400 });
      }
    }

    const normalizedContent = typeof content === "string" ? content.trim() : "";
    const sanitizedContent = normalizedContent
      ? await sanitizeRoleMentions(normalizedContent, serverId)
      : normalizedContent;

    const moderated = applyBlockedWordModeration({
      content: sanitizedContent,
      blockedWords: featureSettings.moderation.blockedWords,
      action: featureSettings.moderation.flaggedWordsAction,
    });

    if (moderated.matchedWords.length > 0 && featureSettings.moderation.flaggedWordsAction === "block") {
      return new NextResponse("This message contains blocked words for this channel.", { status: 400 });
    }

    const finalContent = moderated.nextContent;

    if (!finalContent && !fileUrl) {
      return new NextResponse("Content is required", { status: 400 });
    }

    const serverCountingSnapshot = !normalizedThreadId
      ? await getServerCountingSnapshot({ serverId })
      : null;
    const countingEnabled = Boolean(
      !normalizedThreadId &&
      serverCountingSnapshot?.countingSettings.enabled &&
      serverCountingSnapshot?.countingSettings.channelId === currentChannel.id
    );

    if (countingEnabled) {
      if (fileUrl) {
        return new NextResponse("Attachments are not allowed in counting channels.", { status: 400 });
      }

      if (!countingIntegerPattern.test(finalContent)) {
        return new NextResponse("Only whole numbers are allowed in counting channels.", { status: 400 });
      }
    }

    if (featureSettings.moderation.slowmodeSeconds > 0) {
      const lastMessageResult = await db.execute(sql`
        select "createdAt"
        from "Message"
        where "channelId" = ${currentChannel.id}
          and "memberId" = ${currentMember.id}
          and "deleted" = false
        order by "createdAt" desc
        limit 1
      `);

      const lastMessageCreatedAt = (lastMessageResult as unknown as {
        rows?: Array<{ createdAt: Date | string | null }>;
      }).rows?.[0]?.createdAt;

      if (lastMessageCreatedAt) {
        const elapsedMs = Date.now() - new Date(lastMessageCreatedAt as string | Date).getTime();
        const requiredMs = featureSettings.moderation.slowmodeSeconds * 1000;

        if (elapsedMs < requiredMs) {
          const secondsRemaining = Math.max(1, Math.ceil((requiredMs - elapsedMs) / 1000));
          return new NextResponse(`Slowmode is enabled in this channel. Try again in ${secondsRemaining}s.`, {
            status: 429,
          });
        }
      }
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

    if (currentChannel.type === ChannelType.ANNOUNCEMENT && currentMember.role === MemberRole.GUEST) {
      return new NextResponse("Only moderators can publish in announcement channels.", {
        status: 403,
      });
    }

    const isSlashCommandInput = finalContent.startsWith("/") && !fileUrl;

    if (countingEnabled) {
      const submittedNumber = Number(finalContent);

      if (!Number.isSafeInteger(submittedNumber) || submittedNumber < 0) {
        return new NextResponse("That number is too large for this counting channel.", { status: 400 });
      }

      await ensureMessageReactionSchema();

      const serverOwner = await db.query.server.findFirst({
        where: eq(server.id, serverId),
        columns: { profileId: true },
      });

      const responseMember = serverOwner?.profileId
        ? await db.query.member.findFirst({
            where: and(eq(member.serverId, serverId), eq(member.profileId, serverOwner.profileId)),
            columns: { id: true },
          })
        : null;

      const actorLabel =
        legacyProfileName ||
        legacyProfileEmail ||
        "That member";

    const countingResult = await db.transaction(async (tx: any) => {
        const snapshot = await getServerCountingSnapshot({
          serverId,
          executor: tx,
        });

        if (!snapshot.countingSettings.enabled || snapshot.countingSettings.channelId !== currentChannel.id) {
          throw new Error("COUNTING_NOT_ENABLED");
        }

        const expectedNumber = snapshot.countingState.nextNumber;
        const sameUserViolation =
          snapshot.countingSettings.preventConsecutiveTurns &&
          snapshot.countingState.lastProfileId === legacyProfileId;
        const isCorrectCount = submittedNumber === expectedNumber && !sameUserViolation;

        const insertedRows = await tx
          .insert(message)
          .values({
            id: uuidv4(),
            content: finalContent,
            fileUrl: null,
            memberId: currentMember.id,
            channelId: currentChannel.id,
            threadId: null,
            deleted: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        const insertedCountMessage = insertedRows[0];
        const reactionEmoji = isCorrectCount ? "✅" : "❌";

        await addMessageReaction({
          messageId: insertedCountMessage.id,
          scope: "channel",
          emoji: reactionEmoji,
          executor: tx,
        });

        let nextCountingState: ServerCountingState;
        let responseMessageId: string | null = null;

        if (isCorrectCount) {
          nextCountingState = {
            nextNumber: expectedNumber + 1,
            lastProfileId: legacyProfileId,
            lastMessageId: insertedCountMessage.id,
            updatedAt: new Date().toISOString(),
          };
        } else {
          nextCountingState = {
            ...createDefaultServerCountingState(snapshot.countingSettings),
            updatedAt: new Date().toISOString(),
          };

          const responseContent = buildCountingFailureMessage({
            actorProfileId: legacyProfileId,
            actorLabel,
            expectedNumber,
            submittedNumber,
            resetNumber: nextCountingState.nextNumber,
            sameUserViolation,
          });

          const responseRows = await tx
            .insert(message)
            .values({
              id: uuidv4(),
              content: responseContent,
              fileUrl: null,
              memberId: responseMember?.id ?? currentMember.id,
              channelId: currentChannel.id,
              threadId: null,
              deleted: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();

          responseMessageId = responseRows[0]?.id ?? null;
        }

        await saveServerCountingSnapshot({
          serverId,
          parsedSettings: snapshot.parsedSettings,
          countingSettings: snapshot.countingSettings,
          countingState: nextCountingState,
          executor: tx,
        });

        return {
          insertedMessageId: insertedCountMessage.id,
          responseMessageId,
          reactionEmoji,
          expectedNumber,
          submittedNumber,
          isCorrectCount,
          sameUserViolation,
          nextNumber: nextCountingState.nextNumber,
        };
      });

      const serializedInserted = await getSerializedChannelMessageById(countingResult.insertedMessageId);
      const serializedResponse = countingResult.responseMessageId
        ? await getSerializedChannelMessageById(countingResult.responseMessageId)
        : null;
      const normalizedClientMutationId =
        typeof clientMutationId === "string" && clientMutationId.trim().length > 0
          ? clientMutationId.trim()
          : undefined;

      if (serializedInserted) {
        await publishRealtimeEvent(
          REALTIME_CHANNEL_MESSAGE_CREATED_EVENT,
          {
            serverId,
            channelId: currentChannel.id,
            threadId: null,
          },
          {
            entity: "message",
            action: "created",
            message: {
              ...serializedInserted,
              clientMutationId: normalizedClientMutationId,
            },
            reactionsByMessageId: {
              [countingResult.insertedMessageId]: [{ emoji: countingResult.reactionEmoji, count: 1 }],
            },
            thread: null,
          }
        );
      }

      if (serializedResponse) {
        await publishRealtimeEvent(
          REALTIME_CHANNEL_MESSAGE_CREATED_EVENT,
          {
            serverId,
            channelId: currentChannel.id,
            threadId: null,
          },
          {
            entity: "message",
            action: "created",
            message: serializedResponse,
            thread: null,
          }
        );
      }

      await emitChannelWebhookEvent({
        serverId,
        channelId: currentChannel.id,
        channelName: currentChannel.name,
        eventType: "MESSAGE_CREATED",
        actorProfileId: legacyProfileId,
        payload: {
          messageId: countingResult.insertedMessageId,
          threadId: null,
          content: finalContent,
          fileUrl: null,
          memberId: currentMember.id,
          blockedWordMatches: moderated.matchedWords,
          counting: {
            enabled: true,
            expectedNumber: countingResult.expectedNumber,
            submittedNumber: countingResult.submittedNumber,
            accepted: countingResult.isCorrectCount,
            sameUserViolation: countingResult.sameUserViolation,
            nextNumber: countingResult.nextNumber,
          },
        },
      });

      return NextResponse.json(
        serializedInserted
          ? {
              ...serializedInserted,
              clientMutationId: normalizedClientMutationId,
            }
          : {
              id: countingResult.insertedMessageId,
            }
      );
    }

    if (isSlashCommandInput) {
      const commandResult = await executeServerSlashCommand({
        serverId,
        rawInput: finalContent,
        channelId: currentChannel.id,
        threadId: normalizedThreadId,
        actorProfileId: legacyProfileId,
        actorProfileRole: legacyProfileRole,
      });

      if (commandResult.handled) {
        const handledCommandResult = commandResult as Extract<typeof commandResult, { handled: true }>;
        const handledResponseMemberId = String(handledCommandResult.responseMemberId ?? "").trim();
        const responderMemberId =
          handledResponseMemberId.length > 0
            ? handledResponseMemberId
            : currentMember.id;

        const responderMembership = await db.query.member.findFirst({
          where: and(eq(member.id, responderMemberId), eq(member.serverId, serverId)),
        });

        const insertedResponse = await createMessage({
          content: handledCommandResult.responseContent,
          fileUrl: null,
          memberId: responderMembership?.id ?? currentMember.id,
        });

        const serializedInsertedResponse = await getSerializedChannelMessageById(insertedResponse.id);
        const normalizedClientMutationId =
          typeof clientMutationId === "string" && clientMutationId.trim().length > 0
            ? clientMutationId.trim()
            : undefined;

        if (normalizedThreadId) {
          const ensuredThreadId = normalizedThreadId as string;
          await touchThreadActivity({
            threadId: ensuredThreadId,
          });

          await markThreadRead({
            threadId: ensuredThreadId,
            profileId: legacyProfileId,
          });
        }

        await publishRealtimeEvent(
          REALTIME_CHANNEL_MESSAGE_CREATED_EVENT,
          {
            serverId,
            channelId: currentChannel.id,
            threadId: normalizedThreadId,
          },
          {
            entity: "message",
            action: "created",
            message: serializedInsertedResponse
              ? {
                  ...serializedInsertedResponse,
                  clientMutationId: normalizedClientMutationId,
                }
              : undefined,
            thread: normalizedThreadId
              ? {
                  id: normalizedThreadId,
                }
              : null,
          }
        );

        return NextResponse.json(
          serializedInsertedResponse
            ? {
                ...serializedInsertedResponse,
                clientMutationId: normalizedClientMutationId,
              }
            : insertedResponse
        );
      }
    }

    const inserted = await createMessage({
      content: finalContent || "[attachment]",
      fileUrl: fileUrl ?? null,
      memberId: currentMember.id,
    });

    if (finalContent.startsWith("/") && !fileUrl) {
      const commandResult = await executeServerSlashCommand({
        serverId,
        rawInput: finalContent,
        channelId: currentChannel.id,
        threadId: normalizedThreadId,
        actorProfileId: legacyProfileId,
        actorProfileRole: legacyProfileRole,
      });

      if (commandResult.handled) {
        const handledCommandResult = commandResult as Extract<typeof commandResult, { handled: true }>;
        const handledResponseMemberId = String(handledCommandResult.responseMemberId ?? "").trim();
        const responderMemberId =
          handledResponseMemberId.length > 0
            ? handledResponseMemberId
            : currentMember.id;

        const responderMembership = await db.query.member.findFirst({
          where: and(eq(member.id, responderMemberId), eq(member.serverId, serverId)),
        });

        await db.insert(message).values({
          id: uuidv4(),
          content: handledCommandResult.responseContent,
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
      const ensuredThreadId = normalizedThreadId as string;
      await touchThreadActivity({
        threadId: ensuredThreadId,
      });

      await markThreadRead({
        threadId: ensuredThreadId,
        profileId: legacyProfileId,
      });
    }

    try {
      const serializedInserted = await getSerializedChannelMessageById(inserted.id);
      const normalizedClientMutationId =
        typeof clientMutationId === "string" && clientMutationId.trim().length > 0
          ? clientMutationId.trim()
          : undefined;

      if (serializedInserted) {
        await publishRealtimeEvent(
          REALTIME_CHANNEL_MESSAGE_CREATED_EVENT,
          {
            serverId,
            channelId: currentChannel.id,
            threadId: normalizedThreadId,
          },
          {
            entity: "message",
            action: "created",
            message: {
              ...serializedInserted,
              clientMutationId: normalizedClientMutationId,
            },
            thread: normalizedThreadId
              ? {
                  id: normalizedThreadId,
                }
              : null,
          }
        );
      } else {
        await publishRealtimeEvent(
          REALTIME_CHANNEL_MESSAGE_CREATED_EVENT,
          {
            serverId,
            channelId: currentChannel.id,
            threadId: normalizedThreadId,
          },
          {
            entity: "message",
            action: "created",
            thread: normalizedThreadId
              ? {
                  id: normalizedThreadId,
                }
              : null,
          }
        );
      }
    } catch (realtimeError) {
      console.error("[SOCKET_MESSAGES_POST_REALTIME]", realtimeError);
      await publishRealtimeEvent(
        REALTIME_CHANNEL_MESSAGE_CREATED_EVENT,
        {
          serverId,
          channelId: currentChannel.id,
          threadId: normalizedThreadId,
        },
        {
          entity: "message",
          action: "created",
          thread: normalizedThreadId
            ? {
                id: normalizedThreadId,
              }
            : null,
        }
      );
    }

    const serializedInserted = await getSerializedChannelMessageById(inserted.id);
    const normalizedClientMutationId =
      typeof clientMutationId === "string" && clientMutationId.trim().length > 0
        ? clientMutationId.trim()
        : undefined;

    await emitChannelWebhookEvent({
      serverId,
      channelId: currentChannel.id,
      channelName: currentChannel.name,
      eventType: "MESSAGE_CREATED",
      actorProfileId: legacyProfileId,
      payload: {
        messageId: inserted.id,
        threadId: normalizedThreadId,
        content: finalContent || null,
        fileUrl: fileUrl ?? null,
        memberId: currentMember.id,
        blockedWordMatches: moderated.matchedWords,
      },
    });

    return NextResponse.json(
      serializedInserted
        ? {
            ...serializedInserted,
            clientMutationId: normalizedClientMutationId,
          }
        : inserted
    );
  } catch (error) {
    console.error("[SOCKET_MESSAGES_POST]", error);
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error ?? "Internal Error");
    return new NextResponse(message, { status: 500 });
  }
}
