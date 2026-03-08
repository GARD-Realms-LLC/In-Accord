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

  const connectionUrl = process.env.LIVE_DATABASE_URL?.trim() ?? "";

  if (!connectionUrl || /^replace_/i.test(connectionUrl) || !/^postgres(ql)?:\/\//i.test(connectionUrl)) {
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
        up."profileNameStyle" as "profileNameStyle",
        up."nameplateLabel" as "nameplateLabel",
        up."nameplateColor" as "nameplateColor",
        up."nameplateImageUrl" as "nameplateImageUrl",
        up."pronouns" as "pronouns",
        up."comment" as "comment",
        up."avatarDecorationUrl" as "avatarDecorationUrl",
        nullif(trim(to_jsonb(u)->>'phone'), '') as "phoneNumber",
        nullif(trim(to_jsonb(u)->>'dob'), '') as "dateOfBirth",
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
        profileNameStyle: string | null;
        nameplateLabel: string | null;
        nameplateColor: string | null;
        nameplateImageUrl: string | null;
        pronouns: string | null;
        comment: string | null;
        avatarDecorationUrl: string | null;
        phoneNumber: string | null;
        dateOfBirth: string | null;
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
          profileNameStyle: user.profileNameStyle ?? null,
          nameplateLabel: user.nameplateLabel ?? null,
          nameplateColor: user.nameplateColor ?? null,
          nameplateImageUrl: user.nameplateImageUrl ?? null,
          pronouns: user.pronouns ?? null,
          comment: user.comment ?? null,
          avatarDecorationUrl: user.avatarDecorationUrl ?? null,
          phoneNumber: user.phoneNumber ?? null,
          dateOfBirth: user.dateOfBirth ?? null,
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
