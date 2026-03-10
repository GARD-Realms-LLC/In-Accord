import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const totalsResult = await db.execute(sql`
      select
        (select count(*)::int from "Users") as "totalMembers",
        (select count(*)::int from "Server") as "totalServers"
    `);

    const totalsRow = (totalsResult as unknown as {
      rows: Array<{
        totalMembers: number | string | null;
        totalServers: number | string | null;
      }>;
    }).rows?.[0];

    const reportTotalsResult = await db.execute(sql`
      select
        count(*) filter (
          where coalesce(r."targetType", '') = 'BUG'
            and coalesce(r."status", '') in ('OPEN', 'IN_REVIEW')
        )::int as "openBugCount",
        count(*) filter (
          where coalesce(r."targetType", '') <> 'BUG'
            and coalesce(r."status", '') in ('OPEN', 'IN_REVIEW')
        )::int as "openReportCount"
      from "Report" r
    `);

    const reportTotalsRow = (reportTotalsResult as unknown as {
      rows: Array<{
        openBugCount: number | string | null;
        openReportCount: number | string | null;
      }>;
    }).rows?.[0];

    return NextResponse.json(
      {
        totalMembers: Number(totalsRow?.totalMembers ?? 0),
        totalServers: Number(totalsRow?.totalServers ?? 0),
        openBugCount: Number(reportTotalsRow?.openBugCount ?? 0),
        openReportCount: Number(reportTotalsRow?.openReportCount ?? 0),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("[ADMIN_TOTALS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
