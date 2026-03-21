import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

const D1_BINDING_NAME = "DB";
const DEFAULT_D1_DATABASE_NAME = "inaccordweb";
const WRANGLER_CONFIG_FILE = "wrangler.jsonc";
const REQUIRED_APP_TABLE_NAME = "Users";

type ChildProcessModule = typeof import("child_process");
type PathModule = typeof import("path");
type UtilModule = typeof import("util");

const getBuiltinModule = <TModule,>(moduleName: string): TModule | null => {
  const builtinLoader = (process as typeof process & {
    getBuiltinModule?: (name: string) => TModule | undefined;
  }).getBuiltinModule;

  if (typeof builtinLoader !== "function") {
    return null;
  }

  try {
    return builtinLoader(moduleName) ?? null;
  } catch {
    return null;
  }
};

const getExecFileAsync = () => {
  const childProcess = getBuiltinModule<ChildProcessModule>("child_process");
  const utilModule = getBuiltinModule<UtilModule>("util");

  if (!childProcess?.execFile || !utilModule?.promisify) {
    throw new Error(
      "Wrangler CLI execution requires Node.js child_process support.",
    );
  }

  return utilModule.promisify(childProcess.execFile);
};

const getPathModule = () => {
  const pathModule = getBuiltinModule<PathModule>("path");
  if (!pathModule) {
    throw new Error("Builtin module 'path' is unavailable in this runtime.");
  }

  return pathModule;
};

const getWranglerCliInvocation = () => {
  const localWranglerCliPath = getPathModule().join(
    process.cwd(),
    "node_modules",
    "wrangler",
    "bin",
    "wrangler.js",
  );

  return {
    command: process.execPath,
    args: [localWranglerCliPath],
  };
};

type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  all: <TRow = Record<string, unknown>>() => Promise<{ results?: TRow[] }>;
  run: <TRow = Record<string, unknown>>() => Promise<{ results?: TRow[] }>;
  raw: <TRow = unknown[]>() => Promise<TRow[]>;
};

type D1DatabaseBinding = {
  prepare: (query: string) => D1PreparedStatement;
};

type QueryMethod = "run" | "all" | "values" | "get";

type ObjectRowsResult = { rows: Array<Record<string, unknown>> };
type ObjectRowResult = { rows: Record<string, unknown> | undefined };
type ValueRowsResult = { rows: unknown[][] };
type QueryResult = ObjectRowsResult | ObjectRowResult | ValueRowsResult;

let cachedBindingReadiness: boolean | null = null;

const quoteSqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

const escapeTableNameLiteral = (value: string) =>
  quoteSqlString(String(value ?? "").replace(/'/g, "''"));

const normalizeJsonValue = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (
    !trimmed ||
    !(
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    )
  ) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const normalizeRowObject = (
  row: Record<string, unknown>,
): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    normalized[key] = normalizeJsonValue(value);
  }

  return normalized;
};

const normalizeQueryParam = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (Buffer.isBuffer(value)) {
    return Uint8Array.from(value);
  }

  if (
    Array.isArray(value) ||
    (typeof value === "object" &&
      value !== null &&
      !ArrayBuffer.isView(value) &&
      !(value instanceof ArrayBuffer))
  ) {
    return JSON.stringify(value);
  }

  return value;
};

const serializeInlineValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (value instanceof Date) {
    return quoteSqlString(value.toISOString());
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  if (typeof value === "bigint") {
    return String(value);
  }

  if (Buffer.isBuffer(value)) {
    return `X'${value.toString("hex")}'`;
  }

  if (
    Array.isArray(value) ||
    (typeof value === "object" &&
      value !== null &&
      !ArrayBuffer.isView(value) &&
      !(value instanceof ArrayBuffer))
  ) {
    return quoteSqlString(JSON.stringify(value));
  }

  return quoteSqlString(String(value));
};

const inlineSqlParams = (query: string, params: unknown[]) => {
  if (!params.length) {
    return query;
  }

  let paramIndex = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let output = "";

  for (let index = 0; index < query.length; index += 1) {
    const character = query[index];
    const nextCharacter = query[index + 1];

    if (character === "'" && !inDoubleQuote) {
      output += character;
      if (inSingleQuote && nextCharacter === "'") {
        output += nextCharacter;
        index += 1;
        continue;
      }

      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (character === `"` && !inSingleQuote) {
      output += character;
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (character === "?" && !inSingleQuote && !inDoubleQuote) {
      output += serializeInlineValue(params[paramIndex]);
      paramIndex += 1;
      continue;
    }

    output += character;
  }

  return output;
};

const normalizeWhitespace = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const unquoteIdentifier = (value: string) =>
  value.replace(/^"+|"+$/g, "").trim();

const readCloudflareEnv = async () => {
  try {
    const symbol = Symbol.for("__cloudflare-context__");
    const context = (globalThis as Record<PropertyKey, unknown>)[symbol] as
      | { env?: Record<string, unknown> }
      | undefined;

    if (context?.env) {
      return context.env;
    }
  } catch {
    // Fall through to OpenNext async context lookup.
  }

  try {
    const context = await getCloudflareContext({ async: true });
    return (context?.env as Record<string, unknown> | undefined) ?? null;
  } catch {
    return null;
  }
};

const getD1Binding = async (): Promise<D1DatabaseBinding | null> => {
  const env = await readCloudflareEnv();
  const candidate = env?.[D1_BINDING_NAME] as
    | D1DatabaseBinding
    | undefined
    | null;

  if (candidate && typeof candidate.prepare === "function") {
    return candidate;
  }

  return null;
};

const bindingHasRequiredAppTable = async (binding: D1DatabaseBinding) => {
  if (cachedBindingReadiness !== null) {
    return cachedBindingReadiness;
  }

  try {
    const probe = await binding
      .prepare(
        `select 1 as "present" from sqlite_master where type = 'table' and name = ? limit 1`,
      )
      .bind(REQUIRED_APP_TABLE_NAME)
      .all<{ present?: number | boolean | null }>();

    const firstRow = Array.isArray(probe.results) ? probe.results[0] : undefined;
    cachedBindingReadiness =
      firstRow?.present === 1 || firstRow?.present === true;
  } catch {
    cachedBindingReadiness = false;
  }

  return cachedBindingReadiness;
};

const executeViaBinding = async (
  binding: D1DatabaseBinding,
  query: string,
  params: unknown[],
  method: QueryMethod,
): Promise<QueryResult> => {
  const statement = binding.prepare(query).bind(...params);

  if (method === "values") {
    return {
      rows: (await statement.raw()) as unknown[][],
    };
  }

  if (method === "get") {
    const result = await statement.all<Record<string, unknown>>();
    const firstRow = Array.isArray(result.results) ? result.results[0] : undefined;

    return {
      rows: firstRow ? normalizeRowObject(firstRow) : undefined,
    };
  }

  if (method === "all") {
    const result = await statement.all<Record<string, unknown>>();
    return {
      rows: Array.isArray(result.results)
        ? result.results.map((row) => normalizeRowObject(row))
        : [],
    };
  }

  const result = await statement.run<Record<string, unknown>>();
  return {
    rows: Array.isArray(result.results)
      ? result.results.map((row) => normalizeRowObject(row))
      : [],
  };
};

const executeViaWrangler = async (
  query: string,
  params: unknown[],
  method: QueryMethod,
): Promise<QueryResult> => {
  const inlinedQuery = inlineSqlParams(query, params.map(normalizeQueryParam));
  const wranglerCli = getWranglerCliInvocation();
  let stdout = "";

  try {
    const result = await getExecFileAsync()(
      wranglerCli.command,
      [
        ...wranglerCli.args,
        "d1",
        "execute",
        DEFAULT_D1_DATABASE_NAME,
        "--remote",
        "--json",
        "--config",
        WRANGLER_CONFIG_FILE,
        "--command",
        inlinedQuery,
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 32,
      },
    );

    stdout = String(result.stdout ?? "");
  } catch (error) {
    const normalized = error as {
      message?: unknown;
      code?: unknown;
      stderr?: unknown;
      stdout?: unknown;
    };
    const reason = [
      normalizeTextPart(normalized.message),
      normalizeTextPart(normalized.code),
      normalizeTextPart(normalized.stderr),
      normalizeTextPart(normalized.stdout),
    ]
      .filter(Boolean)
      .join(" | ");

    throw new Error(
      `Failed to execute D1 query via Wrangler${
        reason ? `: ${reason}` : "."
      }`,
    );
  }

  const parsed = JSON.parse(String(stdout ?? "")) as Array<{
    results?: Array<Record<string, unknown>>;
  }>;
  const rows = parsed[0]?.results ?? [];

  if (method === "values") {
    return {
      rows: rows.map((row) => Object.keys(row).map((key) => row[key])),
    };
  }

  if (method === "get") {
    const firstRow = rows[0];
    return {
      rows: firstRow ? normalizeRowObject(firstRow) : undefined,
    };
  }

  return {
    rows: rows.map((row) => normalizeRowObject(row)),
  };
};

const normalizeTextPart = (value: unknown, max = 500) => {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  return normalized.slice(0, max);
};

const executeDirectD1Query = async (
  query: string,
  params: unknown[],
  method: QueryMethod,
): Promise<QueryResult> => {
  const binding = await getD1Binding();
  const normalizedParams = params.map((value) => normalizeQueryParam(value));

  if (binding && (await bindingHasRequiredAppTable(binding))) {
    return executeViaBinding(binding, query, normalizedParams, method);
  }

  return executeViaWrangler(query, normalizedParams, method);
};

const listAllTableNames = async () => {
  const result = await executeDirectD1Query(
    `select name as "tableName" from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name asc`,
    [],
    "all",
  );

  return ((result as ObjectRowsResult).rows ?? [])
    .map((row) => String(row.tableName ?? "").trim())
    .filter(Boolean);
};

const listColumnNamesForTable = async (tableName: string) => {
  const safeTableName = String(tableName ?? "").trim();
  if (!safeTableName) {
    return [];
  }

  const result = await executeDirectD1Query(
    `select name as "columnName" from pragma_table_info(${escapeTableNameLiteral(safeTableName)}) order by cid asc`,
    [],
    "all",
  );

  return ((result as ObjectRowsResult).rows ?? [])
    .map((row) => String(row.columnName ?? "").trim())
    .filter(Boolean);
};

const handleSqliteMasterExistsQuery = async (
  normalizedQuery: string,
): Promise<QueryResult | null> => {
  const match = normalizedQuery.match(
    /^select to_regclass\('"?(?:"([^"]+)"|([^'"]+))"?'\) is not null as "([^"]+)"$/i,
  );

  if (!match) {
    return null;
  }

  const tableName = String(match[1] ?? match[2] ?? "").trim();
  const alias = String(match[3] ?? "exists").trim();
  const tables = await listAllTableNames();

  return {
    rows: [{ [alias]: tables.includes(tableName) }],
  };
};

const handleInformationSchemaColumnExistsQuery = async (
  normalizedQuery: string,
): Promise<QueryResult | null> => {
  const match = normalizedQuery.match(
    /^select exists \( select 1 from information_schema\.columns where table_schema = current_schema\(\) and table_name = '([^']+)' and column_name = '([^']+)' \) as "([^"]+)"$/i,
  );

  if (!match) {
    return null;
  }

  const tableName = String(match[1] ?? "").trim();
  const columnName = String(match[2] ?? "").trim();
  const alias = String(match[3] ?? "exists").trim();
  const columnNames = await listColumnNamesForTable(tableName);

  return {
    rows: [{ [alias]: columnNames.includes(columnName) }],
  };
};

const handleInformationSchemaTablesQuery = async (
  normalizedQuery: string,
): Promise<QueryResult | null> => {
  if (!/from information_schema\.tables/i.test(normalizedQuery)) {
    return null;
  }

  const tableNames = await listAllTableNames();

  return {
    rows: tableNames.map((tableName) => ({
      schemaName: "main",
      tableName,
    })),
  };
};

const handleInformationSchemaColumnsQuery = async (
  normalizedQuery: string,
  params: unknown[],
): Promise<QueryResult | null> => {
  if (!/from information_schema\.columns/i.test(normalizedQuery)) {
    return null;
  }

  if (
    /column_name = \?/i.test(normalizedQuery) &&
    /table_name as "tableName"/i.test(normalizedQuery)
  ) {
    const targetColumnName = String(params[0] ?? "").trim();
    const tableNames = await listAllTableNames();
    const matchedTableNames: string[] = [];

    for (const tableName of tableNames) {
      const columnNames = await listColumnNamesForTable(tableName);
      if (columnNames.includes(targetColumnName)) {
        matchedTableNames.push(tableName);
      }
    }

    return {
      rows: matchedTableNames.map((tableName) => ({ tableName })),
    };
  }

  if (
    /column_name/i.test(normalizedQuery) &&
    /order by (c\.)?ordinal_position/i.test(normalizedQuery)
  ) {
    const targetTableName = String(params[params.length - 1] ?? "").trim();
    const columnNames = await listColumnNamesForTable(targetTableName);

    return {
      rows: columnNames.map((columnName) => ({
        column_name: columnName,
        columnName: columnName,
      })),
    };
  }

  return null;
};

const handleAlterTableAddColumnIfNotExists = async (
  query: string,
  normalizedQuery: string,
): Promise<QueryResult | null> => {
  const match = normalizedQuery.match(
    /^alter table ("[^"]+"|[A-Za-z_][A-Za-z0-9_]*) add column if not exists ("[^"]+"|[A-Za-z_][A-Za-z0-9_]*) (.+)$/i,
  );

  if (!match) {
    return null;
  }

  const tableName = unquoteIdentifier(match[1]);
  const columnName = unquoteIdentifier(match[2]);
  const currentColumns = await listColumnNamesForTable(tableName);

  if (currentColumns.includes(columnName)) {
    return { rows: [] };
  }

  const patchedQuery = query.replace(
    /\badd column if not exists\b/i,
    "add column",
  );

  return executeDirectD1Query(patchedQuery, [], "run");
};

const translateSqlQuery = (query: string) => {
  let translated = query;

  if (
    /pg_advisory_lock/i.test(translated) ||
    /pg_advisory_unlock/i.test(translated)
  ) {
    return `select 1 as "ok"`;
  }

  translated = translated.replace(/::jsonb/gi, "");
  translated = translated.replace(/::json/gi, "");
  translated = translated.replace(/::text/gi, "");
  translated = translated.replace(/::integer/gi, "");
  translated = translated.replace(/::int/gi, "");
  translated = translated.replace(
    /timestamp\s+'epoch'/gi,
    `'1970-01-01T00:00:00.000Z'`,
  );
  translated = translated.replace(
    /to_jsonb\(\s*("[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\s*\)\s*->>\s*'([^']+)'/gi,
    (_match, alias, field) =>
      `${alias}."${String(field).replace(/"/g, '""')}"`,
  );
  translated = translated.replace(/\s+nulls\s+last\b/gi, "");
  translated = translated.replace(
    /now\(\)\s*-\s*\(\s*\?\s*\*\s*interval\s*'1 second'\s*\)/gi,
    `datetime(CURRENT_TIMESTAMP, '-' || ? || ' seconds')`,
  );
  translated = translated.replace(
    /now\(\)\s*-\s*interval\s*'([0-9]+)\s+days'/gi,
    (_match, days) => `datetime(CURRENT_TIMESTAMP, '-${days} days')`,
  );
  translated = translated.replace(
    /now\(\)\s*-\s*make_interval\(\s*mins\s*=>\s*([^)]+)\)/gi,
    (_match, minutesExpression) =>
      `datetime(CURRENT_TIMESTAMP, '-' || ${String(minutesExpression).trim()} || ' minutes')`,
  );
  translated = translated.replace(/\bnow\(\)/gi, "CURRENT_TIMESTAMP");

  return translated;
};

export const isDatabaseRuntimeReady = async () => {
  try {
    const binding = await getD1Binding();
    if (binding) {
      return true;
    }

    await executeViaWrangler("select 1 as test", [], "all");
    return true;
  } catch {
    return false;
  }
};

export const executeD1Query = async (
  query: string,
  params: unknown[],
  method: QueryMethod,
): Promise<QueryResult> => {
  const normalizedQuery = normalizeWhitespace(query);

  const handledTableExists = await handleSqliteMasterExistsQuery(normalizedQuery);
  if (handledTableExists) {
    return handledTableExists;
  }

  const handledColumnExists =
    await handleInformationSchemaColumnExistsQuery(normalizedQuery);
  if (handledColumnExists) {
    return handledColumnExists;
  }

  const handledTables = await handleInformationSchemaTablesQuery(normalizedQuery);
  if (handledTables) {
    return handledTables;
  }

  const handledColumns = await handleInformationSchemaColumnsQuery(
    normalizedQuery,
    params,
  );
  if (handledColumns) {
    return handledColumns;
  }

  const handledAlter = await handleAlterTableAddColumnIfNotExists(
    query,
    normalizedQuery,
  );
  if (handledAlter) {
    return handledAlter;
  }

  return executeDirectD1Query(translateSqlQuery(query), params, method);
};

export const getD1DatabaseBindingName = () => D1_BINDING_NAME;
export const getD1DatabaseName = () => DEFAULT_D1_DATABASE_NAME;
