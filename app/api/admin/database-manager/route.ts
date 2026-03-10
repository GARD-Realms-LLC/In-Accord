import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TableRow = {
  schemaName: string;
  tableName: string;
};

const safeIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

export async function GET(request: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const selectedTable = String(searchParams.get("table") ?? "").trim();

    const tablesResult = await db.execute(sql`
      select
        t.table_schema as "schemaName",
        t.table_name as "tableName"
      from information_schema.tables t
      where t.table_type = 'BASE TABLE'
        and t.table_schema not in ('pg_catalog', 'information_schema')
      order by t.table_schema asc, t.table_name asc
    `);

    const tables = ((tablesResult as unknown as { rows?: TableRow[] }).rows ?? []).map((row) => ({
      schemaName: String(row.schemaName ?? "public"),
      tableName: String(row.tableName ?? ""),
      fullName: `${String(row.schemaName ?? "public")}.${String(row.tableName ?? "")}`,
    }));

    if (!selectedTable) {
      return NextResponse.json({
        tables,
        selectedTable: null,
        columns: [] as string[],
        rows: [] as Array<Record<string, unknown>>,
      });
    }

    const matchedTable = tables.find((item) => item.fullName === selectedTable);
    if (!matchedTable) {
      return new NextResponse("Unknown table", { status: 400 });
    }

    const columnsResult = await db.execute(sql`
      select c.column_name as "columnName"
      from information_schema.columns c
      where c.table_schema = ${matchedTable.schemaName}
        and c.table_name = ${matchedTable.tableName}
      order by c.ordinal_position asc
    `);

    const columns = ((columnsResult as unknown as {
      rows?: Array<{ columnName: string }>;
    }).rows ?? []).map((row) => String(row.columnName ?? "")).filter(Boolean);

    const previewQuery = sql.raw(
      `select * from ${safeIdentifier(matchedTable.schemaName)}.${safeIdentifier(matchedTable.tableName)} limit 100`
    );

    const previewResult = await db.execute(previewQuery);
    const previewRows = ((previewResult as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? []).map((row) => {
      const mapped: Record<string, unknown> = {};
      for (const column of columns) {
        const value = row[column];
        mapped[column] = value instanceof Date ? value.toISOString() : value;
      }
      return mapped;
    });

    return NextResponse.json({
      tables,
      selectedTable: matchedTable.fullName,
      columns,
      rows: previewRows,
    });
  } catch (error) {
    console.error("[ADMIN_DATABASE_MANAGER_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
