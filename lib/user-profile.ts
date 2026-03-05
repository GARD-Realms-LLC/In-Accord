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
      "bannerUrl" text,
      "presenceStatus" varchar(16) not null default 'ONLINE',
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    alter table "UserProfile"
    add column if not exists "bannerUrl" text
  `);

  await db.execute(sql`
    alter table "UserProfile"
    add column if not exists "presenceStatus" varchar(16) not null default 'ONLINE'
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
      left(coalesce(nullif(trim(u."name"), ''), nullif(trim(u."email"), ''), 'User'), 80) as "profileName",
      ${now},
      ${now}
    from "Users" u
    on conflict ("userId") do nothing
  `);

  userProfileSchemaReady = true;
};
