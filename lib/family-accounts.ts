import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  getFamilyLifecycleState,
  normalizeFamilyLinkStateLabel,
  type FamilyLifecycleState,
} from "@/lib/family-lifecycle";

export type { FamilyLifecycleState };

let familyAccountSchemaReady = false;

export const ensureFamilyAccountSchema = async () => {
  if (familyAccountSchemaReady) {
    return;
  }

  await db.execute(sql`
    alter table "Users"
    add column if not exists "familyParentUserId" varchar(191)
  `);

  await db.execute(sql`
    create index if not exists "Users_familyParentUserId_idx"
    on "Users" ("familyParentUserId")
  `);

  familyAccountSchemaReady = true;
};

export { getFamilyLifecycleState, normalizeFamilyLinkStateLabel };

export const autoConvertFamilyAccountIfNeeded = async (
  userId: string,
  dateOfBirth: string | null | undefined,
  familyParentUserId: string | null | undefined
) => {
  const lifecycle = getFamilyLifecycleState(dateOfBirth, familyParentUserId);

  if (!lifecycle.shouldAutoConvert) {
    return {
      familyParentUserId: String(familyParentUserId ?? "").trim() || null,
      lifecycle,
      wasAutoConverted: false,
    };
  }

  await ensureFamilyAccountSchema();

  await db.execute(sql`
    update "Users"
    set "familyParentUserId" = null
    where "userId" = ${userId}
  `);

  const normalizedLifecycle = getFamilyLifecycleState(dateOfBirth, null);

  return {
    familyParentUserId: null,
    lifecycle: normalizedLifecycle,
    wasAutoConverted: true,
  };
};

