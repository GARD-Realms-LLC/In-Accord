import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export type PatronageDonationType = "ONE_TIME" | "MONTHLY";
export type PatronageDonationStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "REFUNDED";

export const allowedPatronageDonationTypes = new Set<PatronageDonationType>(["ONE_TIME", "MONTHLY"]);
export const allowedPatronageDonationStatuses = new Set<PatronageDonationStatus>([
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "CANCELED",
  "REFUNDED",
]);

let patronageSchemaReady = false;

export const ensurePatronageSchema = async () => {
  if (patronageSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "PatronageDonation" (
      "id" varchar(191) primary key,
      "donorProfileId" varchar(191),
      "donorName" varchar(191),
      "donorEmail" varchar(191),
      "donationType" varchar(24) not null,
      "status" varchar(24) not null default 'SUCCEEDED',
      "amountCents" integer not null default 0,
      "currency" varchar(16) not null default 'USD',
      "provider" varchar(64),
      "providerReference" varchar(191),
      "note" text,
      "processedAt" timestamp,
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    create index if not exists "PatronageDonation_type_status_createdAt_idx"
    on "PatronageDonation" ("donationType", "status", "createdAt")
  `);

  await db.execute(sql`
    create index if not exists "PatronageDonation_email_createdAt_idx"
    on "PatronageDonation" ("donorEmail", "createdAt")
  `);

  patronageSchemaReady = true;
};

export const hasSucceededPatronage = async (profileId?: string | null): Promise<boolean> => {
  const normalizedProfileId = String(profileId ?? "").trim();
  if (!normalizedProfileId) {
    return false;
  }

  try {
    await ensurePatronageSchema();

    const result = await db.execute(sql`
      select 1
      from "PatronageDonation" p
      where p."donorProfileId" = ${normalizedProfileId}
        and p."status" = ${"SUCCEEDED"}
      limit 1
    `);

    const rows = (result as unknown as { rows?: Array<{ "?column?"?: number }> }).rows ?? [];
    return rows.length > 0;
  } catch {
    return false;
  }
};
