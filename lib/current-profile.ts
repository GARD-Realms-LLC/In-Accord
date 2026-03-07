import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ensureRemovedInAccordRolesNormalized } from "@/lib/in-accord-admin-migration";
import { normalizePresenceStatus } from "@/lib/presence-status";
import { getSessionUserId } from "@/lib/session";
import { getUserBanner } from "@/lib/user-banner-store";
import { ensureUserProfileSchema } from "@/lib/user-profile";

export const currentProfile = async () => {
  const userId = await getSessionUserId();

  if (!userId) {
    return null;
  }

  const liveConnectionUrl = process.env.LIVE_DATABASE_URL?.trim() ?? "";
  const fallbackConnectionUrl = process.env.DATABASE_URL?.trim() ?? "";
  const connectionUrl =
    liveConnectionUrl && !/^replace_/i.test(liveConnectionUrl)
      ? liveConnectionUrl
      : fallbackConnectionUrl;

  if (!/^postgres(ql)?:\/\//i.test(connectionUrl)) {
    return null;
  }

  try {
    await ensureUserProfileSchema();
    await ensureRemovedInAccordRolesNormalized();

    const userResult = await db.execute(sql`
      select
        u."userId" as "userId",
        u."name" as "realName",
        up."profileName" as "profileName",
        up."bannerUrl" as "bannerUrl",
        up."presenceStatus" as "presenceStatus",
        u."role" as "role",
        u."email" as "email",
        coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
        u."account.created" as "accountCreated",
        u."lastLogin" as "lastLogin"
      from "Users" u
      left join "UserProfile" up on up."userId" = u."userId"
      where u."userId" = ${userId}
      limit 1
    `);

    const rows = (userResult as unknown as {
      rows: Array<{
        userId: string;
        realName: string | null;
        profileName: string | null;
        bannerUrl: string | null;
        presenceStatus: string | null;
        role: string | null;
        email: string | null;
        imageUrl: string | null;
        accountCreated: Date | string | null;
        lastLogin: Date | string | null;
      }>;
    }).rows;
    const user = rows?.[0];

    const resolvedBannerUrl = user
      ? user.bannerUrl ?? (await getUserBanner(user.userId))
      : null;

    const current = user
      ? {
          id: user.userId,
          userId: user.userId,
          name: user.profileName ?? user.realName ?? "User",
          realName: user.realName ?? null,
          profileName: user.profileName ?? null,
          bannerUrl: resolvedBannerUrl,
          presenceStatus: normalizePresenceStatus(user.presenceStatus),
          role: user.role ?? null,
          imageUrl: user.imageUrl ?? "/in-accord-steampunk-logo.png",
          email: user.email ?? "",
          createdAt: user.accountCreated ? new Date(user.accountCreated) : new Date(0),
          updatedAt: user.lastLogin ? new Date(user.lastLogin) : new Date(0),
        }
      : null;

    return current;
  } catch (error) {
    console.error("[CURRENT_PROFILE_LOOKUP]", error);
    return null;
  }
}
