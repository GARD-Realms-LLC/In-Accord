import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export const serverTagIconOptions = [
  { key: "bolt", label: "Bolt", emoji: "⚡" },
  { key: "shield", label: "Shield", emoji: "🛡️" },
  { key: "star", label: "Star", emoji: "⭐" },
  { key: "crown", label: "Crown", emoji: "👑" },
  { key: "fire", label: "Fire", emoji: "🔥" },
  { key: "leaf", label: "Leaf", emoji: "🍃" },
  { key: "music", label: "Music", emoji: "🎵" },
  { key: "game", label: "Game", emoji: "🎮" },
] as const;

export const allowedServerTagIconKeys: Set<string> = new Set(
  serverTagIconOptions.map((item) => item.key)
);

let serverTagSchemaReady = false;

export const ensureServerTagSchema = async () => {
  if (serverTagSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "ServerTag" (
      "serverId" varchar(191) primary key,
      "tagCode" varchar(4) not null,
      "iconKey" varchar(32) not null,
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    create index if not exists "ServerTag_updatedAt_idx"
    on "ServerTag" ("updatedAt")
  `);

  serverTagSchemaReady = true;
};
