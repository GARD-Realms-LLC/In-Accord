import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export type ServerNameBlacklistEntry = {
  name: string;
  normalizedName: string;
  createdByProfileId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

let serverNameBlacklistSchemaReady = false;

export const normalizeServerNameForBlacklist = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/["'`]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export const normalizeServerNameBlacklistNames = (input: unknown): string[] => {
  const rawValues = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/\r?\n/)
      : [];

  const deduped = new Map<string, string>();

  for (const value of rawValues) {
    const name = String(value ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80);

    if (!name) {
      continue;
    }

    const normalizedName = normalizeServerNameForBlacklist(name);
    if (!normalizedName || deduped.has(normalizedName)) {
      continue;
    }

    deduped.set(normalizedName, name);
  }

  return Array.from(deduped.entries())
    .sort((left, right) => left[1].localeCompare(right[1], undefined, { sensitivity: "base" }))
    .map(([, name]) => name)
    .slice(0, 500);
};

export const ensureServerNameBlacklistSchema = async () => {
  if (serverNameBlacklistSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "ServerNameBlacklist" (
      "normalizedName" text primary key,
      "name" text not null,
      "createdByProfileId" text,
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    create index if not exists "ServerNameBlacklist_name_idx"
    on "ServerNameBlacklist" ("name")
  `);

  serverNameBlacklistSchemaReady = true;
};

export const getServerNameBlacklistEntries = async (): Promise<ServerNameBlacklistEntry[]> => {
  await ensureServerNameBlacklistSchema();

  const result = await db.execute(sql`
    select
      "name",
      "normalizedName",
      "createdByProfileId",
      "createdAt",
      "updatedAt"
    from "ServerNameBlacklist"
    order by lower("name") asc
  `);

  const rows = (result as unknown as {
    rows?: Array<{
      name: string | null;
      normalizedName: string | null;
      createdByProfileId: string | null;
      createdAt: string | Date | null;
      updatedAt: string | Date | null;
    }>;
  }).rows ?? [];

  return rows
    .map((row) => ({
      name: String(row.name ?? "").trim(),
      normalizedName: String(row.normalizedName ?? "").trim(),
      createdByProfileId: String(row.createdByProfileId ?? "").trim() || null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    }))
    .filter((row) => row.name.length > 0 && row.normalizedName.length > 0);
};

export const findBlockedServerNameEntry = async (name: unknown): Promise<ServerNameBlacklistEntry | null> => {
  await ensureServerNameBlacklistSchema();

  const normalizedName = normalizeServerNameForBlacklist(name);
  if (!normalizedName) {
    return null;
  }

  const result = await db.execute(sql`
    select
      "name",
      "normalizedName",
      "createdByProfileId",
      "createdAt",
      "updatedAt"
    from "ServerNameBlacklist"
    where "normalizedName" = ${normalizedName}
    limit 1
  `);

  const row = (result as unknown as {
    rows?: Array<{
      name: string | null;
      normalizedName: string | null;
      createdByProfileId: string | null;
      createdAt: string | Date | null;
      updatedAt: string | Date | null;
    }>;
  }).rows?.[0];

  if (!row) {
    return null;
  }

  return {
    name: String(row.name ?? "").trim(),
    normalizedName: String(row.normalizedName ?? "").trim(),
    createdByProfileId: String(row.createdByProfileId ?? "").trim() || null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
};

export const replaceServerNameBlacklistEntries = async (
  names: unknown,
  actorProfileId: string | null
): Promise<ServerNameBlacklistEntry[]> => {
  await ensureServerNameBlacklistSchema();

  const normalizedNames = normalizeServerNameBlacklistNames(names);
  const now = new Date();

  await db.transaction(async (tx: any) => {
    await tx.execute(sql`delete from "ServerNameBlacklist"`);

    for (const name of normalizedNames) {
      await tx.execute(sql`
        insert into "ServerNameBlacklist" (
          "normalizedName",
          "name",
          "createdByProfileId",
          "createdAt",
          "updatedAt"
        )
        values (
          ${normalizeServerNameForBlacklist(name)},
          ${name},
          ${actorProfileId},
          ${now},
          ${now}
        )
      `);
    }
  });

  return getServerNameBlacklistEntries();
};