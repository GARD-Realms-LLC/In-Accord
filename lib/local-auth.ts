import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ensureSchemaInitialized } from "@/lib/schema-init-state";

const readExistsFlag = (value: unknown) =>
  value === true || value === 1 || value === "1";

export const hasLocalAuthSchema = async () => {
  const result = await db.execute(sql`
    select
      exists (
        select 1
        from sqlite_master
        where type = 'table'
          and name = 'LocalCredential'
      ) as "exists"
  `);

  const rows = (result as unknown as {
    rows?: Array<{ exists?: boolean | null }>;
  }).rows;

  return readExistsFlag(rows?.[0]?.exists);
};

export const hasLegacyUserPasswordHashColumn = async () => {
  const result = await db.execute(sql`
    select
      exists (
        select 1
        from pragma_table_info('Users')
        where name = 'password_hash'
      ) as "exists"
  `);

  const rows = (result as unknown as {
    rows?: Array<{ exists?: boolean | null }>;
  }).rows;

  return readExistsFlag(rows?.[0]?.exists);
};

export const ensureLocalAuthSchema = async () => {
  await ensureSchemaInitialized("local-auth-schema", async () => {
    if (await hasLocalAuthSchema()) {
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
  });
};
