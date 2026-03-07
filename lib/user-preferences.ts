import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export type CustomThemeColors = {
  background: string;
  card: string;
  secondary: string;
  accent: string;
  primary: string;
  foreground: string;
  mutedForeground: string;
  border: string;
};

export type UserPreferences = {
  mentionsEnabled: boolean;
  customCss: string;
  languagePreference: string;
  connectedAccounts: string[];
  serverTags: string[];
  selectedServerTagServerId: string | null;
  customThemeColors: CustomThemeColors | null;
  downloadedPlugins: string[];
  transparentBackground: {
    selectedBackground: string | null;
    uploadedBackgrounds: string[];
  };
};

let userPreferencesSchemaReady = false;

const normalizeStringArray = (values: unknown, max = 100): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }

  const unique = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    unique.add(trimmed);
    if (unique.size >= max) {
      break;
    }
  }

  return Array.from(unique);
};

const normalizeCustomThemeColors = (value: unknown): CustomThemeColors | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Partial<Record<keyof CustomThemeColors, unknown>>;
  const keys: Array<keyof CustomThemeColors> = [
    "background",
    "card",
    "secondary",
    "accent",
    "primary",
    "foreground",
    "mutedForeground",
    "border",
  ];

  const next = {} as CustomThemeColors;
  for (const key of keys) {
    const candidate = source[key];
    if (typeof candidate !== "string" || !/^#[0-9a-fA-F]{6}$/.test(candidate)) {
      return null;
    }

    next[key] = candidate;
  }

  return next;
};

const parseJsonSafely = (raw: string | null): unknown => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

const allowedLanguagePreferences = new Set([
  "system",
  "en-US",
  "es-ES",
  "fr-FR",
  "de-DE",
  "it-IT",
  "pt-BR",
  "ja-JP",
  "ko-KR",
  "zh-CN",
]);

const normalizeLanguagePreference = (value: unknown): string => {
  if (typeof value !== "string") {
    return "system";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "system";
  }

  return allowedLanguagePreferences.has(trimmed) ? trimmed : "system";
};

const allowedConnectedAccounts = new Set([
  "github",
  "google",
  "steam",
  "twitch",
  "xbox",
  "youtube",
]);

const normalizeConnectedAccounts = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const normalized = item.trim().toLowerCase();
    if (!allowedConnectedAccounts.has(normalized)) {
      continue;
    }

    unique.add(normalized);
  }

  return Array.from(unique);
};

const normalizeServerTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const normalized = item.trim().replace(/\s+/g, " ");
    if (normalized.length < 2 || normalized.length > 24) {
      continue;
    }

    if (!/^[a-zA-Z0-9][a-zA-Z0-9\s\-_.]*$/.test(normalized)) {
      continue;
    }

    unique.add(normalized);
    if (unique.size >= 6) {
      break;
    }
  }

  return Array.from(unique);
};

export const ensureUserPreferencesSchema = async () => {
  if (userPreferencesSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "UserPreference" (
      "userId" varchar(191) primary key,
      "mentionsEnabled" boolean not null default true,
      "customCss" text not null default '',
      "languagePreference" text not null default 'system',
      "connectedAccountsJson" text not null default '[]',
      "serverTagsJson" text not null default '[]',
      "selectedServerTagServerId" text,
      "customThemeColorsJson" text,
      "downloadedPluginsJson" text not null default '[]',
      "transparentBackgroundSelected" text,
      "transparentBackgroundUploadsJson" text not null default '[]',
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    create index if not exists "UserPreference_updatedAt_idx"
    on "UserPreference" ("updatedAt")
  `);

  await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "languagePreference" text not null default 'system'
  `);

  await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "connectedAccountsJson" text not null default '[]'
  `);

  await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "serverTagsJson" text not null default '[]'
  `);

  await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "selectedServerTagServerId" text
  `);

  const now = new Date();
  await db.execute(sql`
    insert into "UserPreference" ("userId", "createdAt", "updatedAt")
    select u."userId", ${now}, ${now}
    from "Users" u
    on conflict ("userId") do nothing
  `);

  userPreferencesSchemaReady = true;
};

export const getUserPreferences = async (userId: string): Promise<UserPreferences> => {
  await ensureUserPreferencesSchema();

  const result = await db.execute(sql`
    select
      "mentionsEnabled",
      "customCss",
      "languagePreference",
      "connectedAccountsJson",
      "serverTagsJson",
      "selectedServerTagServerId",
      "customThemeColorsJson",
      "downloadedPluginsJson",
      "transparentBackgroundSelected",
      "transparentBackgroundUploadsJson"
    from "UserPreference"
    where "userId" = ${userId}
    limit 1
  `);

  const row = (result as unknown as {
    rows: Array<{
      mentionsEnabled: boolean | null;
      customCss: string | null;
      languagePreference: string | null;
      connectedAccountsJson: string | null;
      serverTagsJson: string | null;
      selectedServerTagServerId: string | null;
      customThemeColorsJson: string | null;
      downloadedPluginsJson: string | null;
      transparentBackgroundSelected: string | null;
      transparentBackgroundUploadsJson: string | null;
    }>;
  }).rows?.[0];

  const customThemeColors = normalizeCustomThemeColors(parseJsonSafely(row?.customThemeColorsJson ?? null));
  const connectedAccounts = normalizeConnectedAccounts(parseJsonSafely(row?.connectedAccountsJson ?? null));
  const serverTags = normalizeServerTags(parseJsonSafely(row?.serverTagsJson ?? null));
  const downloadedPlugins = normalizeStringArray(parseJsonSafely(row?.downloadedPluginsJson ?? null), 200);
  const transparentUploads = normalizeStringArray(
    parseJsonSafely(row?.transparentBackgroundUploadsJson ?? null),
    40
  );

  return {
    mentionsEnabled: row?.mentionsEnabled !== false,
    customCss: typeof row?.customCss === "string" ? row.customCss : "",
    languagePreference: normalizeLanguagePreference(row?.languagePreference),
    connectedAccounts,
    serverTags,
    selectedServerTagServerId:
      typeof row?.selectedServerTagServerId === "string" && row.selectedServerTagServerId.trim().length > 0
        ? row.selectedServerTagServerId.trim()
        : null,
    customThemeColors,
    downloadedPlugins,
    transparentBackground: {
      selectedBackground:
        typeof row?.transparentBackgroundSelected === "string" && row.transparentBackgroundSelected.trim().length > 0
          ? row.transparentBackgroundSelected.trim()
          : null,
      uploadedBackgrounds: transparentUploads,
    },
  };
};

export const updateUserPreferences = async (
  userId: string,
  updates: Partial<{
    mentionsEnabled: boolean;
    customCss: string;
    languagePreference: string;
    connectedAccounts: string[];
    serverTags: string[];
    selectedServerTagServerId: string | null;
    customThemeColors: CustomThemeColors | null;
    downloadedPlugins: string[];
    transparentBackgroundSelected: string | null;
    transparentBackgroundUploads: string[];
  }>
) => {
  await ensureUserPreferencesSchema();

  const values: Array<ReturnType<typeof sql>> = [];

  if (typeof updates.mentionsEnabled === "boolean") {
    values.push(sql`"mentionsEnabled" = ${updates.mentionsEnabled}`);
  }

  if (typeof updates.customCss === "string") {
    values.push(sql`"customCss" = ${updates.customCss}`);
  }

  if (typeof updates.languagePreference === "string") {
    values.push(sql`"languagePreference" = ${normalizeLanguagePreference(updates.languagePreference)}`);
  }

  if (Array.isArray(updates.connectedAccounts)) {
    values.push(sql`"connectedAccountsJson" = ${JSON.stringify(normalizeConnectedAccounts(updates.connectedAccounts))}`);
  }

  if (Array.isArray(updates.serverTags)) {
    values.push(sql`"serverTagsJson" = ${JSON.stringify(normalizeServerTags(updates.serverTags))}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "selectedServerTagServerId")) {
    const selectedServerTagServerId =
      typeof updates.selectedServerTagServerId === "string" && updates.selectedServerTagServerId.trim().length > 0
        ? updates.selectedServerTagServerId.trim()
        : null;
    values.push(sql`"selectedServerTagServerId" = ${selectedServerTagServerId}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "customThemeColors")) {
    const normalized = normalizeCustomThemeColors(updates.customThemeColors);
    values.push(sql`"customThemeColorsJson" = ${normalized ? JSON.stringify(normalized) : null}`);
  }

  if (Array.isArray(updates.downloadedPlugins)) {
    values.push(sql`"downloadedPluginsJson" = ${JSON.stringify(normalizeStringArray(updates.downloadedPlugins, 200))}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "transparentBackgroundSelected")) {
    const selected =
      typeof updates.transparentBackgroundSelected === "string" && updates.transparentBackgroundSelected.trim().length > 0
        ? updates.transparentBackgroundSelected.trim()
        : null;

    values.push(sql`"transparentBackgroundSelected" = ${selected}`);
  }

  if (Array.isArray(updates.transparentBackgroundUploads)) {
    values.push(
      sql`"transparentBackgroundUploadsJson" = ${JSON.stringify(
        normalizeStringArray(updates.transparentBackgroundUploads, 40)
      )}`
    );
  }

  if (values.length === 0) {
    return getUserPreferences(userId);
  }

  values.push(sql`"updatedAt" = now()`);

  await db.execute(sql`
    update "UserPreference"
    set ${sql.join(values, sql`, `)}
    where "userId" = ${userId}
  `);

  return getUserPreferences(userId);
};
