import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export type ServerRailFolder = {
  id: string;
  name: string;
  serverIds: string[];
  background?: string;
};

const normalizeFolderBackground = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return /^#([0-9a-fA-F]{6})$/.test(normalized) ? normalized.toLowerCase() : undefined;
};

let serverRailLayoutSchemaReady = false;

export const normalizeServerRailFolders = (input: unknown): ServerRailFolder[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  const folders: ServerRailFolder[] = [];

  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const maybeFolder = item as Partial<ServerRailFolder>;

    if (typeof maybeFolder.id !== "string" || typeof maybeFolder.name !== "string") {
      continue;
    }

    const serverIds = Array.isArray(maybeFolder.serverIds)
      ? Array.from(new Set(maybeFolder.serverIds.filter((id): id is string => typeof id === "string")))
      : [];

    folders.push({
      id: maybeFolder.id,
      name: maybeFolder.name,
      serverIds,
      background: normalizeFolderBackground(maybeFolder.background),
    });
  }

  return folders;
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

export const getServerRailFolders = async (profileId: string): Promise<ServerRailFolder[]> => {
  const normalizedProfileId = String(profileId ?? "").trim();
  if (!normalizedProfileId) {
    return [];
  }

  await ensureServerRailLayoutSchema();

  const result = await db.execute(sql`
    select "foldersJson"
    from "ServerRailLayout"
    where "profileId" = ${normalizedProfileId}
    limit 1
  `);

  const row = (result as unknown as {
    rows: Array<{ foldersJson: string | null }>;
  }).rows?.[0];

  try {
    const parsed =
      typeof row?.foldersJson === "string"
        ? (JSON.parse(row.foldersJson) as unknown)
        : row?.foldersJson;
    return normalizeServerRailFolders(parsed);
  } catch {
    return [];
  }
};

export const upsertServerRailFolders = async (profileId: string, folders: ServerRailFolder[]) => {
  const normalizedProfileId = String(profileId ?? "").trim();
  if (!normalizedProfileId) {
    return;
  }

  const payload = JSON.stringify(normalizeServerRailFolders(folders));

  await ensureServerRailLayoutSchema();

  await db.execute(sql`
    insert into "ServerRailLayout" ("profileId", "foldersJson", "updatedAt")
    values (${normalizedProfileId}, ${payload}, CURRENT_TIMESTAMP)
    on conflict ("profileId") do update
    set "foldersJson" = excluded."foldersJson",
        "updatedAt" = excluded."updatedAt"
  `);
};

export const removeServerFromServerRailFolders = async (serverId: string) => {
  const normalizedServerId = String(serverId ?? "").trim();
  if (!normalizedServerId) {
    return;
  }

  await ensureServerRailLayoutSchema();

  const result = await db.execute(sql`
    select "profileId", "foldersJson"
    from "ServerRailLayout"
  `);

  const rows = (result as unknown as {
    rows?: Array<{ profileId: string | null; foldersJson: string | null }>;
  }).rows ?? [];

  for (const row of rows) {
    const normalizedProfileId = String(row.profileId ?? "").trim();
    if (!normalizedProfileId) {
      continue;
    }

    let folders: ServerRailFolder[] = [];
    try {
      folders = normalizeServerRailFolders(
        typeof row.foldersJson === "string" ? JSON.parse(row.foldersJson) : row.foldersJson
      );
    } catch {
      folders = [];
    }

    const nextFolders = normalizeServerRailFolders(
      folders
        .map((folder) => ({
          ...folder,
          serverIds: folder.serverIds.filter((id) => id !== normalizedServerId),
        }))
        .filter((folder) => folder.serverIds.length > 0)
    );

    await upsertServerRailFolders(normalizedProfileId, nextFolders);
  }
};
