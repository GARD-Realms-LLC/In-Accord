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

    const body = (await req.json()) as { pronouns?: string | null };
    const pronounsInput = typeof body.pronouns === "string" ? body.pronouns.trim() : "";

    if (pronounsInput.length > 40) {
      return NextResponse.json(
        { error: "Pronouns must be 40 characters or fewer." },
        { status: 400 }
      );
    }

    await ensureUserProfileSchema();

    const now = new Date();
    const normalizedPronouns = pronounsInput.length > 0 ? pronounsInput : null;
    const fallbackProfileName =
      (current.profileName ?? current.realName ?? current.email ?? "User").trim().slice(0, 80) || "User";

    await db.execute(sql`
      insert into "UserProfile" ("userId", "profileName", "pronouns", "createdAt", "updatedAt")
      values (${current.id}, ${fallbackProfileName}, ${normalizedPronouns}, ${now}, ${now})
      on conflict ("userId") do update
      set "pronouns" = excluded."pronouns",
          "updatedAt" = excluded."updatedAt"
    `);

    return NextResponse.json({ ok: true, pronouns: normalizedPronouns });
  } catch (error) {
    console.error("[PROFILE_PRONOUNS_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
