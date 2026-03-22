import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

const USER_ID_PAD_LENGTH = 8;

export const getNextIncrementalUserId = async () => {
  const result = await db.execute(sql`
    select "userId"
    from "Users"
  `);

  const rows = (result as unknown as {
    rows?: Array<{ userId?: string | null }>;
  }).rows ?? [];

  let nextId = 0;
  for (const row of rows) {
    const rawUserId = String(row?.userId ?? "").trim();
    if (!/^\d+$/.test(rawUserId)) {
      continue;
    }

    const numericUserId = Number(rawUserId);
    if (!Number.isFinite(numericUserId) || numericUserId < 0) {
      continue;
    }

    nextId = Math.max(nextId, Math.floor(numericUserId) + 1);
  }

  if (!Number.isFinite(nextId) || nextId < 0) {
    throw new Error("Unable to generate next incremental user ID");
  }

  return String(nextId).padStart(USER_ID_PAD_LENGTH, "0");
};
