import { db } from "@/lib/db";
import { and, eq, or, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { conversation } from "@/lib/db";

export const getOrCreateConversation = async (
  memberOneId: string,
  memberTwoId: string
) => {
  let conversation = await findConversation(memberOneId, memberTwoId);

  if (!conversation) {
    conversation = await createConversation(memberOneId, memberTwoId);
  }

  return conversation;
};

const hydrateConversation = async (conversationId: string) => {
  const result = await db.execute(sql`
    select
      c."id" as "conversationId",

      m1."id" as "memberOneId",
      m1."role" as "memberOneRole",
      m1."profileId" as "memberOneProfileId",
      m1."serverId" as "memberOneServerId",
      m1."createdAt" as "memberOneCreatedAt",
      m1."updatedAt" as "memberOneUpdatedAt",
      u1."userId" as "memberOneUserId",
      coalesce(nullif(trim(up1."profileName"), ''), u1."name", u1."email", 'User') as "memberOneName",
      u1."email" as "memberOneEmail",
      coalesce(u1."avatarUrl", u1."avatar", u1."icon") as "memberOneImageUrl",
      u1.[account.created] as "memberOneAccountCreated",
      u1."lastLogin" as "memberOneLastLogin",

      m2."id" as "memberTwoId",
      m2."role" as "memberTwoRole",
      m2."profileId" as "memberTwoProfileId",
      m2."serverId" as "memberTwoServerId",
      m2."createdAt" as "memberTwoCreatedAt",
      m2."updatedAt" as "memberTwoUpdatedAt",
      u2."userId" as "memberTwoUserId",
      coalesce(nullif(trim(up2."profileName"), ''), u2."name", u2."email", 'User') as "memberTwoName",
      u2."email" as "memberTwoEmail",
      coalesce(u2."avatarUrl", u2."avatar", u2."icon") as "memberTwoImageUrl",
      u2.[account.created] as "memberTwoAccountCreated",
      u2."lastLogin" as "memberTwoLastLogin"
    from "Conversation" c
    left join "Member" m1 on m1."id" = c."memberOneId"
    left join "Users" u1 on u1."userId" = m1."profileId"
    left join "UserProfile" up1 on up1."userId" = m1."profileId"
    left join "Member" m2 on m2."id" = c."memberTwoId"
    left join "Users" u2 on u2."userId" = m2."profileId"
    left join "UserProfile" up2 on up2."userId" = m2."profileId"
    where c."id" = ${conversationId}
    limit 1
  `);

  const row = (
    result as unknown as {
      rows: Array<{
        conversationId: string;
        memberOneId: string;
        memberOneRole: string;
        memberOneProfileId: string;
        memberOneServerId: string;
        memberOneCreatedAt: Date | string;
        memberOneUpdatedAt: Date | string;
        memberOneUserId: string | null;
        memberOneName: string | null;
        memberOneEmail: string | null;
        memberOneImageUrl: string | null;
        memberOneAccountCreated: Date | string | null;
        memberOneLastLogin: Date | string | null;
        memberTwoId: string;
        memberTwoRole: string;
        memberTwoProfileId: string;
        memberTwoServerId: string;
        memberTwoCreatedAt: Date | string;
        memberTwoUpdatedAt: Date | string;
        memberTwoUserId: string | null;
        memberTwoName: string | null;
        memberTwoEmail: string | null;
        memberTwoImageUrl: string | null;
        memberTwoAccountCreated: Date | string | null;
        memberTwoLastLogin: Date | string | null;
      }>;
    }
  ).rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.conversationId,
    memberOne: {
      id: row.memberOneId,
      role: row.memberOneRole,
      profileId: row.memberOneProfileId,
      serverId: row.memberOneServerId,
      createdAt: new Date(row.memberOneCreatedAt),
      updatedAt: new Date(row.memberOneUpdatedAt),
      profile: {
        id: row.memberOneUserId ?? row.memberOneProfileId,
        userId: row.memberOneUserId ?? row.memberOneProfileId,
        name: row.memberOneName ?? row.memberOneEmail ?? "User",
        email: row.memberOneEmail ?? "",
        imageUrl: row.memberOneImageUrl ?? "/in-accord-steampunk-logo.png",
        createdAt: row.memberOneAccountCreated
          ? new Date(row.memberOneAccountCreated)
          : new Date(0),
        updatedAt: row.memberOneLastLogin
          ? new Date(row.memberOneLastLogin)
          : new Date(0),
      },
    },
    memberTwo: {
      id: row.memberTwoId,
      role: row.memberTwoRole,
      profileId: row.memberTwoProfileId,
      serverId: row.memberTwoServerId,
      createdAt: new Date(row.memberTwoCreatedAt),
      updatedAt: new Date(row.memberTwoUpdatedAt),
      profile: {
        id: row.memberTwoUserId ?? row.memberTwoProfileId,
        userId: row.memberTwoUserId ?? row.memberTwoProfileId,
        name: row.memberTwoName ?? row.memberTwoEmail ?? "User",
        email: row.memberTwoEmail ?? "",
        imageUrl: row.memberTwoImageUrl ?? "/in-accord-steampunk-logo.png",
        createdAt: row.memberTwoAccountCreated
          ? new Date(row.memberTwoAccountCreated)
          : new Date(0),
        updatedAt: row.memberTwoLastLogin
          ? new Date(row.memberTwoLastLogin)
          : new Date(0),
      },
    },
  };
};

const findConversation = async (memberOneId: string, memberTwoId: string) => {
  try {
    const existing = await db.query.conversation.findFirst({
      where: or(
        and(
          eq(conversation.memberOneId, memberOneId),
          eq(conversation.memberTwoId, memberTwoId)
        ),
        and(
          eq(conversation.memberOneId, memberTwoId),
          eq(conversation.memberTwoId, memberOneId)
        )
      ),
    });

    if (!existing) {
      return null;
    }

    return await hydrateConversation(existing.id);
  } catch (error) {
    return null;
  }
};

const createConversation = async (memberOneId: string, memberTwoId: string) => {
  try {
    const nowId = uuidv4();

    await db.insert(conversation).values({
        id: nowId,
        memberOneId,
        memberTwoId,
    });

    return await hydrateConversation(nowId);
  } catch (error) {
    return null;
  }
};
