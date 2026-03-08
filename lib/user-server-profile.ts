import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

type UserServerProfileRow = {
  userId: string;
  serverId: string;
  profileName: string | null;
  profileNameStyle: string | null;
  comment: string | null;
  nameplateLabel: string | null;
  nameplateColor: string | null;
  nameplateImageUrl: string | null;
  avatarDecorationUrl: string | null;
  bannerUrl: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type UserServerProfile = {
  userId: string;
  serverId: string;
  profileName: string | null;
  profileNameStyle: string | null;
  comment: string | null;
  nameplateLabel: string | null;
  nameplateColor: string | null;
  nameplateImageUrl: string | null;
  avatarDecorationUrl: string | null;
  bannerUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

let userServerProfileSchemaReady = false;

export const ensureUserServerProfileSchema = async () => {
  if (userServerProfileSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "UserServerProfile" (
      "userId" varchar(191) not null,
      "serverId" varchar(191) not null,
      "profileName" varchar(80),
      "profileNameStyle" varchar(128),
      "comment" varchar(280),
      "nameplateLabel" varchar(40),
      "nameplateColor" varchar(20),
      "nameplateImageUrl" text,
      "avatarDecorationUrl" text,
      "bannerUrl" text,
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null,
      primary key ("userId", "serverId")
    )
  `);

  await db.execute(sql`
    alter table "UserServerProfile"
    add column if not exists "avatarDecorationUrl" text
  `);

  await db.execute(sql`
    alter table "UserServerProfile"
    add column if not exists "comment" varchar(280)
  `);

  await db.execute(sql`
    alter table "UserServerProfile"
    add column if not exists "profileNameStyle" varchar(128)
  `);

  await db.execute(sql`
    alter table "UserServerProfile"
    alter column "profileNameStyle" type varchar(128)
  `);

  await db.execute(sql`
    alter table "UserServerProfile"
    add column if not exists "nameplateLabel" varchar(40)
  `);

  await db.execute(sql`
    alter table "UserServerProfile"
    add column if not exists "nameplateColor" varchar(20)
  `);

  await db.execute(sql`
    alter table "UserServerProfile"
    add column if not exists "nameplateImageUrl" text
  `);

  await db.execute(sql`
    create index if not exists "UserServerProfile_serverId_idx"
    on "UserServerProfile" ("serverId")
  `);

  await db.execute(sql`
    create index if not exists "UserServerProfile_updatedAt_idx"
    on "UserServerProfile" ("updatedAt")
  `);

  userServerProfileSchemaReady = true;
};

export const getUserServerProfile = async (
  userId: string,
  serverId: string
): Promise<UserServerProfile | null> => {
  await ensureUserServerProfileSchema();

  const result = await db.execute(sql`
    select
      "userId",
      "serverId",
      "profileName",
      "profileNameStyle",
      "comment",
      "nameplateLabel",
      "nameplateColor",
      "nameplateImageUrl",
      "avatarDecorationUrl",
      "bannerUrl",
      "createdAt",
      "updatedAt"
    from "UserServerProfile"
    where "userId" = ${userId}
      and "serverId" = ${serverId}
    limit 1
  `);

  const row = (result as unknown as { rows?: UserServerProfileRow[] }).rows?.[0];

  if (!row) {
    return null;
  }

  return {
    userId: row.userId,
    serverId: row.serverId,
    profileName: row.profileName,
    profileNameStyle: row.profileNameStyle,
    comment: row.comment,
    nameplateLabel: row.nameplateLabel,
    nameplateColor: row.nameplateColor,
    nameplateImageUrl: row.nameplateImageUrl,
    avatarDecorationUrl: row.avatarDecorationUrl,
    bannerUrl: row.bannerUrl,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
};
