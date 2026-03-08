import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

let userProfileSchemaReady = false;

export const ensureUserProfileSchema = async () => {
  if (userProfileSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "UserProfile" (
      "userId" varchar(191) primary key,
      "profileName" varchar(80) not null,
      "profileNameStyle" varchar(128),
      "nameplateLabel" varchar(40),
      "nameplateColor" varchar(20),
      "nameplateImageUrl" text,
      "pronouns" varchar(40),
      "comment" varchar(280),
      "avatarDecorationUrl" text,
      "bannerUrl" text,
      "presenceStatus" varchar(16) not null default 'ONLINE',
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    alter table "UserProfile"
    add column if not exists "avatarDecorationUrl" text
  `);

  await db.execute(sql`
    alter table "UserProfile"
    add column if not exists "bannerUrl" text
  `);

  await db.execute(sql`
    alter table "UserProfile"
    add column if not exists "profileNameStyle" varchar(128)
  `);

  await db.execute(sql`
    alter table "UserProfile"
    alter column "profileNameStyle" type varchar(128)
  `);

  await db.execute(sql`
    alter table "UserProfile"
    add column if not exists "nameplateLabel" varchar(40)
  `);

  await db.execute(sql`
    alter table "UserProfile"
    add column if not exists "nameplateColor" varchar(20)
  `);

  await db.execute(sql`
    alter table "UserProfile"
    add column if not exists "nameplateImageUrl" text
  `);

  await db.execute(sql`
    alter table "UserProfile"
    add column if not exists "presenceStatus" varchar(16) not null default 'ONLINE'
  `);

  await db.execute(sql`
    alter table "UserProfile"
    add column if not exists "pronouns" varchar(40)
  `);

  await db.execute(sql`
    alter table "UserProfile"
    add column if not exists "comment" varchar(280)
  `);

  await db.execute(sql`
    update "UserProfile"
    set "presenceStatus" = 'ONLINE'
    where "presenceStatus" is null or trim("presenceStatus") = ''
  `);

  const now = new Date();
  await db.execute(sql`
    insert into "UserProfile" ("userId", "profileName", "createdAt", "updatedAt")
    select
      u."userId",
      left(coalesce(nullif(trim(u."name"), ''), 'User'), 80) as "profileName",
      ${now},
      ${now}
    from "Users" u
    on conflict ("userId") do nothing
  `);

  userProfileSchemaReady = true;
};

export const getUserProfileNameMap = async (userIds: string[]) => {
  const normalizedUserIds = Array.from(
    new Set(
      userIds
        .map((userId) => String(userId ?? "").trim())
        .filter((userId) => userId.length > 0)
    )
  );

  if (normalizedUserIds.length === 0) {
    return new Map<string, string>();
  }

  await ensureUserProfileSchema();

  const values = normalizedUserIds.map((userId) => sql`(${userId})`);
  const userIdValues = sql.join(values, sql`, `);

  const result = await db.execute(sql`
    with "RequestedUsers" ("userId") as (
      values ${userIdValues}
    )
    select
      ru."userId" as "userId",
      up."profileName" as "profileName"
    from "RequestedUsers" ru
    left join "UserProfile" up on up."userId" = ru."userId"
  `);

  const rows = (result as unknown as {
    rows: Array<{
      userId: string;
      profileName: string | null;
    }>;
  }).rows;

  const map = new Map<string, string>();

  for (const row of rows ?? []) {
    const normalizedName = String(row.profileName ?? "").trim();
    if (normalizedName) {
      map.set(row.userId, normalizedName);
    }
  }

  return map;
};
