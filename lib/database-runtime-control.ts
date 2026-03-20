import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export type DatabaseRuntimeTarget = "live" | "local";

type StoredDatabaseRuntimeControl = {
  activeTarget?: DatabaseRuntimeTarget;
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
  activeTarget: DatabaseRuntimeTarget;
  effectiveTarget: DatabaseRuntimeTarget;
  effectiveSource: "runtime" | "fallback";
  updatedAt: string | null;
  local: DatabaseRuntimeEndpointInfo;
  live: DatabaseRuntimeEndpointInfo;
  d1: DatabaseRuntimeD1Info;
};

const DATABASE_RUNTIME_CONTROL_FILE = "database-runtime-control.json";

type FsModule = typeof import("fs");
type PathModule = typeof import("path");

let cachedFsModule: FsModule | null = null;
let cachedPathModule: PathModule | null = null;

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

const normalizeTarget = (value: unknown): DatabaseRuntimeTarget =>
  String(value ?? "").trim().toLowerCase() === "local" ? "local" : "live";

const normalizeCount = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return Math.floor(numeric);
};

const isPlaceholderValue = (value: string | null | undefined) =>
  !value || /^replace_/i.test(value.trim());

const readCloudflareEnvText = (
  envName: "LIVE_DATABASE_URL" | "DATABASE_URL",
) => {
  try {
    const context = getCloudflareContext();
    const env = context?.env as Record<string, unknown> | undefined;
    const value = env?.[envName];
    return typeof value === "string" ? value.trim() : null;
  } catch {
    return null;
  }
};

const readRuntimeDatabaseUrl = (
  envName: "LIVE_DATABASE_URL" | "DATABASE_URL",
) => {
  const cloudflareValue = readCloudflareEnvText(envName);
  if (!isPlaceholderValue(cloudflareValue)) {
    return cloudflareValue;
  }

  const processValue = String(process.env[envName] ?? "").trim();
  return !isPlaceholderValue(processValue) ? processValue : "";
};

const readStoredDatabaseRuntimeControl = (): StoredDatabaseRuntimeControl => {
  const fs = getFsModule();
  const targetPath = getDatabaseRuntimeControlPath();
  if (!fs || !targetPath || !fs.existsSync(targetPath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(targetPath, "utf8");
    const parsed = JSON.parse(raw) as StoredDatabaseRuntimeControl;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeStoredDatabaseRuntimeControl = (
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

const parseDatabaseUrl = (
  value: string | null | undefined,
  target: DatabaseRuntimeTarget,
  envName: "LIVE_DATABASE_URL" | "DATABASE_URL",
): DatabaseRuntimeEndpointInfo => {
  const normalized = String(value ?? "").trim();
  const label = target === "live" ? "Live PostgreSQL" : "Local PostgreSQL";

  if (isPlaceholderValue(normalized)) {
    return {
      target,
      label,
      envName,
      configured: false,
      host: null,
      port: null,
      database: null,
      ssl: null,
    };
  }

  try {
    const parsed = new URL(normalized);
    const databaseName = parsed.pathname.replace(/^\/+/, "").trim() || null;
    const sslHint =
      parsed.searchParams.get("sslmode") ??
      parsed.searchParams.get("ssl") ??
      parsed.searchParams.get("tls");
    const ssl =
      sslHint === null
        ? null
        : /^(1|true|require|verify-ca|verify-full)$/i.test(sslHint);

    return {
      target,
      label,
      envName,
      configured: true,
      host: parsed.hostname || null,
      port: parsed.port || null,
      database: databaseName,
      ssl,
    };
  } catch {
    return {
      target,
      label,
      envName,
      configured: false,
      host: null,
      port: null,
      database: null,
      ssl: null,
    };
  }
};

const buildDatabaseRuntimeSetup = (
  stored: StoredDatabaseRuntimeControl,
): DatabaseRuntimeSetup => {
  const local = parseDatabaseUrl(
    readRuntimeDatabaseUrl("DATABASE_URL"),
    "local",
    "DATABASE_URL",
  );
  const live = parseDatabaseUrl(
    readRuntimeDatabaseUrl("LIVE_DATABASE_URL"),
    "live",
    "LIVE_DATABASE_URL",
  );

  const activeTarget = normalizeTarget(stored.activeTarget);
  let effectiveTarget = activeTarget;
  let effectiveSource: "runtime" | "fallback" = "runtime";

  if (effectiveTarget === "local" && !local.configured) {
    effectiveTarget = live.configured ? "live" : "local";
    effectiveSource = "fallback";
  }

  if (effectiveTarget === "live" && !live.configured) {
    effectiveTarget = local.configured ? "local" : "live";
    effectiveSource = "fallback";
  }

  return {
    activeTarget,
    effectiveTarget,
    effectiveSource,
    updatedAt: normalizeText(stored.updatedAt, 128),
    local,
    live,
    d1: {
      configured: Boolean(
        normalizeText(stored.d1DatabaseName, 191) ||
          normalizeText(stored.d1DatabaseId, 191),
      ),
      accountId: normalizeText(stored.d1AccountId, 191),
      databaseId: normalizeText(stored.d1DatabaseId, 191),
      databaseName: normalizeText(stored.d1DatabaseName, 191),
      managementUrl: normalizeUrl(stored.d1ManagementUrl),
      lastImportedAt: normalizeText(stored.d1LastImportedAt, 128),
      lastImportSource: normalizeText(stored.d1LastImportSource, 64),
      lastImportTables: normalizeCount(stored.d1LastImportTables),
      lastImportRowsWritten: normalizeCount(stored.d1LastImportRowsWritten),
      lastImportNote: normalizeText(stored.d1LastImportNote, 1024),
    },
  };
};

export const getDatabaseRuntimeSetup = (): DatabaseRuntimeSetup =>
  buildDatabaseRuntimeSetup(readStoredDatabaseRuntimeControl());

export const getEffectiveDatabaseTarget = (): DatabaseRuntimeTarget =>
  getDatabaseRuntimeSetup().effectiveTarget;

export const getOptionalEffectiveDatabaseConnectionString = () => {
  const setup = getDatabaseRuntimeSetup();
  const connectionString =
    setup.effectiveTarget === "local"
      ? readRuntimeDatabaseUrl("DATABASE_URL")
      : readRuntimeDatabaseUrl("LIVE_DATABASE_URL");

  if (isPlaceholderValue(connectionString)) {
    return null;
  }

  if (!connectionString || !/^postgres(ql)?:\/\//i.test(connectionString)) {
    return null;
  }

  return connectionString;
};

export const getEffectiveDatabaseConnectionString = () => {
  const connectionString = getOptionalEffectiveDatabaseConnectionString();

  if (!connectionString) {
    throw new Error(
      "No database URL configured. Set LIVE_DATABASE_URL or DATABASE_URL.",
    );
  }

  return connectionString;
};

export const setDatabaseRuntimeTarget = (
  nextTarget: DatabaseRuntimeTarget,
): DatabaseRuntimeSetup => {
  const setup = getDatabaseRuntimeSetup();
  const targetInfo = nextTarget === "local" ? setup.local : setup.live;

  if (!targetInfo.configured) {
    throw new Error(
      `${targetInfo.envName} is not configured for ${targetInfo.label}.`,
    );
  }

  const current = readStoredDatabaseRuntimeControl();
  const nextValue: StoredDatabaseRuntimeControl = {
    ...current,
    activeTarget: nextTarget,
    updatedAt: new Date().toISOString(),
  };

  writeStoredDatabaseRuntimeControl(nextValue);
  return getDatabaseRuntimeSetup();
};

export const updateDatabaseRuntimeD1Info = (updates: {
  accountId?: string | null;
  databaseId?: string | null;
  databaseName?: string | null;
  managementUrl?: string | null;
}) => {
  const current = readStoredDatabaseRuntimeControl();
  const nextValue: StoredDatabaseRuntimeControl = {
    ...current,
    ...(Object.prototype.hasOwnProperty.call(updates, "accountId")
      ? { d1AccountId: normalizeText(updates.accountId, 191) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, "databaseId")
      ? { d1DatabaseId: normalizeText(updates.databaseId, 191) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, "databaseName")
      ? { d1DatabaseName: normalizeText(updates.databaseName, 191) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, "managementUrl")
      ? { d1ManagementUrl: normalizeUrl(updates.managementUrl) }
      : {}),
    updatedAt: new Date().toISOString(),
  };

  writeStoredDatabaseRuntimeControl(nextValue);
  return getDatabaseRuntimeSetup();
};

export const recordDatabaseRuntimeD1Sync = (details: {
  sourceTarget: DatabaseRuntimeTarget;
  tableCount?: number | null;
  rowsWritten?: number | null;
  note?: string | null;
}) => {
  const current = readStoredDatabaseRuntimeControl();
  const nextValue: StoredDatabaseRuntimeControl = {
    ...current,
    d1LastImportedAt: new Date().toISOString(),
    d1LastImportSource: details.sourceTarget,
    d1LastImportTables: normalizeCount(details.tableCount),
    d1LastImportRowsWritten: normalizeCount(details.rowsWritten),
    d1LastImportNote: normalizeText(details.note, 1024),
    updatedAt: new Date().toISOString(),
  };

  writeStoredDatabaseRuntimeControl(nextValue);
  return getDatabaseRuntimeSetup();
};
