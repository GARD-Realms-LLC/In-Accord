import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

let serverOtherSettingsSchemaReady = false;

export const ensureServerOtherSettingsSchema = async () => {
  if (serverOtherSettingsSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "ServerOtherSettings" (
      "serverId" varchar(191) primary key,
      "rawSettingsJson" text not null default '{}',
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  serverOtherSettingsSchemaReady = true;
};