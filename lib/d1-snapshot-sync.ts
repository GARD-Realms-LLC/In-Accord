import "server-only";

import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";

import { Pool } from "pg";

const execFileAsync = promisify(execFile);
const NPX_EXECUTABLE = process.platform === "win32" ? "npx.cmd" : "npx";

type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
};

type PrimaryKeyRow = {
  table_name: string;
  column_name: string;
};

type EnumRow = {
  enum_name: string;
  enum_value: string;
};

type IndexRow = {
  tablename: string;
  indexname: string;
  indexdef: string;
};

export type D1SnapshotSyncResult = {
  databaseName: string;
  tableCount: number;
  queryCount: number;
  rowsWritten: number | null;
  databaseSizeMb: string | null;
};

const quoteIdent = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
const quoteSqlString = (value: string) => `'${String(value).replace(/'/g, "''")}'`;

const sqliteTypeFor = (column: ColumnRow) => {
  const type = String(column.data_type ?? "").toLowerCase();
  const udt = String(column.udt_name ?? "").toLowerCase();

  if (type.includes("boolean") || udt === "bool") {
    return "INTEGER";
  }

  if (
    type.includes("integer") ||
    udt === "int2" ||
    udt === "int4" ||
    udt === "int8"
  ) {
    return "INTEGER";
  }

  if (
    type.includes("real") ||
    type.includes("double") ||
    udt === "float4" ||
    udt === "float8"
  ) {
    return "REAL";
  }

  if (type.includes("numeric") || udt === "numeric" || udt === "decimal") {
    return "NUMERIC";
  }

  if (
    type.includes("timestamp") ||
    type === "date" ||
    udt === "timestamp" ||
    udt === "timestamptz" ||
    udt === "date"
  ) {
    return "TEXT";
  }

  if (type.includes("json") || udt === "json" || udt === "jsonb") {
    return "TEXT";
  }

  if (type.includes("bytea") || udt === "bytea") {
    return "BLOB";
  }

  return "TEXT";
};

const convertDefault = (raw: string | null) => {
  const value = String(raw ?? "").trim();
  if (!value) {
    return "";
  }

  if (/^now\(\)$/i.test(value)) {
    return "DEFAULT CURRENT_TIMESTAMP";
  }

  if (/^true$/i.test(value)) {
    return "DEFAULT 1";
  }

  if (/^false$/i.test(value)) {
    return "DEFAULT 0";
  }

  if (/^null::/i.test(value)) {
    return "DEFAULT NULL";
  }

  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return `DEFAULT ${value}`;
  }

  const castStringMatch = value.match(/^'(.*)'::[\w\s.\[\]"]+$/);
  if (castStringMatch) {
    return `DEFAULT ${quoteSqlString(castStringMatch[1].replace(/''/g, "'"))}`;
  }

  const plainStringMatch = value.match(/^'(.*)'$/);
  if (plainStringMatch) {
    return `DEFAULT ${quoteSqlString(plainStringMatch[1].replace(/''/g, "'"))}`;
  }

  return "";
};

const serializeValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return "NULL";
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

  if (value instanceof Date) {
    return quoteSqlString(value.toISOString());
  }

  if (Buffer.isBuffer(value)) {
    return `X'${value.toString("hex")}'`;
  }

  if (Array.isArray(value) || typeof value === "object") {
    return quoteSqlString(JSON.stringify(value));
  }

  return quoteSqlString(String(value));
};

const normalizeIndexDef = (indexDef: string) => {
  let sql = String(indexDef ?? "");
  sql = sql.replace(
    /^CREATE\s+(UNIQUE\s+)?INDEX\s+/i,
    (_, unique = "") => `CREATE ${unique}INDEX IF NOT EXISTS `,
  );
  sql = sql.replace(/\s+ON\s+public\./i, " ON ");
  sql = sql.replace(/\s+USING\s+btree/i, "");
  sql = sql.replace(/::[A-Za-z_][A-Za-z0-9_ .\[\]"]*/g, "");
  sql = sql.replace(/TRIM\(BOTH FROM /g, "trim(");
  return `${sql};`;
};

const parseImportMeta = (stdout: string) => {
  const rowsWrittenMatch = stdout.match(/"rows_written":\s*(\d+)/i);
  const sizeMatch = stdout.match(/"Database size \(MB\)":\s*"([^"]+)"/i);

  return {
    rowsWritten: rowsWrittenMatch ? Number(rowsWrittenMatch[1]) : null,
    databaseSizeMb: sizeMatch ? sizeMatch[1] : null,
  };
};

const createTempSqlPath = () =>
  path.join(
    os.tmpdir(),
    `inaccord-d1-sync-${Date.now()}-${Math.random().toString(16).slice(2)}.sql`,
  );

export const syncPostgresSnapshotToD1 = async ({
  connectionString,
  databaseName,
}: {
  connectionString: string;
  databaseName: string;
}): Promise<D1SnapshotSyncResult> => {
  const pool = new Pool({ connectionString, max: 1 });
  const sqlFilePath = createTempSqlPath();

  try {
    const tablesResult = (await pool.query(`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name
    `)) as unknown as { rows: Array<{ table_name: string }> };

    const columnsResult = (await pool.query(`
      select
        table_name,
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position
    `)) as unknown as { rows: ColumnRow[] };

    const primaryKeysResult = (await pool.query(`
      select
        tc.table_name,
        kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
      where tc.table_schema = 'public'
        and tc.constraint_type = 'PRIMARY KEY'
      order by tc.table_name, kcu.ordinal_position
    `)) as unknown as { rows: PrimaryKeyRow[] };

    const enumsResult = (await pool.query(`
      select
        t.typname as enum_name,
        e.enumlabel as enum_value
      from pg_type t
      join pg_enum e
        on t.oid = e.enumtypid
      join pg_namespace n
        on n.oid = t.typnamespace
      where n.nspname = 'public'
      order by t.typname, e.enumsortorder
    `)) as unknown as { rows: EnumRow[] };

    const indexesResult = (await pool.query(`
      select
        tablename,
        indexname,
        indexdef
      from pg_indexes
      where schemaname = 'public'
      order by tablename, indexname
    `)) as unknown as { rows: IndexRow[] };

    const tables = tablesResult.rows.map((row) => row.table_name);
    const columnsByTable = new Map<string, ColumnRow[]>();
    for (const row of columnsResult.rows) {
      const list = columnsByTable.get(row.table_name) ?? [];
      list.push(row);
      columnsByTable.set(row.table_name, list);
    }

    const primaryKeysByTable = new Map<string, string[]>();
    for (const row of primaryKeysResult.rows) {
      const list = primaryKeysByTable.get(row.table_name) ?? [];
      list.push(row.column_name);
      primaryKeysByTable.set(row.table_name, list);
    }

    const enumsByName = new Map<string, string[]>();
    for (const row of enumsResult.rows) {
      const list = enumsByName.get(row.enum_name) ?? [];
      list.push(row.enum_value);
      enumsByName.set(row.enum_name, list);
    }

    const indexesByTable = new Map<string, IndexRow[]>();
    for (const row of indexesResult.rows) {
      if (/_pkey$/i.test(row.indexname)) {
        continue;
      }

      const list = indexesByTable.get(row.tablename) ?? [];
      list.push(row);
      indexesByTable.set(row.tablename, list);
    }

    const statements: string[] = [
      "-- Generated from PostgreSQL live snapshot for Cloudflare D1",
    ];

    for (const table of [...tables].reverse()) {
      statements.push(`DROP TABLE IF EXISTS ${quoteIdent(table)};`);
    }

    for (const table of tables) {
      const columns = columnsByTable.get(table) ?? [];
      const primaryKeys = primaryKeysByTable.get(table) ?? [];

      const columnStatements = columns.map((column) => {
        const tokens = [quoteIdent(column.column_name), sqliteTypeFor(column)];
        const enumValues = enumsByName.get(column.udt_name);

        if (enumValues?.length) {
          tokens.push(
            `CHECK (${quoteIdent(column.column_name)} IN (${enumValues
              .map(quoteSqlString)
              .join(", ")}))`,
          );
        }

        const defaultSql = convertDefault(column.column_default);
        if (defaultSql) {
          tokens.push(defaultSql);
        }

        if (String(column.is_nullable).toUpperCase() === "NO") {
          tokens.push("NOT NULL");
        }

        return `  ${tokens.join(" ")}`;
      });

      if (primaryKeys.length) {
        columnStatements.push(
          `  PRIMARY KEY (${primaryKeys.map(quoteIdent).join(", ")})`,
        );
      }

      statements.push(
        `CREATE TABLE ${quoteIdent(table)} (\n${columnStatements.join(",\n")}\n);`,
      );
    }

    for (const table of tables) {
      const indexes = indexesByTable.get(table) ?? [];
      for (const index of indexes) {
        statements.push(normalizeIndexDef(index.indexdef));
      }
    }

    let queryCount = statements.length;

    for (const table of tables) {
      const columns = columnsByTable.get(table) ?? [];
      if (!columns.length) {
        continue;
      }

      const rowsResult = (await pool.query(
        `select * from ${quoteIdent(table)}`,
      )) as unknown as { rows: Array<Record<string, unknown>> };

      const columnNames = columns.map((column) => column.column_name);
      for (const row of rowsResult.rows) {
        const values = columnNames.map((columnName) =>
          serializeValue(row[columnName]),
        );
        statements.push(
          `INSERT INTO ${quoteIdent(table)} (${columnNames
            .map(quoteIdent)
            .join(", ")}) VALUES (${values.join(", ")});`,
        );
        queryCount += 1;
      }
    }

    fs.writeFileSync(sqlFilePath, `${statements.join("\n")}\n`, "utf8");

    const { stdout, stderr } = await execFileAsync(
      NPX_EXECUTABLE,
      [
        "wrangler",
        "d1",
        "execute",
        databaseName,
        "--remote",
        "--yes",
        "--json",
        "--file",
        sqlFilePath,
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 64,
      },
    );

    const output = `${String(stdout ?? "")}\n${String(stderr ?? "")}`;
    const meta = parseImportMeta(output);

    return {
      databaseName,
      tableCount: tables.length,
      queryCount,
      rowsWritten: meta.rowsWritten,
      databaseSizeMb: meta.databaseSizeMb,
    };
  } finally {
    try {
      const closablePool = pool as unknown as {
        end?: () => Promise<void> | void;
      };
      await closablePool.end?.();
    } catch {
      // Ignore close errors during cleanup.
    }

    try {
      fs.unlinkSync(sqlFilePath);
    } catch {
      // Ignore temp cleanup errors.
    }
  }
};
