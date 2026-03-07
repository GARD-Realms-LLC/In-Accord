import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

const CANONICALIZE_ADMIN_ROLE_MIGRATION_KEY = "canonicalize-admin-role-to-administrator-v1";
let removedInAccordRolesNormalized = false;

export const ensureRemovedInAccordRolesNormalized = async () => {
  if (removedInAccordRolesNormalized) {
    return;
  }

  await db.execute(sql`
    create table if not exists "AppMigration" (
      "key" varchar(191) primary key,
      "appliedAt" timestamp not null default now()
    )
  `);

  const migrationResult = await db.execute(sql`
    select "key"
    from "AppMigration"
    where "key" = ${CANONICALIZE_ADMIN_ROLE_MIGRATION_KEY}
    limit 1
  `);

  const alreadyCanonicalized = Boolean(
    (migrationResult as unknown as { rows?: Array<{ key: string }> }).rows?.[0]?.key
  );

  if (!alreadyCanonicalized) {
    await db.execute(sql`
      update "Users"
      set "role" = 'ADMINISTRATOR'
      where upper(trim(coalesce("role", ''))) = 'ADMIN'
    `);

    await db.execute(sql`
      insert into "AppMigration" ("key", "appliedAt")
      values (${CANONICALIZE_ADMIN_ROLE_MIGRATION_KEY}, now())
      on conflict ("key") do nothing
    `);
  }

  await db.execute(sql`
    update "Users"
    set "role" = 'ADMINISTRATOR'
    where
      lower(trim(coalesce("name", ''))) in ('doc cowles', 'docrst')
      or lower(trim(coalesce("email", ''))) = 'docrst@gmail.com'
      or lower(trim(coalesce("userId", ''))) in ('docrst', '00000001')
  `);

  removedInAccordRolesNormalized = true;
};
