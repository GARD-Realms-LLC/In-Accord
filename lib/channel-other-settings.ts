import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

let channelOtherSettingsSchemaReady = false;

export const ensureChannelOtherSettingsSchema = async () => {
  if (channelOtherSettingsSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "ChannelOtherSettings" (
      "channelId" varchar(191) primary key,
      "serverId" varchar(191) not null,
      "OtherType" integer,
      "rawSettingsJson" text not null default '{}',
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    create index if not exists "ChannelOtherSettings_serverId_idx"
    on "ChannelOtherSettings" ("serverId")
  `);

  channelOtherSettingsSchemaReady = true;
};
