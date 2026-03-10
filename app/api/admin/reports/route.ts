import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { allowedReportStatuses, ensureReportSchema, type ReportStatus } from "@/lib/reports";

type ReportRow = {
  id: string;
  reporterProfileId: string;
  targetType: "USER" | "SERVER" | "MESSAGE" | "BUG";
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
  targetMessageContent: string | null;
  assignedAdminName: string | null;
  assignedAdminEmail: string | null;
};

type ReportSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const allowedReportSeverities = new Set<ReportSeverity>(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

const applySeverityToReason = (reason: string | null | undefined, severity: ReportSeverity) => {
  const source = String(reason ?? "").trim();
  const withoutPrefix = source.replace(/^\[(LOW|MEDIUM|HIGH|CRITICAL)\]\s*/i, "").trim();
  return withoutPrefix ? `[${severity}] ${withoutPrefix}` : `[${severity}]`;
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
      targetTypeFilter === "USER" || targetTypeFilter === "SERVER" || targetTypeFilter === "MESSAGE" || targetTypeFilter === "BUG"
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
        coalesce(nullif(trim(a_up."profileName"), ''), nullif(trim(a_u."name"), ''), a_u."email", r."assignedAdminProfileId") as "assignedAdminName",
        a_u."email" as "assignedAdminEmail",
        coalesce(nullif(trim(tup."profileName"), ''), nullif(trim(tu."name"), ''), tu."email", null) as "targetUserName",
        s."name" as "targetServerName",
        coalesce(
          nullif(trim(m."content"), ''),
          nullif(trim(dm."content"), ''),
          case when m."id" is not null or dm."id" is not null then '[attachment or empty message]' else null end
        ) as "targetMessageContent"
      from "Report" r
      left join "Users" u on u."userId" = r."reporterProfileId"
      left join "UserProfile" up on up."userId" = r."reporterProfileId"
      left join "Users" a_u on a_u."userId" = r."assignedAdminProfileId"
      left join "UserProfile" a_up on a_up."userId" = r."assignedAdminProfileId"
      left join "Users" tu on tu."userId" = r."targetId" and r."targetType" = 'USER'
      left join "UserProfile" tup on tup."userId" = tu."userId"
      left join "Server" s on s."id" = r."targetId" and r."targetType" = 'SERVER'
      left join "Message" m on m."id" = r."targetId" and r."targetType" = 'MESSAGE'
      left join "DirectMessage" dm on dm."id" = r."targetId" and r."targetType" = 'MESSAGE'
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
          : row.targetType === "SERVER"
            ? row.targetServerName ?? row.targetId
            : row.targetType === "BUG"
              ? "In-Accord App"
              : row.targetMessageContent ?? row.targetId,
      reason: row.reason ?? "",
      details: row.details ?? "",
      status: row.status,
      adminNote: row.adminNote ?? "",
      assignedAdminProfileId: row.assignedAdminProfileId,
      assignedAdminName: row.assignedAdminName ?? row.assignedAdminProfileId ?? null,
      assignedAdminEmail: row.assignedAdminEmail ?? null,
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
      assignAction?: "SELF" | "UNASSIGN";
      severity?: string;
    };

    const reportId = String(body.reportId ?? "").trim();
    const statusRaw = typeof body.status === "string" ? body.status : null;
    const status = statusRaw ? statusRaw.trim().toUpperCase() : null;
    const assignAction =
      body.assignAction === "SELF" || body.assignAction === "UNASSIGN"
        ? body.assignAction
        : null;
    const severityRaw = typeof body.severity === "string" ? body.severity : null;
    const severity = severityRaw ? severityRaw.trim().toUpperCase() : null;
    const hasAdminNote = Object.prototype.hasOwnProperty.call(body, "adminNote");
    const adminNote = hasAdminNote ? String(body.adminNote ?? "").trim().slice(0, 4000) : null;

    if (!reportId) {
      return new NextResponse("reportId is required", { status: 400 });
    }

    if (status && !allowedReportStatuses.has(status as ReportStatus)) {
      return new NextResponse("Invalid status", { status: 400 });
    }

    if (severity && !allowedReportSeverities.has(severity as ReportSeverity)) {
      return new NextResponse("Invalid severity", { status: 400 });
    }

    if (!status && !assignAction && !hasAdminNote && !severity) {
      return new NextResponse("No updates supplied", { status: 400 });
    }

    const updateClauses = [sql`"updatedAt" = now()`];

    if (status) {
      updateClauses.push(sql`"status" = ${status}`);
    }

    if (assignAction === "SELF") {
      updateClauses.push(sql`"assignedAdminProfileId" = ${profile.id}`);
    }

    if (assignAction === "UNASSIGN") {
      updateClauses.push(sql`"assignedAdminProfileId" = null`);
    }

    if (hasAdminNote) {
      updateClauses.push(sql`"adminNote" = ${adminNote}`);
    }

    if (severity) {
      const currentReportResult = await db.execute(sql`
        select "reason"
        from "Report"
        where "id" = ${reportId}
        limit 1
      `);

      const currentReason = (currentReportResult as unknown as { rows?: Array<{ reason?: string | null }> }).rows?.[0]?.reason ?? null;
      const nextReason = applySeverityToReason(currentReason, severity as ReportSeverity);
      updateClauses.push(sql`"reason" = ${nextReason}`);
    }

    await db.execute(sql`
      update "Report"
      set ${sql.join(updateClauses, sql`, `)}
      where "id" = ${reportId}
    `);

    return NextResponse.json({ ok: true, reportId, status: status ?? null, assignAction, severity: severity ?? null });
  } catch (error) {
    console.error("[ADMIN_REPORTS_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
