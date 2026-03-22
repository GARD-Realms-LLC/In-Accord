import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export interface GlobalRecentDmItem {
  conversationId: string;
  serverId: string;
  memberId: string;
  profileId: string;
  displayName: string;
  imageUrl: string | null;
  avatarDecorationUrl: string | null;
  profileCreatedAt: Date | null;
  lastMessageAt: Date;
  unreadCount: number;
}

export interface SerializedRecentDmRailItem {
  conversationId: string;
  serverId: string;
  memberId: string;
  profileId: string;
  displayName: string;
  imageUrl: string | null;
  avatarDecorationUrl: string | null;
  profileCreatedAt: string | null;
  timestampLabel: string;
  lastMessageAt: string | null;
  unreadCount: number;
}

export const formatRecentDmTimestamp = (value: Date) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "";
  }

  return value.toISOString();
};

export const serializeRecentDmRailItem = (item: GlobalRecentDmItem): SerializedRecentDmRailItem => ({
  conversationId: item.conversationId,
  serverId: item.serverId,
  memberId: item.memberId,
  profileId: item.profileId,
  displayName: item.displayName,
  imageUrl: item.imageUrl,
  avatarDecorationUrl: item.avatarDecorationUrl,
  profileCreatedAt: item.profileCreatedAt ? item.profileCreatedAt.toISOString() : null,
  timestampLabel: formatRecentDmTimestamp(item.lastMessageAt),
  lastMessageAt:
    item.lastMessageAt instanceof Date && !Number.isNaN(item.lastMessageAt.getTime())
      ? item.lastMessageAt.toISOString()
      : null,
  unreadCount: item.unreadCount,
});

export const getGlobalRecentDmsForProfile = async ({
  profileId,
  selectedServerId,
  recentWindowDays = 30,
}: {
  profileId: string;
  selectedServerId?: string | null;
  recentWindowDays?: number;
}): Promise<GlobalRecentDmItem[]> => {
  if (!profileId) {
    return [];
  }

  const normalizedSelectedServerId = String(selectedServerId ?? "").trim() || null;
  const normalizedRecentWindowDays = Number.isFinite(recentWindowDays)
    ? Math.max(1, Math.floor(recentWindowDays))
    : 30;
  const recentCutoff = new Date(Date.now() - normalizedRecentWindowDays * 24 * 60 * 60 * 1000);

  const result = await db.execute(sql`
    with self_members as (
      select m."id"
      from "Member" m
      where m."profileId" = ${profileId}
    ),
    conversations_with_other as (
      select
        c."id" as "conversationId",
        case
          when c."memberOneId" in (select "id" from self_members) then c."memberTwoId"
          else c."memberOneId"
        end as "otherMemberId"
      from "Conversation" c
      where c."memberOneId" in (select "id" from self_members)
         or c."memberTwoId" in (select "id" from self_members)
    ),
    recent_conversations as (
      select
        dm."conversationId" as "conversationId",
        max(dm."createdAt") as "lastMessageAt"
      from "DirectMessage" dm
      inner join conversations_with_other cwo
        on cwo."conversationId" = dm."conversationId"
      where dm."deleted" = false
        and dm."createdAt" >= ${recentCutoff}
      group by dm."conversationId"
    )
    select
      cwo."conversationId" as "conversationId",
      om."serverId" as "serverId",
      om."id" as "memberId",
      om."profileId" as "profileId",
      coalesce(nullif(trim(up."profileName"), ''), u."name", u."email", 'User') as "displayName",
      coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
      up."avatarDecorationUrl" as "avatarDecorationUrl",
      coalesce(up."createdAt", u."account.created") as "profileCreatedAt",
      rc."lastMessageAt" as "lastMessageAt",
      0 as "unreadCount"
    from conversations_with_other cwo
    inner join recent_conversations rc on rc."conversationId" = cwo."conversationId"
    inner join "Member" om on om."id" = cwo."otherMemberId"
    left join "Users" u on u."userId" = om."profileId"
    left join "UserProfile" up on up."userId" = om."profileId"
    where 1 = 1
      ${normalizedSelectedServerId ? sql`and om."serverId" = ${normalizedSelectedServerId}` : sql``}
    group by
      cwo."conversationId",
      om."serverId",
      om."id",
      om."profileId",
      coalesce(nullif(trim(up."profileName"), ''), u."name", u."email", 'User'),
      coalesce(u."avatarUrl", u."avatar", u."icon"),
      up."avatarDecorationUrl",
      coalesce(up."createdAt", u."account.created"),
      rc."lastMessageAt"
    order by "lastMessageAt" desc
    limit 50
  `);

  const rows = (result as unknown as {
    rows: Array<{
      conversationId: string;
      serverId: string;
      memberId: string;
      profileId: string;
      displayName: string;
      imageUrl: string | null;
      avatarDecorationUrl: string | null;
      profileCreatedAt: Date | string | null;
      lastMessageAt: Date | string;
      unreadCount: number | string;
    }>;
  }).rows ?? [];

  return rows.map((row) => ({
    conversationId: row.conversationId,
    serverId: row.serverId,
    memberId: row.memberId,
    profileId: row.profileId,
    displayName: row.displayName,
    imageUrl: row.imageUrl,
    avatarDecorationUrl: row.avatarDecorationUrl ?? null,
    profileCreatedAt: row.profileCreatedAt ? new Date(row.profileCreatedAt) : null,
    lastMessageAt: new Date(row.lastMessageAt),
    unreadCount: Number(row.unreadCount ?? 0),
  }));
};

export const getRecentDmRailItemForProfile = async ({
  profileId,
  conversationId,
  selectedServerId,
  recentWindowDays = 30,
}: {
  profileId: string;
  conversationId: string;
  selectedServerId?: string | null;
  recentWindowDays?: number;
}): Promise<SerializedRecentDmRailItem | null> => {
  if (!profileId || !conversationId) {
    return null;
  }

  const items = await getGlobalRecentDmsForProfile({
    profileId,
    selectedServerId,
    recentWindowDays,
  });

  const match = items.find((item) => item.conversationId === conversationId);
  return match ? serializeRecentDmRailItem(match) : null;
};

export const markConversationRead = async ({
  profileId,
  conversationId,
}: {
  profileId: string;
  conversationId: string;
}) => {
  if (!profileId || !conversationId) {
    return;
  }

  // No persisted read-state table in this codebase yet.
  // This intentionally no-ops to keep existing call sites stable.
};
