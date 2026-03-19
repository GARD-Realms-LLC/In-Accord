import { access, readFile } from "fs/promises";
import path from "path";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { normalizeOptionalCloudflareObjectPointer } from "@/lib/live-db-asset-pointers";
import { getLegacyWorkspaceDataDir, getRuntimeDataDir } from "@/lib/runtime-data-dir";
import { ensureUserProfileSchema } from "@/lib/user-profile";

type LegacyUserBannerMap = Record<string, string>;
type LegacyServerBannerMap = Record<string, string | { url?: unknown; fit?: unknown; scale?: unknown }>;

declare global {
  // eslint-disable-next-line no-var
  var inAccordLegacyUserBannerImportPromise: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var inAccordLegacyServerBannerImportPromise: Promise<void> | undefined;
}

const FILE_DATA_DISABLED = String(process.env.INACCORD_DISABLE_FILE_DATA ?? "").trim() === "1";

const pathExists = async (targetPath: string) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const readFirstExistingJson = async <T>(relativeFileName: string): Promise<T | null> => {
  const runtimeStoresDir = path.join(getRuntimeDataDir(), "stores");
  const candidates = [
    path.join(runtimeStoresDir, relativeFileName),
    path.join(getLegacyWorkspaceDataDir(), relativeFileName),
  ];

  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) {
      continue;
    }

    try {
      const raw = await readFile(candidate, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as T;
      }
    } catch {
      // Ignore malformed legacy files and continue.
    }
  }

  return null;
};

const normalizeServerBannerFit = (value: unknown): "cover" | "contain" | "scale" => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "contain" || normalized === "scale" ? normalized : "cover";
};

const normalizeServerBannerScale = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.min(2, Math.max(0.25, parsed));
};

const normalizeLegacyBannerPointer = (value: unknown): string | null => {
  const cloudflarePointer = normalizeOptionalCloudflareObjectPointer(value);
  if (cloudflarePointer) {
    return cloudflarePointer;
  }

  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith("/")) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    if (parsed.pathname === "/api/r2/object") {
      const key = String(parsed.searchParams.get("key") ?? "").trim();
      return key ? `/api/r2/object?key=${encodeURIComponent(key)}` : null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
};

export const ensureLegacyUserBannerPointersImported = async () => {
  if (FILE_DATA_DISABLED) {
    return;
  }

  if (globalThis.inAccordLegacyUserBannerImportPromise) {
    return globalThis.inAccordLegacyUserBannerImportPromise;
  }

  globalThis.inAccordLegacyUserBannerImportPromise = (async () => {
    await ensureUserProfileSchema();

    const legacyMap = await readFirstExistingJson<LegacyUserBannerMap>("user-banners.json");
    if (!legacyMap) {
      return;
    }

    const now = new Date();

    for (const [userId, rawBannerUrl] of Object.entries(legacyMap)) {
      const normalizedUserId = String(userId ?? "").trim();
      const normalizedBannerUrl = normalizeLegacyBannerPointer(rawBannerUrl);

      if (!normalizedUserId || !normalizedBannerUrl) {
        continue;
      }

      await db.execute(sql`
        insert into "UserProfile" ("userId", "profileName", "bannerUrl", "createdAt", "updatedAt")
        values (${normalizedUserId}, ${"User"}, ${normalizedBannerUrl}, ${now}, ${now})
        on conflict ("userId") do update
        set "bannerUrl" = case
              when nullif(trim("UserProfile"."bannerUrl"), '') is null then excluded."bannerUrl"
              else "UserProfile"."bannerUrl"
            end,
            "updatedAt" = case
              when nullif(trim("UserProfile"."bannerUrl"), '') is null then excluded."updatedAt"
              else "UserProfile"."updatedAt"
            end
      `);
    }
  })().catch((error) => {
    globalThis.inAccordLegacyUserBannerImportPromise = undefined;
    throw error;
  });

  return globalThis.inAccordLegacyUserBannerImportPromise;
};

export const ensureLegacyServerBannerPointersImported = async () => {
  if (FILE_DATA_DISABLED) {
    return;
  }

  if (globalThis.inAccordLegacyServerBannerImportPromise) {
    return globalThis.inAccordLegacyServerBannerImportPromise;
  }

  globalThis.inAccordLegacyServerBannerImportPromise = (async () => {
    const legacyMap = await readFirstExistingJson<LegacyServerBannerMap>("server-banners.json");
    if (!legacyMap) {
      return;
    }

    const now = new Date();

    await db.execute(sql`
      create table if not exists "ServerBanner" (
        "serverId" varchar(191) primary key,
        "url" text,
        "fit" varchar(20) not null default 'cover',
        "scale" double precision not null default 1,
        "createdAt" timestamp not null default now(),
        "updatedAt" timestamp not null default now()
      )
    `);

    for (const [serverId, rawValue] of Object.entries(legacyMap)) {
      const normalizedServerId = String(serverId ?? "").trim();
      const candidateUrl =
        typeof rawValue === "string"
          ? rawValue
          : typeof rawValue?.url === "string"
            ? rawValue.url
            : null;
      const normalizedBannerUrl = normalizeLegacyBannerPointer(candidateUrl);

      if (!normalizedServerId || !normalizedBannerUrl) {
        continue;
      }

      const fit = normalizeServerBannerFit(typeof rawValue === "object" ? rawValue?.fit : undefined);
      const scale = normalizeServerBannerScale(typeof rawValue === "object" ? rawValue?.scale : undefined);

      await db.execute(sql`
        insert into "ServerBanner" ("serverId", "url", "fit", "scale", "createdAt", "updatedAt")
        values (${normalizedServerId}, ${normalizedBannerUrl}, ${fit}, ${scale}, ${now}, ${now})
        on conflict ("serverId") do update
        set "url" = case
              when nullif(trim("ServerBanner"."url"), '') is null then excluded."url"
              else "ServerBanner"."url"
            end,
            "fit" = case
              when nullif(trim("ServerBanner"."url"), '') is null then excluded."fit"
              else "ServerBanner"."fit"
            end,
            "scale" = case
              when nullif(trim("ServerBanner"."url"), '') is null then excluded."scale"
              else "ServerBanner"."scale"
            end,
            "updatedAt" = case
              when nullif(trim("ServerBanner"."url"), '') is null then excluded."updatedAt"
              else "ServerBanner"."updatedAt"
            end
      `);
    }
  })().catch((error) => {
    globalThis.inAccordLegacyServerBannerImportPromise = undefined;
    throw error;
  });

  return globalThis.inAccordLegacyServerBannerImportPromise;
};
