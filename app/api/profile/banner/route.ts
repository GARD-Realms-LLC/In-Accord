import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { appendBannerDebugEvent } from "@/lib/banner-debug";
import { resolveBannerUrl } from "@/lib/asset-url";
import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { normalizeOptionalCloudflareObjectPointer } from "@/lib/live-db-asset-pointers";
import { ensureUserProfileSchema } from "@/lib/user-profile";

export async function PATCH(req: Request) {
  try {
    const current = await currentProfile();

    if (!current) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { bannerUrl?: string | null };
    const normalizedBannerUrl = normalizeOptionalCloudflareObjectPointer(body.bannerUrl);

    if (body.bannerUrl !== null && body.bannerUrl !== undefined && normalizedBannerUrl === null) {
      return NextResponse.json({ error: "bannerUrl must be a Cloudflare object pointer" }, { status: 400 });
    }

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

    const resolvedBannerUrl = resolveBannerUrl(normalizedBannerUrl);
    void appendBannerDebugEvent({
      source: "api/profile/banner",
      stage: "patch",
      rawValue: normalizedBannerUrl,
      resolvedValue: resolvedBannerUrl,
      metadata: {
        profileId: current.id,
      },
    });

    return NextResponse.json({ ok: true, bannerUrl: resolvedBannerUrl });
  } catch (error) {
    console.error("[PROFILE_BANNER_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
