import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { allowedReportStatuses, ensureReportSchema, type ReportStatus } from "@/lib/reports";

type ReportRow = {
  id: string;
  reporterProfileId: string;
  targetType: "USER" | "SERVER";
  targetId: string;
  reason: string | null;
  details: string | null;
  status: string;
  adminNote: string | null;
  assignedAdminProfileId: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  targetUserName: string | null;
  targetServerName: string | null;
};

export async function GET(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    await ensureReportSchema();

    const { searchParams } = new URL(req.url);
    const statusFilter = String(searchParams.get("status") ?? "ALL").trim().toUpperCase();
    const targetTypeFilter = String(searchParams.get("targetType") ?? "ALL").trim().toUpperCase();

    const statusSql =
      statusFilter !== "ALL" && allowedReportStatuses.has(statusFilter as ReportStatus)
        ? sql`and r."status" = ${statusFilter}`
        : sql``;

    const targetTypeSql =
      targetTypeFilter === "USER" || targetTypeFilter === "SERVER"
        ? sql`and r."targetType" = ${targetTypeFilter}`
        : sql``;

    const result = await db.execute(sql`
      select
        r."id" as "id",
        r."reporterProfileId" as "reporterProfileId",
        r."targetType" as "targetType",
        r."targetId" as "targetId",
        r."reason" as "reason",
        r."details" as "details",
        r."status" as "status",
        r."adminNote" as "adminNote",
        r."assignedAdminProfileId" as "assignedAdminProfileId",
        r."createdAt" as "createdAt",
        r."updatedAt" as "updatedAt",
        coalesce(nullif(trim(up."profileName"), ''), nullif(trim(u."name"), ''), u."email", r."reporterProfileId") as "reporterName",
        u."email" as "reporterEmail",
        coalesce(nullif(trim(tup."profileName"), ''), nullif(trim(tu."name"), ''), tu."email", null) as "targetUserName",
        s."name" as "targetServerName"
      from "Report" r
      left join "Users" u on u."userId" = r."reporterProfileId"
      left join "UserProfile" up on up."userId" = r."reporterProfileId"
      left join "Users" tu on tu."userId" = r."targetId" and r."targetType" = 'USER'
      left join "UserProfile" tup on tup."userId" = tu."userId"
      left join "Server" s on s."id" = r."targetId" and r."targetType" = 'SERVER'
      where 1=1
      ${statusSql}
      ${targetTypeSql}
      order by
        case
          when r."status" = 'OPEN' then 0
          when r."status" = 'IN_REVIEW' then 1
          when r."status" = 'RESOLVED' then 2
          else 3
        end asc,
        r."createdAt" desc
      limit 400
    `);

    const reports = ((result as unknown as { rows?: ReportRow[] }).rows ?? []).map((row) => ({
      id: row.id,
      reporterProfileId: row.reporterProfileId,
      reporterName: row.reporterName ?? row.reporterProfileId,
      reporterEmail: row.reporterEmail ?? "",
      targetType: row.targetType,
      targetId: row.targetId,
      targetName:
        row.targetType === "USER"
          ? row.targetUserName ?? row.targetId
          : row.targetServerName ?? row.targetId,
      reason: row.reason ?? "",
      details: row.details ?? "",
      status: row.status,
      adminNote: row.adminNote ?? "",
      assignedAdminProfileId: row.assignedAdminProfileId,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    }));

    return NextResponse.json({ reports });
  } catch (error) {
    console.error("[ADMIN_REPORTS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    await ensureReportSchema();

    const body = (await req.json().catch(() => ({}))) as {
      reportId?: string;
      status?: string;
      adminNote?: string;
    };

    const reportId = String(body.reportId ?? "").trim();
    const status = String(body.status ?? "").trim().toUpperCase();
    const adminNote = String(body.adminNote ?? "").trim().slice(0, 4000);

    if (!reportId) {
      return new NextResponse("reportId is required", { status: 400 });
    }

    if (!allowedReportStatuses.has(status as ReportStatus)) {
      return new NextResponse("Invalid status", { status: 400 });
    }

    const updateClauses = [
      sql`"status" = ${status}`,
      sql`"assignedAdminProfileId" = ${profile.id}`,
      sql`"updatedAt" = now()`,
    ];

    if (adminNote) {
      updateClauses.push(sql`"adminNote" = ${adminNote}`);
    }

    await db.execute(sql`
      update "Report"
      set ${sql.join(updateClauses, sql`, `)}
      where "id" = ${reportId}
    `);

    return NextResponse.json({ ok: true, reportId, status });
  } catch (error) {
    console.error("[ADMIN_REPORTS_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
