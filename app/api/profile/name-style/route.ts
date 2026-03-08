import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { normalizeProfileNameStyleValue } from "@/lib/profile-name-styles";
import { ensureUserProfileSchema } from "@/lib/user-profile";

export async function PATCH(req: Request) {
  try {
    const current = await currentProfile();

    if (!current) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { profileNameStyle?: unknown };
    const rawStyle = typeof body.profileNameStyle === "string" ? body.profileNameStyle.trim() : "";
    const normalizedStyle = normalizeProfileNameStyleValue(rawStyle);

    await ensureUserProfileSchema();

    const now = new Date();
    const fallbackProfileName =
      (current.profileName ?? current.realName ?? current.email ?? "User").trim().slice(0, 80) || "User";

    await db.execute(sql`
      insert into "UserProfile" ("userId", "profileName", "profileNameStyle", "createdAt", "updatedAt")
      values (${current.id}, ${fallbackProfileName}, ${normalizedStyle}, ${now}, ${now})
      on conflict ("userId") do update
      set "profileNameStyle" = excluded."profileNameStyle",
          "updatedAt" = excluded."updatedAt"
    `);

    return NextResponse.json({ ok: true, profileNameStyle: normalizedStyle });
  } catch (error) {
    console.error("[PROFILE_NAME_STYLE_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
