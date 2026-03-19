import { after, NextResponse } from "next/server";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { currentProfile } from "@/lib/current-profile";
import { conversation, db, directMessage, member } from "@/lib/db";
import { getRecentDmRailItemForProfile } from "@/lib/direct-messages";
import { publishRealtimeEvent } from "@/lib/realtime-events-server";
import {
  REALTIME_DIRECT_MESSAGE_CREATED_EVENT,
  REALTIME_DM_RAIL_SYNC_EVENT,
} from "@/lib/realtime-events";
import { getUserProfileNameMap } from "@/lib/user-profile";

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

const getConversationProfileIds = async (conversationId: string) => {
  const rows = await db.query.member.findMany({
    where: or(
      eq(member.id, (await db.query.conversation.findFirst({ where: eq(conversation.id, conversationId) }))?.memberOneId ?? ""),
      eq(member.id, (await db.query.conversation.findFirst({ where: eq(conversation.id, conversationId) }))?.memberTwoId ?? "")
    ),
  });

  return rows.map((item) => String(item.profileId ?? "").trim()).filter(Boolean);
};

const serializeDirectMessage = async (item: {
  id: string;
  content: string;
  fileUrl: string | null;
  deleted: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  member: {
    id: string;
    profileId: string;
    role?: string | null;
    profile: {
      id: string;
      userId?: string | null;
      name?: string | null;
      email?: string | null;
      imageUrl?: string | null;
      createdAt?: Date | string | null;
      updatedAt?: Date | string | null;
    };
  };
}) => {
  const profileNameMap = await getUserProfileNameMap([item.member.profileId]);
  const profileRoleRows = await db.execute(sql`
    select "userId", "role"
    from "Users"
    where "userId" = ${item.member.profileId}
    limit 1
  `);
  const profileRole = ((profileRoleRows as unknown as {
    rows?: Array<{ userId: string; role: string | null }>;
  }).rows ?? [])[0]?.role ?? null;

  return {
    id: item.id,
    content: item.content,
    fileUrl: item.fileUrl,
    deleted: item.deleted,
    timestamp: formatTimestamp(item.createdAt),
    isUpdated: new Date(item.updatedAt).getTime() !== new Date(item.createdAt).getTime(),
    member: {
      ...item.member,
      profile: {
        ...item.member.profile,
        createdAt: normalizeIsoDate(item.member.profile.createdAt),
        updatedAt: normalizeIsoDate(item.member.profile.updatedAt),
        name: profileNameMap.get(item.member.profileId) ?? item.member.profile.name,
        role: profileRole,
      },
    },
  };
};

const getSerializedDirectMessageById = async (directMessageId: string) => {
  const row = await db.query.directMessage.findFirst({
    where: eq(directMessage.id, directMessageId),
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

  return serializeDirectMessage(row);
};

const serializeImmediateDirectMessage = ({
  item,
  currentMember,
  currentProfile,
}: {
  item: {
    id: string;
    content: string;
    fileUrl: string | null;
    deleted: boolean;
    createdAt: Date | string;
    updatedAt: Date | string;
  };
  currentMember: {
    id: string;
    profileId: string;
    role?: string | null;
  };
  currentProfile: {
    id: string;
    userId?: string | null;
    name?: string | null;
    email?: string | null;
    imageUrl?: string | null;
    role?: string | null;
    createdAt?: Date | string | null;
    updatedAt?: Date | string | null;
  };
}) => ({
  id: item.id,
  content: item.content,
  fileUrl: item.fileUrl,
  deleted: item.deleted,
  timestamp: formatTimestamp(item.createdAt),
  isUpdated: new Date(item.updatedAt).getTime() !== new Date(item.createdAt).getTime(),
  member: {
    ...currentMember,
    profile: {
      id: currentProfile.id,
      userId: String(currentProfile.userId ?? "").trim() || currentProfile.id,
      name: String(currentProfile.name ?? "").trim() || String(currentProfile.email ?? "").trim() || "Deleted User",
      imageUrl: String(currentProfile.imageUrl ?? "").trim() || "/in-accord-steampunk-logo.png",
      email: String(currentProfile.email ?? "").trim(),
      role: currentProfile.role ?? null,
      createdAt: normalizeIsoDate(currentProfile.createdAt),
      updatedAt: normalizeIsoDate(currentProfile.updatedAt),
    },
  },
});

const publishDirectMessageRailSync = async ({
  conversationId,
  participantProfileIds,
}: {
  conversationId: string;
  participantProfileIds: string[];
}) => {
  await Promise.all(
    participantProfileIds.map(async (participantProfileId) => {
      const item = await getRecentDmRailItemForProfile({
        profileId: participantProfileId,
        conversationId,
      });

      await publishRealtimeEvent(
        REALTIME_DM_RAIL_SYNC_EVENT,
        {
          profileId: participantProfileId,
        },
        {
          entity: "direct-message",
          action: "sync",
          scope: "rail",
          conversationId,
          item,
        }
      );
    })
  );
};

export async function GET(req: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const conversationId = String(searchParams.get("conversationId") ?? "").trim();

    if (!conversationId) {
      return new NextResponse("Conversation ID missing", { status: 400 });
    }

    const currentConversation = await db.query.conversation.findFirst({
      where: eq(conversation.id, conversationId),
    });

    if (!currentConversation) {
      return new NextResponse("Conversation not found", { status: 404 });
    }

    const currentMember = await db.query.member.findFirst({
      where: and(
        eq(member.profileId, profile.id),
        or(eq(member.id, currentConversation.memberOneId), eq(member.id, currentConversation.memberTwoId))
      ),
    });

    if (!currentMember) {
      return new NextResponse("Member not found in conversation", { status: 404 });
    }

    const messageRows = await db.query.directMessage.findMany({
      where: eq(directMessage.conversationId, conversationId),
      orderBy: [asc(directMessage.createdAt)],
      with: {
        member: {
          with: {
            profile: true,
          },
        },
      },
    });

    const reactionRows = messageRows.length
      ? await db.execute(sql`
          select "messageId", "emoji", "count"
          from "MessageReaction"
          where "scope" = 'direct'
            and "messageId" in (${sql.join(messageRows.map((item) => sql`${item.id}`), sql`, `)})
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

    const profileNameMap = await getUserProfileNameMap(messageRows.map((item) => item.member.profileId));
    const uniqueMessageProfileIds = Array.from(new Set(messageRows.map((item) => item.member.profileId).filter(Boolean)));

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

    return NextResponse.json({
      messages: messageRows.map((item) => ({
        id: item.id,
        content: item.content,
        fileUrl: item.fileUrl,
        deleted: item.deleted,
        timestamp: formatTimestamp(item.createdAt),
        isUpdated: new Date(item.updatedAt).getTime() !== new Date(item.createdAt).getTime(),
        member: {
          ...item.member,
          profile: {
            ...item.member.profile,
            createdAt: item.member.profile.createdAt?.toISOString?.() ?? new Date(item.member.profile.createdAt ?? 0).toISOString(),
            updatedAt: item.member.profile.updatedAt?.toISOString?.() ?? new Date(item.member.profile.updatedAt ?? 0).toISOString(),
            name: profileNameMap.get(item.member.profileId) ?? item.member.profile.name,
            role: profileRoleMap.get(item.member.profileId) ?? null,
          },
        },
      })),
      reactionsByMessageId,
    });
  } catch (error) {
    console.error("[SOCKET_DIRECT_MESSAGES_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { content, fileUrl, clientMutationId } = await req.json();
    const { searchParams } = new URL(req.url);
    const conversationId = String(searchParams.get("conversationId") ?? "").trim();

    if (!conversationId) {
      return new NextResponse("Conversation ID missing", { status: 400 });
    }

    const currentConversation = await db.query.conversation.findFirst({
      where: eq(conversation.id, conversationId),
    });

    if (!currentConversation) {
      return new NextResponse("Conversation not found", { status: 404 });
    }

    const currentMember = await db.query.member.findFirst({
      where: and(
        eq(member.profileId, profile.id),
        or(
          eq(member.id, currentConversation.memberOneId),
          eq(member.id, currentConversation.memberTwoId)
        )
      ),
    });

    if (!currentMember) {
      return new NextResponse("Member not found in conversation", { status: 404 });
    }

    const normalizedContent = typeof content === "string" ? content.trim() : "";
    const normalizedFileUrl = typeof fileUrl === "string" ? fileUrl.trim() : "";

    if (!normalizedContent && !normalizedFileUrl) {
      return new NextResponse("Content is required", { status: 400 });
    }

    const now = new Date();

    const inserted = await db
      .insert(directMessage)
      .values({
        id: uuidv4(),
        content: normalizedContent || "[attachment]",
        fileUrl: normalizedFileUrl || null,
        memberId: currentMember.id,
        conversationId,
        deleted: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const normalizedClientMutationId =
      typeof clientMutationId === "string" && clientMutationId.trim().length > 0
        ? clientMutationId.trim()
        : undefined;
    const serializedInserted = serializeImmediateDirectMessage({
      item: inserted[0],
      currentMember: {
        id: currentMember.id,
        profileId: currentMember.profileId,
        role: currentMember.role ?? null,
      },
      currentProfile: profile,
    });
    const responsePayload = {
      ...serializedInserted,
      clientMutationId: normalizedClientMutationId,
    };

    after(async () => {
      const sideEffectTasks: Array<Promise<unknown>> = [];

      sideEffectTasks.push(
        publishRealtimeEvent(
          REALTIME_DIRECT_MESSAGE_CREATED_EVENT,
          { conversationId },
          {
            entity: "direct-message",
            action: "created",
            message: responsePayload,
          }
        )
      );

      sideEffectTasks.push(
        (async () => {
          const participantProfileIds = await getConversationProfileIds(conversationId);
          await publishDirectMessageRailSync({
            conversationId,
            participantProfileIds,
          });
        })()
      );

      const results = await Promise.allSettled(sideEffectTasks);
      for (const result of results) {
        if (result.status === "rejected") {
          console.error("[SOCKET_DIRECT_MESSAGES_POST_SIDE_EFFECT]", result.reason);
        }
      }
    });

    return NextResponse.json(
      responsePayload
    );
  } catch (error) {
    console.error("[SOCKET_DIRECT_MESSAGES_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
