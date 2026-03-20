import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getOptionalEffectiveDatabaseConnectionString } from "@/lib/database-runtime-control";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const readExpectedToken = () =>
  String(process.env.INACCORD_D1_SNAPSHOT_TOKEN ?? "").trim();

const readProvidedToken = (request: Request) =>
  String(request.headers.get("x-inaccord-d1-snapshot-token") ?? "").trim();

const quoteIdent = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
const quoteSqlString = (value: string) => `'${String(value).replace(/'/g, "''")}'`;

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

const normalizeRequestedTables = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const tables: string[] = [];

  for (const entry of value) {
    const tableName = String(entry ?? "").trim();
    if (!/^[A-Za-z0-9_]+$/.test(tableName) || seen.has(tableName)) {
      continue;
    }

    seen.add(tableName);
    tables.push(tableName);
  }

  return tables;
};

const describeConnectionString = (connectionString: string | null) => {
  const normalized = String(connectionString ?? "").trim();
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    return {
      protocol: parsed.protocol || null,
      host: parsed.hostname || null,
      port: parsed.port || null,
      database: parsed.pathname.replace(/^\/+/, "") || null,
      username: parsed.username || null,
    };
  } catch {
    return {
      protocol: null,
      host: null,
      port: null,
      database: null,
      username: null,
    };
  }
};

const describeError = (error: unknown) => {
  const normalized =
    typeof error === "object" && error !== null
      ? (error as {
          name?: unknown;
          message?: unknown;
          stack?: unknown;
          cause?: {
            name?: unknown;
            message?: unknown;
            code?: unknown;
            stack?: unknown;
            cause?: unknown;
          };
          code?: unknown;
        })
      : null;

  return JSON.stringify(
    {
      name: normalized?.name ?? null,
      message: normalized?.message ?? String(error),
      code: normalized?.code ?? null,
      stack:
        typeof normalized?.stack === "string"
          ? normalized.stack.split("\n").slice(0, 12)
          : null,
      cause: normalized?.cause
        ? {
            name: normalized.cause.name ?? null,
            message: normalized.cause.message ?? null,
            code: normalized.cause.code ?? null,
            stack:
              typeof normalized.cause.stack === "string"
                ? normalized.cause.stack.split("\n").slice(0, 12)
                : null,
            nestedCause: normalized.cause.cause ?? null,
          }
        : null,
    },
    null,
    2,
  );
};

const readTableColumnNames = async (table: string) => {
  const result = await db.execute(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${table}
    order by ordinal_position
  `);

  const rows = (result as unknown as {
    rows?: Array<{ column_name?: string | null }>;
  }).rows;

  return (rows ?? [])
    .map((row) => String(row.column_name ?? "").trim())
    .filter((columnName) => Boolean(columnName));
};

export async function POST(request: Request) {
  let connectionDetails: ReturnType<typeof describeConnectionString> = null;

  try {
    const expectedToken = readExpectedToken();
    const providedToken = readProvidedToken(request);

    if (!expectedToken || !providedToken || providedToken !== expectedToken) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const connectionString = getOptionalEffectiveDatabaseConnectionString();
    connectionDetails = describeConnectionString(connectionString);
    if (!connectionString || !/^postgres(ql)?:\/\//i.test(connectionString)) {
      return NextResponse.json(
        {
          message:
            "Database unavailable. Configure LIVE_DATABASE_URL or DATABASE_URL with a PostgreSQL connection string.",
          connection: connectionDetails,
        },
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      tables?: unknown;
    };
    const tables = normalizeRequestedTables(body.tables);
    if (!tables.length) {
      return new NextResponse("Provide at least one table name.", { status: 400 });
    }

    const statements: string[] = ["PRAGMA foreign_keys = OFF;"];
    let queryCount = 1;
    let rowCount = 0;

    for (const table of [...tables].reverse()) {
      statements.push(`DELETE FROM ${quoteIdent(table)};`);
      queryCount += 1;
    }

    for (const table of tables) {
      const columnNames = await readTableColumnNames(table);

      if (!columnNames.length) {
        continue;
      }

      const columnAliases = columnNames.map((_, index) => `c${index}`);
      const selectList = sql.join(
        columnNames.map((columnName, index) =>
          sql`${sql.identifier(columnName)} as ${sql.identifier(columnAliases[index])}`,
        ),
        sql.raw(", "),
      );
      const result = (await db.execute(
        sql`select ${selectList} from ${sql.identifier(table)}`,
      )) as {
        rows?: Array<Record<string, unknown>>;
      };
      const rows = (result.rows ?? [])
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map((entry) => {
          const restored: Record<string, unknown> = {};

          for (let index = 0; index < columnNames.length; index += 1) {
            restored[columnNames[index]] = entry[columnAliases[index]];
          }

          return restored;
        });

      for (const row of rows) {
        const values = columnNames.map((columnName) =>
          serializeValue((row as Record<string, unknown>)[columnName]),
        );
        statements.push(
          `INSERT INTO ${quoteIdent(table)} (${columnNames
            .map(quoteIdent)
            .join(", ")}) VALUES (${values.join(", ")});`,
        );
        queryCount += 1;
        rowCount += 1;
      }
    }

    statements.push("PRAGMA foreign_keys = ON;");
    queryCount += 1;

    return new NextResponse(`${statements.join("\n")}\n`, {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/sql; charset=utf-8",
        "x-inaccord-snapshot-table-count": String(tables.length),
        "x-inaccord-snapshot-query-count": String(queryCount),
        "x-inaccord-snapshot-row-count": String(rowCount),
      },
    });
  } catch (error) {
    console.error("[ADMIN_DATABASE_RUNTIME_EXPORT_SQL]", error);
    return NextResponse.json(
      {
        error: JSON.parse(describeError(error)),
        connection: connectionDetails,
      },
      {
      status: 500,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      },
    },
    );
  }
}
