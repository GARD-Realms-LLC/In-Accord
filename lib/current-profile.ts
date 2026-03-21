import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  autoConvertFamilyAccountIfNeeded,
  ensureFamilyAccountSchema,
} from "@/lib/family-accounts";
import { ensureLegacyUserBannerPointersImported } from "@/lib/legacy-banner-db-migration";
import { normalizePresenceStatus } from "@/lib/presence-status";
import { resolveAvatarUrl, resolveBannerUrl } from "@/lib/asset-url";
import { clearSessionUserId, getSessionUserId } from "@/lib/session";
import { ensureUserProfileSchema } from "@/lib/user-profile";

const CURRENT_PROFILE_CACHE_TTL_MS = 10_000;
const DISABLE_CURRENT_PROFILE_CACHE = true;

type CachedProfile = {
  id: string;
  userId: string;
  name: string;
  realName: string | null;
  profileName: string | null;
  profileNameStyle: string | null;
  nameplateLabel: string | null;
  nameplateColor: string | null;
  nameplateImageUrl: string | null;
  pronouns: string | null;
  businessRole: string | null;
  businessSection: string | null;
  comment: string | null;
  avatarDecorationUrl: string | null;
  profileEffectUrl: string | null;
  phoneNumber: string | null;
  dateOfBirth: string | null;
  familyParentUserId: string | null;
  bannerUrl: string | null;
  presenceStatus: string;
  currentGame: string | null;
  role: string | null;
  imageUrl: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
};

const currentProfileCache = new Map<string, { value: CachedProfile | null; expiresAt: number }>();

const normalizeProfileDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return new Date(0);
  }

  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
};

const getCachedCurrentProfile = (userId: string) => {
  if (DISABLE_CURRENT_PROFILE_CACHE) {
    return null;
  }

  const cached = currentProfileCache.get(userId);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    currentProfileCache.delete(userId);
    return null;
  }

  return cached.value;
};

const setCachedCurrentProfile = (userId: string, value: CachedProfile | null) => {
  if (DISABLE_CURRENT_PROFILE_CACHE) {
    return;
  }

  currentProfileCache.set(userId, {
    value,
    expiresAt: Date.now() + CURRENT_PROFILE_CACHE_TTL_MS,
  });
};

const getBasicCurrentProfile = async (userId: string): Promise<CachedProfile | null> => {
  const userResult = await db.execute(sql`
    select
      u."userId" as "userId",
      u."name" as "realName",
      u."email" as "email",
      u."role" as "role",
      coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
      u."account.created" as "accountCreated",
      u."lastLogin" as "lastLogin"
    from "Users" u
    where u."userId" = ${userId}
    limit 1
  `);

  const rows = (userResult as unknown as {
    rows: Array<{
      userId: string;
      realName: string | null;
      email: string | null;
      role: string | null;
      imageUrl: string | null;
      accountCreated: Date | string | null;
      lastLogin: Date | string | null;
    }>;
  }).rows;
  const user = rows?.[0] ?? null;

  if (!user) {
    return null;
  }

  return {
    id: user.userId,
    userId: user.userId,
    name: user.realName ?? user.email ?? "User",
    realName: user.realName ?? null,
    profileName: null,
    profileNameStyle: null,
    nameplateLabel: null,
    nameplateColor: null,
    nameplateImageUrl: null,
    pronouns: null,
    businessRole: null,
    businessSection: null,
    comment: null,
    avatarDecorationUrl: null,
    profileEffectUrl: null,
    phoneNumber: null,
    dateOfBirth: null,
    familyParentUserId: null,
    bannerUrl: null,
    presenceStatus: "ONLINE",
    currentGame: null,
    role: user.role ?? null,
    imageUrl: resolveAvatarUrl(user.imageUrl) ?? "/in-accord-steampunk-logo.png",
    email: user.email ?? "",
    createdAt: normalizeProfileDate(user.accountCreated),
    updatedAt: normalizeProfileDate(user.lastLogin),
  };
};

export const currentProfile = async () => {
  const userId = await getSessionUserId();

  if (!userId) {
    return null;
  }

  const cachedProfile = getCachedCurrentProfile(userId);
  if (cachedProfile) {
    return cachedProfile;
  }

  try {
    await ensureLegacyUserBannerPointersImported();
    await ensureUserProfileSchema();
    await ensureFamilyAccountSchema();

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
        up."businessRole" as "businessRole",
        up."businessSection" as "businessSection",
        up."comment" as "comment",
        up."avatarDecorationUrl" as "avatarDecorationUrl",
        up."profileEffectUrl" as "profileEffectUrl",
        nullif(trim(to_jsonb(u)->>'phone'), '') as "phoneNumber",
        nullif(trim(to_jsonb(u)->>'dob'), '') as "dateOfBirth",
        nullif(trim(to_jsonb(u)->>'familyParentUserId'), '') as "familyParentUserId",
        up."bannerUrl" as "bannerUrl",
        up."presenceStatus" as "presenceStatus",
        nullif(trim(to_jsonb(up)->>'currentGame'), '') as "currentGame",
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
        businessRole: string | null;
        businessSection: string | null;
        comment: string | null;
        avatarDecorationUrl: string | null;
        profileEffectUrl: string | null;
        phoneNumber: string | null;
        dateOfBirth: string | null;
        familyParentUserId: string | null;
        bannerUrl: string | null;
        presenceStatus: string | null;
        currentGame: string | null;
        role: string | null;
        email: string | null;
        imageUrl: string | null;
        accountCreated: Date | string | null;
        lastLogin: Date | string | null;
      }>;
    }).rows;
    const user = rows?.[0];

    const resolvedBannerUrl = user?.bannerUrl ?? null;

    let normalizedFamily: Awaited<ReturnType<typeof autoConvertFamilyAccountIfNeeded>> | null = null;
    if (user) {
      try {
        normalizedFamily = await autoConvertFamilyAccountIfNeeded(
          user.userId,
          user.dateOfBirth,
          user.familyParentUserId
        );
      } catch (error) {
        console.error("[CURRENT_PROFILE_FAMILY_NORMALIZE]", error);
      }
    }

    const current: CachedProfile | null = user
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
          businessRole: user.businessRole ?? null,
          businessSection: user.businessSection ?? null,
          comment: user.comment ?? null,
          avatarDecorationUrl: user.avatarDecorationUrl ?? null,
          profileEffectUrl: user.profileEffectUrl ?? null,
          phoneNumber: user.phoneNumber ?? null,
          dateOfBirth: user.dateOfBirth ?? null,
          familyParentUserId: normalizedFamily?.familyParentUserId ?? user.familyParentUserId ?? null,
          bannerUrl: resolveBannerUrl(resolvedBannerUrl),
          presenceStatus: normalizePresenceStatus(user.presenceStatus),
          currentGame: user.currentGame ?? null,
          role: user.role ?? null,
          imageUrl: resolveAvatarUrl(user.imageUrl) ?? "/in-accord-steampunk-logo.png",
          email: user.email ?? "",
          createdAt: normalizeProfileDate(user.accountCreated),
          updatedAt: normalizeProfileDate(user.lastLogin),
        }
      : null;

    setCachedCurrentProfile(userId, current);

    return current;
  } catch (error) {
    console.error("[CURRENT_PROFILE_LOOKUP]", error);

    try {
      const fallbackProfile = await getBasicCurrentProfile(userId);
      setCachedCurrentProfile(userId, fallbackProfile);
      return fallbackProfile;
    } catch (fallbackError) {
      console.error("[CURRENT_PROFILE_LOOKUP_FALLBACK]", fallbackError);
    }

    await clearSessionUserId();
    return null;
  }
}
