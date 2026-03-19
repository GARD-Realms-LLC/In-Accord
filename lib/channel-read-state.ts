import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db, member, message } from "@/lib/db";

let channelReadStateSchemaReady = false;

export const ensureChannelReadStateSchema = async () => {
  if (channelReadStateSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "ChannelReadState" (
      "channelId" varchar(191) not null,
      "profileId" varchar(191) not null,
      "lastReadAt" timestamp not null,
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null,
      primary key ("channelId", "profileId")
    )
  `);

  await db.execute(sql`
    create index if not exists "ChannelReadState_profileId_idx"
    on "ChannelReadState" ("profileId")
  `);

  await db.execute(sql`
    create index if not exists "ChannelReadState_channelId_idx"
    on "ChannelReadState" ("channelId")
  `);

  channelReadStateSchemaReady = true;
};

export const markChannelRead = async ({
  channelId,
  profileId,
  readAt,
}: {
  channelId: string;
  profileId: string;
  readAt?: Date;
}) => {
  if (!channelId || !profileId) {
    return;
  }

  await ensureChannelReadStateSchema();

  const now = readAt ?? new Date();

  await db.execute(sql`
    insert into "ChannelReadState" ("channelId", "profileId", "lastReadAt", "createdAt", "updatedAt")
    values (${channelId}, ${profileId}, ${now}, ${now}, ${now})
    on conflict ("channelId", "profileId")
    do update set
      "lastReadAt" = excluded."lastReadAt",
      "updatedAt" = excluded."updatedAt"
  `);
};

export const listUnreadChannelIds = async ({
  profileId,
  channelIds,
}: {
  profileId: string;
  channelIds: string[];
}) => {
  if (!profileId || channelIds.length === 0) {
    return new Set<string>();
  }

  await ensureChannelReadStateSchema();

  const uniqueChannelIds = Array.from(new Set(channelIds.map((value) => String(value ?? "").trim()).filter(Boolean)));

  if (uniqueChannelIds.length === 0) {
    return new Set<string>();
  }

  const rows = await db
    .select({
      channelId: message.channelId,
    })
    .from(message)
    .innerJoin(member, eq(member.id, message.memberId))
    .where(
      and(
        inArray(message.channelId, uniqueChannelIds),
        isNull(message.threadId),
        eq(message.deleted, false),
        sql`${member.profileId} <> ${profileId}`,
        sql`${message.createdAt} > coalesce((
          select crs."lastReadAt"
          from "ChannelReadState" crs
          where crs."channelId" = ${message.channelId}
            and crs."profileId" = ${profileId}
          limit 1
        ), timestamp 'epoch')`
      )
    )
    .groupBy(message.channelId);

  return new Set(rows.map((row) => String(row.channelId ?? "").trim()).filter(Boolean));
};