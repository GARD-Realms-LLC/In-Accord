import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  getFamilyLifecycleState,
  normalizeFamilyLinkStateLabel,
  type FamilyLifecycleState,
} from "@/lib/family-lifecycle";

export type { FamilyLifecycleState };

let businessAccountSchemaReady = false;

export const ensureBusinessAccountSchema = async () => {
  if (businessAccountSchemaReady) {
    return;
  }

  await db.execute(sql`
    alter table "Users"
    add column if not exists "businessParentUserId" varchar(191)
  `);

  await db.execute(sql`
    create index if not exists "Users_businessParentUserId_idx"
    on "Users" ("businessParentUserId")
  `);

  businessAccountSchemaReady = true;
};

export { getFamilyLifecycleState, normalizeFamilyLinkStateLabel };

export const autoConvertBusinessAccountIfNeeded = async (
  userId: string,
  dateOfBirth: string | null | undefined,
  businessParentUserId: string | null | undefined
) => {
  const lifecycle = getFamilyLifecycleState(dateOfBirth, businessParentUserId);

  if (!lifecycle.shouldAutoConvert) {
    return {
      businessParentUserId: String(businessParentUserId ?? "").trim() || null,
      lifecycle,
      wasAutoConverted: false,
    };
  }

  await ensureBusinessAccountSchema();

  await db.execute(sql`
    update "Users"
    set "businessParentUserId" = null
    where "userId" = ${userId}
  `);

  const normalizedLifecycle = getFamilyLifecycleState(dateOfBirth, null);

  return {
    businessParentUserId: null,
    lifecycle: normalizedLifecycle,
    wasAutoConverted: true,
  };
};
