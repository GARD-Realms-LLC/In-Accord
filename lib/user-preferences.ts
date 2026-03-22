import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ensureSchemaInitialized } from "@/lib/schema-init-state";

type CryptoModule = typeof import("crypto");

let cachedCryptoModule: CryptoModule | null = null;

const getCryptoModule = (): CryptoModule => {
  if (cachedCryptoModule) {
    return cachedCryptoModule;
  }

  const builtinLoader = (process as typeof process & {
    getBuiltinModule?: (moduleName: string) => CryptoModule | undefined;
  }).getBuiltinModule;

  if (typeof builtinLoader !== "function") {
    throw new Error("Builtin module 'crypto' is unavailable in this runtime.");
  }

  const loaded = builtinLoader("crypto");
  if (!loaded) {
    throw new Error("Builtin module 'crypto' is unavailable in this runtime.");
  }

  cachedCryptoModule = loaded;
  return cachedCryptoModule;
};

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

export type ActivityPrivacyPreferences = {
  shareActivityStatus: boolean;
  shareCurrentGame: boolean;
  allowFriendJoinRequests: boolean;
  allowSpectateRequests: boolean;
  activityVisibility: "everyone" | "friends" | "none";
  logActivityHistory: boolean;
};

export type RegisteredGameEntry = {
  id: string;
  name: string;
  provider: string;
  shortDescription: string;
  thumbnailUrl: string;
  addedAt: string;
};

export type RegisteredGamesPreferences = {
  showDetectedGames: boolean;
  manualGames: RegisteredGameEntry[];
  hiddenGameIds: string[];
};

export type NotificationPreferences = {
  enableDesktopNotifications: boolean;
  enableSoundEffects: boolean;
  emailNotifications: boolean;
  notifyOnDirectMessages: boolean;
  notifyOnReplies: boolean;
  notifyOnServerMessages: boolean;
};

export type TextImagesPreferences = {
  showEmbeds: boolean;
  showLinkPreviews: boolean;
  showInlineMedia: boolean;
  autoplayGifs: boolean;
  autoplayStickers: boolean;
  convertEmoticons: boolean;
};

export type AccessibilityPreferences = {
  preferReducedMotion: boolean;
  highContrastMode: boolean;
  largerChatFont: boolean;
  enableScreenReaderAnnouncements: boolean;
  messageSpacing: "compact" | "comfortable";
};

export type EmojiPreferences = {
  showComposerEmojiButton: boolean;
  compactReactionButtons: boolean;
  defaultComposerEmoji: string;
  favoriteEmojis: string[];
  uploadedEmojiUrls: string[];
};

export type StickerPreferences = {
  showComposerStickerButton: boolean;
  preferAnimatedStickers: boolean;
  defaultComposerStickerUrl: string;
  favoriteStickers: string[];
  uploadedStickerUrls: string[];
};

export type KeybindPreferences = {
  enableCustomKeybinds: boolean;
  openCommandPalette: string;
  focusServerSearch: string;
  toggleMute: string;
  toggleDeafen: string;
  toggleCamera: string;
};

export type AdvancedPreferences = {
  enableHardwareAcceleration: boolean;
  openLinksInApp: boolean;
  confirmBeforeQuit: boolean;
  enableDebugOverlay: boolean;
  enableSpellCheck: boolean;
  diagnosticsLevel: "off" | "basic" | "verbose";
};

export type StreamerModePreferences = {
  enabled: boolean;
  hidePersonalInfo: boolean;
  hideInviteLinks: boolean;
  hideNotificationContent: boolean;
  suppressSounds: boolean;
};

export type GameOverlayPreferences = {
  enabled: boolean;
  showPerformanceStats: boolean;
  enableClickThrough: boolean;
  opacity: number;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
};

export type BotGhostIntegrationConfig = {
  enabled: boolean;
  webhookUrl: string;
  apiKeyHint: string;
  lastHealthStatus: "unknown" | "healthy" | "unhealthy";
  lastHealthCheckedAt: string;
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

export type BusinessCenterPreferences = {
  requireContentFilterForFamilyMembers: boolean;
  shareWeeklySafetySummary: boolean;
  allowDirectMessagesFromNonFriends: boolean;
  alertOnMatureContentInteractions: boolean;
  businessDesignation: string;
  businessSection: string;
  businessApplicationStatus: string;
  businessApplicationSubmittedAt: string;
  businessApplicationFiles: BusinessCenterApplicationFile[];
  businessMembers: BusinessCenterMemberAccount[];
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
  childSection?: string;
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

export type BusinessCenterApplicationFile = FamilyCenterApplicationFile;

export type BusinessCenterMemberAccount = FamilyCenterMemberAccount;

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

const defaultActivityPrivacyPreferences: ActivityPrivacyPreferences = {
  shareActivityStatus: true,
  shareCurrentGame: true,
  allowFriendJoinRequests: true,
  allowSpectateRequests: false,
  activityVisibility: "friends",
  logActivityHistory: true,
};

const defaultRegisteredGamesPreferences: RegisteredGamesPreferences = {
  showDetectedGames: true,
  manualGames: [],
  hiddenGameIds: [],
};

const defaultNotificationPreferences: NotificationPreferences = {
  enableDesktopNotifications: true,
  enableSoundEffects: true,
  emailNotifications: false,
  notifyOnDirectMessages: true,
  notifyOnReplies: true,
  notifyOnServerMessages: true,
};

const defaultTextImagesPreferences: TextImagesPreferences = {
  showEmbeds: true,
  showLinkPreviews: true,
  showInlineMedia: true,
  autoplayGifs: true,
  autoplayStickers: true,
  convertEmoticons: true,
};

const defaultAccessibilityPreferences: AccessibilityPreferences = {
  preferReducedMotion: false,
  highContrastMode: false,
  largerChatFont: false,
  enableScreenReaderAnnouncements: true,
  messageSpacing: "comfortable",
};

const defaultEmojiPreferences: EmojiPreferences = {
  showComposerEmojiButton: true,
  compactReactionButtons: false,
  defaultComposerEmoji: "😊",
  favoriteEmojis: ["😀", "😂", "😍", "🔥", "👏", "🎉", "👍", "👀"],
  uploadedEmojiUrls: [],
};

const defaultStickerPreferences: StickerPreferences = {
  showComposerStickerButton: true,
  preferAnimatedStickers: true,
  defaultComposerStickerUrl: "",
  favoriteStickers: [],
  uploadedStickerUrls: [],
};

const defaultKeybindPreferences: KeybindPreferences = {
  enableCustomKeybinds: false,
  openCommandPalette: "Ctrl+K",
  focusServerSearch: "Ctrl+Shift+F",
  toggleMute: "Ctrl+Shift+M",
  toggleDeafen: "Ctrl+Shift+D",
  toggleCamera: "Ctrl+Shift+C",
};

const defaultAdvancedPreferences: AdvancedPreferences = {
  enableHardwareAcceleration: true,
  openLinksInApp: true,
  confirmBeforeQuit: true,
  enableDebugOverlay: false,
  enableSpellCheck: true,
  diagnosticsLevel: "basic",
};

const defaultStreamerModePreferences: StreamerModePreferences = {
  enabled: false,
  hidePersonalInfo: true,
  hideInviteLinks: true,
  hideNotificationContent: true,
  suppressSounds: false,
};

const defaultGameOverlayPreferences: GameOverlayPreferences = {
  enabled: false,
  showPerformanceStats: false,
  enableClickThrough: false,
  opacity: 85,
  position: "top-right",
};

const defaultBotGhostIntegration: BotGhostIntegrationConfig = {
  enabled: false,
  webhookUrl: "",
  apiKeyHint: "",
  lastHealthStatus: "unknown",
  lastHealthCheckedAt: "",
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

const defaultBusinessCenterPreferences: BusinessCenterPreferences = {
  requireContentFilterForFamilyMembers: true,
  shareWeeklySafetySummary: true,
  allowDirectMessagesFromNonFriends: false,
  alertOnMatureContentInteractions: true,
  businessDesignation: "",
  businessSection: "",
  businessApplicationStatus: "",
  businessApplicationSubmittedAt: "",
  businessApplicationFiles: [],
  businessMembers: [],
};

export type UserPreferences = {
  mentionsEnabled: boolean;
  notifications: NotificationPreferences;
  textImages: TextImagesPreferences;
  accessibility: AccessibilityPreferences;
  emoji: EmojiPreferences;
  stickers: StickerPreferences;
  keybinds: KeybindPreferences;
  advanced: AdvancedPreferences;
  streamerMode: StreamerModePreferences;
  gameOverlay: GameOverlayPreferences;
  botGhost: BotGhostIntegrationConfig;
  customCss: string;
  languagePreference: string;
  connectedAccounts: string[];
  contentSocial: ContentSocialPreferences;
  dataPrivacy: DataPrivacyPreferences;
  activityPrivacy: ActivityPrivacyPreferences;
  registeredGames: RegisteredGamesPreferences;
  familyCenter: FamilyCenterPreferences;
  businessCenter: BusinessCenterPreferences;
  schoolCenter: FamilyCenterPreferences;
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
  OtherApps: OtherAppConfig[];
  OtherBots: OtherBotConfig[];
  OtherBotAutoImportOnSave: boolean;
};

export type OtherAppConfig = {
  id: string;
  name: string;
  applicationId: string;
  clientId: string;
  scopes: string[];
  redirectUri: string;
  enabled: boolean;
  createdAt: string;
};

export type OtherBotConfig = {
  id: string;
  name: string;
  applicationId: string;
  botUserId: string;
  tokenHint: string;
  tokenUpdatedAt?: string;
  templateImportsMade?: number;
  templatesImportedCount?: number;
  templateServerIds?: string[];
  templateStatsUpdatedAt?: string;
  commands: string[];
  permissions: string[];
  enabled: boolean;
  createdAt: string;
};

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

const normalizeActivityPrivacyPreferences = (value: unknown): ActivityPrivacyPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultActivityPrivacyPreferences };
  }

  const source = value as Partial<Record<keyof ActivityPrivacyPreferences, unknown>>;
  const activityVisibility =
    source.activityVisibility === "everyone" ||
    source.activityVisibility === "friends" ||
    source.activityVisibility === "none"
      ? source.activityVisibility
      : defaultActivityPrivacyPreferences.activityVisibility;

  return {
    shareActivityStatus:
      typeof source.shareActivityStatus === "boolean"
        ? source.shareActivityStatus
        : defaultActivityPrivacyPreferences.shareActivityStatus,
    shareCurrentGame:
      typeof source.shareCurrentGame === "boolean"
        ? source.shareCurrentGame
        : defaultActivityPrivacyPreferences.shareCurrentGame,
    allowFriendJoinRequests:
      typeof source.allowFriendJoinRequests === "boolean"
        ? source.allowFriendJoinRequests
        : defaultActivityPrivacyPreferences.allowFriendJoinRequests,
    allowSpectateRequests:
      typeof source.allowSpectateRequests === "boolean"
        ? source.allowSpectateRequests
        : defaultActivityPrivacyPreferences.allowSpectateRequests,
    activityVisibility,
    logActivityHistory:
      typeof source.logActivityHistory === "boolean"
        ? source.logActivityHistory
        : defaultActivityPrivacyPreferences.logActivityHistory,
  };
};

const normalizeRegisteredGamesPreferences = (value: unknown): RegisteredGamesPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultRegisteredGamesPreferences };
  }

  const source = value as Partial<Record<keyof RegisteredGamesPreferences, unknown>>;
  const hiddenGameIds = normalizeStringArray(source.hiddenGameIds, 240)
    .map((entry) => entry.slice(0, 120));

  const manualGames = Array.isArray(source.manualGames)
    ? source.manualGames
        .filter((entry): entry is RegisteredGameEntry => Boolean(entry && typeof entry === "object"))
        .map((entry, index) => {
          const candidate = entry as Partial<RegisteredGameEntry>;
          const name = normalizeLabel(candidate.name, 120);
          const id =
            normalizeIdLike(candidate.id, 120) ||
            `manual-${index + 1}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

          return {
            id,
            name,
            provider: normalizeLabel(candidate.provider, 60) || "manual",
            shortDescription: normalizeLabel(candidate.shortDescription, 280),
            thumbnailUrl: normalizeMediaUrlLike(candidate.thumbnailUrl, 2048),
            addedAt: normalizeIsoDate(candidate.addedAt),
          } satisfies RegisteredGameEntry;
        })
        .filter((entry) => entry.name.length > 0)
        .slice(0, 120)
    : [];

  return {
    showDetectedGames:
      typeof source.showDetectedGames === "boolean"
        ? source.showDetectedGames
        : defaultRegisteredGamesPreferences.showDetectedGames,
    manualGames,
    hiddenGameIds,
  };
};

const normalizeNotificationPreferences = (value: unknown): NotificationPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultNotificationPreferences };
  }

  const source = value as Partial<Record<keyof NotificationPreferences, unknown>>;

  return {
    enableDesktopNotifications:
      typeof source.enableDesktopNotifications === "boolean"
        ? source.enableDesktopNotifications
        : defaultNotificationPreferences.enableDesktopNotifications,
    enableSoundEffects:
      typeof source.enableSoundEffects === "boolean"
        ? source.enableSoundEffects
        : defaultNotificationPreferences.enableSoundEffects,
    emailNotifications:
      typeof source.emailNotifications === "boolean"
        ? source.emailNotifications
        : defaultNotificationPreferences.emailNotifications,
    notifyOnDirectMessages:
      typeof source.notifyOnDirectMessages === "boolean"
        ? source.notifyOnDirectMessages
        : defaultNotificationPreferences.notifyOnDirectMessages,
    notifyOnReplies:
      typeof source.notifyOnReplies === "boolean"
        ? source.notifyOnReplies
        : defaultNotificationPreferences.notifyOnReplies,
    notifyOnServerMessages:
      typeof source.notifyOnServerMessages === "boolean"
        ? source.notifyOnServerMessages
        : defaultNotificationPreferences.notifyOnServerMessages,
  };
};

const normalizeTextImagesPreferences = (value: unknown): TextImagesPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultTextImagesPreferences };
  }

  const source = value as Partial<Record<keyof TextImagesPreferences, unknown>>;

  return {
    showEmbeds:
      typeof source.showEmbeds === "boolean"
        ? source.showEmbeds
        : defaultTextImagesPreferences.showEmbeds,
    showLinkPreviews:
      typeof source.showLinkPreviews === "boolean"
        ? source.showLinkPreviews
        : defaultTextImagesPreferences.showLinkPreviews,
    showInlineMedia:
      typeof source.showInlineMedia === "boolean"
        ? source.showInlineMedia
        : defaultTextImagesPreferences.showInlineMedia,
    autoplayGifs:
      typeof source.autoplayGifs === "boolean"
        ? source.autoplayGifs
        : defaultTextImagesPreferences.autoplayGifs,
    autoplayStickers:
      typeof source.autoplayStickers === "boolean"
        ? source.autoplayStickers
        : defaultTextImagesPreferences.autoplayStickers,
    convertEmoticons:
      typeof source.convertEmoticons === "boolean"
        ? source.convertEmoticons
        : defaultTextImagesPreferences.convertEmoticons,
  };
};

const normalizeAccessibilityPreferences = (value: unknown): AccessibilityPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultAccessibilityPreferences };
  }

  const source = value as Partial<Record<keyof AccessibilityPreferences, unknown>>;
  const messageSpacing =
    source.messageSpacing === "compact" || source.messageSpacing === "comfortable"
      ? source.messageSpacing
      : defaultAccessibilityPreferences.messageSpacing;

  return {
    preferReducedMotion:
      typeof source.preferReducedMotion === "boolean"
        ? source.preferReducedMotion
        : defaultAccessibilityPreferences.preferReducedMotion,
    highContrastMode:
      typeof source.highContrastMode === "boolean"
        ? source.highContrastMode
        : defaultAccessibilityPreferences.highContrastMode,
    largerChatFont:
      typeof source.largerChatFont === "boolean"
        ? source.largerChatFont
        : defaultAccessibilityPreferences.largerChatFont,
    enableScreenReaderAnnouncements:
      typeof source.enableScreenReaderAnnouncements === "boolean"
        ? source.enableScreenReaderAnnouncements
        : defaultAccessibilityPreferences.enableScreenReaderAnnouncements,
    messageSpacing,
  };
};

const normalizeEmojiPreferences = (value: unknown): EmojiPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultEmojiPreferences };
  }

  const source = value as Partial<Record<keyof EmojiPreferences, unknown>>;
  const defaultComposerEmoji =
    typeof source.defaultComposerEmoji === "string" && source.defaultComposerEmoji.trim().length > 0
      ? source.defaultComposerEmoji.trim().slice(0, 16)
      : defaultEmojiPreferences.defaultComposerEmoji;

  const favoriteEmojis = Array.isArray(source.favoriteEmojis)
    ? Array.from(
        new Set(
          source.favoriteEmojis
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
            .slice(0, 32)
        )
      )
    : [...defaultEmojiPreferences.favoriteEmojis];

  const uploadedEmojiUrls = Array.isArray(source.uploadedEmojiUrls)
    ? Array.from(
        new Set(
          source.uploadedEmojiUrls
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
            .slice(0, 120)
        )
      )
    : [];

  return {
    showComposerEmojiButton:
      typeof source.showComposerEmojiButton === "boolean"
        ? source.showComposerEmojiButton
        : defaultEmojiPreferences.showComposerEmojiButton,
    compactReactionButtons:
      typeof source.compactReactionButtons === "boolean"
        ? source.compactReactionButtons
        : defaultEmojiPreferences.compactReactionButtons,
    defaultComposerEmoji,
    favoriteEmojis,
    uploadedEmojiUrls,
  };
};

const normalizeStickerPreferences = (value: unknown): StickerPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultStickerPreferences };
  }

  const source = value as Partial<Record<keyof StickerPreferences, unknown>>;
  const defaultComposerStickerUrl =
    typeof source.defaultComposerStickerUrl === "string"
      ? source.defaultComposerStickerUrl.trim().slice(0, 2048)
      : defaultStickerPreferences.defaultComposerStickerUrl;

  const favoriteStickers = Array.isArray(source.favoriteStickers)
    ? Array.from(
        new Set(
          source.favoriteStickers
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
            .slice(0, 48)
        )
      )
    : [...defaultStickerPreferences.favoriteStickers];

  const uploadedStickerUrls = Array.isArray(source.uploadedStickerUrls)
    ? Array.from(
        new Set(
          source.uploadedStickerUrls
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
            .slice(0, 120)
        )
      )
    : [];

  return {
    showComposerStickerButton:
      typeof source.showComposerStickerButton === "boolean"
        ? source.showComposerStickerButton
        : defaultStickerPreferences.showComposerStickerButton,
    preferAnimatedStickers:
      typeof source.preferAnimatedStickers === "boolean"
        ? source.preferAnimatedStickers
        : defaultStickerPreferences.preferAnimatedStickers,
    defaultComposerStickerUrl,
    favoriteStickers,
    uploadedStickerUrls,
  };
};

const normalizeKeybindString = (value: unknown, fallback: string) => {
  const normalized = typeof value === "string" ? value.trim().slice(0, 64) : "";
  return normalized.length > 0 ? normalized : fallback;
};

const normalizeKeybindPreferences = (value: unknown): KeybindPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultKeybindPreferences };
  }

  const source = value as Partial<Record<keyof KeybindPreferences, unknown>>;

  return {
    enableCustomKeybinds:
      typeof source.enableCustomKeybinds === "boolean"
        ? source.enableCustomKeybinds
        : defaultKeybindPreferences.enableCustomKeybinds,
    openCommandPalette: normalizeKeybindString(
      source.openCommandPalette,
      defaultKeybindPreferences.openCommandPalette
    ),
    focusServerSearch: normalizeKeybindString(
      source.focusServerSearch,
      defaultKeybindPreferences.focusServerSearch
    ),
    toggleMute: normalizeKeybindString(source.toggleMute, defaultKeybindPreferences.toggleMute),
    toggleDeafen: normalizeKeybindString(source.toggleDeafen, defaultKeybindPreferences.toggleDeafen),
    toggleCamera: normalizeKeybindString(source.toggleCamera, defaultKeybindPreferences.toggleCamera),
  };
};

const normalizeAdvancedPreferences = (value: unknown): AdvancedPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultAdvancedPreferences };
  }

  const source = value as Partial<Record<keyof AdvancedPreferences, unknown>>;
  const diagnosticsLevel =
    source.diagnosticsLevel === "off" ||
    source.diagnosticsLevel === "basic" ||
    source.diagnosticsLevel === "verbose"
      ? source.diagnosticsLevel
      : defaultAdvancedPreferences.diagnosticsLevel;

  return {
    enableHardwareAcceleration:
      typeof source.enableHardwareAcceleration === "boolean"
        ? source.enableHardwareAcceleration
        : defaultAdvancedPreferences.enableHardwareAcceleration,
    openLinksInApp:
      typeof source.openLinksInApp === "boolean"
        ? source.openLinksInApp
        : defaultAdvancedPreferences.openLinksInApp,
    confirmBeforeQuit:
      typeof source.confirmBeforeQuit === "boolean"
        ? source.confirmBeforeQuit
        : defaultAdvancedPreferences.confirmBeforeQuit,
    enableDebugOverlay:
      typeof source.enableDebugOverlay === "boolean"
        ? source.enableDebugOverlay
        : defaultAdvancedPreferences.enableDebugOverlay,
    enableSpellCheck:
      typeof source.enableSpellCheck === "boolean"
        ? source.enableSpellCheck
        : defaultAdvancedPreferences.enableSpellCheck,
    diagnosticsLevel,
  };
};

const normalizeStreamerModePreferences = (value: unknown): StreamerModePreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultStreamerModePreferences };
  }

  const source = value as Partial<Record<keyof StreamerModePreferences, unknown>>;

  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : defaultStreamerModePreferences.enabled,
    hidePersonalInfo:
      typeof source.hidePersonalInfo === "boolean"
        ? source.hidePersonalInfo
        : defaultStreamerModePreferences.hidePersonalInfo,
    hideInviteLinks:
      typeof source.hideInviteLinks === "boolean"
        ? source.hideInviteLinks
        : defaultStreamerModePreferences.hideInviteLinks,
    hideNotificationContent:
      typeof source.hideNotificationContent === "boolean"
        ? source.hideNotificationContent
        : defaultStreamerModePreferences.hideNotificationContent,
    suppressSounds:
      typeof source.suppressSounds === "boolean"
        ? source.suppressSounds
        : defaultStreamerModePreferences.suppressSounds,
  };
};

const normalizeGameOverlayPreferences = (value: unknown): GameOverlayPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultGameOverlayPreferences };
  }

  const source = value as Partial<Record<keyof GameOverlayPreferences, unknown>>;
  const position =
    source.position === "top-left" ||
    source.position === "top-right" ||
    source.position === "bottom-left" ||
    source.position === "bottom-right"
      ? source.position
      : defaultGameOverlayPreferences.position;
  const opacity =
    typeof source.opacity === "number" && Number.isFinite(source.opacity)
      ? Math.max(20, Math.min(100, Math.round(source.opacity)))
      : defaultGameOverlayPreferences.opacity;

  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : defaultGameOverlayPreferences.enabled,
    showPerformanceStats:
      typeof source.showPerformanceStats === "boolean"
        ? source.showPerformanceStats
        : defaultGameOverlayPreferences.showPerformanceStats,
    enableClickThrough:
      typeof source.enableClickThrough === "boolean"
        ? source.enableClickThrough
        : defaultGameOverlayPreferences.enableClickThrough,
    opacity,
    position,
  };
};

const normalizeBotGhostIntegration = (value: unknown): BotGhostIntegrationConfig => {
  if (!value || typeof value !== "object") {
    return { ...defaultBotGhostIntegration };
  }

  const source = value as Partial<Record<keyof BotGhostIntegrationConfig, unknown>>;
  const lastHealthStatus =
    source.lastHealthStatus === "healthy" ||
    source.lastHealthStatus === "unhealthy" ||
    source.lastHealthStatus === "unknown"
      ? source.lastHealthStatus
      : defaultBotGhostIntegration.lastHealthStatus;

  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : defaultBotGhostIntegration.enabled,
    webhookUrl: normalizeMediaUrlLike(source.webhookUrl, 2048),
    apiKeyHint: normalizeTokenHint(source.apiKeyHint),
    lastHealthStatus,
    lastHealthCheckedAt: normalizeIsoDate(source.lastHealthCheckedAt),
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

const normalizeBusinessCenterPreferences = (value: unknown): BusinessCenterPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultBusinessCenterPreferences };
  }

  const source = value as Partial<Record<keyof BusinessCenterPreferences, unknown>>;
  const businessApplicationFiles = Array.isArray(source.businessApplicationFiles)
    ? source.businessApplicationFiles
        .filter((entry): entry is BusinessCenterApplicationFile => {
          if (!entry || typeof entry !== "object") {
            return false;
          }

          const candidate = entry as Partial<BusinessCenterApplicationFile>;
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
        : defaultBusinessCenterPreferences.requireContentFilterForFamilyMembers,
    shareWeeklySafetySummary:
      typeof source.shareWeeklySafetySummary === "boolean"
        ? source.shareWeeklySafetySummary
        : defaultBusinessCenterPreferences.shareWeeklySafetySummary,
    allowDirectMessagesFromNonFriends:
      typeof source.allowDirectMessagesFromNonFriends === "boolean"
        ? source.allowDirectMessagesFromNonFriends
        : defaultBusinessCenterPreferences.allowDirectMessagesFromNonFriends,
    alertOnMatureContentInteractions:
      typeof source.alertOnMatureContentInteractions === "boolean"
        ? source.alertOnMatureContentInteractions
        : defaultBusinessCenterPreferences.alertOnMatureContentInteractions,
    businessDesignation: normalizeLabel(source.businessDesignation, 80),
    businessSection: normalizeLabel(source.businessSection, 80),
    businessApplicationStatus: normalizeLabel(source.businessApplicationStatus, 80),
    businessApplicationSubmittedAt:
      typeof source.businessApplicationSubmittedAt === "string" && !Number.isNaN(new Date(source.businessApplicationSubmittedAt).getTime())
        ? new Date(source.businessApplicationSubmittedAt).toISOString()
        : "",
    businessApplicationFiles,
    businessMembers: normalizeFamilyCenterMembers(source.businessMembers),
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

const normalizeSlashCommandNames = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const normalized = item
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .replace(/[_\s]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (!normalized || normalized.length > 32) {
      continue;
    }

    unique.add(normalized);
    if (unique.size >= 500) {
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
      childSection: normalizeLabel(source.childSection, 80),
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

const normalizeBotTokenInputMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const next: Record<string, string> = {};

  for (const [rawBotId, rawToken] of Object.entries(source)) {
    const botId = normalizeIdLike(rawBotId, 80);
    if (!botId || typeof rawToken !== "string") {
      continue;
    }

    const token = rawToken.trim();
    if (!token) {
      continue;
    }

    next[botId] = token;
  }

  return next;
};

const normalizeBotTokenCipherMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const next: Record<string, string> = {};

  for (const [rawBotId, rawCipher] of Object.entries(source)) {
    const botId = normalizeIdLike(rawBotId, 80);
    if (!botId || typeof rawCipher !== "string") {
      continue;
    }

    const cipher = rawCipher.trim();
    if (!cipher) {
      continue;
    }

    next[botId] = cipher;
  }

  return next;
};

const getBotTokenEncryptionKey = () => {
  const configured = String(process.env.BOT_TOKEN_ENCRYPTION_KEY ?? process.env.SESSION_SECRET ?? "").trim();
  if (!configured) {
    return null;
  }

  const { createHash } = getCryptoModule();
  return createHash("sha256").update(configured).digest();
};

const encryptBotToken = (token: string) => {
  const key = getBotTokenEncryptionKey();
  if (!key) {
    throw new Error("Missing BOT_TOKEN_ENCRYPTION_KEY or SESSION_SECRET for bot token encryption.");
  }

  const { createCipheriv, randomBytes } = getCryptoModule();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
};

const decryptBotToken = (cipherText: string) => {
  const key = getBotTokenEncryptionKey();
  if (!key) {
    throw new Error("Missing BOT_TOKEN_ENCRYPTION_KEY or SESSION_SECRET for bot token encryption.");
  }

  const [ivRaw, tagRaw, encryptedRaw] = cipherText.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted bot token payload.");
  }

  const iv = Buffer.from(ivRaw, "base64");
  const tag = Buffer.from(tagRaw, "base64");
  const encrypted = Buffer.from(encryptedRaw, "base64");

  const { createDecipheriv } = getCryptoModule();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
};

const normalizeOtherApps = (value: unknown): OtherAppConfig[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: OtherAppConfig[] = [];

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

const normalizeOtherBots = (value: unknown): OtherBotConfig[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: OtherBotConfig[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const source = item as Record<string, unknown>;
    const id = normalizeIdLike(source.id, 80);
    const name = normalizeLabel(source.name, 80);
    const applicationId = normalizeIdLike(source.applicationId, 64);
    const tokenUpdatedAtRaw = typeof source.tokenUpdatedAt === "string" ? source.tokenUpdatedAt.trim() : "";
    const tokenUpdatedAt =
      tokenUpdatedAtRaw && !Number.isNaN(new Date(tokenUpdatedAtRaw).getTime())
        ? new Date(tokenUpdatedAtRaw).toISOString()
        : "";
    const templateImportsMadeRaw =
      typeof source.templateImportsMade === "number" && Number.isFinite(source.templateImportsMade)
        ? source.templateImportsMade
        : 0;
    const templatesImportedCountRaw =
      typeof source.templatesImportedCount === "number" && Number.isFinite(source.templatesImportedCount)
        ? source.templatesImportedCount
        : 0;
    const templateImportsMade = Math.max(0, Math.floor(templateImportsMadeRaw));
    const templatesImportedCount = Math.max(0, Math.floor(templatesImportedCountRaw));
    const templateServerIds = normalizeStringArray(source.templateServerIds, 500)
      .map((entry) => normalizeIdLike(entry, 191))
      .filter((entry) => entry.length > 0);
    const templateStatsUpdatedAtRaw =
      typeof source.templateStatsUpdatedAt === "string" ? source.templateStatsUpdatedAt.trim() : "";
    const templateStatsUpdatedAt =
      templateStatsUpdatedAtRaw && !Number.isNaN(new Date(templateStatsUpdatedAtRaw).getTime())
        ? new Date(templateStatsUpdatedAtRaw).toISOString()
        : "";

    if (!id || !name || !applicationId) {
      continue;
    }

    normalized.push({
      id,
      name,
      applicationId,
      botUserId: normalizeIdLike(source.botUserId, 64),
      tokenHint: normalizeTokenHint(source.tokenHint),
      ...(tokenUpdatedAt ? { tokenUpdatedAt } : {}),
      ...(templateImportsMade > 0 ? { templateImportsMade } : {}),
      ...(templatesImportedCount > 0 ? { templatesImportedCount } : {}),
      ...(templateServerIds.length > 0 ? { templateServerIds } : {}),
      ...(templateStatsUpdatedAt ? { templateStatsUpdatedAt } : {}),
      commands: (() => {
        const fromCommands = normalizeSlashCommandNames(source.commands);
        if (fromCommands.length > 0) {
          return fromCommands;
        }

        const fromPermissions = normalizeSlashCommandNames(source.permissions);
        if (fromPermissions.length > 0) {
          return fromPermissions;
        }

        return ["help", "ping", "echo"];
      })(),
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
  await ensureSchemaInitialized("user-preferences-schema", async () => {
    await db.execute(sql`
    create table if not exists "UserPreference" (
      "userId" varchar(191) primary key,
      "mentionsEnabled" boolean not null default true,
      "notificationsJson" text not null default '{}',
      "textImagesJson" text not null default '{}',
      "accessibilityJson" text not null default '{}',
      "emojiJson" text not null default '{}',
      "stickersJson" text not null default '{}',
      "keybindsJson" text not null default '{}',
      "advancedJson" text not null default '{}',
      "streamerModeJson" text not null default '{}',
      "gameOverlayJson" text not null default '{}',
      "botGhostJson" text not null default '{}',
      "customCss" text not null default '',
      "languagePreference" text not null default 'system',
      "connectedAccountsJson" text not null default '[]',
      "contentSocialJson" text not null default '{}',
      "dataPrivacyJson" text not null default '{}',
      "activityPrivacyJson" text not null default '{}',
      "registeredGamesJson" text not null default '{}',
      "familyCenterJson" text not null default '{}',
      "businessCenterJson" text not null default '{}',
      "schoolCenterJson" text not null default '{}',
      "serverTagsJson" text not null default '[]',
      "selectedServerTagServerId" text,
      "customThemeColorsJson" text,
      "downloadedPluginsJson" text not null default '[]',
      "bannerUploadsJson" text not null default '[]',
      "avatarUploadsJson" text not null default '[]',
      "OtherAppsJson" text not null default '[]',
      "OtherBotsJson" text not null default '[]',
      "OtherBotTokenSecretsJson" text not null default '{}',
      "OtherBotAutoImportOnSave" boolean not null default true,
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
    add column if not exists "notificationsJson" text not null default '{}'
    `);

    await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "textImagesJson" text not null default '{}'
    `);

    await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "accessibilityJson" text not null default '{}'
    `);

    await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "emojiJson" text not null default '{}'
    `);

    await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "stickersJson" text not null default '{}'
    `);

    await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "keybindsJson" text not null default '{}'
    `);

    await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "advancedJson" text not null default '{}'
    `);

    await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "streamerModeJson" text not null default '{}'
    `);

    await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "gameOverlayJson" text not null default '{}'
    `);

    await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "botGhostJson" text not null default '{}'
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
    add column if not exists "activityPrivacyJson" text not null default '{}'
    `);

    await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "registeredGamesJson" text not null default '{}'
    `);

    await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "familyCenterJson" text not null default '{}'
    `);

    await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "businessCenterJson" text not null default '{}'
    `);

    await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "schoolCenterJson" text not null default '{}'
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
    add column if not exists "OtherAppsJson" text not null default '[]'
    `);

    await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "OtherBotsJson" text not null default '[]'
    `);

    await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "OtherBotTokenSecretsJson" text not null default '{}'
    `);

    await db.execute(sql`
    alter table "UserPreference"
    add column if not exists "OtherBotAutoImportOnSave" boolean not null default true
    `);
  });
};

const ensureUserPreferenceRow = async (userId: string) => {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId) {
    return;
  }

  await db.execute(sql`
    insert into "UserPreference" ("userId", "createdAt", "updatedAt")
    values (${normalizedUserId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    on conflict ("userId") do nothing
  `);
};

export const getUserPreferences = async (userId: string): Promise<UserPreferences> => {
  await ensureUserPreferencesSchema();
  await ensureUserPreferenceRow(userId);

  const result = await db.execute(sql`
    select
      "mentionsEnabled",
      "notificationsJson",
      "textImagesJson",
      "accessibilityJson",
      "emojiJson",
      "stickersJson",
      "keybindsJson",
      "advancedJson",
      "streamerModeJson",
      "gameOverlayJson",
      "botGhostJson",
      "customCss",
      "languagePreference",
      "connectedAccountsJson",
      "contentSocialJson",
      "dataPrivacyJson",
      "activityPrivacyJson",
      "registeredGamesJson",
      "familyCenterJson",
      "businessCenterJson",
      "schoolCenterJson",
      "serverTagsJson",
      "selectedServerTagServerId",
      "customThemeColorsJson",
      "downloadedPluginsJson",
      "bannerUploadsJson",
      "avatarUploadsJson",
      "OtherAppsJson",
      "OtherBotsJson",
      "OtherBotTokenSecretsJson",
      "OtherBotAutoImportOnSave",
      "transparentBackgroundSelected",
      "transparentBackgroundUploadsJson"
    from "UserPreference"
    where "userId" = ${userId}
    limit 1
  `);

  const row = (result as unknown as {
    rows: Array<{
      mentionsEnabled: boolean | null;
      notificationsJson: string | null;
      textImagesJson: string | null;
      accessibilityJson: string | null;
      emojiJson: string | null;
      stickersJson: string | null;
      keybindsJson: string | null;
      advancedJson: string | null;
      streamerModeJson: string | null;
      gameOverlayJson: string | null;
      botGhostJson: string | null;
      customCss: string | null;
      languagePreference: string | null;
      connectedAccountsJson: string | null;
      contentSocialJson: string | null;
      dataPrivacyJson: string | null;
      activityPrivacyJson: string | null;
      registeredGamesJson: string | null;
      familyCenterJson: string | null;
      businessCenterJson: string | null;
      schoolCenterJson: string | null;
      serverTagsJson: string | null;
      selectedServerTagServerId: string | null;
      customThemeColorsJson: string | null;
      downloadedPluginsJson: string | null;
      bannerUploadsJson: string | null;
      avatarUploadsJson: string | null;
      OtherAppsJson: string | null;
      OtherBotsJson: string | null;
      OtherBotTokenSecretsJson: string | null;
      OtherBotAutoImportOnSave: boolean | null;
      transparentBackgroundSelected: string | null;
      transparentBackgroundUploadsJson: string | null;
    }>;
  }).rows?.[0];

  const customThemeColors = normalizeCustomThemeColors(parseJsonSafely(row?.customThemeColorsJson ?? null));
  const notifications = normalizeNotificationPreferences(parseJsonSafely(row?.notificationsJson ?? null));
  const textImages = normalizeTextImagesPreferences(parseJsonSafely(row?.textImagesJson ?? null));
  const accessibility = normalizeAccessibilityPreferences(parseJsonSafely(row?.accessibilityJson ?? null));
  const emoji = normalizeEmojiPreferences(parseJsonSafely(row?.emojiJson ?? null));
  const stickers = normalizeStickerPreferences(parseJsonSafely(row?.stickersJson ?? null));
  const keybinds = normalizeKeybindPreferences(parseJsonSafely(row?.keybindsJson ?? null));
  const advanced = normalizeAdvancedPreferences(parseJsonSafely(row?.advancedJson ?? null));
  const streamerMode = normalizeStreamerModePreferences(parseJsonSafely(row?.streamerModeJson ?? null));
  const gameOverlay = normalizeGameOverlayPreferences(parseJsonSafely(row?.gameOverlayJson ?? null));
  const botGhost = normalizeBotGhostIntegration(parseJsonSafely(row?.botGhostJson ?? null));
  const connectedAccounts = normalizeConnectedAccounts(parseJsonSafely(row?.connectedAccountsJson ?? null));
  const contentSocial = normalizeContentSocialPreferences(parseJsonSafely(row?.contentSocialJson ?? null));
  const dataPrivacy = normalizeDataPrivacyPreferences(parseJsonSafely(row?.dataPrivacyJson ?? null));
  const activityPrivacy = normalizeActivityPrivacyPreferences(parseJsonSafely(row?.activityPrivacyJson ?? null));
  const registeredGames = normalizeRegisteredGamesPreferences(parseJsonSafely(row?.registeredGamesJson ?? null));
  const familyCenter = normalizeFamilyCenterPreferences(parseJsonSafely(row?.familyCenterJson ?? null));
  const businessCenter = normalizeBusinessCenterPreferences(parseJsonSafely(row?.businessCenterJson ?? null));
  const schoolCenter = normalizeFamilyCenterPreferences(parseJsonSafely(row?.schoolCenterJson ?? null));
  const serverTags = normalizeServerTags(parseJsonSafely(row?.serverTagsJson ?? null));
  const downloadedPlugins = normalizeStringArray(parseJsonSafely(row?.downloadedPluginsJson ?? null), 200);
  const bannerUploads = normalizeStringArray(parseJsonSafely(row?.bannerUploadsJson ?? null), 60);
  const avatarUploads = normalizeStringArray(parseJsonSafely(row?.avatarUploadsJson ?? null), 60);
  const OtherApps = normalizeOtherApps(parseJsonSafely(row?.OtherAppsJson ?? null));
  const OtherBots = normalizeOtherBots(parseJsonSafely(row?.OtherBotsJson ?? null));
  const transparentUploads = normalizeStringArray(
    parseJsonSafely(row?.transparentBackgroundUploadsJson ?? null),
    40
  );

  return {
    mentionsEnabled: row?.mentionsEnabled !== false,
    notifications,
    textImages,
    accessibility,
    emoji,
    stickers,
    keybinds,
    advanced,
    streamerMode,
    gameOverlay,
    botGhost,
    customCss: typeof row?.customCss === "string" ? row.customCss : "",
    languagePreference: normalizeLanguagePreference(row?.languagePreference),
    connectedAccounts,
    contentSocial,
    dataPrivacy,
    activityPrivacy,
    registeredGames,
    familyCenter,
    businessCenter,
    schoolCenter,
    serverTags,
    selectedServerTagServerId:
      typeof row?.selectedServerTagServerId === "string" && row.selectedServerTagServerId.trim().length > 0
        ? row.selectedServerTagServerId.trim()
        : null,
    customThemeColors,
    downloadedPlugins,
    bannerUploads,
    avatarUploads,
    OtherApps,
    OtherBots,
    OtherBotAutoImportOnSave: row?.OtherBotAutoImportOnSave !== false,
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
    notifications: NotificationPreferences;
    textImages: TextImagesPreferences;
    accessibility: AccessibilityPreferences;
    emoji: EmojiPreferences;
    stickers: StickerPreferences;
    keybinds: KeybindPreferences;
    advanced: AdvancedPreferences;
    streamerMode: StreamerModePreferences;
    gameOverlay: GameOverlayPreferences;
    botGhost: BotGhostIntegrationConfig;
    customCss: string;
    languagePreference: string;
    connectedAccounts: string[];
    contentSocial: ContentSocialPreferences;
    dataPrivacy: DataPrivacyPreferences;
    activityPrivacy: ActivityPrivacyPreferences;
    registeredGames: RegisteredGamesPreferences;
    familyCenter: FamilyCenterPreferences;
    businessCenter: BusinessCenterPreferences;
    schoolCenter: FamilyCenterPreferences;
    serverTags: string[];
    selectedServerTagServerId: string | null;
    customThemeColors: CustomThemeColors | null;
    downloadedPlugins: string[];
    bannerUploads: string[];
    avatarUploads: string[];
    OtherApps: OtherAppConfig[];
    OtherBots: OtherBotConfig[];
    OtherBotTokens: Record<string, string>;
    OtherBotAutoImportOnSave: boolean;
    transparentBackgroundSelected: string | null;
    transparentBackgroundUploads: string[];
  }>
) => {
  await ensureUserPreferencesSchema();
  await ensureUserPreferenceRow(userId);

  const values: Array<ReturnType<typeof sql>> = [];

  if (typeof updates.mentionsEnabled === "boolean") {
    values.push(sql`"mentionsEnabled" = ${updates.mentionsEnabled}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "notifications")) {
    values.push(
      sql`"notificationsJson" = ${JSON.stringify(normalizeNotificationPreferences(updates.notifications))}`
    );
  }

  if (Object.prototype.hasOwnProperty.call(updates, "textImages")) {
    values.push(
      sql`"textImagesJson" = ${JSON.stringify(normalizeTextImagesPreferences(updates.textImages))}`
    );
  }

  if (Object.prototype.hasOwnProperty.call(updates, "accessibility")) {
    values.push(
      sql`"accessibilityJson" = ${JSON.stringify(normalizeAccessibilityPreferences(updates.accessibility))}`
    );
  }

  if (Object.prototype.hasOwnProperty.call(updates, "emoji")) {
    values.push(
      sql`"emojiJson" = ${JSON.stringify(normalizeEmojiPreferences(updates.emoji))}`
    );
  }

  if (Object.prototype.hasOwnProperty.call(updates, "stickers")) {
    values.push(
      sql`"stickersJson" = ${JSON.stringify(normalizeStickerPreferences(updates.stickers))}`
    );
  }

  if (Object.prototype.hasOwnProperty.call(updates, "keybinds")) {
    values.push(
      sql`"keybindsJson" = ${JSON.stringify(normalizeKeybindPreferences(updates.keybinds))}`
    );
  }

  if (Object.prototype.hasOwnProperty.call(updates, "advanced")) {
    values.push(
      sql`"advancedJson" = ${JSON.stringify(normalizeAdvancedPreferences(updates.advanced))}`
    );
  }

  if (Object.prototype.hasOwnProperty.call(updates, "streamerMode")) {
    values.push(
      sql`"streamerModeJson" = ${JSON.stringify(normalizeStreamerModePreferences(updates.streamerMode))}`
    );
  }

  if (Object.prototype.hasOwnProperty.call(updates, "gameOverlay")) {
    values.push(
      sql`"gameOverlayJson" = ${JSON.stringify(normalizeGameOverlayPreferences(updates.gameOverlay))}`
    );
  }

  if (Object.prototype.hasOwnProperty.call(updates, "botGhost")) {
    values.push(
      sql`"botGhostJson" = ${JSON.stringify(normalizeBotGhostIntegration(updates.botGhost))}`
    );
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

  if (Object.prototype.hasOwnProperty.call(updates, "activityPrivacy")) {
    values.push(
      sql`"activityPrivacyJson" = ${JSON.stringify(normalizeActivityPrivacyPreferences(updates.activityPrivacy))}`
    );
  }

  if (Object.prototype.hasOwnProperty.call(updates, "registeredGames")) {
    values.push(
      sql`"registeredGamesJson" = ${JSON.stringify(normalizeRegisteredGamesPreferences(updates.registeredGames))}`
    );
  }

  if (Object.prototype.hasOwnProperty.call(updates, "familyCenter")) {
    values.push(
      sql`"familyCenterJson" = ${JSON.stringify(normalizeFamilyCenterPreferences(updates.familyCenter))}`
    );
  }

  if (Object.prototype.hasOwnProperty.call(updates, "businessCenter")) {
    values.push(
      sql`"businessCenterJson" = ${JSON.stringify(normalizeBusinessCenterPreferences(updates.businessCenter))}`
    );
  }

  if (Object.prototype.hasOwnProperty.call(updates, "schoolCenter")) {
    values.push(
      sql`"schoolCenterJson" = ${JSON.stringify(normalizeFamilyCenterPreferences(updates.schoolCenter))}`
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

  if (Array.isArray(updates.OtherApps)) {
    values.push(sql`"OtherAppsJson" = ${JSON.stringify(normalizeOtherApps(updates.OtherApps))}`);
  }

  if (Array.isArray(updates.OtherBots)) {
    values.push(sql`"OtherBotsJson" = ${JSON.stringify(normalizeOtherBots(updates.OtherBots))}`);
  }

  if (typeof updates.OtherBotAutoImportOnSave === "boolean") {
    values.push(sql`"OtherBotAutoImportOnSave" = ${updates.OtherBotAutoImportOnSave}`);
  }

  if (
    Array.isArray(updates.OtherBots) ||
    Object.prototype.hasOwnProperty.call(updates, "OtherBotTokens")
  ) {
    const existing = await db.execute(sql`
      select
        "OtherBotsJson",
        "OtherBotTokenSecretsJson"
      from "UserPreference"
      where "userId" = ${userId}
      limit 1
    `);

    const existingRow = (existing as unknown as {
      rows?: Array<{ OtherBotsJson: string | null; OtherBotTokenSecretsJson: string | null }>;
    }).rows?.[0];

    const nextBots = Array.isArray(updates.OtherBots)
      ? normalizeOtherBots(updates.OtherBots)
      : normalizeOtherBots(parseJsonSafely(existingRow?.OtherBotsJson ?? null));

    const existingSecrets = normalizeBotTokenCipherMap(
      parseJsonSafely(existingRow?.OtherBotTokenSecretsJson ?? null)
    );
    const nextSecrets: Record<string, string> = { ...existingSecrets };

    const tokenUpdates = normalizeBotTokenInputMap(updates.OtherBotTokens);
    for (const [botId, token] of Object.entries(tokenUpdates)) {
      if (!nextBots.some((item) => item.id === botId)) {
        continue;
      }

      nextSecrets[botId] = encryptBotToken(token);
    }

    const validIds = new Set(nextBots.map((item) => item.id));
    for (const botId of Object.keys(nextSecrets)) {
      if (!validIds.has(botId)) {
        delete nextSecrets[botId];
      }
    }

    values.push(sql`"OtherBotTokenSecretsJson" = ${JSON.stringify(nextSecrets)}`);
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

  values.push(sql`"updatedAt" = CURRENT_TIMESTAMP`);

  await db.execute(sql`
    update "UserPreference"
    set ${sql.join(values, sql`, `)}
    where "userId" = ${userId}
  `);

  return getUserPreferences(userId);
};

export const getDecryptedOtherBotToken = async (userId: string, botId: string): Promise<string | null> => {
  await ensureUserPreferencesSchema();

  const normalizedBotId = normalizeIdLike(botId, 80);
  if (!normalizedBotId) {
    return null;
  }

  const preferences = await getUserPreferences(userId);
  if (!preferences.OtherBots.some((bot) => bot.id === normalizedBotId)) {
    return null;
  }

  const result = await db.execute(sql`
    select "OtherBotTokenSecretsJson"
    from "UserPreference"
    where "userId" = ${userId}
    limit 1
  `);

  const row = (result as unknown as {
    rows?: Array<{
      OtherBotTokenSecretsJson: string | null;
    }>;
  }).rows?.[0];

  const secretMap = normalizeBotTokenCipherMap(parseJsonSafely(row?.OtherBotTokenSecretsJson ?? null));
  const cipher = secretMap[normalizedBotId];
  if (!cipher) {
    return null;
  }

  try {
    const token = decryptBotToken(cipher).trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
};

export const updateOtherBotCommands = async (
  userId: string,
  botId: string,
  commands: string[]
): Promise<OtherBotConfig | null> => {
  const normalizedBotId = normalizeIdLike(botId, 80);
  if (!normalizedBotId) {
    return null;
  }

  const normalizedCommands = normalizeSlashCommandNames(commands);
  if (normalizedCommands.length === 0) {
    return null;
  }

  const preferences = await getUserPreferences(userId);
  const botIndex = preferences.OtherBots.findIndex((bot) => bot.id === normalizedBotId);
  if (botIndex < 0) {
    return null;
  }

  const nextBots = [...preferences.OtherBots];
  nextBots[botIndex] = {
    ...nextBots[botIndex],
    commands: normalizedCommands,
  };

  const updated = await updateUserPreferences(userId, { OtherBots: nextBots });
  return updated.OtherBots.find((bot) => bot.id === normalizedBotId) ?? null;
};

export const updateOtherBotTemplateStats = async (
  userId: string,
  botId: string,
  updates: {
    importsMadeDelta?: number;
    templatesImportedDelta?: number;
    serverId?: string;
  }
): Promise<OtherBotConfig | null> => {
  const normalizedBotId = normalizeIdLike(botId, 80);
  if (!normalizedBotId) {
    return null;
  }

  const preferences = await getUserPreferences(userId);
  const botIndex = preferences.OtherBots.findIndex((bot) => bot.id === normalizedBotId);
  if (botIndex < 0) {
    return null;
  }

  const importsMadeDelta =
    typeof updates.importsMadeDelta === "number" && Number.isFinite(updates.importsMadeDelta)
      ? Math.max(0, Math.floor(updates.importsMadeDelta))
      : 0;
  const templatesImportedDelta =
    typeof updates.templatesImportedDelta === "number" && Number.isFinite(updates.templatesImportedDelta)
      ? Math.max(0, Math.floor(updates.templatesImportedDelta))
      : 0;
  const normalizedServerId = normalizeIdLike(updates.serverId, 191);

  const nextBots = [...preferences.OtherBots];
  const currentBot = nextBots[botIndex];
  const currentServerIds = Array.isArray(currentBot.templateServerIds)
    ? currentBot.templateServerIds.map((entry) => normalizeIdLike(entry, 191)).filter((entry) => entry.length > 0)
    : [];
  const nextServerIds = normalizedServerId
    ? Array.from(new Set([...currentServerIds, normalizedServerId]))
    : currentServerIds;

  nextBots[botIndex] = {
    ...currentBot,
    templateImportsMade: Math.max(0, Math.floor(currentBot.templateImportsMade ?? 0) + importsMadeDelta),
    templatesImportedCount: Math.max(0, Math.floor(currentBot.templatesImportedCount ?? 0) + templatesImportedDelta),
    templateServerIds: nextServerIds,
    templateStatsUpdatedAt: new Date().toISOString(),
  };

  const updated = await updateUserPreferences(userId, { OtherBots: nextBots });
  return updated.OtherBots.find((bot) => bot.id === normalizedBotId) ?? null;
};
