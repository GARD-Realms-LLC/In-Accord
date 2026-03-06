import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

let messageReactionSchemaReady = false;

export const ensureMessageReactionSchema = async () => {
  if (messageReactionSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "MessageReaction" (
      "id" varchar(191) primary key,
      "messageId" varchar(191) not null,
      "scope" varchar(16) not null,
      "emoji" varchar(32) not null,
      "count" integer not null default 0,
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    create unique index if not exists "MessageReaction_message_scope_emoji_uq"
    on "MessageReaction" ("messageId", "scope", "emoji")
  `);

  await db.execute(sql`
    create index if not exists "MessageReaction_message_scope_idx"
    on "MessageReaction" ("messageId", "scope")
  `);

  messageReactionSchemaReady = true;
};
