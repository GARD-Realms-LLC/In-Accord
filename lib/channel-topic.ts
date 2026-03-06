import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

let channelTopicSchemaReady = false;

export const ensureChannelTopicSchema = async () => {
  if (channelTopicSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "ChannelTopic" (
      "channelId" varchar(191) primary key,
      "serverId" varchar(191) not null,
      "topic" text,
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    create index if not exists "ChannelTopic_serverId_idx"
    on "ChannelTopic" ("serverId")
  `);

  channelTopicSchemaReady = true;
};
