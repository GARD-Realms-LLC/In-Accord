import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ensureLegacyUserBannerPointersImported } from "@/lib/legacy-banner-db-migration";
import { ensureUserProfileSchema } from "@/lib/user-profile";

export async function getUserBanner(userId: string): Promise<string | null> {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId) {
    return null;
  }

  await ensureLegacyUserBannerPointersImported();
  await ensureUserProfileSchema();

  const result = await db.execute(sql`
    select nullif(trim(up."bannerUrl"), '') as "bannerUrl"
    from "UserProfile" up
    where up."userId" = ${normalizedUserId}
    limit 1
  `);

  const bannerUrl = ((result as unknown as {
    rows?: Array<{ bannerUrl: string | null }>;
  }).rows ?? [])[0]?.bannerUrl;

  return typeof bannerUrl === "string" && bannerUrl.trim().length > 0 ? bannerUrl.trim() : null;
}

export async function setUserBanner(userId: string, bannerUrl?: string | null) {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId) {
    throw new Error("User ID is required.");
  }

  await ensureLegacyUserBannerPointersImported();
  await ensureUserProfileSchema();

  const normalizedBannerUrl = typeof bannerUrl === "string" && bannerUrl.trim().length > 0 ? bannerUrl.trim() : null;
  const now = new Date();

  await db.execute(sql`
    insert into "UserProfile" ("userId", "profileName", "bannerUrl", "createdAt", "updatedAt")
    values (
      ${normalizedUserId},
      ${"User"},
      ${normalizedBannerUrl},
      ${now},
      ${now}
    )
    on conflict ("userId") do update
    set "bannerUrl" = excluded."bannerUrl",
        "updatedAt" = excluded."updatedAt"
  `);
}
