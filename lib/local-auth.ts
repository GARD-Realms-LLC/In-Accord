import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

let schemaReady = false;

export const ensureLocalAuthSchema = async () => {
  if (schemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "LocalCredential" (
      "userId" varchar(191) primary key,
      "passwordHash" varchar(255) not null,
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  schemaReady = true;
};
