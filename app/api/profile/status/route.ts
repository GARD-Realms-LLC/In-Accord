import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { normalizePresenceStatus } from "@/lib/presence-status";
import { ensureUserProfileSchema } from "@/lib/user-profile";

export async function PATCH(req: Request) {
  try {
    const current = await currentProfile();

    if (!current) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { status?: string };
    const status = normalizePresenceStatus(body.status);

    await ensureUserProfileSchema();

    const now = new Date();
    await db.execute(sql`
      insert into "UserProfile" ("userId", "profileName", "presenceStatus", "createdAt", "updatedAt")
      values (
        ${current.id},
        ${(current.profileName ?? current.realName ?? current.email ?? "User").trim().slice(0, 80) || "User"},
        ${status},
        ${now},
        ${now}
      )
      on conflict ("userId") do update
      set "presenceStatus" = excluded."presenceStatus",
          "updatedAt" = excluded."updatedAt"
    `);

    return NextResponse.json({ ok: true, status });
  } catch (error) {
    console.error("[PROFILE_STATUS_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
