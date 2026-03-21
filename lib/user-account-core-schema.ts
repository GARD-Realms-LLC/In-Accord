import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

let userAccountCoreSchemaReady = false;

export const ensureUserAccountCoreSchema = async () => {
  if (userAccountCoreSchemaReady) {
    return;
  }

  await db.execute(sql`
    alter table "Users"
    add column if not exists "phone" varchar(32)
  `);

  await db.execute(sql`
    alter table "Users"
    add column if not exists "dob" date
  `);

  userAccountCoreSchemaReady = true;
};
