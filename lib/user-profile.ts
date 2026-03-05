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
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
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
