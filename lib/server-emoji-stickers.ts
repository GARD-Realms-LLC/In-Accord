import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export type ServerEmojiStickerAssetType = "EMOJI" | "STICKER";

export const allowedServerEmojiStickerAssetTypes = new Set<ServerEmojiStickerAssetType>([
  "EMOJI",
  "STICKER",
]);

let serverEmojiStickerSchemaReady = false;

export const ensureServerEmojiStickerSchema = async () => {
  if (serverEmojiStickerSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "ServerEmojiSticker" (
      "id" varchar(191) primary key,
      "serverId" varchar(191) not null,
      "assetType" varchar(16) not null,
      "name" varchar(64) not null,
      "emoji" varchar(64),
      "imageUrl" text,
      "isEnabled" boolean not null default true,
      "createdByProfileId" varchar(191),
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    create index if not exists "ServerEmojiSticker_serverId_assetType_idx"
    on "ServerEmojiSticker" ("serverId", "assetType")
  `);

  await db.execute(sql`
    create index if not exists "ServerEmojiSticker_updatedAt_idx"
    on "ServerEmojiSticker" ("updatedAt")
  `);

  await db.execute(sql`
    create unique index if not exists "ServerEmojiSticker_serverId_assetType_name_uq"
    on "ServerEmojiSticker" ("serverId", "assetType", "name")
  `);

  await db.execute(sql`
    alter table "ServerEmojiSticker"
    add constraint "ServerEmojiSticker_assetType_check"
    check ("assetType" in ('EMOJI', 'STICKER'))
  `).catch(() => {
    // Constraint likely already exists.
  });

  serverEmojiStickerSchemaReady = true;
};
