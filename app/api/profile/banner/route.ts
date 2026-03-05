import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { setUserBanner } from "@/lib/user-banner-store";
import { ensureUserProfileSchema } from "@/lib/user-profile";

export async function PATCH(req: Request) {
  try {
    const current = await currentProfile();

    if (!current) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { bannerUrl?: string | null };
    const normalizedBannerUrl =
      typeof body.bannerUrl === "string" && body.bannerUrl.trim().length > 0
        ? body.bannerUrl.trim()
        : null;

    const fallbackProfileName = (current.profileName ?? current.realName ?? current.email ?? "User")
      .trim()
      .slice(0, 80) || "User";

    try {
      await ensureUserProfileSchema();

      const now = new Date();
      await db.execute(sql`
        insert into "UserProfile" ("userId", "profileName", "bannerUrl", "createdAt", "updatedAt")
        values (
          ${current.id},
          ${fallbackProfileName},
          ${normalizedBannerUrl},
          ${now},
          ${now}
        )
        on conflict ("userId") do update
        set "bannerUrl" = excluded."bannerUrl",
            "updatedAt" = excluded."updatedAt"
      `);
    } catch (dbError) {
      console.error("[PROFILE_BANNER_PATCH_DB]", dbError);
    }

    await setUserBanner(current.id, normalizedBannerUrl);

    return NextResponse.json({ ok: true, bannerUrl: normalizedBannerUrl });
  } catch (error) {
    console.error("[PROFILE_BANNER_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
