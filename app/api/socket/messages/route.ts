import { NextResponse } from "next/server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { currentProfile } from "@/lib/current-profile";
import { channel, ChannelType, db, member, MemberRole, message, server } from "@/lib/db";
import { ensureChannelThreadSchema, markThreadRead, touchThreadActivity } from "@/lib/channel-threads";
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
    const { content, fileUrl, clientMutationId } = await req.json();
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

    const memberContextResult = await resolveMemberContext({ profileId: profile.id, serverId });

    if (!memberContextResult) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const permissions = await computeChannelPermissionForMember({
      serverId,
      channelId,
      memberContext: memberContextResult,
    });

    if (!permissions.allowView) {
      return new NextResponse("You cannot view this channel", { status: 403 });
    }

    if (!permissions.allowSend) {
      return new NextResponse("You cannot send messages in this channel", { status: 403 });
    }

    const featureSettings = await getChannelFeatureSettings({ serverId, channelId: currentChannel.id });

    if (featureSettings.moderation.requireVerifiedEmail && !String(profile.email ?? "").trim()) {
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
      serverCountingSnapshot.countingSettings.channelId === currentChannel.id
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
        const elapsedMs = Date.now() - new Date(lastMessageCreatedAt).getTime();
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
        String(profile.name ?? "").trim() ||
        String(profile.email ?? "").trim() ||
        "That member";

      const countingResult = await db.transaction(async (tx) => {
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
          snapshot.countingState.lastProfileId === profile.id;
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
            lastProfileId: profile.id,
            lastMessageId: insertedCountMessage.id,
            updatedAt: new Date().toISOString(),
          };
        } else {
          nextCountingState = {
            ...createDefaultServerCountingState(snapshot.countingSettings),
            updatedAt: new Date().toISOString(),
          };

          const responseContent = buildCountingFailureMessage({
            actorProfileId: profile.id,
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
        actorProfileId: profile.id,
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
        actorProfileId: profile.id,
        actorProfileRole: profile.role,
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

        const serializedInsertedResponse = await getSerializedChannelMessageById(insertedResponse.id);
        const normalizedClientMutationId =
          typeof clientMutationId === "string" && clientMutationId.trim().length > 0
            ? clientMutationId.trim()
            : undefined;

        if (normalizedThreadId) {
          await touchThreadActivity({
            threadId: normalizedThreadId,
          });

          await markThreadRead({
            threadId: normalizedThreadId,
            profileId: profile.id,
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
        actorProfileId: profile.id,
        actorProfileRole: profile.role,
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
      actorProfileId: profile.id,
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
    return new NextResponse("Internal Error", { status: 500 });
  }
}
