import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export interface GlobalRecentDmItem {
  conversationId: string;
  serverId: string;
  memberId: string;
  displayName: string;
  imageUrl: string | null;
  lastMessageAt: Date;
  unreadCount: number;
}

export const getGlobalRecentDmsForProfile = async ({
  profileId,
}: {
  profileId: string;
}): Promise<GlobalRecentDmItem[]> => {
  if (!profileId) {
    return [];
  }

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
    )
    select
      cwo."conversationId" as "conversationId",
      om."serverId" as "serverId",
      om."id" as "memberId",
      coalesce(nullif(trim(up."profileName"), ''), u."name", u."email", 'User') as "displayName",
      coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
      coalesce(max(dm."createdAt"), now()) as "lastMessageAt",
      0::integer as "unreadCount"
    from conversations_with_other cwo
    inner join "Member" om on om."id" = cwo."otherMemberId"
    left join "Users" u on u."userId" = om."profileId"
    left join "UserProfile" up on up."userId" = om."profileId"
    left join "DirectMessage" dm on dm."conversationId" = cwo."conversationId"
    group by
      cwo."conversationId",
      om."serverId",
      om."id",
      coalesce(nullif(trim(up."profileName"), ''), u."name", u."email", 'User'),
      coalesce(u."avatarUrl", u."avatar", u."icon")
    order by max(dm."createdAt") desc nulls last
    limit 50
  `);

  const rows = (result as unknown as {
    rows: Array<{
      conversationId: string;
      serverId: string;
      memberId: string;
      displayName: string;
      imageUrl: string | null;
      lastMessageAt: Date | string;
      unreadCount: number | string;
    }>;
  }).rows ?? [];

  return rows.map((row) => ({
    conversationId: row.conversationId,
    serverId: row.serverId,
    memberId: row.memberId,
    displayName: row.displayName,
    imageUrl: row.imageUrl,
    lastMessageAt: new Date(row.lastMessageAt),
    unreadCount: Number(row.unreadCount ?? 0),
  }));
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
