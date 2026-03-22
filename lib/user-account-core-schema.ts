import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ensureSchemaInitialized } from "@/lib/schema-init-state";

export const ensureUserAccountCoreSchema = async () => {
  await ensureSchemaInitialized("user-account-core-schema", async () => {
    await db.execute(sql`
      alter table "Users"
      add column if not exists "phone" varchar(32)
    `);

    await db.execute(sql`
      alter table "Users"
      add column if not exists "dob" date
    `);
  });
};
