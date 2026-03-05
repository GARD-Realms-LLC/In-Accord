import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { ensureUserProfileSchema } from "@/lib/user-profile";

export async function PATCH(req: Request) {
  try {
    const current = await currentProfile();

    if (!current) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { realName?: string };
    const realName = String(body.realName ?? "").trim();

    if (!realName) {
      return NextResponse.json({ error: "Real Name is required." }, { status: 400 });
    }

    if (realName.length > 80) {
      return NextResponse.json(
        { error: "Real Name must be 80 characters or fewer." },
        { status: 400 }
      );
    }

    await ensureUserProfileSchema();

    const now = new Date();
    await db.execute(sql`
      insert into "UserProfile" ("userId", "profileName", "createdAt", "updatedAt")
      values (${current.id}, ${realName}, ${now}, ${now})
      on conflict ("userId") do update
      set "profileName" = excluded."profileName",
          "updatedAt" = excluded."updatedAt"
    `);

    return NextResponse.json({ ok: true, realName });
  } catch (error) {
    console.error("[PROFILE_REAL_NAME_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
