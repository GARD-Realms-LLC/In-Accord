import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export const ensureFriendRelationsSchema = async () => {
  await db.execute(sql`
    create table if not exists "FriendRequest" (
      "id" varchar(191) primary key,
      "requesterProfileId" varchar(191) not null,
      "recipientProfileId" varchar(191) not null,
      "status" varchar(32) not null default 'PENDING',
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    create index if not exists "FriendRequest_requester_idx"
    on "FriendRequest" ("requesterProfileId")
  `);

  await db.execute(sql`
    create index if not exists "FriendRequest_recipient_idx"
    on "FriendRequest" ("recipientProfileId")
  `);

  await db.execute(sql`
    create index if not exists "FriendRequest_status_idx"
    on "FriendRequest" ("status")
  `);

  await db.execute(sql`
    create table if not exists "BlockedProfile" (
      "profileId" varchar(191) not null,
      "blockedProfileId" varchar(191) not null,
      "createdAt" timestamp not null,
      primary key ("profileId", "blockedProfileId")
    )
  `);

  await db.execute(sql`
    create index if not exists "BlockedProfile_blocked_idx"
    on "BlockedProfile" ("blockedProfileId")
  `);

  // Canonicalize historical rows that may have stored Member IDs instead of profile IDs.
  await db.execute(sql`
    update "FriendRequest" fr
    set
      "requesterProfileId" = coalesce(
        (
          select m."profileId"
          from "Member" m
          where m."id" = fr."requesterProfileId"
          limit 1
        ),
        fr."requesterProfileId"
      ),
      "recipientProfileId" = coalesce(
        (
          select m."profileId"
          from "Member" m
          where m."id" = fr."recipientProfileId"
          limit 1
        ),
        fr."recipientProfileId"
      ),
      "updatedAt" = now()
    where
      exists (
        select 1
        from "Member" m
        where m."id" = fr."requesterProfileId"
      )
      or exists (
        select 1
        from "Member" m
        where m."id" = fr."recipientProfileId"
      )
  `);

  // Cleanup any previously auto-generated accepted rows from conversation pairs.
  // Friend requests must stay explicit and only become ACCEPTED via user action.
  await db.execute(sql`
    delete from "FriendRequest"
    where "id" like 'conv-%'
  `);
};
