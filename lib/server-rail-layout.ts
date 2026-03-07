import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export type ServerRailFolder = {
  id: string;
  name: string;
  serverIds: string[];
};

let serverRailLayoutSchemaReady = false;
const GLOBAL_SERVER_RAIL_LAYOUT_KEY = "__GLOBAL__";

export const normalizeServerRailFolders = (input: unknown): ServerRailFolder[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const maybeFolder = item as Partial<ServerRailFolder>;

      if (typeof maybeFolder.id !== "string" || typeof maybeFolder.name !== "string") {
        return null;
      }

      const serverIds = Array.isArray(maybeFolder.serverIds)
        ? Array.from(new Set(maybeFolder.serverIds.filter((id): id is string => typeof id === "string")))
        : [];

      return {
        id: maybeFolder.id,
        name: maybeFolder.name,
        serverIds,
      };
    })
    .filter((item): item is ServerRailFolder => item !== null);
};

export const ensureServerRailLayoutSchema = async () => {
  if (serverRailLayoutSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "ServerRailLayout" (
      "profileId" varchar(191) primary key,
      "foldersJson" text not null default '[]',
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    create index if not exists "ServerRailLayout_updatedAt_idx"
    on "ServerRailLayout" ("updatedAt")
  `);

  serverRailLayoutSchemaReady = true;
};

export const getServerRailFolders = async (): Promise<ServerRailFolder[]> => {
  await ensureServerRailLayoutSchema();

  const result = await db.execute(sql`
    select "foldersJson"
    from "ServerRailLayout"
    where "profileId" = ${GLOBAL_SERVER_RAIL_LAYOUT_KEY}
    limit 1
  `);

  const row = (result as unknown as {
    rows: Array<{ foldersJson: string | null }>;
  }).rows?.[0];

  if (row?.foldersJson) {
    try {
      const parsed = JSON.parse(row.foldersJson) as unknown;
      return normalizeServerRailFolders(parsed);
    } catch {
      return [];
    }
  }

  const fallbackResult = await db.execute(sql`
    select "foldersJson"
    from "ServerRailLayout"
    where "foldersJson" is not null
      and trim("foldersJson") <> ''
    order by "updatedAt" desc
    limit 1
  `);

  const fallbackRow = (fallbackResult as unknown as {
    rows: Array<{ foldersJson: string | null }>;
  }).rows?.[0];

  if (!fallbackRow?.foldersJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(fallbackRow.foldersJson) as unknown;
    const normalized = normalizeServerRailFolders(parsed);

    if (normalized.length > 0) {
      await upsertServerRailFolders(normalized);
    }

    return normalized;
  } catch {
    return [];
  }
};

export const upsertServerRailFolders = async (folders: ServerRailFolder[]) => {
  const payload = JSON.stringify(normalizeServerRailFolders(folders));

  await ensureServerRailLayoutSchema();

  await db.execute(sql`
    insert into "ServerRailLayout" ("profileId", "foldersJson", "updatedAt")
    values (${GLOBAL_SERVER_RAIL_LAYOUT_KEY}, ${payload}, now())
    on conflict ("profileId") do update
    set "foldersJson" = excluded."foldersJson",
        "updatedAt" = excluded."updatedAt"
  `);
};
