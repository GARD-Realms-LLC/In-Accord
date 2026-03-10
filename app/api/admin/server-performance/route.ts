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

    const pingStart = Date.now();
    await db.execute(sql`select 1`);
    const databasePingMs = Date.now() - pingStart;

    const countsResult = await db.execute(sql`
      select
        (select count(*)::int from "Users") as "totalMembers",
        (select count(*)::int from "Server") as "totalServers",
        (select count(*)::int from "Channel") as "totalChannels",
        (select count(*)::int from "Message") as "totalMessages"
    `);

    const countsRow = (countsResult as unknown as {
      rows?: Array<{
        totalMembers: number | string | null;
        totalServers: number | string | null;
        totalChannels: number | string | null;
        totalMessages: number | string | null;
      }>;
    }).rows?.[0];

    const rssBytes = Number(process.memoryUsage().rss ?? 0);
    const heapUsedBytes = Number(process.memoryUsage().heapUsed ?? 0);

    return NextResponse.json(
      {
        uptimeSeconds: Math.max(0, Math.floor(process.uptime())),
        nodeVersion: process.version,
        databasePingMs,
        totalMembers: Number(countsRow?.totalMembers ?? 0),
        totalServers: Number(countsRow?.totalServers ?? 0),
        totalChannels: Number(countsRow?.totalChannels ?? 0),
        totalMessages: Number(countsRow?.totalMessages ?? 0),
        memoryRssMb: Number((rssBytes / (1024 * 1024)).toFixed(1)),
        memoryHeapUsedMb: Number((heapUsedBytes / (1024 * 1024)).toFixed(1)),
        updatedAt: new Date().toISOString(),
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
    console.error("[ADMIN_SERVER_PERFORMANCE_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
