import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

let channelGroupSchemaReady = false;

export const ensureChannelGroupSchema = async () => {
  if (channelGroupSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "ChannelGroup" (
      "id" varchar(191) primary key,
      "name" varchar(191) not null,
      "serverId" varchar(191) not null,
      "profileId" varchar(191) not null,
      "sortOrder" integer not null default 0,
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    alter table "ChannelGroup"
    add column if not exists "sortOrder" integer not null default 0
  `);

  await db.execute(sql`
    with ranked as (
      select
        g."id",
        row_number() over (
          partition by g."serverId"
          order by g."sortOrder" asc, g."createdAt" asc, g."id" asc
        ) as rn
      from "ChannelGroup" g
    )
    update "ChannelGroup" g
    set "sortOrder" = r.rn
    from ranked r
    where g."id" = r."id"
  `);

  await db.execute(sql`
    create index if not exists "ChannelGroup_serverId_idx"
    on "ChannelGroup" ("serverId")
  `);

  await db.execute(sql`
    create index if not exists "ChannelGroup_serverId_sortOrder_idx"
    on "ChannelGroup" ("serverId", "sortOrder")
  `);

  await db.execute(sql`
    alter table "Channel"
    add column if not exists "channelGroupId" varchar(191)
  `);

  await db.execute(sql`
    alter table "Channel"
    add column if not exists "sortOrder" integer not null default 0
  `);

  await db.execute(sql`
    with ranked as (
      select
        c."id",
        row_number() over (
          partition by c."serverId", coalesce(c."channelGroupId", '')
          order by c."sortOrder" asc, c."createdAt" asc, c."id" asc
        ) as rn
      from "Channel" c
    )
    update "Channel" c
    set "sortOrder" = r.rn
    from ranked r
    where c."id" = r."id"
  `);

  await db.execute(sql`
    create index if not exists "Channel_channelGroupId_idx"
    on "Channel" ("channelGroupId")
  `);

  await db.execute(sql`
    create index if not exists "Channel_serverId_group_sortOrder_idx"
    on "Channel" ("serverId", "channelGroupId", "sortOrder")
  `);

  // Dedupe channel names per server (case-insensitive, trimmed), keeping oldest.
  await db.execute(sql`
    with ranked as (
      select
        c."id",
        row_number() over (
          partition by c."serverId", lower(trim(coalesce(c."name", '')))
          order by c."createdAt" asc, c."id" asc
        ) as rn
      from "Channel" c
    )
    update "Channel" c
    set
      "name" = concat(
        coalesce(nullif(trim(c."name"), ''), 'channel'),
        '-',
        left(c."id", 6)
      ),
      "updatedAt" = now()
    from ranked r
    where c."id" = r."id"
      and r.rn > 1
  `);

  // Dedupe channel-group names per server (case-insensitive, trimmed), keeping oldest.
  await db.execute(sql`
    with ranked as (
      select
        g."id",
        row_number() over (
          partition by g."serverId", lower(trim(coalesce(g."name", '')))
          order by g."createdAt" asc, g."id" asc
        ) as rn
      from "ChannelGroup" g
    )
    update "ChannelGroup" g
    set
      "name" = concat(
        coalesce(nullif(trim(g."name"), ''), 'group'),
        '-',
        left(g."id", 6)
      ),
      "updatedAt" = now()
    from ranked r
    where g."id" = r."id"
      and r.rn > 1
  `);

  await db.execute(sql`
    create unique index if not exists "Channel_unique_name_per_server"
    on "Channel" (
      "serverId",
      lower(trim(coalesce("name", '')))
    )
  `);

  await db.execute(sql`
    create unique index if not exists "ChannelGroup_unique_name_per_server"
    on "ChannelGroup" (
      "serverId",
      lower(trim(coalesce("name", '')))
    )
  `);

  channelGroupSchemaReady = true;
};
