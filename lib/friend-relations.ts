import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

let friendRelationsReady = false;

export const ensureFriendRelationsSchema = async () => {
  if (friendRelationsReady) {
    return;
  }

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

  friendRelationsReady = true;
};
