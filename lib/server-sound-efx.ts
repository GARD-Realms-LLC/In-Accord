import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

let serverSoundEfxSchemaReady = false;

export const normalizeSoundEfxName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

export const isValidSoundEfxName = (value: string) => /^[a-z0-9_]{2,32}$/.test(value);

export const normalizeAudioUrl = (value: unknown) => String(value ?? "").trim();

export const isValidAudioUrl = (value: string) => /^(https?:\/\/|\/)/i.test(value);

export const ensureServerSoundEfxSchema = async () => {
  if (serverSoundEfxSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "ServerSoundEfx" (
      "id" varchar(191) primary key,
      "serverId" varchar(191) not null,
      "name" varchar(64) not null,
      "audioUrl" text not null,
      "isEnabled" boolean not null default true,
      "createdByProfileId" varchar(191),
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    create index if not exists "ServerSoundEfx_serverId_idx"
    on "ServerSoundEfx" ("serverId")
  `);

  await db.execute(sql`
    create index if not exists "ServerSoundEfx_updatedAt_idx"
    on "ServerSoundEfx" ("updatedAt")
  `);

  await db.execute(sql`
    create unique index if not exists "ServerSoundEfx_serverId_name_uq"
    on "ServerSoundEfx" ("serverId", "name")
  `);

  serverSoundEfxSchemaReady = true;
};
