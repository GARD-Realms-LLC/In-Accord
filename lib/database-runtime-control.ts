import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

type StoredDatabaseRuntimeControl = {
  d1AccountId?: string | null;
  d1DatabaseId?: string | null;
  d1DatabaseName?: string | null;
  d1ManagementUrl?: string | null;
  d1LastImportedAt?: string | null;
  d1LastImportSource?: string | null;
  d1LastImportTables?: number | null;
  d1LastImportRowsWritten?: number | null;
  d1LastImportNote?: string | null;
  updatedAt?: string | null;
};

export type DatabaseRuntimeTarget = "live" | "local";

export type DatabaseRuntimeEndpointInfo = {
  target: DatabaseRuntimeTarget;
  label: string;
  envName: "LIVE_DATABASE_URL" | "DATABASE_URL";
  configured: boolean;
  host: string | null;
  port: string | null;
  database: string | null;
  ssl: boolean | null;
};

export type DatabaseRuntimeD1Info = {
  configured: boolean;
  accountId: string | null;
  databaseId: string | null;
  databaseName: string | null;
  managementUrl: string | null;
  lastImportedAt: string | null;
  lastImportSource: string | null;
  lastImportTables: number | null;
  lastImportRowsWritten: number | null;
  lastImportNote: string | null;
};

export type DatabaseRuntimeSetup = {
  runtime: "d1";
  activeTarget: DatabaseRuntimeTarget;
  effectiveTarget: DatabaseRuntimeTarget;
  effectiveSource: "runtime";
  updatedAt: string | null;
  local: DatabaseRuntimeEndpointInfo;
  live: DatabaseRuntimeEndpointInfo;
  d1: DatabaseRuntimeD1Info;
};

const DATABASE_RUNTIME_CONTROL_FILE = "database-runtime-control.json";
const DATABASE_RUNTIME_CONTROL_TABLE = "InAccordDatabaseRuntimeConfig";
const DATABASE_RUNTIME_CONTROL_ROW_ID = 1;
const DEFAULT_D1_ACCOUNT_ID = "e6170abf1613b7f0d6f016cda0f7fcf4";
const DEFAULT_D1_DATABASE_ID = "34b0c741-8247-45bd-811f-12855ad69a90";
const DEFAULT_D1_DATABASE_NAME = "inaccordweb";
const DEFAULT_D1_MANAGEMENT_URL =
  "https://dash.cloudflare.com/e6170abf1613b7f0d6f016cda0f7fcf4/workers/d1/databases/34b0c741-8247-45bd-811f-12855ad69a90";

type FsModule = typeof import("fs");
type PathModule = typeof import("path");

let cachedFsModule: FsModule | null = null;
let cachedPathModule: PathModule | null = null;
let databaseRuntimeControlSchemaReady = false;

const getBuiltinModule = <TModule,>(moduleName: string): TModule | null => {
  const builtinLoader = (process as typeof process & {
    getBuiltinModule?: (targetName: string) => TModule | undefined;
  }).getBuiltinModule;

  if (typeof builtinLoader !== "function") {
    return null;
  }

  const loaded = builtinLoader(moduleName);
  return loaded ?? null;
};

const getFsModule = () => {
  if (cachedFsModule) {
    return cachedFsModule;
  }

  cachedFsModule = getBuiltinModule<FsModule>("fs");
  return cachedFsModule;
};

const getPathModule = () => {
  if (cachedPathModule) {
    return cachedPathModule;
  }

  cachedPathModule = getBuiltinModule<PathModule>("path");
  return cachedPathModule;
};

const getDatabaseRuntimeControlPath = () => {
  const path = getPathModule();
  if (!path) {
    return null;
  }

  return path.join(process.cwd(), ".data", DATABASE_RUNTIME_CONTROL_FILE);
};

const normalizeText = (value: unknown, max = 4096) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, max);
};

const normalizeUrl = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
};

const normalizeCount = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return Math.floor(numeric);
};

const normalizeStoredD1DatabaseName = (value: unknown) => {
  const normalized = normalizeText(value, 191);
  if (!normalized || normalized.toLowerCase() === "inaccord") {
    return DEFAULT_D1_DATABASE_NAME;
  }

  return normalized;
};

const createDefaultStoredDatabaseRuntimeControl =
  (): StoredDatabaseRuntimeControl => ({
    d1AccountId: DEFAULT_D1_ACCOUNT_ID,
    d1DatabaseId: DEFAULT_D1_DATABASE_ID,
    d1DatabaseName: DEFAULT_D1_DATABASE_NAME,
    d1ManagementUrl: DEFAULT_D1_MANAGEMENT_URL,
    updatedAt: null,
  });

const readStoredDatabaseRuntimeControlFromFile = (): StoredDatabaseRuntimeControl => {
  const fs = getFsModule();
  const targetPath = getDatabaseRuntimeControlPath();
  if (!fs || !targetPath || !fs.existsSync(targetPath)) {
    return createDefaultStoredDatabaseRuntimeControl();
  }

  try {
    const raw = fs.readFileSync(targetPath, "utf8");
    const parsed = JSON.parse(raw) as StoredDatabaseRuntimeControl;
    return parsed && typeof parsed === "object"
      ? parsed
      : createDefaultStoredDatabaseRuntimeControl();
  } catch {
    return createDefaultStoredDatabaseRuntimeControl();
  }
};

const writeStoredDatabaseRuntimeControlToFile = (
  nextValue: StoredDatabaseRuntimeControl,
) => {
  const fs = getFsModule();
  const path = getPathModule();
  const targetPath = getDatabaseRuntimeControlPath();
  if (!fs || !path || !targetPath) {
    throw new Error(
      "File-backed database runtime control is unavailable in this runtime.",
    );
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(
    targetPath,
    `${JSON.stringify(nextValue, null, 2)}\n`,
    "utf8",
  );
};

const ensureDatabaseRuntimeControlSchema = async () => {
  if (databaseRuntimeControlSchemaReady) {
    return;
  }

  await db.execute(sql.raw(`
    create table if not exists "${DATABASE_RUNTIME_CONTROL_TABLE}" (
      "id" integer primary key,
      "accountId" text,
      "databaseId" text,
      "databaseName" text,
      "managementUrl" text,
      "lastImportedAt" text,
      "lastImportSource" text,
      "lastImportTables" integer,
      "lastImportRowsWritten" integer,
      "lastImportNote" text,
      "updatedAt" text
    )
  `));

  await db.execute(sql`
    insert into "InAccordDatabaseRuntimeConfig" (
      "id",
      "accountId",
      "databaseId",
      "databaseName",
      "managementUrl",
      "updatedAt"
    )
    values (
      ${DATABASE_RUNTIME_CONTROL_ROW_ID},
      ${DEFAULT_D1_ACCOUNT_ID},
      ${DEFAULT_D1_DATABASE_ID},
      ${DEFAULT_D1_DATABASE_NAME},
      ${DEFAULT_D1_MANAGEMENT_URL},
      ${new Date().toISOString()}
    )
    on conflict ("id") do nothing
  `);

  databaseRuntimeControlSchemaReady = true;
};

const readStoredDatabaseRuntimeControlFromD1 =
  async (): Promise<StoredDatabaseRuntimeControl | null> => {
    await ensureDatabaseRuntimeControlSchema();

    const result = await db.execute(sql`
      select
        "accountId" as "d1AccountId",
        "databaseId" as "d1DatabaseId",
        "databaseName" as "d1DatabaseName",
        "managementUrl" as "d1ManagementUrl",
        "lastImportedAt" as "d1LastImportedAt",
        "lastImportSource" as "d1LastImportSource",
        "lastImportTables" as "d1LastImportTables",
        "lastImportRowsWritten" as "d1LastImportRowsWritten",
        "lastImportNote" as "d1LastImportNote",
        "updatedAt" as "updatedAt"
      from "InAccordDatabaseRuntimeConfig"
      where "id" = ${DATABASE_RUNTIME_CONTROL_ROW_ID}
      limit 1
    `);

    const row = ((result as unknown as {
      rows?: StoredDatabaseRuntimeControl[];
    }).rows ?? [])[0];

    return row ?? null;
  };

const readStoredDatabaseRuntimeControl =
  async (): Promise<StoredDatabaseRuntimeControl> => {
    try {
      const stored = await readStoredDatabaseRuntimeControlFromD1();
      if (stored) {
        return stored;
      }
    } catch {
      // Fall back to local state for runtimes without live D1 access.
    }

    return readStoredDatabaseRuntimeControlFromFile();
  };

const writeStoredDatabaseRuntimeControlToD1 = async (
  nextValue: StoredDatabaseRuntimeControl,
) => {
  await ensureDatabaseRuntimeControlSchema();

  await db.execute(sql`
    insert into "InAccordDatabaseRuntimeConfig" (
      "id",
      "accountId",
      "databaseId",
      "databaseName",
      "managementUrl",
      "lastImportedAt",
      "lastImportSource",
      "lastImportTables",
      "lastImportRowsWritten",
      "lastImportNote",
      "updatedAt"
    )
    values (
      ${DATABASE_RUNTIME_CONTROL_ROW_ID},
      ${normalizeText(nextValue.d1AccountId, 191)},
      ${normalizeText(nextValue.d1DatabaseId, 191)},
      ${normalizeStoredD1DatabaseName(nextValue.d1DatabaseName)},
      ${normalizeUrl(nextValue.d1ManagementUrl)},
      ${normalizeText(nextValue.d1LastImportedAt, 128)},
      ${normalizeText(nextValue.d1LastImportSource, 64)},
      ${normalizeCount(nextValue.d1LastImportTables)},
      ${normalizeCount(nextValue.d1LastImportRowsWritten)},
      ${normalizeText(nextValue.d1LastImportNote, 1024)},
      ${normalizeText(nextValue.updatedAt, 128)}
    )
    on conflict ("id") do update set
      "accountId" = excluded."accountId",
      "databaseId" = excluded."databaseId",
      "databaseName" = excluded."databaseName",
      "managementUrl" = excluded."managementUrl",
      "lastImportedAt" = excluded."lastImportedAt",
      "lastImportSource" = excluded."lastImportSource",
      "lastImportTables" = excluded."lastImportTables",
      "lastImportRowsWritten" = excluded."lastImportRowsWritten",
      "lastImportNote" = excluded."lastImportNote",
      "updatedAt" = excluded."updatedAt"
  `);
};

const writeStoredDatabaseRuntimeControl = async (
  nextValue: StoredDatabaseRuntimeControl,
) => {
  try {
    await writeStoredDatabaseRuntimeControlToD1(nextValue);
    return;
  } catch {
    // Fall back to local state for runtimes without live D1 access.
  }

  writeStoredDatabaseRuntimeControlToFile(nextValue);
};

const buildDatabaseRuntimeSetup = (
  stored: StoredDatabaseRuntimeControl,
): DatabaseRuntimeSetup => {
  return {
    runtime: "d1",
    activeTarget: "live",
    effectiveTarget: "live",
    effectiveSource: "runtime",
    updatedAt: normalizeText(stored.updatedAt, 128),
    local: {
      target: "local",
      label: "Local PostgreSQL",
      envName: "DATABASE_URL",
      configured: false,
      host: null,
      port: null,
      database: null,
      ssl: null,
    },
    live: {
      target: "live",
      label: "Live PostgreSQL",
      envName: "LIVE_DATABASE_URL",
      configured: false,
      host: null,
      port: null,
      database: null,
      ssl: null,
    },
    d1: {
      configured: true,
      accountId: normalizeText(stored.d1AccountId, 191) ?? DEFAULT_D1_ACCOUNT_ID,
      databaseId:
        normalizeText(stored.d1DatabaseId, 191) ?? DEFAULT_D1_DATABASE_ID,
      databaseName: normalizeStoredD1DatabaseName(stored.d1DatabaseName),
      managementUrl:
        normalizeUrl(stored.d1ManagementUrl) ?? DEFAULT_D1_MANAGEMENT_URL,
      lastImportedAt: normalizeText(stored.d1LastImportedAt, 128),
      lastImportSource: normalizeText(stored.d1LastImportSource, 64),
      lastImportTables: normalizeCount(stored.d1LastImportTables),
      lastImportRowsWritten: normalizeCount(stored.d1LastImportRowsWritten),
      lastImportNote: normalizeText(stored.d1LastImportNote, 1024),
    },
  };
};

export const getDatabaseRuntimeSetup = async (): Promise<DatabaseRuntimeSetup> =>
  buildDatabaseRuntimeSetup(await readStoredDatabaseRuntimeControl());

export const updateDatabaseRuntimeD1Info = async (updates: {
  accountId?: string | null;
  databaseId?: string | null;
  databaseName?: string | null;
  managementUrl?: string | null;
}) => {
  const current = await readStoredDatabaseRuntimeControl();
  const nextValue: StoredDatabaseRuntimeControl = {
    ...current,
    ...(Object.prototype.hasOwnProperty.call(updates, "accountId")
      ? { d1AccountId: normalizeText(updates.accountId, 191) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, "databaseId")
      ? { d1DatabaseId: normalizeText(updates.databaseId, 191) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, "databaseName")
      ? { d1DatabaseName: normalizeStoredD1DatabaseName(updates.databaseName) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, "managementUrl")
      ? { d1ManagementUrl: normalizeUrl(updates.managementUrl) }
      : {}),
    updatedAt: new Date().toISOString(),
  };

  await writeStoredDatabaseRuntimeControl(nextValue);
  return getDatabaseRuntimeSetup();
};

export const recordDatabaseRuntimeD1Sync = async (details: {
  sourceTarget?: string | null;
  tableCount?: number | null;
  rowsWritten?: number | null;
  note?: string | null;
}) => {
  const current = await readStoredDatabaseRuntimeControl();
  const nextValue: StoredDatabaseRuntimeControl = {
    ...current,
    d1LastImportedAt: new Date().toISOString(),
    d1LastImportSource: normalizeText(details.sourceTarget, 64),
    d1LastImportTables: normalizeCount(details.tableCount),
    d1LastImportRowsWritten: normalizeCount(details.rowsWritten),
    d1LastImportNote: normalizeText(details.note, 1024),
    updatedAt: new Date().toISOString(),
  };

  await writeStoredDatabaseRuntimeControl(nextValue);
  return getDatabaseRuntimeSetup();
};
