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

export type ContentSocialPreferences = {
  allowDirectMessagesFromServerMembers: boolean;
  allowFriendRequests: boolean;
  matureContentFilter: "strict" | "moderate" | "off";
  hideSensitiveLinkPreviews: boolean;
};

export type DataPrivacyPreferences = {
  profileDiscoverable: boolean;
  showPresenceToNonFriends: boolean;
  allowUsageDiagnostics: boolean;
  retentionMode: "standard" | "minimal";
};

export type FamilyCenterPreferences = {
  requireContentFilterForFamilyMembers: boolean;
  shareWeeklySafetySummary: boolean;
  allowDirectMessagesFromNonFriends: boolean;
  alertOnMatureContentInteractions: boolean;
  familyDesignation: string;
  familyApplicationStatus: string;
  familyApplicationSubmittedAt: string;
  familyApplicationFiles: FamilyCenterApplicationFile[];
  familyMembers: FamilyCenterMemberAccount[];
};

export type FamilyCenterApplicationFile = {
  name: string;
  url: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

export type FamilyCenterMemberAccount = {
  id: string;
  childName: string;
  accountIdentifier: string;
  childRelation: string;
  childEmail: string;
  childPassword: string;
  childPhone: string;
  childDateOfBirth: string;
  linkedUserId: string;
  familyLinkState: "managed-under-16" | "eligible-16-plus" | "normal";
  createdAt: string;
  requireContentFilterForFamilyMembers: boolean;
  shareWeeklySafetySummary: boolean;
  allowDirectMessagesFromNonFriends: boolean;
  alertOnMatureContentInteractions: boolean;
};

const defaultContentSocialPreferences: ContentSocialPreferences = {
  allowDirectMessagesFromServerMembers: true,
  allowFriendRequests: true,
  matureContentFilter: "moderate",
  hideSensitiveLinkPreviews: true,
};

const defaultDataPrivacyPreferences: DataPrivacyPreferences = {
  profileDiscoverable: true,
  showPresenceToNonFriends: true,
  allowUsageDiagnostics: true,
  retentionMode: "standard",
};

const defaultFamilyCenterPreferences: FamilyCenterPreferences = {
  requireContentFilterForFamilyMembers: true,
  shareWeeklySafetySummary: true,
  allowDirectMessagesFromNonFriends: false,
  alertOnMatureContentInteractions: true,
  familyDesignation: "",
  familyApplicationStatus: "",
  familyApplicationSubmittedAt: "",
  familyApplicationFiles: [],
  familyMembers: [],
};

export type UserPreferences = {
  mentionsEnabled: boolean;
  customCss: string;
  languagePreference: string;
  connectedAccounts: string[];
  contentSocial: ContentSocialPreferences;
  dataPrivacy: DataPrivacyPreferences;
  familyCenter: FamilyCenterPreferences;
  serverTags: string[];
  selectedServerTagServerId: string | null;
  customThemeColors: CustomThemeColors | null;
  downloadedPlugins: string[];
  bannerUploads: string[];
  avatarUploads: string[];
  transparentBackground: {
    selectedBackground: string | null;
    uploadedBackgrounds: string[];
  };
  discordApps: DiscordAppConfig[];
  discordBots: DiscordBotConfig[];
};

export type DiscordAppConfig = {
  id: string;
  name: string;
  applicationId: string;
  clientId: string;
  scopes: string[];
  redirectUri: string;
  enabled: boolean;
  createdAt: string;
};

export type DiscordBotConfig = {
  id: string;
  name: string;
  applicationId: string;
  botUserId: string;
  tokenHint: string;
  permissions: string[];
  enabled: boolean;
  createdAt: string;
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

const normalizeContentSocialPreferences = (value: unknown): ContentSocialPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultContentSocialPreferences };
  }

  const source = value as Partial<Record<keyof ContentSocialPreferences, unknown>>;
  const matureContentFilter =
    source.matureContentFilter === "strict" ||
    source.matureContentFilter === "moderate" ||
    source.matureContentFilter === "off"
      ? source.matureContentFilter
      : defaultContentSocialPreferences.matureContentFilter;

  return {
    allowDirectMessagesFromServerMembers:
      typeof source.allowDirectMessagesFromServerMembers === "boolean"
        ? source.allowDirectMessagesFromServerMembers
        : defaultContentSocialPreferences.allowDirectMessagesFromServerMembers,
    allowFriendRequests:
      typeof source.allowFriendRequests === "boolean"
        ? source.allowFriendRequests
        : defaultContentSocialPreferences.allowFriendRequests,
    matureContentFilter,
    hideSensitiveLinkPreviews:
      typeof source.hideSensitiveLinkPreviews === "boolean"
        ? source.hideSensitiveLinkPreviews
        : defaultContentSocialPreferences.hideSensitiveLinkPreviews,
  };
};

const normalizeDataPrivacyPreferences = (value: unknown): DataPrivacyPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultDataPrivacyPreferences };
  }

  const source = value as Partial<Record<keyof DataPrivacyPreferences, unknown>>;
  const retentionMode =
    source.retentionMode === "minimal" || source.retentionMode === "standard"
      ? source.retentionMode
      : defaultDataPrivacyPreferences.retentionMode;

  return {
    profileDiscoverable:
      typeof source.profileDiscoverable === "boolean"
        ? source.profileDiscoverable
        : defaultDataPrivacyPreferences.profileDiscoverable,
    showPresenceToNonFriends:
      typeof source.showPresenceToNonFriends === "boolean"
        ? source.showPresenceToNonFriends
        : defaultDataPrivacyPreferences.showPresenceToNonFriends,
    allowUsageDiagnostics:
      typeof source.allowUsageDiagnostics === "boolean"
        ? source.allowUsageDiagnostics
        : defaultDataPrivacyPreferences.allowUsageDiagnostics,
    retentionMode,
  };
};

const normalizeFamilyCenterPreferences = (value: unknown): FamilyCenterPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultFamilyCenterPreferences };
  }

  const source = value as Partial<Record<keyof FamilyCenterPreferences, unknown>>;
  const familyApplicationFiles = Array.isArray(source.familyApplicationFiles)
    ? source.familyApplicationFiles
        .filter((entry): entry is FamilyCenterApplicationFile => {
          if (!entry || typeof entry !== "object") {
            return false;
          }

          const candidate = entry as Partial<FamilyCenterApplicationFile>;
          return typeof candidate.name === "string" && typeof candidate.url === "string";
        })
        .map((entry) => ({
          name: normalizeLabel(entry.name, 200),
          url: normalizeMediaUrlLike(entry.url, 2048),
          mimeType: normalizeLabel(entry.mimeType, 120).toLowerCase() || "application/octet-stream",
          size:
            typeof entry.size === "number" && Number.isFinite(entry.size) && entry.size > 0
              ? Math.min(Math.floor(entry.size), 100 * 1024 * 1024)
              : 0,
          uploadedAt: normalizeIsoDate(entry.uploadedAt),
        }))
        .filter((entry) => entry.name.length > 0 && entry.url.length > 0)
        .slice(0, 20)
    : [];

  return {
    requireContentFilterForFamilyMembers:
      typeof source.requireContentFilterForFamilyMembers === "boolean"
        ? source.requireContentFilterForFamilyMembers
        : defaultFamilyCenterPreferences.requireContentFilterForFamilyMembers,
    shareWeeklySafetySummary:
      typeof source.shareWeeklySafetySummary === "boolean"
        ? source.shareWeeklySafetySummary
        : defaultFamilyCenterPreferences.shareWeeklySafetySummary,
    allowDirectMessagesFromNonFriends:
      typeof source.allowDirectMessagesFromNonFriends === "boolean"
        ? source.allowDirectMessagesFromNonFriends
        : defaultFamilyCenterPreferences.allowDirectMessagesFromNonFriends,
    alertOnMatureContentInteractions:
      typeof source.alertOnMatureContentInteractions === "boolean"
        ? source.alertOnMatureContentInteractions
        : defaultFamilyCenterPreferences.alertOnMatureContentInteractions,
    familyDesignation: normalizeLabel(source.familyDesignation, 80),
    familyApplicationStatus: normalizeLabel(source.familyApplicationStatus, 80),
    familyApplicationSubmittedAt:
      typeof source.familyApplicationSubmittedAt === "string" && !Number.isNaN(new Date(source.familyApplicationSubmittedAt).getTime())
        ? new Date(source.familyApplicationSubmittedAt).toISOString()
        : "",
    familyApplicationFiles,
    familyMembers: normalizeFamilyCenterMembers(source.familyMembers),
  };
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

const normalizeIdLike = (value: unknown, maxLength = 64): string => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return /^[a-zA-Z0-9_\-:.]{2,}$/.test(trimmed) ? trimmed.slice(0, maxLength) : "";
};

const normalizeLabel = (value: unknown, maxLength = 80): string => {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.slice(0, maxLength);
};

const normalizeScopesOrPermissions = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const normalized = item.trim().toLowerCase();
    if (!normalized || normalized.length > 64 || !/^[a-z0-9_.-]+$/.test(normalized)) {
      continue;
    }

    unique.add(normalized);
    if (unique.size >= 24) {
      break;
    }
  }

  return Array.from(unique);
};

const normalizeUrlLike = (value: unknown, maxLength = 512): string => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return "";
  }

  return trimmed.slice(0, maxLength);
};

const normalizeMediaUrlLike = (value: unknown, maxLength = 2048): string => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/")) {
    return trimmed.slice(0, maxLength);
  }

  return "";
};

const normalizeIsoDate = (value: unknown): string => {
  if (typeof value !== "string") {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
};

const normalizeFamilyCenterMembers = (value: unknown): FamilyCenterMemberAccount[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: FamilyCenterMemberAccount[] = [];
  const seen = new Set<string>();
  const allowedRelations = new Set([
    "Grand Daughter",
    "Grand Son",
    "Daughter",
    "Son",
    "Niece",
    "Nephew",
  ]);

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const source = item as Record<string, unknown>;
    const accountIdentifier = normalizeLabel(source.accountIdentifier, 160);
    const childRelation = normalizeLabel(source.childRelation, 40);
    if (!accountIdentifier) {
      continue;
    }

    const dedupeKey = accountIdentifier.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    normalized.push({
      id: normalizeIdLike(source.id, 80) || `family-member-${normalized.length + 1}`,
      childName: normalizeLabel(source.childName, 60),
      accountIdentifier,
      childRelation: allowedRelations.has(childRelation) ? childRelation : "",
      childEmail: normalizeLabel(source.childEmail, 160),
      childPassword: normalizeLabel(source.childPassword, 128),
      childPhone: normalizeLabel(source.childPhone, 32),
      childDateOfBirth:
        typeof source.childDateOfBirth === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.childDateOfBirth)
          ? source.childDateOfBirth
          : "",
      linkedUserId: normalizeLabel(source.linkedUserId, 191),
      familyLinkState:
        source.familyLinkState === "managed-under-16" ||
        source.familyLinkState === "eligible-16-plus" ||
        source.familyLinkState === "normal"
          ? source.familyLinkState
          : "normal",
      createdAt: normalizeIsoDate(source.createdAt),
      requireContentFilterForFamilyMembers:
        typeof source.requireContentFilterForFamilyMembers === "boolean"
          ? source.requireContentFilterForFamilyMembers
          : true,
      shareWeeklySafetySummary:
        typeof source.shareWeeklySafetySummary === "boolean"
          ? source.shareWeeklySafetySummary
          : true,
      allowDirectMessagesFromNonFriends:
        typeof source.allowDirectMessagesFromNonFriends === "boolean"
          ? source.allowDirectMessagesFromNonFriends
          : false,
      alertOnMatureContentInteractions:
        typeof source.alertOnMatureContentInteractions === "boolean"
          ? source.alertOnMatureContentInteractions
          : true,
    });

    if (normalized.length >= 50) {
      break;
    }
  }

  return normalized;
};

const normalizeTokenHint = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.length <= 8) {
    return `••••${trimmed}`;
  }

  const suffix = trimmed.slice(-4);
  return `••••••••${suffix}`;
};

const normalizeDiscordApps = (value: unknown): DiscordAppConfig[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: DiscordAppConfig[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const source = item as Record<string, unknown>;
    const id = normalizeIdLike(source.id, 80);
    const name = normalizeLabel(source.name, 80);
    const applicationId = normalizeIdLike(source.applicationId, 64);
    const clientId = normalizeIdLike(source.clientId, 64);

    if (!id || !name || !applicationId || !clientId) {
      continue;
    }

    normalized.push({
      id,
      name,
      applicationId,
      clientId,
      scopes: normalizeScopesOrPermissions(source.scopes),
      redirectUri: normalizeUrlLike(source.redirectUri, 512),
      enabled: source.enabled !== false,
      createdAt: normalizeIsoDate(source.createdAt),
    });

    if (normalized.length >= 50) {
      break;
    }
  }

  return normalized;
};

const normalizeDiscordBots = (value: unknown): DiscordBotConfig[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: DiscordBotConfig[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const source = item as Record<string, unknown>;
    const id = normalizeIdLike(source.id, 80);
    const name = normalizeLabel(source.name, 80);
    const applicationId = normalizeIdLike(source.applicationId, 64);

    if (!id || !name || !applicationId) {
      continue;
    }

    normalized.push({
      id,
      name,
      applicationId,
      botUserId: normalizeIdLike(source.botUserId, 64),
      tokenHint: normalizeTokenHint(source.tokenHint),
      permissions: normalizeScopesOrPermissions(source.permissions),
      enabled: source.enabled !== false,
      createdAt: normalizeIsoDate(source.createdAt),
    });

    if (normalized.length >= 50) {
      break;
    }
  }

  return normalized;
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
      "contentSocialJson" text not null default '{}',
      "dataPrivacyJson" text not null default '{}',
      "familyCenterJson" text not null default '{}',
      "serverTagsJson" text not null default '[]',
      "selectedServerTagServerId" text,
      "customThemeColorsJson" text,
      "downloadedPluginsJson" text not null default '[]',
      "bannerUploadsJson" text not null default '[]',
      "avatarUploadsJson" text not null default '[]',
      "discordAppsJson" text not null default '[]',
      "discordBotsJson" text not null default '[]',
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
    add column if not exists "contentSocialJson" text not null default '{}'
  `);

  await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "dataPrivacyJson" text not null default '{}'
  `);

  await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "familyCenterJson" text not null default '{}'
  `);

  await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "serverTagsJson" text not null default '[]'
  `);

  await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "selectedServerTagServerId" text
  `);

  await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "bannerUploadsJson" text not null default '[]'
  `);

  await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "avatarUploadsJson" text not null default '[]'
  `);

  await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "discordAppsJson" text not null default '[]'
  `);

  await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "discordBotsJson" text not null default '[]'
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
      "contentSocialJson",
      "dataPrivacyJson",
      "familyCenterJson",
      "serverTagsJson",
      "selectedServerTagServerId",
      "customThemeColorsJson",
      "downloadedPluginsJson",
      "bannerUploadsJson",
      "avatarUploadsJson",
      "discordAppsJson",
      "discordBotsJson",
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
      contentSocialJson: string | null;
      dataPrivacyJson: string | null;
      familyCenterJson: string | null;
      serverTagsJson: string | null;
      selectedServerTagServerId: string | null;
      customThemeColorsJson: string | null;
      downloadedPluginsJson: string | null;
      bannerUploadsJson: string | null;
      avatarUploadsJson: string | null;
      discordAppsJson: string | null;
      discordBotsJson: string | null;
      transparentBackgroundSelected: string | null;
      transparentBackgroundUploadsJson: string | null;
    }>;
  }).rows?.[0];

  const customThemeColors = normalizeCustomThemeColors(parseJsonSafely(row?.customThemeColorsJson ?? null));
  const connectedAccounts = normalizeConnectedAccounts(parseJsonSafely(row?.connectedAccountsJson ?? null));
  const contentSocial = normalizeContentSocialPreferences(parseJsonSafely(row?.contentSocialJson ?? null));
  const dataPrivacy = normalizeDataPrivacyPreferences(parseJsonSafely(row?.dataPrivacyJson ?? null));
  const familyCenter = normalizeFamilyCenterPreferences(parseJsonSafely(row?.familyCenterJson ?? null));
  const serverTags = normalizeServerTags(parseJsonSafely(row?.serverTagsJson ?? null));
  const downloadedPlugins = normalizeStringArray(parseJsonSafely(row?.downloadedPluginsJson ?? null), 200);
  const bannerUploads = normalizeStringArray(parseJsonSafely(row?.bannerUploadsJson ?? null), 60);
  const avatarUploads = normalizeStringArray(parseJsonSafely(row?.avatarUploadsJson ?? null), 60);
  const discordApps = normalizeDiscordApps(parseJsonSafely(row?.discordAppsJson ?? null));
  const discordBots = normalizeDiscordBots(parseJsonSafely(row?.discordBotsJson ?? null));
  const transparentUploads = normalizeStringArray(
    parseJsonSafely(row?.transparentBackgroundUploadsJson ?? null),
    40
  );

  return {
    mentionsEnabled: row?.mentionsEnabled !== false,
    customCss: typeof row?.customCss === "string" ? row.customCss : "",
    languagePreference: normalizeLanguagePreference(row?.languagePreference),
    connectedAccounts,
    contentSocial,
    dataPrivacy,
    familyCenter,
    serverTags,
    selectedServerTagServerId:
      typeof row?.selectedServerTagServerId === "string" && row.selectedServerTagServerId.trim().length > 0
        ? row.selectedServerTagServerId.trim()
        : null,
    customThemeColors,
    downloadedPlugins,
    bannerUploads,
    avatarUploads,
    discordApps,
    discordBots,
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
    contentSocial: ContentSocialPreferences;
    dataPrivacy: DataPrivacyPreferences;
    familyCenter: FamilyCenterPreferences;
    serverTags: string[];
    selectedServerTagServerId: string | null;
    customThemeColors: CustomThemeColors | null;
    downloadedPlugins: string[];
    bannerUploads: string[];
    avatarUploads: string[];
    discordApps: DiscordAppConfig[];
    discordBots: DiscordBotConfig[];
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

  if (Object.prototype.hasOwnProperty.call(updates, "contentSocial")) {
    values.push(
      sql`"contentSocialJson" = ${JSON.stringify(normalizeContentSocialPreferences(updates.contentSocial))}`
    );
  }

  if (Object.prototype.hasOwnProperty.call(updates, "dataPrivacy")) {
    values.push(
      sql`"dataPrivacyJson" = ${JSON.stringify(normalizeDataPrivacyPreferences(updates.dataPrivacy))}`
    );
  }

  if (Object.prototype.hasOwnProperty.call(updates, "familyCenter")) {
    values.push(
      sql`"familyCenterJson" = ${JSON.stringify(normalizeFamilyCenterPreferences(updates.familyCenter))}`
    );
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

  if (Array.isArray(updates.bannerUploads)) {
    values.push(sql`"bannerUploadsJson" = ${JSON.stringify(normalizeStringArray(updates.bannerUploads, 60))}`);
  }

  if (Array.isArray(updates.avatarUploads)) {
    values.push(sql`"avatarUploadsJson" = ${JSON.stringify(normalizeStringArray(updates.avatarUploads, 60))}`);
  }

  if (Array.isArray(updates.discordApps)) {
    values.push(sql`"discordAppsJson" = ${JSON.stringify(normalizeDiscordApps(updates.discordApps))}`);
  }

  if (Array.isArray(updates.discordBots)) {
    values.push(sql`"discordBotsJson" = ${JSON.stringify(normalizeDiscordBots(updates.discordBots))}`);
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
