import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { allowedReportTargetTypes, ensureReportSchema, type ReportTargetType } from "@/lib/reports";

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureReportSchema();

    const body = (await req.json().catch(() => ({}))) as {
      targetType?: string;
      targetId?: string;
      reason?: string;
      details?: string;
    };

    const targetType = String(body.targetType ?? "").trim().toUpperCase() as ReportTargetType;
    const targetId = String(body.targetId ?? "").trim();
    const reason = String(body.reason ?? "").trim().slice(0, 300);
    const details = String(body.details ?? "").trim().slice(0, 4000);

    if (!allowedReportTargetTypes.has(targetType)) {
      return NextResponse.json({ error: "Invalid targetType" }, { status: 400 });
    }

    if (!targetId) {
      return NextResponse.json({ error: "targetId is required" }, { status: 400 });
    }

    if (targetType === "USER" && targetId === profile.id) {
      return NextResponse.json({ error: "You cannot report yourself" }, { status: 400 });
    }

    if (targetType === "USER") {
      const targetUserResult = await db.execute(sql`
        select "userId"
        from "Users"
        where "userId" = ${targetId}
        limit 1
      `);

      const exists = Boolean(
        (targetUserResult as unknown as { rows?: Array<{ userId: string }> }).rows?.[0]?.userId
      );

      if (!exists) {
        return NextResponse.json({ error: "Target user not found" }, { status: 404 });
      }
    }

    if (targetType === "SERVER") {
      const targetServerResult = await db.execute(sql`
        select "id"
        from "Server"
        where "id" = ${targetId}
        limit 1
      `);

      const exists = Boolean(
        (targetServerResult as unknown as { rows?: Array<{ id: string }> }).rows?.[0]?.id
      );

      if (!exists) {
        return NextResponse.json({ error: "Target server not found" }, { status: 404 });
      }
    }

    if (targetType === "MESSAGE") {
      const targetMessageResult = await db.execute(sql`
        select "id"
        from "Message"
        where "id" = ${targetId}
        limit 1
      `);

      const targetDirectMessageResult = await db.execute(sql`
        select "id"
        from "DirectMessage"
        where "id" = ${targetId}
        limit 1
      `);

      const exists = Boolean(
        (targetMessageResult as unknown as { rows?: Array<{ id: string }> }).rows?.[0]?.id ||
        (targetDirectMessageResult as unknown as { rows?: Array<{ id: string }> }).rows?.[0]?.id
      );

      if (!exists) {
        return NextResponse.json({ error: "Target message not found" }, { status: 404 });
      }
    }

    const reportId = uuidv4();

    await db.execute(sql`
      insert into "Report" (
        "id",
        "reporterProfileId",
        "targetType",
        "targetId",
        "reason",
        "details",
        "status",
        "createdAt",
        "updatedAt"
      )
      values (
        ${reportId},
        ${profile.id},
        ${targetType},
        ${targetId},
        ${reason || null},
        ${details || null},
        ${"OPEN"},
        now(),
        now()
      )
    `);

    return NextResponse.json({ ok: true, reportId, status: "OPEN" });
  } catch (error) {
    console.error("[REPORTS_POST]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
