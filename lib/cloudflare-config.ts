import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export type CloudflareRuntimeConfig = {
  apiToken: string | null;
  accountId: string | null;
  zoneId: string | null;
  zoneName: string | null;
  updatedAt: string | null;
};

type CloudflareRuntimeConfigRow = {
  apiToken: string | null;
  accountId: string | null;
  zoneId: string | null;
  zoneName: string | null;
  updatedAt: Date | string | null;
};

let cloudflareConfigSchemaReady = false;

const normalizeToken = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  if (!normalized || /replace_me/i.test(normalized)) {
    return null;
  }

  return normalized.slice(0, 4096);
};

const normalizeText = (value: unknown, max = 191) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, max);
};

export const ensureCloudflareRuntimeConfigSchema = async () => {
  if (cloudflareConfigSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "InAccordCloudflareConfig" (
      "id" varchar(32) primary key,
      "apiToken" text,
      "accountId" varchar(191),
      "zoneId" varchar(191),
      "zoneName" varchar(191),
      "updatedAt" timestamp(3) not null default now()
    )
  `);

  await db.execute(sql`
    insert into "InAccordCloudflareConfig" ("id")
    values ('default')
    on conflict ("id") do nothing
  `);

  cloudflareConfigSchemaReady = true;
};

export const getCloudflareRuntimeConfig = async (): Promise<CloudflareRuntimeConfig> => {
  await ensureCloudflareRuntimeConfigSchema();

  const result = await db.execute(sql`
    select
      "apiToken" as "apiToken",
      "accountId" as "accountId",
      "zoneId" as "zoneId",
      "zoneName" as "zoneName",
      "updatedAt" as "updatedAt"
    from "InAccordCloudflareConfig"
    where "id" = 'default'
    limit 1
  `);

  const row = ((result as unknown as { rows?: CloudflareRuntimeConfigRow[] }).rows ?? [])[0];

  return {
    apiToken: normalizeToken(row?.apiToken),
    accountId: normalizeText(row?.accountId),
    zoneId: normalizeText(row?.zoneId),
    zoneName: normalizeText(row?.zoneName),
    updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
};

export const updateCloudflareRuntimeConfig = async (updates: {
  apiToken?: string | null;
  accountId?: string | null;
  zoneId?: string | null;
  zoneName?: string | null;
}) => {
  await ensureCloudflareRuntimeConfigSchema();

  const clauses = [sql`"updatedAt" = now()`];

  if (Object.prototype.hasOwnProperty.call(updates, "apiToken")) {
    clauses.push(sql`"apiToken" = ${normalizeToken(updates.apiToken)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "accountId")) {
    clauses.push(sql`"accountId" = ${normalizeText(updates.accountId)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "zoneId")) {
    clauses.push(sql`"zoneId" = ${normalizeText(updates.zoneId)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "zoneName")) {
    clauses.push(sql`"zoneName" = ${normalizeText(updates.zoneName)}`);
  }

  await db.execute(sql`
    update "InAccordCloudflareConfig"
    set ${sql.join(clauses, sql`, `)}
    where "id" = 'default'
  `);

  return getCloudflareRuntimeConfig();
};
