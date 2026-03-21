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

type SqlExecutor = Pick<typeof db, "execute">;

export const addMessageReaction = async ({
  messageId,
  scope,
  emoji,
  count = 1,
  executor = db,
}: {
  messageId: string;
  scope: "channel" | "direct";
  emoji: string;
  count?: number;
  executor?: SqlExecutor;
}) => {
  const normalizedMessageId = String(messageId ?? "").trim();
  const normalizedEmoji = String(emoji ?? "").trim().slice(0, 32);
  const safeCount = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1;

  if (!normalizedMessageId || !normalizedEmoji) {
    return;
  }

  await ensureMessageReactionSchema();
  const now = new Date();

  await executor.execute(sql`
    insert into "MessageReaction" (
      "id",
      "messageId",
      "scope",
      "emoji",
      "count",
      "createdAt",
      "updatedAt"
    )
    values (
      ${crypto.randomUUID()},
      ${normalizedMessageId},
      ${scope},
      ${normalizedEmoji},
      ${safeCount},
      ${now},
      ${now}
    )
    on conflict ("messageId", "scope", "emoji") do update
    set
      "count" = "MessageReaction"."count" + ${safeCount},
      "updatedAt" = excluded."updatedAt"
  `);
};
