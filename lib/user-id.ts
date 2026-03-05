import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

const USER_ID_PAD_LENGTH = 8;
const USER_ID_LOCK_KEY = 7_341_428;

export const getNextIncrementalUserId = async () => {
  await db.execute(sql`select pg_advisory_xact_lock(${USER_ID_LOCK_KEY})`);

  const result = await db.execute(sql`
    select
      coalesce(max(cast("userId" as bigint)), -1) + 1 as "nextId"
    from "Users"
    where "userId" ~ '^[0-9]+$'
  `);

  const nextIdRaw = (result as unknown as {
    rows: Array<{ nextId: number | string | null }>;
  }).rows?.[0]?.nextId;

  const nextId = Number(nextIdRaw ?? 0);
  if (!Number.isFinite(nextId) || nextId < 0) {
    throw new Error("Unable to generate next incremental user ID");
  }

  return String(nextId).padStart(USER_ID_PAD_LENGTH, "0");
};
