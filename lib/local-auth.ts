import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

let schemaReady = false;

export const hasLocalAuthSchema = async () => {
  const result = await db.execute(sql`
    select to_regclass('"LocalCredential"') is not null as "exists"
  `);

  const rows = (result as unknown as {
    rows?: Array<{ exists?: boolean | null }>;
  }).rows;

  return rows?.[0]?.exists === true;
};

export const hasLegacyUserPasswordHashColumn = async () => {
  const result = await db.execute(sql`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = current_schema()
        and table_name = 'Users'
        and column_name = 'password_hash'
    ) as "exists"
  `);

  const rows = (result as unknown as {
    rows?: Array<{ exists?: boolean | null }>;
  }).rows;

  return rows?.[0]?.exists === true;
};

export const ensureLocalAuthSchema = async () => {
  if (schemaReady) {
    return;
  }

  if (await hasLocalAuthSchema()) {
    schemaReady = true;
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
