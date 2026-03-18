"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import {
  Accessibility,
  Activity,
  Ban,
  Baby,
  Headphones,
  Briefcase,
  Bell,
  CreditCard,
  Camera,
  ChevronDown,
  ChevronRight,
  Crown,
  Gamepad2,
  Gift,
  Heart,
  Flag,
  IdCard,
  ImageIcon,
  Keyboard,
  Languages,
  Loader2,
  Link2,
  LogOut,
  Mic,
  MicOff,
  Monitor,
  Palette,
  Puzzle,
  Radio,
  Receipt,
  Smile,
  School,
  Sticker,
  Tags,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Video,
  VideoOff,
  User,
  UserPlus,
  VolumeX,
  Wrench,
  LockKeyhole,
  Eye,
  EyeOff,
} from "lucide-react";
import axios from "axios";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type StripeElementsOptions } from "@stripe/stripe-js";

import { ModeToggle } from "@/components/mode-toggle";
import { ModeratorLineIcon } from "@/components/moderator-line-icon";
import { BusinessMemberIcon } from "@/components/business-member-icon";
import { OtherDeveloperPanel } from "@/components/settings/other-developer-panel";
import { FileUpload } from "@/components/file-upload";
import { Button } from "@/components/ui/button";
import { BannerImage } from "@/components/ui/banner-image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NameplatePill } from "@/components/nameplate-pill";
import { ProfileEffectLayer } from "@/components/profile-effect-layer";
import { ProfileNameWithServerTag } from "@/components/profile-name-with-server-tag";
import { ProfileIconRow } from "@/components/profile-icon-row";
import { UserAvatar } from "@/components/user-avatar";
import {
  DialogDescription,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { useModal } from "@/hooks/use-modal-store";
import { getInAccordStaffLabel, isInAccordAdministrator, isInAccordDeveloper, isInAccordModerator, isInAccordParent } from "@/lib/in-accord-admin";
import { writeMentionsEnabled } from "@/lib/mentions";
import {
  composeProfileNameStyleValue,
  DEFAULT_PROFILE_NAME_STYLE,
  getProfileNameStyleClass,
  getProfileNameStyleParts,
  normalizeProfileNameStyleValue,
  PROFILE_NAME_COLOR_OPTIONS,
  PROFILE_NAME_EFFECT_OPTIONS,
  PROFILE_NAME_FONT_OPTIONS,
  type ProfileNameColorKey,
  type ProfileNameEffectKey,
  type ProfileNameFontKey,
} from "@/lib/profile-name-styles";
import { formatPresenceStatusLabel, normalizePresenceStatus, presenceStatusLabelMap } from "@/lib/presence-status";
import { resolveProfileIcons } from "@/lib/profile-icons";
import { resolveBannerUrl } from "@/lib/asset-url";
import { getCachedVoiceState, VOICE_STATE_SYNC_EVENT, type VoiceStateSyncDetail } from "@/lib/voice-state-sync";
import type {
  AdvancedPreferences,
  ActivityPrivacyPreferences,
  AccessibilityPreferences,
  BotGhostIntegrationConfig,
  ContentSocialPreferences,
  DataPrivacyPreferences,
  EmojiPreferences,
  GameOverlayPreferences,
  KeybindPreferences,
  RegisteredGameEntry,
  RegisteredGamesPreferences,
  StickerPreferences,
  StreamerModePreferences,
  NotificationPreferences,
  TextImagesPreferences,
  FamilyCenterApplicationFile,
  FamilyCenterMemberAccount,
  FamilyCenterPreferences,
  OtherAppConfig,
  OtherBotConfig,
} from "@/lib/user-preferences";

type PatronageEmbeddedPaymentFormProps = {
  onSuccess: (paymentIntentId: string) => Promise<void>;
  onErrorMessage: (message: string) => void;
};

const PatronageEmbeddedPaymentForm = ({ onSuccess, onErrorMessage }: PatronageEmbeddedPaymentFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onPayNow = async () => {
    if (!stripe || !elements) {
      onErrorMessage("Payment form is still loading.");
      return;
    }

    try {
      setIsSubmitting(true);
      onErrorMessage("");

      const result = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });

      if (result.error) {
        onErrorMessage(result.error.message ?? "Payment confirmation failed.");
        return;
      }

      const paymentIntentId = String(result.paymentIntent?.id ?? "").trim();
      if (!paymentIntentId) {
        onErrorMessage("Payment completed, but no payment reference was returned.");
        return;
      }

      await onSuccess(paymentIntentId);
    } catch {
      onErrorMessage("Could not complete payment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <PaymentElement />
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => void onPayNow()}
          disabled={isSubmitting || !stripe || !elements}
          className="bg-emerald-600 text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Processing..." : "Pay Now"}
        </Button>
      </div>
    </div>
  );
};

type SettingsSection =
  | "myAccount"
  | "profiles"
  | "bugReporting"
  | "becomePatron"
  | "contentSocial"
  | "dataPrivacy"
  | "familyCenter"
  | "businessCenter"
  | "schoolCenter"
  | "authorizedApps"
  | "OtherDeveloper"
  | "devices"
  | "connections"
  | "friendRequests"
  | "nitro"
  | "serverBoost"
  | "subscriptions"
  | "giftInventory"
  | "billing"
  | "appearance"
  | "accessibility"
  | "voiceVideo"
  | "textImages"
  | "emoji"
  | "stickers"
  | "notifications"
  | "keybinds"
  | "language"
  | "streamerMode"
  | "advanced"
  | "activityPrivacy"
  | "registeredGames"
  | "gameOverlay";

type SectionGroup = {
  label: string;
  sections: SettingsSection[];
};

const sectionGroups: SectionGroup[] = [
  {
    label: "User Settings",
    sections: [
      "myAccount",
      "profiles",
      "contentSocial",
      "dataPrivacy",
      "authorizedApps",
      "devices",
      "connections",
      "friendRequests",
      "serverBoost",
      "OtherDeveloper",
      "bugReporting",
      "becomePatron",
    ],
  },
  {
    label: "App Settings",
    sections: [
      "appearance",
      "accessibility",
      "voiceVideo",
      "textImages",
      "emoji",
      "stickers",
      "notifications",
      "keybinds",
      "language",
      "streamerMode",
      "advanced",
    ],
  },
  {
    label: "Activity Settings",
    sections: ["activityPrivacy", "registeredGames", "gameOverlay"],
  },
  {
    label: "Account Centers",
    sections: [
      "familyCenter",
      "businessCenter",
      "schoolCenter",
    ],
  },
];

const sectionLabelMap: Record<SettingsSection, string> = {
  myAccount: "My Account",
  profiles: "Profiles",
  bugReporting: "Bug Reporting",
  becomePatron: "Become a Patron",
  contentSocial: "Content & Social",
  dataPrivacy: "Data & Privacy",
  familyCenter: "Family Center",
  businessCenter: "Business Center",
  schoolCenter: "School Center",
  authorizedApps: "Authorized Apps",
  OtherDeveloper: "Bot/App Developer",
  devices: "Devices",
  connections: "Connections",
  friendRequests: "Blocked Users",
  nitro: "Nitro",
  serverBoost: "SERVER TAGS",
  subscriptions: "Subscriptions",
  giftInventory: "Gift Inventory",
  billing: "Billing",
  appearance: "Appearance",
  accessibility: "Accessibility",
  voiceVideo: "Voice & Video",
  textImages: "Text & Images",
  emoji: "Emoji",
  stickers: "Stickers",
  notifications: "Notifications",
  keybinds: "Keybinds",
  language: "Language",
  streamerMode: "Streamer Mode",
  advanced: "Advanced",
  activityPrivacy: "Activity Privacy",
  registeredGames: "Registered Games",
  gameOverlay: "Game Overlay",
};

const sectionDescriptionMap: Record<SettingsSection, string> = {
  myAccount: "Manage your account details and security settings.",
  profiles: "Set profile customization per identity and server context.",
  bugReporting: "Report app issues and bugs directly to In-Accord staff.",
  becomePatron: "Support In-Accord with one-time or monthly patronage.",
  contentSocial: "Control social and content visibility preferences.",
  dataPrivacy: "Review data, privacy, and safety controls.",
  familyCenter: "Configure family center and family controls.",
  businessCenter: "Configure business center controls and managed business accounts.",
  schoolCenter: "Configure school center controls and managed school accounts.",
  authorizedApps: "Review third-party authorized app access.",
  OtherDeveloper: "Manage bots and apps connected to your In-Accord profile.",
  devices: "Manage signed-in devices and sessions.",
  connections: "Connect and manage linked external accounts.",
  friendRequests: "Manage blocked users and request interactions.",
  nitro: "View Nitro settings and perks.",
  serverBoost: "Configure server tags and profile tag display.",
  subscriptions: "Review active and available subscriptions.",
  giftInventory: "Manage account gifts and inventory.",
  billing: "Manage payment methods and billing details.",
  appearance: "Customize how In-Accord looks and feels.",
  accessibility: "Accessibility options for readability and input.",
  voiceVideo: "Configure voice and video preferences.",
  textImages: "Manage text, embeds, and media display behavior.",
  emoji: "Emoji picker and emoji behavior preferences.",
  stickers: "Sticker packs and sticker behavior settings.",
  notifications: "Tune notification behavior and alert routing.",
  keybinds: "Set keybinds and keyboard shortcuts.",
  language: "Choose your preferred display language.",
  streamerMode: "Control streamer mode privacy options.",
  advanced: "Advanced application behavior and diagnostics options.",
  activityPrivacy: "Control how your activity is shared.",
  registeredGames: "Manage detected and manually-added games.",
  gameOverlay: "Configure in-game overlay behavior.",
};

const sectionIconMap: Record<SettingsSection, React.ComponentType<{ className?: string }>> = {
  myAccount: User,
  profiles: IdCard,
  bugReporting: Flag,
  becomePatron: Heart,
  contentSocial: Smile,
  dataPrivacy: LockKeyhole,
  familyCenter: Baby,
  businessCenter: Briefcase,
  schoolCenter: School,
  authorizedApps: ShieldCheck,
  OtherDeveloper: Puzzle,
  devices: Smartphone,
  connections: Link2,
  friendRequests: UserPlus,
  nitro: Sparkles,
  serverBoost: Tags,
  subscriptions: Receipt,
  giftInventory: Gift,
  billing: CreditCard,
  appearance: Palette,
  accessibility: Accessibility,
  voiceVideo: Mic,
  textImages: ImageIcon,
  emoji: Smile,
  stickers: Sticker,
  notifications: Bell,
  keybinds: Keyboard,
  language: Languages,
  streamerMode: Radio,
  advanced: SlidersHorizontal,
  activityPrivacy: LockKeyhole,
  registeredGames: Gamepad2,
  gameOverlay: Monitor,
};

const settingsSections = [
  "myAccount",
  "profiles",
  "bugReporting",
  "becomePatron",
  "contentSocial",
  "dataPrivacy",
  "familyCenter",
  "businessCenter",
  "schoolCenter",
  "authorizedApps",
  "OtherDeveloper",
  "devices",
  "connections",
  "friendRequests",
  "nitro",
  "serverBoost",
  "subscriptions",
  "giftInventory",
  "billing",
  "appearance",
  "accessibility",
  "voiceVideo",
  "textImages",
  "emoji",
  "stickers",
  "notifications",
  "keybinds",
  "language",
  "streamerMode",
  "advanced",
  "activityPrivacy",
  "registeredGames",
  "gameOverlay",
] as const;

const VOICE_TOGGLE_MUTE_EVENT = "inaccord:voice-toggle-mute";
const VOICE_TOGGLE_DEAFEN_EVENT = "inaccord:voice-toggle-deafen";
const VOICE_TOGGLE_CAMERA_EVENT = "inaccord:voice-toggle-camera";
const PM_TOGGLE_CAMERA_EVENT = "inaccord:pm-toggle-camera";
const PM_CAMERA_STATE_SYNC_EVENT = "inaccord:pm-camera-state-sync";

const settingsSectionSet = new Set<SettingsSection>(settingsSections);

const applyAccessibilityPreferencesToDocument = (preferences: AccessibilityPreferences) => {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;

  root.classList.toggle("inaccord-accessibility-reduced-motion", preferences.preferReducedMotion);
  root.classList.toggle("inaccord-accessibility-high-contrast", preferences.highContrastMode);
  root.classList.toggle("inaccord-accessibility-large-chat-font", preferences.largerChatFont);
  root.setAttribute("data-inaccord-message-spacing", preferences.messageSpacing);
};

const normalizeSettingsSection = (value: unknown): SettingsSection | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  return settingsSectionSet.has(normalized as SettingsSection)
    ? (normalized as SettingsSection)
    : null;
};

const CUSTOM_CSS_STYLE_ID = "in-accord-custom-css-style";
const languageOptions = [
  { value: "system", label: "System Default" },
  { value: "en-US", label: "English (US)" },
  { value: "es-ES", label: "Español" },
  { value: "fr-FR", label: "Français" },
  { value: "de-DE", label: "Deutsch" },
  { value: "it-IT", label: "Italiano" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "ja-JP", label: "日本語" },
  { value: "ko-KR", label: "한국어" },
  { value: "zh-CN", label: "中文（简体）" },
] as const;

const NAMEPLATE_COLOR_PRESETS = [
  { key: "blurple", label: "Blurple", color: "#5865f2" },
  { key: "rose", label: "Rose", color: "#eb459e" },
  { key: "emerald", label: "Emerald", color: "#3ba55d" },
  { key: "gold", label: "Gold", color: "#f1c40f" },
  { key: "sky", label: "Sky", color: "#3498db" },
  { key: "slate", label: "Slate", color: "#99aab5" },
] as const;

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

type RegisteredConnectionGame = {
  id: string;
  name: string;
  provider: string;
  shortDescription: string;
  thumbnailUrl: string;
  processName?: string;
};

type RunningAppEntry = {
  id: string;
  processName: string;
  windowTitle: string;
  label: string;
};

type RegisteredGamesProviderState = {
  source: "live" | "fallback" | "native-installed-scan" | "unsupported-platform" | "none";
  count: number;
};

const defaultBotGhostIntegration: BotGhostIntegrationConfig = {
  enabled: false,
  webhookUrl: "",
  apiKeyHint: "",
  lastHealthStatus: "unknown",
  lastHealthCheckedAt: "",
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
    webhookUrl: typeof source.webhookUrl === "string" ? source.webhookUrl.trim().slice(0, 2048) : "",
    apiKeyHint: typeof source.apiKeyHint === "string" ? source.apiKeyHint.trim().slice(0, 64) : "",
    lastHealthStatus,
    lastHealthCheckedAt:
      typeof source.lastHealthCheckedAt === "string" && !Number.isNaN(new Date(source.lastHealthCheckedAt).getTime())
        ? new Date(source.lastHealthCheckedAt).toISOString()
        : "",
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

const familyMemberRelationOptions = [
  "Grand Daughter",
  "Grand Son",
  "Daughter",
  "Son",
  "Mother",
  "Father",
  "Wife",
  "Husband",
  "Niece",
  "Nephew",
] as const;

const businessRoleGroups = [
  {
    label: "C-Suite & Executive Leadership",
    options: [
      "Chief Executive Officer (CEO)",
      "Chief Operating Officer (COO)",
      "Chief Financial Officer (CFO)",
      "Chief Marketing Officer (CMO)",
      "Chief Technology Officer (CTO)",
      "Chief Information Officer (CIO)",
      "Chief Human Resources Officer (CHRO)",
      "Chief Commercial Officer (CCO)",
      "Chief Information Security Officer (CISO)",
      "Chief Sustainability Officer (CSO)",
      "Chief Growth Officer (CGO)",
      "Chief Diversity Officer (CDO)",
      "Chief Experience Officer (CXO)",
      "Managing Partner",
    ],
  },
  {
    label: "Vice Presidents & Directors",
    options: [
      "Vice Presidents & Directors",
      "Vice President (VP) of Operations",
      "VP of Engineering",
      "Director of Marketing",
      "Director of Finance",
      "Creative Director",
      "Regional Director",
    ],
  },
  {
    label: "Management & Departmental Leads",
    options: [
      "Management & Departmental Leads",
      "Product Manager",
      "Human Resources Manager",
      "Information Technology (IT) Manager",
      "Sales Manager",
      "Marketing Manager",
      "Operations Manager",
      "Account Manager",
      "Customer Service Manager",
      "Plant Manager",
      "Team Lead",
    ],
  },
  {
    label: "Administrative Support",
    options: [
      "Executive Assistant (EA)",
      "Administrative Assistant",
      "Office Manager",
      "Receptionist",
      "Virtual Assistant",
    ],
  },
  {
    label: "Technical & Specialist Roles",
    options: [
      "Software Developer",
      "Data Analyst",
      "Business Systems Analyst",
      "Systems Administrator",
      "SEO Specialist",
      "Copywriter",
      "HR Coordinator",
      "Accountant",
    ],
  },
] as const;

const businessRoleOptions = businessRoleGroups.flatMap((group) => group.options);

const businessSectionOptions = [
  "Finance",
  "Operations",
  "Human Resources (HR)",
  "Information Technology (IT)",
  "Research and Development (R&D)",
  "Sales",
  "Legal",
  "Customer Service",
  "Accounting",
  "Procurement",
  "Quality Assurance",
  "Engineering",
  "Production",
  "Corporate Communications",
  "Logistics",
  "Product Management",
  "Strategy",
  "Administration",
  "Compliance",
  "Risk Management",
  "Internal Audit",
  "Diversity and Inclusion",
  "Business Development",
  "Security",
] as const;

const familyDesignationOptions = [
  "Grand Father",
  "Grand Mother",
  "Mother",
  "Father",
  "Wife",
  "Husband",
  "Aunty",
  "Uncle",
  "Legal Guardian",
] as const;

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
        .map((entry) => {
          const uploadedDate =
            typeof entry.uploadedAt === "string" && !Number.isNaN(new Date(entry.uploadedAt).getTime())
              ? new Date(entry.uploadedAt).toISOString()
              : new Date().toISOString();

          const normalizedUrl = String(entry.url ?? "").trim().slice(0, 2048);

          return {
            name: String(entry.name ?? "").trim().slice(0, 200),
            url: /^https?:\/\//i.test(normalizedUrl) || normalizedUrl.startsWith("/") ? normalizedUrl : "",
            mimeType: String(entry.mimeType ?? "application/octet-stream").trim().slice(0, 120).toLowerCase(),
            size:
              typeof entry.size === "number" && Number.isFinite(entry.size) && entry.size > 0
                ? Math.min(Math.floor(entry.size), 100 * 1024 * 1024)
                : 0,
            uploadedAt: uploadedDate,
          } satisfies FamilyCenterApplicationFile;
        })
        .filter((entry) => entry.name.length > 0 && entry.url.length > 0)
        .slice(0, 20)
    : [];

  const familyMembers = Array.isArray(source.familyMembers)
    ? source.familyMembers
        .filter((entry): entry is FamilyCenterMemberAccount => {
          if (!entry || typeof entry !== "object") {
            return false;
          }

          const candidate = entry as Partial<FamilyCenterMemberAccount>;
          return typeof candidate.accountIdentifier === "string";
        })
        .map((entry, index) => {
          const accountIdentifier = String(entry.accountIdentifier ?? "").trim().slice(0, 160);
          const childName = String(entry.childName ?? "").trim().slice(0, 60);
          const id = String(entry.id ?? "").trim().slice(0, 80) || `family-member-${index + 1}`;
          const createdAt = String(entry.createdAt ?? "").trim() || new Date().toISOString();

          return {
            id,
            childName,
            accountIdentifier,
            childRelation: familyMemberRelationOptions.includes(
              (entry.childRelation ?? "") as (typeof familyMemberRelationOptions)[number]
            )
              ? (entry.childRelation as (typeof familyMemberRelationOptions)[number])
              : "",
            childSection: String(entry.childSection ?? "").trim().slice(0, 80),
            childEmail: String(entry.childEmail ?? "").trim().slice(0, 160),
            childPassword: String(entry.childPassword ?? "").trim().slice(0, 128),
            childPhone: String(entry.childPhone ?? "").trim().slice(0, 32),
            childDateOfBirth:
              typeof entry.childDateOfBirth === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.childDateOfBirth)
                ? entry.childDateOfBirth
                : "",
            linkedUserId: String(entry.linkedUserId ?? "").trim().slice(0, 191),
            familyLinkState:
              entry.familyLinkState === "managed-under-16" ||
              entry.familyLinkState === "eligible-16-plus" ||
              entry.familyLinkState === "normal"
                ? entry.familyLinkState
                : "normal",
            createdAt,
            requireContentFilterForFamilyMembers:
              typeof entry.requireContentFilterForFamilyMembers === "boolean"
                ? entry.requireContentFilterForFamilyMembers
                : defaultFamilyCenterPreferences.requireContentFilterForFamilyMembers,
            shareWeeklySafetySummary:
              typeof entry.shareWeeklySafetySummary === "boolean"
                ? entry.shareWeeklySafetySummary
                : defaultFamilyCenterPreferences.shareWeeklySafetySummary,
            allowDirectMessagesFromNonFriends:
              typeof entry.allowDirectMessagesFromNonFriends === "boolean"
                ? entry.allowDirectMessagesFromNonFriends
                : defaultFamilyCenterPreferences.allowDirectMessagesFromNonFriends,
            alertOnMatureContentInteractions:
              typeof entry.alertOnMatureContentInteractions === "boolean"
                ? entry.alertOnMatureContentInteractions
                : defaultFamilyCenterPreferences.alertOnMatureContentInteractions,
          } satisfies FamilyCenterMemberAccount;
        })
        .filter((entry) => entry.accountIdentifier.length > 0)
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
    familyDesignation: typeof source.familyDesignation === "string" ? source.familyDesignation.trim().slice(0, 80) : "",
    familyApplicationStatus:
      typeof source.familyApplicationStatus === "string" ? source.familyApplicationStatus.trim().slice(0, 80) : "",
    familyApplicationSubmittedAt:
      typeof source.familyApplicationSubmittedAt === "string" && !Number.isNaN(new Date(source.familyApplicationSubmittedAt).getTime())
        ? new Date(source.familyApplicationSubmittedAt).toISOString()
        : "",
    familyApplicationFiles,
    familyMembers,
  };
};

const normalizeBusinessCenterPreferences = (value: unknown): FamilyCenterPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultFamilyCenterPreferences };
  }

  const source = value as Record<string, unknown>;

  const normalized = normalizeFamilyCenterPreferences({
    requireContentFilterForFamilyMembers: source.requireContentFilterForFamilyMembers,
    shareWeeklySafetySummary: source.shareWeeklySafetySummary,
    allowDirectMessagesFromNonFriends: source.allowDirectMessagesFromNonFriends,
    alertOnMatureContentInteractions: source.alertOnMatureContentInteractions,
    familyDesignation: source.businessDesignation,
    familyApplicationStatus: source.businessApplicationStatus,
    familyApplicationSubmittedAt: source.businessApplicationSubmittedAt,
    familyApplicationFiles: source.businessApplicationFiles,
    familyMembers: source.businessMembers,
  });

  const businessMembers = Array.isArray(source.businessMembers)
    ? source.businessMembers
        .filter((entry): entry is FamilyCenterMemberAccount => {
          if (!entry || typeof entry !== "object") {
            return false;
          }

          const candidate = entry as Partial<FamilyCenterMemberAccount>;
          return typeof candidate.accountIdentifier === "string";
        })
        .map((entry, index) => {
          const accountIdentifier = String(entry.accountIdentifier ?? "").trim().slice(0, 160);
          const childName = String(entry.childName ?? "").trim().slice(0, 60);
          const id = String(entry.id ?? "").trim().slice(0, 80) || `business-member-${index + 1}`;
          const createdAt = String(entry.createdAt ?? "").trim() || new Date().toISOString();

          return {
            id,
            childName,
            accountIdentifier,
            childRelation: businessRoleOptions.includes(
              (entry.childRelation ?? "") as (typeof businessRoleOptions)[number]
            )
              ? (entry.childRelation as (typeof businessRoleOptions)[number])
              : "",
            childSection: businessSectionOptions.includes(
              (entry.childSection ?? "") as (typeof businessSectionOptions)[number]
            )
              ? (entry.childSection as (typeof businessSectionOptions)[number])
              : "",
            childEmail: String(entry.childEmail ?? "").trim().slice(0, 160),
            childPassword: String(entry.childPassword ?? "").trim().slice(0, 128),
            childPhone: String(entry.childPhone ?? "").trim().slice(0, 32),
            childDateOfBirth:
              typeof entry.childDateOfBirth === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.childDateOfBirth)
                ? entry.childDateOfBirth
                : "",
            linkedUserId: String(entry.linkedUserId ?? "").trim().slice(0, 191),
            familyLinkState:
              entry.familyLinkState === "managed-under-16" ||
              entry.familyLinkState === "eligible-16-plus" ||
              entry.familyLinkState === "normal"
                ? entry.familyLinkState
                : "normal",
            createdAt,
            requireContentFilterForFamilyMembers:
              typeof entry.requireContentFilterForFamilyMembers === "boolean"
                ? entry.requireContentFilterForFamilyMembers
                : defaultFamilyCenterPreferences.requireContentFilterForFamilyMembers,
            shareWeeklySafetySummary:
              typeof entry.shareWeeklySafetySummary === "boolean"
                ? entry.shareWeeklySafetySummary
                : defaultFamilyCenterPreferences.shareWeeklySafetySummary,
            allowDirectMessagesFromNonFriends:
              typeof entry.allowDirectMessagesFromNonFriends === "boolean"
                ? entry.allowDirectMessagesFromNonFriends
                : defaultFamilyCenterPreferences.allowDirectMessagesFromNonFriends,
            alertOnMatureContentInteractions:
              typeof entry.alertOnMatureContentInteractions === "boolean"
                ? entry.alertOnMatureContentInteractions
                : defaultFamilyCenterPreferences.alertOnMatureContentInteractions,
          } satisfies FamilyCenterMemberAccount;
        })
        .filter((entry) => entry.accountIdentifier.length > 0)
    : [];

  return {
    ...normalized,
    familyMembers: businessMembers,
  };
};

const mapFamilyCenterToBusinessCenterPayload = (value: FamilyCenterPreferences) => {
  return {
    requireContentFilterForFamilyMembers: value.requireContentFilterForFamilyMembers,
    shareWeeklySafetySummary: value.shareWeeklySafetySummary,
    allowDirectMessagesFromNonFriends: value.allowDirectMessagesFromNonFriends,
    alertOnMatureContentInteractions: value.alertOnMatureContentInteractions,
    businessDesignation: value.familyDesignation,
    businessApplicationStatus: value.familyApplicationStatus,
    businessApplicationSubmittedAt: value.familyApplicationSubmittedAt,
    businessApplicationFiles: value.familyApplicationFiles,
    businessMembers: value.familyMembers,
  };
};

const sanitizeFamilyApplicationErrorMessage = (value: string | null | undefined) => {
  const message = String(value ?? "").trim();
  if (!message) {
    return "Could not submit application. Please try again.";
  }

  const normalized = message.toLowerCase();
  const containsSensitiveStorageDetails =
    normalized.includes("cloud storage") ||
    normalized.includes("local fallback") ||
    normalized.includes("secure document storage") ||
    normalized.includes("not configured") ||
    normalized.includes("clouflare_r2") ||
    normalized.includes("cloudflare_r2") ||
    normalized.includes("missing:");

  if (containsSensitiveStorageDetails) {
    return "Document upload is temporarily unavailable. Please try again later.";
  }

  return message;
};

type PasswordStrengthTone = "Weak" | "Fair" | "Good" | "Strong";

const getPasswordStrength = (value: string): { label: PasswordStrengthTone; className: string; score: number } => {
  const password = value.trim();
  if (!password) {
    return { label: "Weak", className: "text-rose-300", score: 0 };
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^a-zA-Z\d]/.test(password)) score += 1;

  if (score >= 6) {
    return { label: "Strong", className: "text-emerald-300", score };
  }

  if (score >= 5) {
    return { label: "Good", className: "text-sky-300", score };
  }

  if (score >= 3) {
    return { label: "Fair", className: "text-amber-300", score };
  }

  return { label: "Weak", className: "text-rose-300", score };
};

type CustomThemeColors = {
  background: string;
  card: string;
  secondary: string;
  accent: string;
  primary: string;
  foreground: string;
  mutedForeground: string;
  border: string;
};

const defaultDisplayStyleColors: CustomThemeColors = {
  background: "#101419",
  card: "#172028",
  secondary: "#1f2b36",
  accent: "#274054",
  primary: "#22c6b9",
  foreground: "#f3fbff",
  mutedForeground: "#b4d2da",
  border: "#2d5a66",
};

const displayStylePresets: Array<{ key: string; label: string; colors: CustomThemeColors }> = [
  {
    key: "ocean",
    label: "Ocean",
    colors: {
      background: "#101419",
      card: "#172028",
      secondary: "#1f2b36",
      accent: "#274054",
      primary: "#22c6b9",
      foreground: "#f3fbff",
      mutedForeground: "#b4d2da",
      border: "#2d5a66",
    },
  },
  {
    key: "sunset",
    label: "Sunset",
    colors: {
      background: "#2b1117",
      card: "#3a1822",
      secondary: "#4a2130",
      accent: "#5a2a3d",
      primary: "#ff7a59",
      foreground: "#fff2f0",
      mutedForeground: "#f2c4bc",
      border: "#7a3c4d",
    },
  },
  {
    key: "neon",
    label: "Neon",
    colors: {
      background: "#0b1020",
      card: "#111a2f",
      secondary: "#162241",
      accent: "#1d2d54",
      primary: "#6df5ff",
      foreground: "#eaf7ff",
      mutedForeground: "#9ec1d9",
      border: "#2b4770",
    },
  },
];

const displayStyleColorFields: Array<{ key: keyof CustomThemeColors; label: string }> = [
  { key: "background", label: "Main Background" },
  { key: "card", label: "Card Background" },
  { key: "secondary", label: "Secondary Surface" },
  { key: "accent", label: "Accent Surface" },
  { key: "primary", label: "Primary Accent" },
  { key: "foreground", label: "Primary Text" },
  { key: "mutedForeground", label: "Muted Text" },
  { key: "border", label: "Border" },
];

const hexToHslTokens = (hex: string) => {
  const normalized = hex.replace("#", "");

  const safeHex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((chunk) => `${chunk}${chunk}`)
          .join("")
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(safeHex)) {
    return "0 0% 0%";
  }

  const r = Number.parseInt(safeHex.slice(0, 2), 16) / 255;
  const g = Number.parseInt(safeHex.slice(2, 4), 16) / 255;
  const b = Number.parseInt(safeHex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  const l = (max + min) / 2;
  const s =
    delta === 0
      ? 0
      : delta / (1 - Math.abs(2 * l - 1));

  if (delta !== 0) {
    switch (max) {
      case r:
        h = 60 * (((g - b) / delta) % 6);
        break;
      case g:
        h = 60 * ((b - r) / delta + 2);
        break;
      default:
        h = 60 * ((r - g) / delta + 4);
        break;
    }
  }

  if (h < 0) {
    h += 360;
  }

  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

type BlockedProfileSummary = {
  profileId: string;
  displayName: string;
  email: string | null;
  imageUrl: string | null;
  blockedAt: string | null;
};

type PatronageHistoryEntry = {
  id: string;
  donationType: "ONE_TIME" | "MONTHLY";
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "REFUNDED";
  amountCents: number;
  currency: string;
  note: string | null;
  createdAt: string | null;
};

type ConnectionProvider = {
  key: string;
  label: string;
  description: string;
};

type DeviceSession = {
  sessionId: string;
  deviceName: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

type SecurityKeyItem = {
  id: string;
  credentialId: string;
  nickname: string;
  transports: string[];
  createdAt: string;
  lastUsedAt: string | null;
};

type SmsAuthStatus = {
  enabled: boolean;
  hasPendingVerification: boolean;
  maskedPhoneNumber: string | null;
  verifiedAt: string | null;
  lastUsedAt: string | null;
};

const defaultSmsAuthStatus: SmsAuthStatus = {
  enabled: false,
  hasPendingVerification: false,
  maskedPhoneNumber: null,
  verifiedAt: null,
  lastUsedAt: null,
};

type AuthenticatorAppStatus = {
  enabled: boolean;
  hasPendingSetup: boolean;
  verifiedAt: string | null;
  lastUsedAt: string | null;
};

const defaultAuthenticatorAppStatus: AuthenticatorAppStatus = {
  enabled: false,
  hasPendingSetup: false,
  verifiedAt: null,
  lastUsedAt: null,
};

type ServerTagIconOption = {
  key: string;
  label: string;
  emoji: string;
};

type OwnedServerTag = {
  serverId: string;
  serverName: string;
  tagCode: string | null;
  iconKey: string | null;
};

type MemberServerTag = {
  serverId: string;
  serverName: string;
  tagCode: string;
  iconKey: string;
  iconEmoji: string;
  isSelected: boolean;
};

type MemberServerProfileOption = {
  serverId: string;
  serverName: string;
  profileName: string | null;
  profileNameStyle?: string | null;
  comment?: string | null;
  nameplateLabel?: string | null;
  nameplateColor?: string | null;
  nameplateImageUrl?: string | null;
  imageUrl?: string | null;
  avatarDecorationUrl?: string | null;
  profileEffectUrl?: string | null;
  bannerUrl: string | null;
  effectiveProfileName?: string | null;
  effectiveProfileNameStyle?: string | null;
  effectiveComment?: string | null;
  effectiveNameplateLabel?: string | null;
  effectiveNameplateColor?: string | null;
  effectiveNameplateImageUrl?: string | null;
  effectiveImageUrl?: string | null;
  effectiveAvatarDecorationUrl?: string | null;
  effectiveProfileEffectUrl?: string | null;
  effectiveBannerUrl?: string | null;
};

type FamilyMemberLifecycle = {
  memberUserId: string;
  age: number | null;
  isFamilyLinked: boolean;
  showFamilyIcon: boolean;
  canConvertToNormal: boolean;
  state: "managed-under-16" | "eligible-16-plus" | "normal";
};

const connectionProviders: ConnectionProvider[] = [
  {
    key: "github",
    label: "GitHub",
    description: "Share coding profile links and repository identity.",
  },
  {
    key: "google",
    label: "Google",
    description: "Use Google identity in account linking workflows.",
  },
  {
    key: "steam",
    label: "Steam",
    description: "Show connected gaming identity and activity.",
  },
  {
    key: "twitch",
    label: "Twitch",
    description: "Link streaming account presence.",
  },
  {
    key: "xbox",
    label: "Xbox",
    description: "Attach your Xbox gaming profile.",
  },
  {
    key: "youtube",
    label: "YouTube",
    description: "Link creator channel identity.",
  },
];

const normalizeRegisteredGamesPreferences = (value: unknown): RegisteredGamesPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultRegisteredGamesPreferences };
  }

  const source = value as Partial<Record<keyof RegisteredGamesPreferences, unknown>>;
  const hiddenGameIds = Array.isArray(source.hiddenGameIds)
    ? Array.from(
        new Set(
          source.hiddenGameIds
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
            .slice(0, 240)
        )
      )
    : [];

  const manualGames = Array.isArray(source.manualGames)
    ? source.manualGames
        .filter((entry): entry is RegisteredGameEntry => Boolean(entry && typeof entry === "object"))
        .map((entry, index) => {
          const sourceEntry = entry as Partial<RegisteredGameEntry>;
          const name = typeof sourceEntry.name === "string" ? sourceEntry.name.trim().slice(0, 120) : "";
          const id =
            typeof sourceEntry.id === "string" && sourceEntry.id.trim().length > 0
              ? sourceEntry.id.trim().slice(0, 120)
              : `manual-${index + 1}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
          const thumbnailUrl =
            typeof sourceEntry.thumbnailUrl === "string"
              ? sourceEntry.thumbnailUrl.trim().slice(0, 2048)
              : "";

          return {
            id,
            name,
            provider:
              typeof sourceEntry.provider === "string" && sourceEntry.provider.trim().length > 0
                ? sourceEntry.provider.trim().slice(0, 60)
                : "manual",
            shortDescription:
              typeof sourceEntry.shortDescription === "string"
                ? sourceEntry.shortDescription.trim().slice(0, 280)
                : "",
            thumbnailUrl:
              /^https?:\/\//i.test(thumbnailUrl) || thumbnailUrl.startsWith("/") ? thumbnailUrl : "",
            addedAt:
              typeof sourceEntry.addedAt === "string" && !Number.isNaN(new Date(sourceEntry.addedAt).getTime())
                ? new Date(sourceEntry.addedAt).toISOString()
                : new Date().toISOString(),
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

const oauthConnectionProviders = new Set<string>(["github", "google", "steam", "twitch", "xbox", "youtube"]);

export const SettingsModal = () => {
  const router = useRouter();
  const { isOpen, onClose, type, data } = useModal();
  const [activeSection, setActiveSection] = useState<SettingsSection>("myAccount");
  const [displaySection, setDisplaySection] = useState<SettingsSection>("myAccount");
  const [isSectionVisible, setIsSectionVisible] = useState(true);
  const [collapsedSectionGroups, setCollapsedSectionGroups] = useState<Record<string, boolean>>({});
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [isUploadingServerAvatar, setIsUploadingServerAvatar] = useState(false);
  const [isUploadingServerBanner, setIsUploadingServerBanner] = useState(false);
  const [isUploadingNameplateImage, setIsUploadingNameplateImage] = useState(false);
  const [isUploadingServerNameplateImage, setIsUploadingServerNameplateImage] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showCredentialPin, setShowCredentialPin] = useState(false);
  const [isSavingProfileName, setIsSavingProfileName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [credentialPin, setCredentialPin] = useState("");
  const [credentialPinConfirmOne, setCredentialPinConfirmOne] = useState("");
  const [credentialPinConfirmTwo, setCredentialPinConfirmTwo] = useState("");
  const [realName, setRealName] = useState(data.profileRealName ?? "");
  const [profileName, setProfileName] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [comment, setComment] = useState("");
  const [nameplateLabel, setNameplateLabel] = useState("");
  const [nameplateColor, setNameplateColor] = useState("#5865f2");
  const [nameplateImageUrl, setNameplateImageUrl] = useState<string | null>(null);
  const [nameplateLabelInput, setNameplateLabelInput] = useState("");
  const [nameplateColorInput, setNameplateColorInput] = useState("");
  const [nameplateImageUrlInput, setNameplateImageUrlInput] = useState("");
  const [isSavingNameplate, setIsSavingNameplate] = useState(false);
  const [nameplateStatus, setNameplateStatus] = useState<string | null>(null);
  const [avatarDecorationUrl, setAvatarDecorationUrl] = useState<string | null>(null);
  const [avatarDecorationInput, setAvatarDecorationInput] = useState("");
  const [isSavingAvatarDecoration, setIsSavingAvatarDecoration] = useState(false);
  const [avatarDecorationStatus, setAvatarDecorationStatus] = useState<string | null>(null);
  const [profileEffectUrl, setProfileEffectUrl] = useState<string | null>(null);
  const [profileEffectInput, setProfileEffectInput] = useState("");
  const [isSavingProfileEffect, setIsSavingProfileEffect] = useState(false);
  const [profileEffectStatus, setProfileEffectStatus] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [profileRole, setProfileRole] = useState<string | null>(data.profileRole ?? null);
  const [profilePresenceStatus, setProfilePresenceStatus] = useState(
    normalizePresenceStatus(data.profilePresenceStatus)
  );
  const [profileCurrentGame, setProfileCurrentGame] = useState<string | null>(data.profileCurrentGame?.trim() || null);
  const [profileNameError, setProfileNameError] = useState<string | null>(null);
  const [profileNameSuccess, setProfileNameSuccess] = useState<string | null>(null);
  const [isEditingDefaultProfileNameInline, setIsEditingDefaultProfileNameInline] = useState(false);
  const [defaultProfileNameDraft, setDefaultProfileNameDraft] = useState("");
  const [defaultProfileNameStyle, setDefaultProfileNameStyle] = useState<string>(DEFAULT_PROFILE_NAME_STYLE);
  const [defaultProfileNameFont, setDefaultProfileNameFont] = useState<ProfileNameFontKey>("default");
  const [defaultProfileNameEffect, setDefaultProfileNameEffect] = useState<ProfileNameEffectKey>("solid");
  const [defaultProfileNameColor, setDefaultProfileNameColor] = useState<ProfileNameColorKey>("default");
  const [isSavingDefaultProfileNameStyle, setIsSavingDefaultProfileNameStyle] = useState(false);
  const [defaultProfileNameStyleStatus, setDefaultProfileNameStyleStatus] = useState<string | null>(null);
  const [isEditingPronounsInline, setIsEditingPronounsInline] = useState(false);
  const [pronounsDraft, setPronounsDraft] = useState("");
  const [isSavingPronouns, setIsSavingPronouns] = useState(false);
  const [pronounsStatus, setPronounsStatus] = useState<string | null>(null);
  const [isEditingCommentInline, setIsEditingCommentInline] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [commentStatus, setCommentStatus] = useState<string | null>(null);
  const [isEditingPhoneNumberInline, setIsEditingPhoneNumberInline] = useState(false);
  const [phoneNumberDraft, setPhoneNumberDraft] = useState("");
  const [isSavingPhoneNumber, setIsSavingPhoneNumber] = useState(false);
  const [phoneNumberStatus, setPhoneNumberStatus] = useState<string | null>(null);
  const [dateOfBirthDraft, setDateOfBirthDraft] = useState("");
  const [isSavingDateOfBirth, setIsSavingDateOfBirth] = useState(false);
  const [dateOfBirthStatus, setDateOfBirthStatus] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(data.profileImageUrl ?? null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(data.profileBannerUrl ?? null);
  const [uploadedAvatarThumbnails, setUploadedAvatarThumbnails] = useState<string[]>([]);
  const [uploadedBannerThumbnails, setUploadedBannerThumbnails] = useState<string[]>([]);
  const [resolvedProfileId, setResolvedProfileId] = useState<string | null>(data.profileId ?? null);
  const [mentionsEnabled, setMentionsEnabled] = useState(true);
  const [contentSocialPreferences, setContentSocialPreferences] = useState<ContentSocialPreferences>({
    ...defaultContentSocialPreferences,
  });
  const [isSavingContentSocialPreferences, setIsSavingContentSocialPreferences] = useState(false);
  const [contentSocialStatus, setContentSocialStatus] = useState<string | null>(null);
  const [dataPrivacyPreferences, setDataPrivacyPreferences] = useState<DataPrivacyPreferences>({
    ...defaultDataPrivacyPreferences,
  });
  const [isSavingDataPrivacyPreferences, setIsSavingDataPrivacyPreferences] = useState(false);
  const [dataPrivacyStatus, setDataPrivacyStatus] = useState<string | null>(null);
  const [activityPrivacyPreferences, setActivityPrivacyPreferences] = useState<ActivityPrivacyPreferences>({
    ...defaultActivityPrivacyPreferences,
  });
  const [isSavingActivityPrivacyPreferences, setIsSavingActivityPrivacyPreferences] = useState(false);
  const [activityPrivacyStatus, setActivityPrivacyStatus] = useState<string | null>(null);
  const [registeredGamesPreferences, setRegisteredGamesPreferences] = useState<RegisteredGamesPreferences>({
    ...defaultRegisteredGamesPreferences,
  });
  const [manualGameNameInput, setManualGameNameInput] = useState("");
  const [manualGameProviderInput, setManualGameProviderInput] = useState("manual");
  const [manualGameDescriptionInput, setManualGameDescriptionInput] = useState("");
  const [manualGameThumbnailInput, setManualGameThumbnailInput] = useState("");
  const [isSavingRegisteredGamesPreferences, setIsSavingRegisteredGamesPreferences] = useState(false);
  const [registeredGamesStatus, setRegisteredGamesStatus] = useState<string | null>(null);
  const [detectedRegisteredGames, setDetectedRegisteredGames] = useState<RegisteredConnectionGame[]>([]);
  const [runningApps, setRunningApps] = useState<RunningAppEntry[]>([]);
  const [selectedRunningAppId, setSelectedRunningAppId] = useState("");
  const [isLoadingRunningApps, setIsLoadingRunningApps] = useState(false);
  const [registeredGamesProviderStates, setRegisteredGamesProviderStates] = useState<
    Record<string, RegisteredGamesProviderState>
  >({});
  const [isLoadingDetectedRegisteredGames, setIsLoadingDetectedRegisteredGames] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    ...defaultNotificationPreferences,
  });
  const [isSavingNotificationPreferences, setIsSavingNotificationPreferences] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<string | null>(null);
  const [textImagesPreferences, setTextImagesPreferences] = useState<TextImagesPreferences>({
    ...defaultTextImagesPreferences,
  });
  const [isSavingTextImagesPreferences, setIsSavingTextImagesPreferences] = useState(false);
  const [textImagesStatus, setTextImagesStatus] = useState<string | null>(null);
  const [accessibilityPreferences, setAccessibilityPreferences] = useState<AccessibilityPreferences>({
    ...defaultAccessibilityPreferences,
  });
  const [isSavingAccessibilityPreferences, setIsSavingAccessibilityPreferences] = useState(false);
  const [accessibilityStatus, setAccessibilityStatus] = useState<string | null>(null);
  const [emojiPreferences, setEmojiPreferences] = useState<EmojiPreferences>({
    ...defaultEmojiPreferences,
  });
  const [emojiUploadDraftUrl, setEmojiUploadDraftUrl] = useState("");
  const [emojiFavoritesInput, setEmojiFavoritesInput] = useState(defaultEmojiPreferences.favoriteEmojis.join(" "));
  const [isSavingEmojiPreferences, setIsSavingEmojiPreferences] = useState(false);
  const [emojiStatus, setEmojiStatus] = useState<string | null>(null);
  const [stickerPreferences, setStickerPreferences] = useState<StickerPreferences>({
    ...defaultStickerPreferences,
  });
  const [stickerUploadDraftUrl, setStickerUploadDraftUrl] = useState("");
  const [stickerFavoritesInput, setStickerFavoritesInput] = useState("");
  const [isSavingStickerPreferences, setIsSavingStickerPreferences] = useState(false);
  const [stickerStatus, setStickerStatus] = useState<string | null>(null);
  const [keybindPreferences, setKeybindPreferences] = useState<KeybindPreferences>({
    ...defaultKeybindPreferences,
  });
  const [isSavingKeybindPreferences, setIsSavingKeybindPreferences] = useState(false);
  const [keybindStatus, setKeybindStatus] = useState<string | null>(null);
  const [advancedPreferences, setAdvancedPreferences] = useState<AdvancedPreferences>({
    ...defaultAdvancedPreferences,
  });
  const [isSavingAdvancedPreferences, setIsSavingAdvancedPreferences] = useState(false);
  const [advancedStatus, setAdvancedStatus] = useState<string | null>(null);
  const [streamerModePreferences, setStreamerModePreferences] = useState<StreamerModePreferences>({
    ...defaultStreamerModePreferences,
  });
  const [isSavingStreamerModePreferences, setIsSavingStreamerModePreferences] = useState(false);
  const [streamerModeStatus, setStreamerModeStatus] = useState<string | null>(null);
  const [gameOverlayPreferences, setGameOverlayPreferences] = useState<GameOverlayPreferences>({
    ...defaultGameOverlayPreferences,
  });
  const [isSavingGameOverlayPreferences, setIsSavingGameOverlayPreferences] = useState(false);
  const [gameOverlayStatus, setGameOverlayStatus] = useState<string | null>(null);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [isVoiceDeafened, setIsVoiceDeafened] = useState(false);
  const [isVoiceSessionActive, setIsVoiceSessionActive] = useState(false);
  const [isVoiceVideoSession, setIsVoiceVideoSession] = useState(false);
  const [isVoiceCameraOn, setIsVoiceCameraOn] = useState(false);
  const [isPmVideoSessionActive, setIsPmVideoSessionActive] = useState(false);
  const [isPmCameraOn, setIsPmCameraOn] = useState(false);
  const [familyCenterPreferences, setFamilyCenterPreferences] = useState<FamilyCenterPreferences>({
    ...defaultFamilyCenterPreferences,
  });
  const [familyCenterSnapshot, setFamilyCenterSnapshot] = useState<FamilyCenterPreferences>({
    ...defaultFamilyCenterPreferences,
  });
  const [businessCenterSnapshot, setBusinessCenterSnapshot] = useState<FamilyCenterPreferences>({
    ...defaultFamilyCenterPreferences,
  });
  const [schoolCenterSnapshot, setSchoolCenterSnapshot] = useState<FamilyCenterPreferences>({
    ...defaultFamilyCenterPreferences,
  });
  const [isSavingFamilyCenterPreferences, setIsSavingFamilyCenterPreferences] = useState(false);
  const [familyCenterStatus, setFamilyCenterStatus] = useState<string | null>(null);
  const [familyMemberNameInput, setFamilyMemberNameInput] = useState("");
  const [familyMemberAccountInput, setFamilyMemberAccountInput] = useState("");
  const [familyMemberRelationInput, setFamilyMemberRelationInput] = useState<string>("");
  const [familyMemberSectionInput, setFamilyMemberSectionInput] = useState<string>("");
  const [familyMemberEmailInput, setFamilyMemberEmailInput] = useState("");
  const [familyMemberPasswordInput, setFamilyMemberPasswordInput] = useState("");
  const [familyMemberRepeatPasswordInput, setFamilyMemberRepeatPasswordInput] = useState("");
  const [authenticatorAppStatus, setAuthenticatorAppStatus] = useState<AuthenticatorAppStatus>({
    ...defaultAuthenticatorAppStatus,
  });
  const [authenticatorSetupSecret, setAuthenticatorSetupSecret] = useState("");
  const [authenticatorSetupUri, setAuthenticatorSetupUri] = useState("");
  const [authenticatorCodeInput, setAuthenticatorCodeInput] = useState("");
  const [authenticatorAppMessage, setAuthenticatorAppMessage] = useState<string | null>(null);
  const [isAuthenticatorAppBusy, setIsAuthenticatorAppBusy] = useState(false);
  const [isAuthenticatorAppModalOpen, setIsAuthenticatorAppModalOpen] = useState(false);
  const [isSecurityKeyModalOpen, setIsSecurityKeyModalOpen] = useState(false);
  const [securityKeys, setSecurityKeys] = useState<SecurityKeyItem[]>([]);
  const [isSecurityKeyBusy, setIsSecurityKeyBusy] = useState(false);
  const [securityKeyMessage, setSecurityKeyMessage] = useState<string | null>(null);
  const [isSmsModalOpen, setIsSmsModalOpen] = useState(false);
  const [smsAuthStatus, setSmsAuthStatus] = useState<SmsAuthStatus>({ ...defaultSmsAuthStatus });
  const [smsPhoneInput, setSmsPhoneInput] = useState("");
  const [smsCodeInput, setSmsCodeInput] = useState("");
  const [isSmsBusy, setIsSmsBusy] = useState(false);
  const [smsMessage, setSmsMessage] = useState<string | null>(null);

  useEffect(() => {
    const applyVoiceState = (detail?: VoiceStateSyncDetail | null) => {
      if (!detail) {
        return;
      }

      if (typeof detail.active === "boolean") {
        setIsVoiceSessionActive(detail.active);
      }

      if (typeof detail.isMuted === "boolean") {
        setIsVoiceMuted(detail.isMuted);
      }

      if (typeof detail.isDeafened === "boolean") {
        setIsVoiceDeafened(detail.isDeafened);
      }

      if (typeof detail.isVideoChannel === "boolean") {
        setIsVoiceVideoSession(detail.isVideoChannel);
      }

      if (typeof detail.isCameraOn === "boolean") {
        setIsVoiceCameraOn(detail.isCameraOn);
      }
    };

    applyVoiceState(getCachedVoiceState());

    const onVoiceStateSync = (event: Event) => {
      applyVoiceState((event as CustomEvent<VoiceStateSyncDetail>).detail);
    };

    const onPmCameraStateSync = (event: Event) => {
      const customEvent = event as CustomEvent<{
        active?: boolean;
        isCameraOn?: boolean;
      }>;

      if (typeof customEvent.detail?.active === "boolean") {
        setIsPmVideoSessionActive(customEvent.detail.active);
      }

      if (typeof customEvent.detail?.isCameraOn === "boolean") {
        setIsPmCameraOn(customEvent.detail.isCameraOn);
      }
    };

    window.addEventListener(VOICE_STATE_SYNC_EVENT, onVoiceStateSync as EventListener);
    window.addEventListener(PM_CAMERA_STATE_SYNC_EVENT, onPmCameraStateSync as EventListener);

    return () => {
      window.removeEventListener(VOICE_STATE_SYNC_EVENT, onVoiceStateSync as EventListener);
      window.removeEventListener(PM_CAMERA_STATE_SYNC_EVENT, onPmCameraStateSync as EventListener);
    };
  }, []);
  const [familyMemberPhoneInput, setFamilyMemberPhoneInput] = useState("");
  const [familyMemberDateOfBirthInput, setFamilyMemberDateOfBirthInput] = useState("");
  const [familyApplicationSectionInput, setFamilyApplicationSectionInput] = useState<string>("");
  const [isCreatingFamilyMemberAccount, setIsCreatingFamilyMemberAccount] = useState(false);
  const [isConvertingFamilyMemberUserId, setIsConvertingFamilyMemberUserId] = useState<string | null>(null);
  const [familyMemberLifecycleByUserId, setFamilyMemberLifecycleByUserId] = useState<Record<string, FamilyMemberLifecycle>>({});
  const [familyDesignationInput, setFamilyDesignationInput] = useState<string>("");
  const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState("");
  const [languagePreference, setLanguagePreference] = useState<string>("system");
  const [isSavingLanguagePreference, setIsSavingLanguagePreference] = useState(false);
  const [languagePreferenceStatus, setLanguagePreferenceStatus] = useState<string | null>(null);
  const [deviceSessions, setDeviceSessions] = useState<DeviceSession[]>([]);
  const [isLoadingDeviceSessions, setIsLoadingDeviceSessions] = useState(false);
  const [deviceSessionActionPending, setDeviceSessionActionPending] = useState<string | null>(null);
  const [devicesStatus, setDevicesStatus] = useState<string | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<string[]>([]);
  const [connectionProviderAvailability, setConnectionProviderAvailability] = useState<Record<string, boolean>>({});
  const [connectionProviderOAuthSupport, setConnectionProviderOAuthSupport] = useState<Record<string, boolean>>({});
  const [isSavingConnectionProvider, setIsSavingConnectionProvider] = useState<string | null>(null);
  const [connectionsStatus, setConnectionsStatus] = useState<string | null>(null);
  const [bugTitle, setBugTitle] = useState("");
  const [bugCategory, setBugCategory] = useState("general");
  const [bugSeverity, setBugSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [bugSteps, setBugSteps] = useState("");
  const [bugExpected, setBugExpected] = useState("");
  const [bugActual, setBugActual] = useState("");
  const [isSubmittingBugReport, setIsSubmittingBugReport] = useState(false);
  const [bugReportStatus, setBugReportStatus] = useState<string | null>(null);
  const [patronageType, setPatronageType] = useState<"ONE_TIME" | "MONTHLY">("ONE_TIME");
  const [patronageAmount, setPatronageAmount] = useState("");
  const [patronageNote, setPatronageNote] = useState("");
  const [patronagePayerName, setPatronagePayerName] = useState("");
  const [patronagePayerEmail, setPatronagePayerEmail] = useState("");
  const [isSubmittingPatronage, setIsSubmittingPatronage] = useState(false);
  const [isCancellingPatronage, setIsCancellingPatronage] = useState(false);
  const [isLoadingPatronageHistory, setIsLoadingPatronageHistory] = useState(false);
  const [patronageStatus, setPatronageStatus] = useState<string | null>(null);
  const [patronageHistory, setPatronageHistory] = useState<PatronageHistoryEntry[]>([]);
  const [pendingPatronageCheckoutUrl, setPendingPatronageCheckoutUrl] = useState<string | null>(null);
  const [isPatronagePaymentPanelOpen, setIsPatronagePaymentPanelOpen] = useState(false);
  const [isPreparingPatronageIntent, setIsPreparingPatronageIntent] = useState(false);
  const [patronageIntentClientSecret, setPatronageIntentClientSecret] = useState<string | null>(null);
  const [patronageStripePublishableKey, setPatronageStripePublishableKey] = useState<string | null>(null);
  const [patronagePaymentPanelStatus, setPatronagePaymentPanelStatus] = useState<string | null>(null);
  const [pendingPatronageRequest, setPendingPatronageRequest] = useState<{
    donationType: "ONE_TIME" | "MONTHLY";
    amountCents: number;
    currency: string;
    payerName: string;
    payerEmail: string;
    note: string | null;
  } | null>(null);
  const [OtherApps, setOtherApps] = useState<OtherAppConfig[]>([]);
  const [OtherBots, setOtherBots] = useState<OtherBotConfig[]>([]);
  const [OtherBotAutoImportOnSave, setOtherBotAutoImportOnSave] = useState(true);
  const [botGhostIntegration, setBotGhostIntegration] = useState<BotGhostIntegrationConfig>({
    ...defaultBotGhostIntegration,
  });
  const [isSavingOtherConfigs, setIsSavingOtherConfigs] = useState(false);
  const [OtherConfigsStatus, setOtherConfigsStatus] = useState<string | null>(null);
  const [ownedServerTags, setOwnedServerTags] = useState<OwnedServerTag[]>([]);
  const [memberServerTags, setMemberServerTags] = useState<MemberServerTag[]>([]);
  const [memberProfileServers, setMemberProfileServers] = useState<MemberServerProfileOption[]>([]);
  const [selectedProfileSettingsServerId, setSelectedProfileSettingsServerId] = useState<string>("");
  const [serverProfileNameInput, setServerProfileNameInput] = useState("");
  const [serverProfileNameStyleInput, setServerProfileNameStyleInput] = useState<string>("");
  const [serverProfileNameFontInput, setServerProfileNameFontInput] = useState<ProfileNameFontKey>("default");
  const [serverProfileNameEffectInput, setServerProfileNameEffectInput] = useState<ProfileNameEffectKey>("solid");
  const [serverProfileNameColorInput, setServerProfileNameColorInput] = useState<ProfileNameColorKey>("default");
  const [serverProfileCommentInput, setServerProfileCommentInput] = useState("");
  const [serverProfileNameplateLabelInput, setServerProfileNameplateLabelInput] = useState("");
  const [serverProfileNameplateColorInput, setServerProfileNameplateColorInput] = useState("");
  const [serverProfileNameplateImageUrlInput, setServerProfileNameplateImageUrlInput] = useState("");
  const [serverProfileImageInput, setServerProfileImageInput] = useState("");
  const [serverProfileAvatarDecorationInput, setServerProfileAvatarDecorationInput] = useState("");
  const [serverProfileEffectInput, setServerProfileEffectInput] = useState("");
  const [serverProfileBannerInput, setServerProfileBannerInput] = useState("");
  const [isLoadingServerProfiles, setIsLoadingServerProfiles] = useState(false);
  const [isSavingServerProfile, setIsSavingServerProfile] = useState(false);
  const [serverProfileStatus, setServerProfileStatus] = useState<string | null>(null);
  const [selectedOwnedServerId, setSelectedOwnedServerId] = useState<string>("");
  const [selectedProfileServerId, setSelectedProfileServerId] = useState<string>("");
  const [ownerTagCodeInput, setOwnerTagCodeInput] = useState("");
  const [ownerTagIconKey, setOwnerTagIconKey] = useState<string>("bolt");
  const [serverTagIconOptions, setServerTagIconOptions] = useState<ServerTagIconOption[]>([]);
  const [serverTagsStatus, setServerTagsStatus] = useState<string | null>(null);
  const [isSavingServerTags, setIsSavingServerTags] = useState(false);
  const [isLoadingServerTags, setIsLoadingServerTags] = useState(false);
  const [customCss, setCustomCss] = useState("");
  const [customCssStatus, setCustomCssStatus] = useState<string | null>(null);
  const [isCustomCssEditorOpen, setIsCustomCssEditorOpen] = useState(false);
  const [isDefaultProfileNameStylesPanelOpen, setIsDefaultProfileNameStylesPanelOpen] = useState(false);
  const [isServerProfileNameStylesPanelOpen, setIsServerProfileNameStylesPanelOpen] = useState(false);
  const [isAvatarPanelOpen, setIsAvatarPanelOpen] = useState(false);
  const [isAvatarDecorationPanelOpen, setIsAvatarDecorationPanelOpen] = useState(false);
  const [isProfileEffectPanelOpen, setIsProfileEffectPanelOpen] = useState(false);
  const [isNameplatePanelOpen, setIsNameplatePanelOpen] = useState(false);
  const [isDefaultBannerPanelOpen, setIsDefaultBannerPanelOpen] = useState(false);
  const [isServerBannerPanelOpen, setIsServerBannerPanelOpen] = useState(false);
  const [isServerNameplatePanelOpen, setIsServerNameplatePanelOpen] = useState(false);
  const [isServerAvatarPanelOpen, setIsServerAvatarPanelOpen] = useState(false);
  const [isServerAvatarDecorationPanelOpen, setIsServerAvatarDecorationPanelOpen] = useState(false);
  const [isServerProfileEffectPanelOpen, setIsServerProfileEffectPanelOpen] = useState(false);
  const [isPluginsInstalledPanelOpen, setIsPluginsInstalledPanelOpen] = useState(false);
  const [isDownloadedPluginsPanelOpen, setIsDownloadedPluginsPanelOpen] = useState(false);
  const [isPluginUploadsPanelOpen, setIsPluginUploadsPanelOpen] = useState(false);
  const [isFamilyAccountApplyPanelOpen, setIsFamilyAccountApplyPanelOpen] = useState(false);
  const [isFamilyAccountVerificationPanelOpen, setIsFamilyAccountVerificationPanelOpen] = useState(false);
  const [isRemovingFamilyAccount, setIsRemovingFamilyAccount] = useState(false);
  const [familyVerificationFiles, setFamilyVerificationFiles] = useState<File[]>([]);
  const [familyVerificationUploadStatus, setFamilyVerificationUploadStatus] = useState<string | null>(null);
  const [familyApplicationStatus, setFamilyApplicationStatus] = useState<string | null>(null);
  const [downloadedPlugins, setDownloadedPlugins] = useState<string[]>([]);
  const [blockedProfiles, setBlockedProfiles] = useState<BlockedProfileSummary[]>([]);
  const [isLoadingBlockedProfiles, setIsLoadingBlockedProfiles] = useState(false);
  const [blockedProfilesError, setBlockedProfilesError] = useState<string | null>(null);
  const [unblockingProfileId, setUnblockingProfileId] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const avatarPanelInputRef = useRef<HTMLInputElement | null>(null);
  const serverAvatarPanelInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const serverBannerInputRef = useRef<HTMLInputElement | null>(null);
  const nameplateImageInputRef = useRef<HTMLInputElement | null>(null);
  const serverNameplateImageInputRef = useRef<HTMLInputElement | null>(null);
  const familyVerificationFileInputRef = useRef<HTMLInputElement | null>(null);

  const isModalOpen = isOpen && type === "settings";
  const patronageStripePromise = useMemo(
    () => (patronageStripePublishableKey ? loadStripe(patronageStripePublishableKey) : null),
    [patronageStripePublishableKey]
  );
  const patronageElementsOptions = useMemo<StripeElementsOptions | undefined>(() => {
    if (!patronageIntentClientSecret) {
      return undefined;
    }

    return {
      clientSecret: patronageIntentClientSecret,
      appearance: {
        theme: "night",
      },
    };
  }, [patronageIntentClientSecret]);

  const familyMemberPasswordStrength = useMemo(
    () => getPasswordStrength(familyMemberPasswordInput),
    [familyMemberPasswordInput]
  );

  const familyMemberRepeatPasswordStrength = useMemo(
    () => getPasswordStrength(familyMemberRepeatPasswordInput),
    [familyMemberRepeatPasswordInput]
  );

  const installedPluginsCount = useMemo(() => downloadedPlugins.length, [downloadedPlugins.length]);

  const installedPluginsCountLabel = useMemo(
    () => installedPluginsCount.toString().padStart(2, "0"),
    [installedPluginsCount]
  );

  const hasFamilyCenterAccess = useMemo(() => {
    const role = profileRole ?? data.profileRole;
    return isInAccordAdministrator(role) || isInAccordParent(role);
  }, [data.profileRole, profileRole]);
  const isSchoolCenterSection = displaySection === "schoolCenter";
  const isBusinessCenterSection = displaySection === "businessCenter";
  const centerLabel = isBusinessCenterSection ? "Business" : isSchoolCenterSection ? "School" : "Family";
  const centerLabelLower = centerLabel.toLowerCase();
  const isFamilyCenterEditable = hasFamilyCenterAccess;
  const isFamilyApplicationApproved = useMemo(
    () => /approved|aproved/i.test(String(familyApplicationStatus ?? "")),
    [familyApplicationStatus]
  );
  const formattedFamilyApplicationStatus = useMemo(() => {
    const source = String(familyApplicationStatus ?? "").trim();
    if (!source) {
      return "";
    }

    return source
      .replace(/\bAproved\b/gi, "Approved")
      .replace(/\bDenid\b/gi, "Denied");
  }, [familyApplicationStatus]);

  const normalizeCenterDesignationInput = useCallback(
    (value: string, isBusinessCenter: boolean) => {
      const options = isBusinessCenter ? businessRoleOptions : familyDesignationOptions;
      return options.some((option) => option === value) ? value : "";
    },
    []
  );

  const visibleSectionGroups = useMemo<SectionGroup[]>(() => {
    return sectionGroups;
  }, []);

  const sections = useMemo<SettingsSection[]>(() => sectionGroups.flatMap((group) => group.sections), []);

  useEffect(() => {
    if (displaySection === "businessCenter") {
      setFamilyCenterPreferences(businessCenterSnapshot);
      setFamilyApplicationStatus(businessCenterSnapshot.familyApplicationStatus || null);
      setFamilyDesignationInput(normalizeCenterDesignationInput(businessCenterSnapshot.familyDesignation, true));
      return;
    }

    if (displaySection === "schoolCenter") {
      setFamilyCenterPreferences(schoolCenterSnapshot);
      setFamilyApplicationStatus(schoolCenterSnapshot.familyApplicationStatus || null);
      setFamilyDesignationInput(normalizeCenterDesignationInput(schoolCenterSnapshot.familyDesignation, false));
      return;
    }

    if (displaySection === "familyCenter") {
      setFamilyCenterPreferences(familyCenterSnapshot);
      setFamilyApplicationStatus(familyCenterSnapshot.familyApplicationStatus || null);
      setFamilyDesignationInput(normalizeCenterDesignationInput(familyCenterSnapshot.familyDesignation, false));
    }
  }, [businessCenterSnapshot, displaySection, familyCenterSnapshot, normalizeCenterDesignationInput, schoolCenterSnapshot]);

  const bannerHistoryStorageKey = useMemo(() => {
    const scopeId = String(data.profileId ?? resolvedProfileId ?? "anonymous").trim() || "anonymous";
    return `inaccord:banner-history:${scopeId}`;
  }, [data.profileId, resolvedProfileId]);

  const avatarHistoryStorageKey = useMemo(() => {
    const scopeId = String(data.profileId ?? resolvedProfileId ?? "anonymous").trim() || "anonymous";
    return `inaccord:avatar-history:${scopeId}`;
  }, [data.profileId, resolvedProfileId]);

  const rememberUploadedAvatar = useCallback((url?: string | null) => {
    const normalized = String(url ?? "").trim();
    if (!normalized) {
      return;
    }

    setUploadedAvatarThumbnails((prev) => {
      const next = [normalized, ...prev.filter((item) => item !== normalized)].slice(0, 16);

      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(avatarHistoryStorageKey, JSON.stringify(next));
        }
      } catch {
        // ignore storage failures
      }

      void axios.patch("/api/profile/preferences", {
        avatarUploads: next,
      }).catch(() => {
        // ignore preference persistence failures
      });

      return next;
    });
  }, [avatarHistoryStorageKey]);

  const rememberUploadedBanner = useCallback((url?: string | null) => {
    const normalized = String(url ?? "").trim();
    if (!normalized) {
      return;
    }

    setUploadedBannerThumbnails((prev) => {
      const next = [normalized, ...prev.filter((item) => item !== normalized)].slice(0, 16);

      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(bannerHistoryStorageKey, JSON.stringify(next));
        }
      } catch {
        // ignore storage failures
      }

      void axios.patch("/api/profile/preferences", {
        bannerUploads: next,
      }).catch(() => {
        // ignore preference persistence failures
      });

      return next;
    });
  }, [bannerHistoryStorageKey]);

  const normalizeOwnerTagCode = (value: string) => value.trim().toUpperCase();

  useEffect(() => {
    setAvatarUrl(data.profileImageUrl ?? null);
  }, [data.profileImageUrl]);

  useEffect(() => {
    const initialDecoration = (data as { profileAvatarDecorationUrl?: string | null }).profileAvatarDecorationUrl ?? null;
    setAvatarDecorationUrl(initialDecoration);
    setAvatarDecorationInput(initialDecoration ?? "");
  }, [data]);

  useEffect(() => {
    const initialProfileEffect = (data as { profileEffectUrl?: string | null }).profileEffectUrl ?? null;
    setProfileEffectUrl(initialProfileEffect);
    setProfileEffectInput(initialProfileEffect ?? "");
  }, [data]);

  useEffect(() => {
    const initialNameplateLabel = (data as { profileNameplateLabel?: string | null }).profileNameplateLabel ?? "";
    const initialNameplateColor = (data as { profileNameplateColor?: string | null }).profileNameplateColor ?? "";
    const initialNameplateImageUrl = (data as { profileNameplateImageUrl?: string | null }).profileNameplateImageUrl ?? null;
    setNameplateLabel(initialNameplateLabel);
    setNameplateColor(initialNameplateColor || "");
    setNameplateImageUrl(initialNameplateImageUrl);
    setNameplateLabelInput(initialNameplateLabel);
    setNameplateColorInput(initialNameplateColor || "");
    setNameplateImageUrlInput(initialNameplateImageUrl ?? "");
    setNameplateStatus(null);
  }, [data]);

  useEffect(() => {
    setBannerUrl(data.profileBannerUrl ?? null);
  }, [data.profileBannerUrl]);

  useEffect(() => {
    const normalized = String(avatarUrl ?? "").trim();
    if (!normalized) {
      return;
    }

    setUploadedAvatarThumbnails((prev) =>
      prev.includes(normalized) ? prev : [normalized, ...prev].slice(0, 16)
    );
  }, [avatarUrl]);

  useEffect(() => {
    const normalized = String(bannerUrl ?? "").trim();
    if (!normalized) {
      return;
    }

    setUploadedBannerThumbnails((prev) =>
      prev.includes(normalized) ? prev : [normalized, ...prev].slice(0, 16)
    );
  }, [bannerUrl]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(bannerHistoryStorageKey);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      const normalized = Array.isArray(parsed)
        ? parsed
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
            .slice(0, 16)
        : [];

      setUploadedBannerThumbnails((prev) => {
        const merged = [...prev, ...normalized]
          .filter((value, index, arr) => arr.indexOf(value) === index)
          .slice(0, 16);
        return merged;
      });
    } catch {
      // ignore local storage failures
    }
  }, [bannerHistoryStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(avatarHistoryStorageKey);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      const normalized = Array.isArray(parsed)
        ? parsed
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
            .slice(0, 16)
        : [];

      setUploadedAvatarThumbnails((prev) => {
        const merged = [...prev, ...normalized]
          .filter((value, index, arr) => arr.indexOf(value) === index)
          .slice(0, 16);
        return merged;
      });
    } catch {
      // ignore local storage failures
    }
  }, [avatarHistoryStorageKey]);

  useEffect(() => {
    setRealName(data.profileRealName ?? "");
    setProfileName("");
    setDefaultProfileNameDraft("");
    setPronouns("");
    setComment("");
    setNameplateLabel("");
    setNameplateColor("#5865f2");
    setNameplateLabelInput("");
    setNameplateColorInput("#5865f2");
    setNameplateStatus(null);
    setAvatarDecorationUrl(null);
    setAvatarDecorationInput("");
    setAvatarDecorationStatus(null);
    setProfileEffectUrl(null);
    setProfileEffectInput("");
    setProfileEffectStatus(null);
    setPronounsDraft("");
    setIsEditingPronounsInline(false);
    setCommentDraft("");
    setIsEditingCommentInline(false);
    setPhoneNumber("");
    setPhoneNumberDraft("");
    setIsEditingPhoneNumberInline(false);
    setDateOfBirth("");
    setDateOfBirthDraft("");
    setProfileRole(data.profileRole ?? null);
    setProfilePresenceStatus(normalizePresenceStatus(data.profilePresenceStatus));
    setProfileCurrentGame(data.profileCurrentGame?.trim() || null);
    setProfileNameError(null);
    setProfileNameSuccess(null);
    setPronounsStatus(null);
    setCommentStatus(null);
    setPhoneNumberStatus(null);
    setDateOfBirthStatus(null);
  }, [data.profileCurrentGame, data.profileName, data.profilePresenceStatus, data.profileRealName, data.profileRole, isModalOpen]);

  useEffect(() => {
    setResolvedProfileId(data.profileId ?? null);
  }, [data.profileId]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    let cancelled = false;

    const hydratePreferences = async () => {
      try {
        const response = await axios.get<{
          mentionsEnabled?: boolean;
          notifications?: unknown;
          textImages?: unknown;
          accessibility?: unknown;
          emoji?: unknown;
          stickers?: unknown;
          keybinds?: unknown;
          advanced?: unknown;
          streamerMode?: unknown;
          gameOverlay?: unknown;
          contentSocial?: unknown;
          dataPrivacy?: unknown;
          activityPrivacy?: unknown;
          registeredGames?: unknown;
          familyCenter?: unknown;
          businessCenter?: unknown;
          schoolCenter?: unknown;
          languagePreference?: string;
          connectedAccounts?: unknown;
          OtherApps?: unknown;
          OtherBots?: unknown;
          OtherBotAutoImportOnSave?: boolean;
          botGhost?: unknown;
          customCss?: string;
          customThemeColors?: Partial<CustomThemeColors> | null;
          downloadedPlugins?: unknown;
          bannerUploads?: unknown;
          avatarUploads?: unknown;
        }>("/api/profile/preferences");

        if (cancelled) {
          return;
        }

        const mentions = response.data?.mentionsEnabled !== false;
        const hydratedContentSocial = normalizeContentSocialPreferences(response.data?.contentSocial);
        const hydratedDataPrivacy = normalizeDataPrivacyPreferences(response.data?.dataPrivacy);
        const hydratedActivityPrivacy = normalizeActivityPrivacyPreferences(response.data?.activityPrivacy);
        const hydratedRegisteredGames = normalizeRegisteredGamesPreferences(response.data?.registeredGames);
        const hydratedNotifications = normalizeNotificationPreferences(response.data?.notifications);
        const hydratedTextImages = normalizeTextImagesPreferences(response.data?.textImages);
        const hydratedAccessibility = normalizeAccessibilityPreferences(response.data?.accessibility);
        const hydratedEmoji = normalizeEmojiPreferences(response.data?.emoji);
        const hydratedStickers = normalizeStickerPreferences(response.data?.stickers);
        const hydratedKeybinds = normalizeKeybindPreferences(response.data?.keybinds);
        const hydratedAdvanced = normalizeAdvancedPreferences(response.data?.advanced);
        const hydratedStreamerMode = normalizeStreamerModePreferences(response.data?.streamerMode);
        const hydratedGameOverlay = normalizeGameOverlayPreferences(response.data?.gameOverlay);
        const hydratedBotGhost = normalizeBotGhostIntegration(response.data?.botGhost);
        const hydratedFamilyCenter = normalizeFamilyCenterPreferences(response.data?.familyCenter);
        const hydratedBusinessCenter = normalizeBusinessCenterPreferences(response.data?.businessCenter);
        const hydratedSchoolCenter = normalizeFamilyCenterPreferences(response.data?.schoolCenter);
        const language =
          typeof response.data?.languagePreference === "string" &&
          languageOptions.some((option) => option.value === response.data.languagePreference)
            ? response.data.languagePreference
            : "system";
        const css = typeof response.data?.customCss === "string" ? response.data.customCss : "";
        const linked = Array.isArray(response.data?.connectedAccounts)
          ? response.data.connectedAccounts
              .filter((value): value is string => typeof value === "string")
              .map((value) => value.trim().toLowerCase())
              .filter((value) => connectionProviders.some((provider) => provider.key === value))
          : [];
        const plugins = Array.isArray(response.data?.downloadedPlugins)
          ? response.data.downloadedPlugins.filter(
              (value): value is string => typeof value === "string" && value.trim().length > 0
            )
          : [];
        const persistedBannerUploads = Array.isArray(response.data?.bannerUploads)
          ? response.data.bannerUploads
              .filter((value): value is string => typeof value === "string")
              .map((value) => value.trim())
              .filter((value) => value.length > 0)
              .slice(0, 16)
          : [];
        const persistedAvatarUploads = Array.isArray(response.data?.avatarUploads)
          ? response.data.avatarUploads
              .filter((value): value is string => typeof value === "string")
              .map((value) => value.trim())
              .filter((value) => value.length > 0)
              .slice(0, 16)
          : [];
        writeMentionsEnabled(mentions);
        setMentionsEnabled(mentions);
        setContentSocialPreferences(hydratedContentSocial);
        setContentSocialStatus(null);
        setDataPrivacyPreferences(hydratedDataPrivacy);
        setDataPrivacyStatus(null);
        setActivityPrivacyPreferences(hydratedActivityPrivacy);
        setActivityPrivacyStatus(null);
        setRegisteredGamesPreferences(hydratedRegisteredGames);
        setRegisteredGamesStatus(null);
        setManualGameNameInput("");
        setManualGameProviderInput("manual");
        setManualGameDescriptionInput("");
        setManualGameThumbnailInput("");
        setNotificationPreferences(hydratedNotifications);
        setNotificationStatus(null);
        setTextImagesPreferences(hydratedTextImages);
        setTextImagesStatus(null);
        setAccessibilityPreferences(hydratedAccessibility);
        setAccessibilityStatus(null);
        setEmojiPreferences(hydratedEmoji);
        setEmojiUploadDraftUrl("");
        setEmojiFavoritesInput(hydratedEmoji.favoriteEmojis.join(" "));
        setEmojiStatus(null);
        setStickerPreferences(hydratedStickers);
        setStickerUploadDraftUrl("");
        setStickerFavoritesInput(hydratedStickers.favoriteStickers.join("\n"));
        setStickerStatus(null);
        setKeybindPreferences(hydratedKeybinds);
        setKeybindStatus(null);
        setAdvancedPreferences(hydratedAdvanced);
        setAdvancedStatus(null);
        setStreamerModePreferences(hydratedStreamerMode);
        setStreamerModeStatus(null);
        setGameOverlayPreferences(hydratedGameOverlay);
        setGameOverlayStatus(null);
        applyAccessibilityPreferencesToDocument(hydratedAccessibility);
        setFamilyCenterPreferences(hydratedFamilyCenter);
        setFamilyCenterSnapshot(hydratedFamilyCenter);
        setBusinessCenterSnapshot(hydratedBusinessCenter);
        setSchoolCenterSnapshot(hydratedSchoolCenter);
        setFamilyDesignationInput(normalizeCenterDesignationInput(hydratedFamilyCenter.familyDesignation, false));
        setFamilyApplicationStatus(hydratedFamilyCenter.familyApplicationStatus || null);
        setFamilyCenterStatus(null);
        setLanguagePreference(language);
        setLanguagePreferenceStatus(null);
        setConnectedAccounts(Array.from(new Set(linked)));
        setConnectionProviderAvailability({});
        setConnectionProviderOAuthSupport({});
        setConnectionsStatus(null);
        setOtherApps(
          Array.isArray(response.data?.OtherApps)
            ? (response.data.OtherApps as OtherAppConfig[])
            : []
        );
        setOtherBots(
          Array.isArray(response.data?.OtherBots)
            ? (response.data.OtherBots as OtherBotConfig[])
            : []
        );
        setOtherBotAutoImportOnSave(response.data?.OtherBotAutoImportOnSave !== false);
        setBotGhostIntegration(hydratedBotGhost);
        setOtherConfigsStatus(null);
        setCustomCss(css);
        setDownloadedPlugins(plugins);
        setUploadedBannerThumbnails((prev) => {
          const merged = [...persistedBannerUploads, ...prev]
            .filter((value, index, arr) => arr.indexOf(value) === index)
            .slice(0, 16);
          return merged;
        });
        setUploadedAvatarThumbnails((prev) => {
          const merged = [...persistedAvatarUploads, ...prev]
            .filter((value, index, arr) => arr.indexOf(value) === index)
            .slice(0, 16);
          return merged;
        });
        applyCustomCss(css);
      } catch {
        if (cancelled) {
          return;
        }

        writeMentionsEnabled(true);
        setMentionsEnabled(true);
        setContentSocialPreferences({ ...defaultContentSocialPreferences });
        setContentSocialStatus(null);
        setDataPrivacyPreferences({ ...defaultDataPrivacyPreferences });
        setDataPrivacyStatus(null);
        setActivityPrivacyPreferences({ ...defaultActivityPrivacyPreferences });
        setActivityPrivacyStatus(null);
        setRegisteredGamesPreferences({ ...defaultRegisteredGamesPreferences });
        setRegisteredGamesStatus(null);
        setManualGameNameInput("");
        setManualGameProviderInput("manual");
        setManualGameDescriptionInput("");
        setManualGameThumbnailInput("");
        setNotificationPreferences({ ...defaultNotificationPreferences });
        setNotificationStatus(null);
        setTextImagesPreferences({ ...defaultTextImagesPreferences });
        setTextImagesStatus(null);
        setAccessibilityPreferences({ ...defaultAccessibilityPreferences });
        setAccessibilityStatus(null);
        setEmojiPreferences({ ...defaultEmojiPreferences });
        setEmojiUploadDraftUrl("");
        setEmojiFavoritesInput(defaultEmojiPreferences.favoriteEmojis.join(" "));
        setEmojiStatus(null);
        setStickerPreferences({ ...defaultStickerPreferences });
        setStickerUploadDraftUrl("");
        setStickerFavoritesInput("");
        setStickerStatus(null);
        setKeybindPreferences({ ...defaultKeybindPreferences });
        setKeybindStatus(null);
        setAdvancedPreferences({ ...defaultAdvancedPreferences });
        setAdvancedStatus(null);
        setStreamerModePreferences({ ...defaultStreamerModePreferences });
        setStreamerModeStatus(null);
        setGameOverlayPreferences({ ...defaultGameOverlayPreferences });
        setGameOverlayStatus(null);
        applyAccessibilityPreferencesToDocument(defaultAccessibilityPreferences);
        setFamilyCenterPreferences({ ...defaultFamilyCenterPreferences });
        setFamilyCenterSnapshot({ ...defaultFamilyCenterPreferences });
        setBusinessCenterSnapshot({ ...defaultFamilyCenterPreferences });
        setSchoolCenterSnapshot({ ...defaultFamilyCenterPreferences });
        setFamilyCenterStatus(null);
        setLanguagePreference("system");
        setLanguagePreferenceStatus(null);
        setConnectedAccounts([]);
        setConnectionProviderAvailability({});
        setConnectionProviderOAuthSupport({});
        setConnectionsStatus(null);
        setOtherApps([]);
        setOtherBots([]);
        setOtherBotAutoImportOnSave(true);
        setBotGhostIntegration({ ...defaultBotGhostIntegration });
        setOtherConfigsStatus(null);
        setCustomCss("");
        setDownloadedPlugins([]);
        applyCustomCss("");
      }
    };

    void hydratePreferences();

    return () => {
      cancelled = true;
    };
  }, [isModalOpen]);

  const loadAuthenticatorAppStatus = useCallback(async () => {
    try {
      const response = await axios.get<AuthenticatorAppStatus>("/api/profile/authenticator-app");
      setAuthenticatorAppStatus({
        enabled: response.data?.enabled === true,
        hasPendingSetup: response.data?.hasPendingSetup === true,
        verifiedAt: response.data?.verifiedAt ?? null,
        lastUsedAt: response.data?.lastUsedAt ?? null,
      });
    } catch {
      setAuthenticatorAppStatus({ ...defaultAuthenticatorAppStatus });
    }
  }, []);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    void loadAuthenticatorAppStatus();
  }, [isModalOpen, loadAuthenticatorAppStatus]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    if (authenticatorAppStatus.hasPendingSetup && !authenticatorAppStatus.enabled) {
      setIsAuthenticatorAppModalOpen(true);
    }
  }, [authenticatorAppStatus.enabled, authenticatorAppStatus.hasPendingSetup, isModalOpen]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    const requestedSection = normalizeSettingsSection(
      data.query?.settingsSection ?? data.query?.section
    );

    if (!requestedSection) {
      return;
    }

    setActiveSection(requestedSection);
    setDisplaySection(requestedSection);
    setIsSectionVisible(true);
  }, [data.query, isModalOpen]);

  const onToggleMentions = () => {
    const next = !mentionsEnabled;
    setMentionsEnabled(next);
    writeMentionsEnabled(next);

    void axios
      .patch("/api/profile/preferences", {
        mentionsEnabled: next,
      })
      .catch(() => {
        // keep optimistic local state if request fails
      });

    window.dispatchEvent(
      new CustomEvent("inaccord:mentions-setting-updated", {
        detail: {
          mentionsEnabled: next,
        },
      })
    );
  };

  const onSaveLanguagePreference = async () => {
    try {
      setIsSavingLanguagePreference(true);
      setLanguagePreferenceStatus(null);

      await axios.patch("/api/profile/preferences", {
        languagePreference,
      });

      const selectedLabel =
        languageOptions.find((option) => option.value === languagePreference)?.label ?? "System Default";

      setLanguagePreferenceStatus(`Language preference saved: ${selectedLabel}.`);
    } catch {
      setLanguagePreferenceStatus("Could not save language preference.");
    } finally {
      setIsSavingLanguagePreference(false);
    }
  };

  const onStartAuthenticatorAppSetup = async () => {
    try {
      setIsAuthenticatorAppBusy(true);
      setAuthenticatorAppMessage(null);

      const response = await axios.post<{
        secret: string;
        otpauthUri: string;
      }>("/api/profile/authenticator-app", {
        action: "begin",
      });

      setAuthenticatorSetupSecret(String(response.data?.secret ?? "").trim());
      setAuthenticatorSetupUri(String(response.data?.otpauthUri ?? "").trim());
      setAuthenticatorCodeInput("");
      setIsAuthenticatorAppModalOpen(true);
      setAuthenticatorAppMessage("Authenticator setup started. Add the key to your app, then verify with a 6-digit code.");
      await loadAuthenticatorAppStatus();
    } catch (error) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.error === "string"
          ? error.response?.data?.error
          : "Could not start authenticator setup.";
      setAuthenticatorAppMessage(message);
    } finally {
      setIsAuthenticatorAppBusy(false);
    }
  };

  const onVerifyAuthenticatorAppSetup = async () => {
    try {
      setIsAuthenticatorAppBusy(true);
      setAuthenticatorAppMessage(null);

      const response = await axios.post<AuthenticatorAppStatus>("/api/profile/authenticator-app", {
        action: "verify",
        code: authenticatorCodeInput,
      });

      setAuthenticatorAppStatus({
        enabled: response.data?.enabled === true,
        hasPendingSetup: response.data?.hasPendingSetup === true,
        verifiedAt: response.data?.verifiedAt ?? null,
        lastUsedAt: response.data?.lastUsedAt ?? null,
      });
      setAuthenticatorSetupSecret("");
      setAuthenticatorSetupUri("");
      setAuthenticatorCodeInput("");
      setAuthenticatorAppMessage("Authenticator app enabled.");
    } catch (error) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.error === "string"
          ? error.response?.data?.error
          : "Could not verify authenticator code.";
      setAuthenticatorAppMessage(message);
    } finally {
      setIsAuthenticatorAppBusy(false);
    }
  };

  const onDisableAuthenticatorApp = async () => {
    try {
      setIsAuthenticatorAppBusy(true);
      setAuthenticatorAppMessage(null);

      const response = await axios.delete<AuthenticatorAppStatus>("/api/profile/authenticator-app", {
        data: {
          code: authenticatorCodeInput,
        },
      });

      setAuthenticatorAppStatus({
        enabled: response.data?.enabled === true,
        hasPendingSetup: response.data?.hasPendingSetup === true,
        verifiedAt: response.data?.verifiedAt ?? null,
        lastUsedAt: response.data?.lastUsedAt ?? null,
      });
      setAuthenticatorSetupSecret("");
      setAuthenticatorSetupUri("");
      setAuthenticatorCodeInput("");
      setAuthenticatorAppMessage("Authenticator app disabled.");
    } catch (error) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.error === "string"
          ? error.response?.data?.error
          : "Could not disable authenticator app.";
      setAuthenticatorAppMessage(message);
    } finally {
      setIsAuthenticatorAppBusy(false);
    }
  };

  const onCopyAuthenticatorSecret = async () => {
    if (!authenticatorSetupSecret.trim()) {
      setAuthenticatorAppMessage("No authenticator secret available to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(authenticatorSetupSecret.trim());
      setAuthenticatorAppMessage("Authenticator key copied.");
    } catch {
      setAuthenticatorAppMessage("Could not copy authenticator key.");
    }
  };

  const onCopyAuthenticatorUri = async () => {
    if (!authenticatorSetupUri.trim()) {
      setAuthenticatorAppMessage("No authenticator URI available to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(authenticatorSetupUri.trim());
      setAuthenticatorAppMessage("Authenticator URI copied.");
    } catch {
      setAuthenticatorAppMessage("Could not copy authenticator URI.");
    }
  };

  const decodeBase64UrlToUint8Array = (value: string) => {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const binary = window.atob(`${normalized}${padding}`);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  };

  const encodeArrayBufferToBase64Url = (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }

    return window
      .btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  };

  const loadSecurityKeys = useCallback(async () => {
    try {
      const response = await axios.get<{ keys?: SecurityKeyItem[] }>("/api/profile/security-keys");
      const nextKeys = Array.isArray(response.data?.keys)
        ? response.data.keys.map((item, index) => ({
            id: String(item.id ?? "").trim(),
            credentialId: String(item.credentialId ?? "").trim(),
            nickname: String(item.nickname ?? "").trim() || `Security Key ${index + 1}`,
            transports: Array.isArray(item.transports)
              ? item.transports.filter((entry): entry is string => typeof entry === "string")
              : [],
            createdAt: String(item.createdAt ?? "").trim(),
            lastUsedAt: item.lastUsedAt ? String(item.lastUsedAt) : null,
          }))
        : [];

      setSecurityKeys(nextKeys);
    } catch {
      setSecurityKeys([]);
    }
  }, []);

  const onOpenSecurityKeyModal = async () => {
    setIsSecurityKeyModalOpen(true);
    setSecurityKeyMessage(null);
    await loadSecurityKeys();
  };

  const onRegisterSecurityKey = async () => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      setSecurityKeyMessage("Security key registration is unavailable in this environment.");
      return;
    }

    if (!window.isSecureContext || !window.PublicKeyCredential) {
      setSecurityKeyMessage("Security keys require a secure context and browser WebAuthn support.");
      return;
    }

    try {
      setIsSecurityKeyBusy(true);
      setSecurityKeyMessage(null);

      const beginResponse = await axios.post<{
        challenge: string;
        rp: { name: string; id: string };
        user: { id: string; name: string; displayName: string };
        pubKeyCredParams: Array<{ type: "public-key"; alg: number }>;
        timeout: number;
        attestation: "none";
        excludeCredentials: Array<{ type: "public-key"; id: string; transports: string[] }>;
      }>("/api/profile/security-keys", {
        action: "begin",
        origin: window.location.origin,
      });

      const begin = beginResponse.data;

      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: decodeBase64UrlToUint8Array(begin.challenge),
          rp: begin.rp,
          user: {
            id: decodeBase64UrlToUint8Array(begin.user.id),
            name: begin.user.name,
            displayName: begin.user.displayName,
          },
          pubKeyCredParams: begin.pubKeyCredParams,
          timeout: begin.timeout,
          attestation: begin.attestation,
          excludeCredentials: (begin.excludeCredentials ?? []).map((entry) => ({
            type: entry.type,
            id: decodeBase64UrlToUint8Array(entry.id),
            transports: Array.isArray(entry.transports)
              ? entry.transports.filter(
                  (transport): transport is AuthenticatorTransport =>
                    transport === "usb" ||
                    transport === "nfc" ||
                    transport === "ble" ||
                    transport === "hybrid" ||
                    transport === "internal"
                )
              : undefined,
          })),
        },
      })) as PublicKeyCredential | null;

      if (!credential) {
        setSecurityKeyMessage("Security key registration was cancelled.");
        return;
      }

      const response = credential.response as AuthenticatorAttestationResponse;
      const transports =
        typeof response.getTransports === "function"
          ? response.getTransports()
          : [];

      const finishResponse = await axios.post<{ keys?: SecurityKeyItem[] }>("/api/profile/security-keys", {
        action: "finish",
        credential: {
          id: credential.id,
          response: {
            clientDataJSON: encodeArrayBufferToBase64Url(response.clientDataJSON),
            transports,
          },
        },
      });

      setSecurityKeys(Array.isArray(finishResponse.data?.keys) ? finishResponse.data.keys : []);
      setSecurityKeyMessage("Security key registered.");
    } catch (error) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.error === "string"
          ? error.response.data.error
          : "Could not register security key.";
      setSecurityKeyMessage(message);
    } finally {
      setIsSecurityKeyBusy(false);
    }
  };

  const onDeleteSecurityKey = async (securityKeyId: string) => {
    try {
      setIsSecurityKeyBusy(true);
      setSecurityKeyMessage(null);

      const response = await axios.delete<{ keys?: SecurityKeyItem[] }>(`/api/profile/security-keys/${securityKeyId}`);
      setSecurityKeys(Array.isArray(response.data?.keys) ? response.data.keys : []);
      setSecurityKeyMessage("Security key removed.");
    } catch (error) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.error === "string"
          ? error.response.data.error
          : "Could not remove security key.";
      setSecurityKeyMessage(message);
    } finally {
      setIsSecurityKeyBusy(false);
    }
  };

  const loadSmsAuthStatus = useCallback(async () => {
    try {
      const response = await axios.get<SmsAuthStatus>("/api/profile/sms-auth");
      setSmsAuthStatus({
        enabled: response.data?.enabled === true,
        hasPendingVerification: response.data?.hasPendingVerification === true,
        maskedPhoneNumber: response.data?.maskedPhoneNumber ?? null,
        verifiedAt: response.data?.verifiedAt ?? null,
        lastUsedAt: response.data?.lastUsedAt ?? null,
      });
    } catch {
      setSmsAuthStatus({ ...defaultSmsAuthStatus });
    }
  }, []);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    void loadSmsAuthStatus();
  }, [isModalOpen, loadSmsAuthStatus]);

  const onOpenSmsModal = async () => {
    setIsSmsModalOpen(true);
    setSmsMessage(null);
    setSmsCodeInput("");
    setSmsPhoneInput((current) => current || phoneNumber || "");
    await loadSmsAuthStatus();
  };

  const onSendSmsCode = async () => {
    try {
      setIsSmsBusy(true);
      setSmsMessage(null);

      const response = await axios.post<SmsAuthStatus>("/api/profile/sms-auth", {
        action: "begin",
        phoneNumber: smsPhoneInput,
      });

      setSmsAuthStatus({
        enabled: response.data?.enabled === true,
        hasPendingVerification: response.data?.hasPendingVerification === true,
        maskedPhoneNumber: response.data?.maskedPhoneNumber ?? null,
        verifiedAt: response.data?.verifiedAt ?? null,
        lastUsedAt: response.data?.lastUsedAt ?? null,
      });

      setSmsMessage("Verification code sent.");
    } catch (error) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.error === "string"
          ? error.response.data.error
          : "Could not send SMS verification code.";
      setSmsMessage(message);
    } finally {
      setIsSmsBusy(false);
    }
  };

  const onVerifySmsCode = async () => {
    try {
      setIsSmsBusy(true);
      setSmsMessage(null);

      const response = await axios.post<SmsAuthStatus>("/api/profile/sms-auth", {
        action: "verify",
        code: smsCodeInput,
      });

      setSmsAuthStatus({
        enabled: response.data?.enabled === true,
        hasPendingVerification: response.data?.hasPendingVerification === true,
        maskedPhoneNumber: response.data?.maskedPhoneNumber ?? null,
        verifiedAt: response.data?.verifiedAt ?? null,
        lastUsedAt: response.data?.lastUsedAt ?? null,
      });

      setSmsCodeInput("");
      setSmsMessage("SMS verification enabled.");
    } catch (error) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.error === "string"
          ? error.response.data.error
          : "Could not verify SMS code.";
      setSmsMessage(message);
    } finally {
      setIsSmsBusy(false);
    }
  };

  const onDisableSms = async () => {
    try {
      setIsSmsBusy(true);
      setSmsMessage(null);

      const response = await axios.delete<SmsAuthStatus>("/api/profile/sms-auth");
      setSmsAuthStatus({
        enabled: response.data?.enabled === true,
        hasPendingVerification: response.data?.hasPendingVerification === true,
        maskedPhoneNumber: response.data?.maskedPhoneNumber ?? null,
        verifiedAt: response.data?.verifiedAt ?? null,
        lastUsedAt: response.data?.lastUsedAt ?? null,
      });
      setSmsCodeInput("");
      setSmsMessage("SMS verification disabled.");
    } catch (error) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.error === "string"
          ? error.response.data.error
          : "Could not disable SMS verification.";
      setSmsMessage(message);
    } finally {
      setIsSmsBusy(false);
    }
  };

  const onSaveContentSocialPreferences = async () => {
    try {
      setIsSavingContentSocialPreferences(true);
      setContentSocialStatus(null);

      await axios.patch("/api/profile/preferences", {
        contentSocial: contentSocialPreferences,
      });

      setContentSocialStatus("Content & Social preferences saved.");
    } catch {
      setContentSocialStatus("Could not save Content & Social preferences.");
    } finally {
      setIsSavingContentSocialPreferences(false);
    }
  };

  const onSaveDataPrivacyPreferences = async () => {
    try {
      setIsSavingDataPrivacyPreferences(true);
      setDataPrivacyStatus(null);

      await axios.patch("/api/profile/preferences", {
        dataPrivacy: dataPrivacyPreferences,
      });

      setDataPrivacyStatus("Data & Privacy preferences saved.");
    } catch {
      setDataPrivacyStatus("Could not save Data & Privacy preferences.");
    } finally {
      setIsSavingDataPrivacyPreferences(false);
    }
  };

  const onSaveActivityPrivacyPreferences = async () => {
    try {
      setIsSavingActivityPrivacyPreferences(true);
      setActivityPrivacyStatus(null);

      const nextPreferences = normalizeActivityPrivacyPreferences(activityPrivacyPreferences);

      await axios.patch("/api/profile/preferences", {
        activityPrivacy: nextPreferences,
      });

      setActivityPrivacyPreferences(nextPreferences);

      window.dispatchEvent(
        new CustomEvent("inaccord:activity-privacy-preferences-updated", {
          detail: {
            activityPrivacy: nextPreferences,
          },
        })
      );

      setActivityPrivacyStatus("Activity Privacy preferences saved.");
    } catch {
      setActivityPrivacyStatus("Could not save Activity Privacy preferences.");
    } finally {
      setIsSavingActivityPrivacyPreferences(false);
    }
  };

  const onSaveRegisteredGamesPreferences = async () => {
    try {
      setIsSavingRegisteredGamesPreferences(true);
      setRegisteredGamesStatus(null);

      const nextPreferences = normalizeRegisteredGamesPreferences(registeredGamesPreferences);

      await axios.patch("/api/profile/preferences", {
        registeredGames: nextPreferences,
      });

      setRegisteredGamesPreferences(nextPreferences);

      window.dispatchEvent(
        new CustomEvent("inaccord:registered-games-preferences-updated", {
          detail: {
            registeredGames: nextPreferences,
          },
        })
      );

      setRegisteredGamesStatus("Registered Games preferences saved.");
    } catch {
      setRegisteredGamesStatus("Could not save Registered Games preferences.");
    } finally {
      setIsSavingRegisteredGamesPreferences(false);
    }
  };

  const onAddManualRegisteredGame = () => {
    const name = manualGameNameInput.trim().slice(0, 120);
    if (!name) {
      setRegisteredGamesStatus("Enter a game name before adding.");
      return;
    }

    const provider = manualGameProviderInput.trim().slice(0, 60) || "manual";
    const shortDescription = manualGameDescriptionInput.trim().slice(0, 280);
    const thumbnailRaw = manualGameThumbnailInput.trim().slice(0, 2048);
    const thumbnailUrl =
      /^https?:\/\//i.test(thumbnailRaw) || thumbnailRaw.startsWith("/") ? thumbnailRaw : "";
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const id = `manual:${provider}:${slug || `game-${Date.now()}`}`;

    setRegisteredGamesPreferences((current) => {
      const next: RegisteredGamesPreferences = {
        ...current,
        manualGames: [
          {
            id,
            name,
            provider,
            shortDescription,
            thumbnailUrl,
            addedAt: new Date().toISOString(),
          },
          ...current.manualGames.filter((entry) => entry.id !== id),
        ].slice(0, 120),
      };

      return next;
    });

    setManualGameNameInput("");
    setManualGameDescriptionInput("");
    setManualGameThumbnailInput("");
    setRegisteredGamesStatus(null);
  };

  const onAddRunningAppRegisteredGame = () => {
    const selected = runningApps.find((entry) => entry.id === selectedRunningAppId);
    if (!selected) {
      setRegisteredGamesStatus("No running app selected.");
      return;
    }

    const preferredName = selected.windowTitle.trim() || selected.label.trim() || selected.processName.trim();
    const name = preferredName.slice(0, 120);
    if (!name) {
      setRegisteredGamesStatus("Selected app does not have a usable name.");
      return;
    }

    const processName = selected.processName.trim().slice(0, 120);
    const idSuffix = processName || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const id = `manual:running:${idSuffix || Date.now()}`;

    setRegisteredGamesPreferences((current) => ({
      ...current,
      manualGames: [
        {
          id,
          name,
          provider: "running-app",
          shortDescription: processName
            ? `Manually registered from running process: ${processName}.`
            : "Manually registered from currently running app.",
          thumbnailUrl: "",
          addedAt: new Date().toISOString(),
        },
        ...current.manualGames.filter((entry) => entry.id !== id),
      ].slice(0, 120),
    }));

    setManualGameNameInput(name);
    setManualGameProviderInput("running-app");
    setManualGameDescriptionInput(
      processName ? `Running process detected: ${processName}` : "Running app detected"
    );
    setManualGameThumbnailInput("");
    setRegisteredGamesStatus(`Added running app: ${name}.`);
  };

  const onSaveNotificationPreferences = async () => {
    try {
      setIsSavingNotificationPreferences(true);
      setNotificationStatus(null);

      await axios.patch("/api/profile/preferences", {
        notifications: notificationPreferences,
      });

      window.dispatchEvent(
        new CustomEvent("inaccord:notification-preferences-updated", {
          detail: {
            notifications: notificationPreferences,
          },
        })
      );

      setNotificationStatus("Notification preferences saved.");
    } catch {
      setNotificationStatus("Could not save notification preferences.");
    } finally {
      setIsSavingNotificationPreferences(false);
    }
  };

  const onSaveTextImagesPreferences = async () => {
    try {
      setIsSavingTextImagesPreferences(true);
      setTextImagesStatus(null);

      await axios.patch("/api/profile/preferences", {
        textImages: textImagesPreferences,
      });

      window.dispatchEvent(
        new CustomEvent("inaccord:text-images-preferences-updated", {
          detail: {
            textImages: textImagesPreferences,
          },
        })
      );

      setTextImagesStatus("Text & Images preferences saved.");
    } catch {
      setTextImagesStatus("Could not save Text & Images preferences.");
    } finally {
      setIsSavingTextImagesPreferences(false);
    }
  };

  const onSaveAccessibilityPreferences = async () => {
    try {
      setIsSavingAccessibilityPreferences(true);
      setAccessibilityStatus(null);

      await axios.patch("/api/profile/preferences", {
        accessibility: accessibilityPreferences,
      });

      window.dispatchEvent(
        new CustomEvent("inaccord:accessibility-preferences-updated", {
          detail: {
            accessibility: accessibilityPreferences,
          },
        })
      );

      setAccessibilityStatus("Accessibility preferences saved.");
    } catch {
      setAccessibilityStatus("Could not save Accessibility preferences.");
    } finally {
      setIsSavingAccessibilityPreferences(false);
    }
  };

  const onSaveEmojiPreferences = async () => {
    try {
      setIsSavingEmojiPreferences(true);
      setEmojiStatus(null);

      const parsedFavorites = Array.from(
        new Set(
          emojiFavoritesInput
            .split(/\s+/)
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
            .slice(0, 32)
        )
      );

      const nextPreferences: EmojiPreferences = {
        ...emojiPreferences,
        favoriteEmojis: parsedFavorites.length ? parsedFavorites : [...defaultEmojiPreferences.favoriteEmojis],
      };

      await axios.patch("/api/profile/preferences", {
        emoji: nextPreferences,
      });

      setEmojiPreferences(nextPreferences);
      setEmojiUploadDraftUrl("");
      setEmojiFavoritesInput(nextPreferences.favoriteEmojis.join(" "));

      window.dispatchEvent(
        new CustomEvent("inaccord:emoji-preferences-updated", {
          detail: {
            emoji: nextPreferences,
          },
        })
      );

      setEmojiStatus("Emoji preferences saved.");
    } catch {
      setEmojiStatus("Could not save Emoji preferences.");
    } finally {
      setIsSavingEmojiPreferences(false);
    }
  };

  const onSaveStickerPreferences = async () => {
    try {
      setIsSavingStickerPreferences(true);
      setStickerStatus(null);

      const parsedFavorites = Array.from(
        new Set(
          stickerFavoritesInput
            .split(/[\n,\s]+/)
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
            .slice(0, 48)
        )
      );

      const nextPreferences: StickerPreferences = {
        ...stickerPreferences,
        favoriteStickers: parsedFavorites,
      };

      await axios.patch("/api/profile/preferences", {
        stickers: nextPreferences,
      });

      setStickerPreferences(nextPreferences);
      setStickerUploadDraftUrl("");
      setStickerFavoritesInput(nextPreferences.favoriteStickers.join("\n"));

      window.dispatchEvent(
        new CustomEvent("inaccord:sticker-preferences-updated", {
          detail: {
            stickers: nextPreferences,
          },
        })
      );

      setStickerStatus("Sticker preferences saved.");
    } catch {
      setStickerStatus("Could not save Sticker preferences.");
    } finally {
      setIsSavingStickerPreferences(false);
    }
  };

  const onSaveKeybindPreferences = async () => {
    try {
      setIsSavingKeybindPreferences(true);
      setKeybindStatus(null);

      const nextPreferences = normalizeKeybindPreferences(keybindPreferences);

      await axios.patch("/api/profile/preferences", {
        keybinds: nextPreferences,
      });

      setKeybindPreferences(nextPreferences);

      window.dispatchEvent(
        new CustomEvent("inaccord:keybind-preferences-updated", {
          detail: {
            keybinds: nextPreferences,
          },
        })
      );

      setKeybindStatus("Keybind preferences saved.");
    } catch {
      setKeybindStatus("Could not save Keybind preferences.");
    } finally {
      setIsSavingKeybindPreferences(false);
    }
  };

  const onSaveAdvancedPreferences = async () => {
    try {
      setIsSavingAdvancedPreferences(true);
      setAdvancedStatus(null);

      const nextPreferences = normalizeAdvancedPreferences(advancedPreferences);

      await axios.patch("/api/profile/preferences", {
        advanced: nextPreferences,
      });

      setAdvancedPreferences(nextPreferences);

      window.dispatchEvent(
        new CustomEvent("inaccord:advanced-preferences-updated", {
          detail: {
            advanced: nextPreferences,
          },
        })
      );

      setAdvancedStatus("Advanced preferences saved.");
    } catch {
      setAdvancedStatus("Could not save Advanced preferences.");
    } finally {
      setIsSavingAdvancedPreferences(false);
    }
  };

  const onSaveStreamerModePreferences = async () => {
    try {
      setIsSavingStreamerModePreferences(true);
      setStreamerModeStatus(null);

      const nextPreferences = normalizeStreamerModePreferences(streamerModePreferences);

      await axios.patch("/api/profile/preferences", {
        streamerMode: nextPreferences,
      });

      setStreamerModePreferences(nextPreferences);

      window.dispatchEvent(
        new CustomEvent("inaccord:streamer-mode-preferences-updated", {
          detail: {
            streamerMode: nextPreferences,
          },
        })
      );

      setStreamerModeStatus("Streamer Mode preferences saved.");
    } catch {
      setStreamerModeStatus("Could not save Streamer Mode preferences.");
    } finally {
      setIsSavingStreamerModePreferences(false);
    }
  };

  const onSaveGameOverlayPreferences = async () => {
    try {
      setIsSavingGameOverlayPreferences(true);
      setGameOverlayStatus(null);

      const nextPreferences = normalizeGameOverlayPreferences(gameOverlayPreferences);

      await axios.patch("/api/profile/preferences", {
        gameOverlay: nextPreferences,
      });

      setGameOverlayPreferences(nextPreferences);

      window.dispatchEvent(
        new CustomEvent("inaccord:game-overlay-preferences-updated", {
          detail: {
            gameOverlay: nextPreferences,
          },
        })
      );

      setGameOverlayStatus("Game Overlay preferences saved.");
    } catch {
      setGameOverlayStatus("Could not save Game Overlay preferences.");
    } finally {
      setIsSavingGameOverlayPreferences(false);
    }
  };

  const onSaveFamilyCenterPreferences = async () => {
    if (!isFamilyCenterEditable) {
      setFamilyCenterStatus(
        `Only ${centerLabel} or Administrator roles can edit ${centerLabel} Center settings.`
      );
      return;
    }

    try {
      setIsSavingFamilyCenterPreferences(true);
      setFamilyCenterStatus(null);

      await axios.patch("/api/profile/preferences", isBusinessCenterSection
        ? { businessCenter: mapFamilyCenterToBusinessCenterPayload(familyCenterPreferences) }
        : isSchoolCenterSection
          ? { schoolCenter: familyCenterPreferences }
          : { familyCenter: familyCenterPreferences });

      if (isBusinessCenterSection) {
        setBusinessCenterSnapshot(familyCenterPreferences);
        setFamilyCenterStatus("Business Center preferences saved.");
      } else if (isSchoolCenterSection) {
        setSchoolCenterSnapshot(familyCenterPreferences);
        setFamilyCenterStatus("School Center preferences saved.");
      } else {
        setFamilyCenterSnapshot(familyCenterPreferences);
        setFamilyCenterStatus("Family Center preferences saved.");
      }
    } catch {
      setFamilyCenterStatus(
        isBusinessCenterSection
          ? "Could not save Business Center preferences."
          : isSchoolCenterSection
            ? "Could not save School Center preferences."
            : "Could not save Family Center preferences."
      );
    } finally {
      setIsSavingFamilyCenterPreferences(false);
    }
  };

  const onAddFamilyMember = async () => {
    if (!isFamilyCenterEditable) {
      setFamilyCenterStatus(
        `Only ${centerLabel} or Administrator roles can edit ${centerLabel} Center settings.`
      );
      return;
    }

    const childName = familyMemberNameInput.trim();
    const accountIdentifier = familyMemberAccountInput.trim();
    const childRelation = familyMemberRelationInput;
    const childSection = familyMemberSectionInput.trim();
    const childEmail = familyMemberEmailInput.trim();
    const childPassword = familyMemberPasswordInput.trim();
    const childRepeatPassword = familyMemberRepeatPasswordInput.trim();
    const childPhone = familyMemberPhoneInput.trim();
    const requiresDateOfBirth = !isBusinessCenterSection;
    const childDateOfBirthRaw = familyMemberDateOfBirthInput.trim();
    const normalizedChildDateOfBirth = (() => {
      if (!requiresDateOfBirth) {
        return null;
      }

      const candidate = childDateOfBirthRaw.replace(/\//g, "-");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
        return null;
      }

      const [yearPart, monthPart, dayPart] = candidate.split("-");
      const year = Number(yearPart);
      const month = Number(monthPart);
      const day = Number(dayPart);
      const parsed = new Date(`${candidate}T00:00:00.000Z`);

      if (
        Number.isNaN(parsed.getTime()) ||
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() + 1 !== month ||
        parsed.getUTCDate() !== day
      ) {
        return null;
      }

      return candidate;
    })();

    if (!childName || !accountIdentifier || !childRelation || (isBusinessCenterSection && !childSection) || !childEmail || !childPassword || !childRepeatPassword || !childPhone || (requiresDateOfBirth && !childDateOfBirthRaw)) {
      setFamilyCenterStatus(
        `${centerLabel} Name, Profile Name, ${isBusinessCenterSection ? "Business Role and Business Section" : `${centerLabel} Relation`}, Email, Password, Repeat Password, Phone${isBusinessCenterSection ? "" : ", and Date of Birth"} are required.`
      );
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(childEmail)) {
      setFamilyCenterStatus("Enter a valid email address.");
      return;
    }

    if (requiresDateOfBirth && !normalizedChildDateOfBirth) {
      setFamilyCenterStatus("Select a valid Date of Birth.");
      return;
    }

    if (childPassword.length < 8) {
      setFamilyCenterStatus("Password must be at least 8 characters.");
      return;
    }

    if (childPassword !== childRepeatPassword) {
      setFamilyCenterStatus("Password and Repeat Password do not match.");
      return;
    }

    const alreadyExists = familyCenterPreferences.familyMembers.some(
      (entry) =>
        entry.accountIdentifier.toLowerCase() === accountIdentifier.toLowerCase() ||
        entry.childEmail.toLowerCase() === childEmail.toLowerCase()
    );

    if (alreadyExists) {
      setFamilyCenterStatus(
        `That account or email is already listed in ${centerLabel} Members.`
      );
      return;
    }

    try {
      setIsCreatingFamilyMemberAccount(true);

      const response = await axios.post<{
        ok: boolean;
        memberUserId: string;
        lifecycle: FamilyMemberLifecycle;
      }>(isBusinessCenterSection ? "/api/business-center/members" : isSchoolCenterSection ? "/api/school-center/members" : "/api/family-center/members", {
        childName,
        childRelation,
        childSection: isBusinessCenterSection ? childSection : "",
        accountIdentifier,
        childEmail,
        childPassword,
        childPhone,
        childDateOfBirth: normalizedChildDateOfBirth,
      });

      const nextMember: FamilyCenterMemberAccount = {
      id: `family-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      childName: childName.slice(0, 60),
      accountIdentifier: accountIdentifier.slice(0, 160),
      childRelation,
      childSection: isBusinessCenterSection ? childSection : "",
      childEmail: childEmail.slice(0, 160),
      childPassword: childPassword.slice(0, 128),
      childPhone: childPhone.slice(0, 32),
      childDateOfBirth: normalizedChildDateOfBirth ?? "",
      linkedUserId: response.data.memberUserId,
      familyLinkState: response.data.lifecycle.state,
      createdAt: new Date().toISOString(),
      requireContentFilterForFamilyMembers: familyCenterPreferences.requireContentFilterForFamilyMembers,
      shareWeeklySafetySummary: familyCenterPreferences.shareWeeklySafetySummary,
      allowDirectMessagesFromNonFriends: familyCenterPreferences.allowDirectMessagesFromNonFriends,
      alertOnMatureContentInteractions: familyCenterPreferences.alertOnMatureContentInteractions,
    };

    setFamilyCenterPreferences((current) => ({
      ...current,
      familyMembers: [...current.familyMembers, nextMember],
    }));
      setFamilyMemberLifecycleByUserId((current) => ({
        ...current,
        [response.data.memberUserId]: response.data.lifecycle,
      }));
    setSelectedFamilyMemberId(nextMember.id);
    setFamilyMemberNameInput("");
    setFamilyMemberAccountInput("");
    setFamilyMemberRelationInput("");
    setFamilyMemberSectionInput("");
    setFamilyMemberEmailInput("");
    setFamilyMemberPasswordInput("");
    setFamilyMemberRepeatPasswordInput("");
    setFamilyMemberPhoneInput("");
    setFamilyMemberDateOfBirthInput("");
      setFamilyCenterStatus(
        `${centerLabel} account added and real user account created. Click Save Changes to persist.`
      );
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error || error.response?.data || error.message
        : `Could not create the ${centerLabelLower} member account.`;

      setFamilyCenterStatus(
        typeof message === "string"
          ? message
          : `Could not create the ${centerLabelLower} member account.`
      );
    } finally {
      setIsCreatingFamilyMemberAccount(false);
    }
  };

  const onRemoveFamilyMember = (memberId: string) => {
    if (!isFamilyCenterEditable) {
      setFamilyCenterStatus(
        `Only ${centerLabel} or Administrator roles can edit ${centerLabel} Center settings.`
      );
      return;
    }

    setFamilyCenterPreferences((current) => {
      const target = current.familyMembers.find((entry) => entry.id === memberId);
      if (target?.linkedUserId) {
        setFamilyMemberLifecycleByUserId((existing) => {
          if (!existing[target.linkedUserId]) {
            return existing;
          }

          const next = { ...existing };
          delete next[target.linkedUserId];
          return next;
        });
      }

      return {
        ...current,
        familyMembers: current.familyMembers.filter((entry) => entry.id !== memberId),
      };
    });
    setFamilyCenterStatus(
      `${centerLabel} account removed. Click Save Changes to persist.`
    );
  };

  const onSeedApprovedBusinessMember = () => {
    if (!isBusinessCenterSection || !isFamilyApplicationApproved) {
      return;
    }

    if (!isFamilyCenterEditable) {
      setFamilyCenterStatus("Only Business or Administrator roles can edit Business Center settings.");
      return;
    }

    const linkedUserId = String(resolvedProfileId ?? data.profileId ?? "").trim();
    const fallbackProfileName =
      String(profileName || "").trim() ||
      String(realName || "").trim() ||
      String(data.profileEmail || "").trim().split("@")[0] ||
      linkedUserId ||
      "Business Member";

    const alreadyExists = familyCenterPreferences.familyMembers.some((entry) => {
      const sameLinked = linkedUserId && String(entry.linkedUserId ?? "").trim() === linkedUserId;
      const sameIdentifier =
        String(entry.accountIdentifier ?? "").trim().toLowerCase() === fallbackProfileName.toLowerCase();
      return sameLinked || sameIdentifier;
    });

    if (alreadyExists) {
      setFamilyCenterStatus("Your business member profile is already listed.");
      return;
    }

    const nextMember: FamilyCenterMemberAccount = {
      id: `business-member-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      childName: fallbackProfileName.slice(0, 60),
      accountIdentifier: fallbackProfileName.slice(0, 160),
      childRelation: String(familyDesignationInput ?? "").trim().slice(0, 80),
      childSection: String(familyApplicationSectionInput ?? "").trim().slice(0, 80),
      childEmail: String(data.profileEmail ?? "").trim().slice(0, 160),
      childPassword: "",
      childPhone: String(phoneNumber ?? "").trim().slice(0, 32),
      childDateOfBirth: String(dateOfBirth ?? "").trim().slice(0, 10),
      linkedUserId,
      familyLinkState: "normal",
      createdAt: new Date().toISOString(),
      requireContentFilterForFamilyMembers: familyCenterPreferences.requireContentFilterForFamilyMembers,
      shareWeeklySafetySummary: familyCenterPreferences.shareWeeklySafetySummary,
      allowDirectMessagesFromNonFriends: familyCenterPreferences.allowDirectMessagesFromNonFriends,
      alertOnMatureContentInteractions: familyCenterPreferences.alertOnMatureContentInteractions,
    };

    setFamilyCenterPreferences((current) => ({
      ...current,
      familyMembers: [...current.familyMembers, nextMember],
    }));
    setSelectedFamilyMemberId(nextMember.id);
    setFamilyCenterStatus("Business member added. Click Save Changes to persist.");
  };

  const onConvertFamilyMemberToNormal = async (member: FamilyCenterMemberAccount) => {
    if (!member.linkedUserId) {
      setFamilyCenterStatus("This family member is not linked to a real account.");
      return;
    }

    const lifecycle = familyMemberLifecycleByUserId[member.linkedUserId];
    if (!lifecycle?.canConvertToNormal) {
      setFamilyCenterStatus("This account can be converted when the member is 16 or older.");
      return;
    }

    try {
      setIsConvertingFamilyMemberUserId(member.linkedUserId);

      const response = await axios.patch<{
        ok: boolean;
        memberUserId: string;
        lifecycle: FamilyMemberLifecycle;
      }>(isBusinessCenterSection ? "/api/business-center/members" : isSchoolCenterSection ? "/api/school-center/members" : "/api/family-center/members", {
        action: "convert-to-normal",
        memberUserId: member.linkedUserId,
      });

      setFamilyMemberLifecycleByUserId((current) => ({
        ...current,
        [response.data.memberUserId]: response.data.lifecycle,
      }));

      setFamilyCenterPreferences((current) => ({
        ...current,
        familyMembers: current.familyMembers.map((entry) =>
          entry.linkedUserId === response.data.memberUserId
            ? {
                ...entry,
                familyLinkState: response.data.lifecycle.state,
              }
            : entry
        ),
      }));

      setFamilyCenterStatus(`${centerLabel} account converted to normal account.`);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error || error.response?.data || error.message
        : `Could not convert the ${centerLabelLower} account.`;
      setFamilyCenterStatus(
        typeof message === "string"
          ? message
          : `Could not convert the ${centerLabelLower} account.`
      );
    } finally {
      setIsConvertingFamilyMemberUserId(null);
    }
  };

  const linkedFamilyMemberUserIds = useMemo(
    () =>
      familyCenterPreferences.familyMembers
        .map((member) => member.linkedUserId)
        .filter((value) => value.trim().length > 0)
        .join(","),
    [familyCenterPreferences.familyMembers]
  );

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    const linkedUserIds = linkedFamilyMemberUserIds
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (linkedUserIds.length === 0) {
      return;
    }

    let cancelled = false;

    const hydrateLifecycle = async () => {
      try {
        const response = await axios.get<{ members?: FamilyMemberLifecycle[] }>(isBusinessCenterSection ? "/api/business-center/members" : isSchoolCenterSection ? "/api/school-center/members" : "/api/family-center/members", {
          params: {
            ids: linkedUserIds.join(","),
          },
        });

        if (cancelled) {
          return;
        }

        const members = Array.isArray(response.data?.members)
          ? response.data.members.filter((entry) => typeof entry.memberUserId === "string" && entry.memberUserId.trim().length > 0)
          : [];

        setFamilyMemberLifecycleByUserId(() => {
          const next: Record<string, FamilyMemberLifecycle> = {};
          members.forEach((entry) => {
            next[entry.memberUserId] = entry;
          });
          return next;
        });

        setFamilyCenterPreferences((current) => {
          let changed = false;

          const nextMembers = current.familyMembers.map((member) => {
            if (!member.linkedUserId) {
              return member;
            }

            const entry = members.find((value) => value.memberUserId === member.linkedUserId);
            if (!entry || entry.state === member.familyLinkState) {
              return member;
            }

            changed = true;
            return {
              ...member,
              familyLinkState: entry.state,
            };
          });

          if (!changed) {
            return current;
          }

          return {
            ...current,
            familyMembers: nextMembers,
          };
        });
      } catch {
        // keep UI functional even when lifecycle hydration fails
      }
    };

    void hydrateLifecycle();

    return () => {
      cancelled = true;
    };
  }, [isBusinessCenterSection, isModalOpen, isSchoolCenterSection, linkedFamilyMemberUserIds]);

  useEffect(() => {
    const members = familyCenterPreferences.familyMembers;

    if (members.length === 0) {
      if (selectedFamilyMemberId) {
        setSelectedFamilyMemberId("");
      }
      return;
    }

    const exists = members.some((member) => member.id === selectedFamilyMemberId);
    if (!exists) {
      setSelectedFamilyMemberId(members[0]?.id ?? "");
    }
  }, [familyCenterPreferences.familyMembers, selectedFamilyMemberId]);

  const selectedFamilyMember = useMemo(() => {
    return (
      familyCenterPreferences.familyMembers.find((member) => member.id === selectedFamilyMemberId) ?? null
    );
  }, [familyCenterPreferences.familyMembers, selectedFamilyMemberId]);

  const updateSelectedFamilyMemberOversight = (
    key:
      | "requireContentFilterForFamilyMembers"
      | "shareWeeklySafetySummary"
      | "allowDirectMessagesFromNonFriends"
      | "alertOnMatureContentInteractions"
  ) => {
    if (!isFamilyCenterEditable) {
      setFamilyCenterStatus(
        `Only ${centerLabel} or Administrator roles can edit ${centerLabel} Center settings.`
      );
      return;
    }

    if (!selectedFamilyMemberId) {
      setFamilyCenterStatus("Select a family account first.");
      return;
    }

    setFamilyCenterPreferences((current) => ({
      ...current,
      familyMembers: current.familyMembers.map((member) => {
        if (member.id !== selectedFamilyMemberId) {
          return member;
        }

        return {
          ...member,
          [key]: !member[key],
        };
      }),
    }));
    setFamilyCenterStatus(null);
  };

  const onCopyDefaultsToSelectedChild = () => {
    if (!isFamilyCenterEditable) {
      setFamilyCenterStatus(
        `Only ${centerLabel} or Administrator roles can edit ${centerLabel} Center settings.`
      );
      return;
    }

    if (!selectedFamilyMemberId) {
      setFamilyCenterStatus("Select a family account first.");
      return;
    }

    setFamilyCenterPreferences((current) => ({
      ...current,
      familyMembers: current.familyMembers.map((member) => {
        if (member.id !== selectedFamilyMemberId) {
          return member;
        }

        return {
          ...member,
          requireContentFilterForFamilyMembers: current.requireContentFilterForFamilyMembers,
          shareWeeklySafetySummary: current.shareWeeklySafetySummary,
          allowDirectMessagesFromNonFriends: current.allowDirectMessagesFromNonFriends,
          alertOnMatureContentInteractions: current.alertOnMatureContentInteractions,
        };
      }),
    }));

    setFamilyCenterStatus(
      `Default ${centerLabel} Center controls copied to selected ${centerLabelLower} account. Click Save Changes to persist.`
    );
  };

  const onResetSelectedChildToAppDefaults = () => {
    if (!isFamilyCenterEditable) {
      setFamilyCenterStatus(
        `Only ${centerLabel} or Administrator roles can edit ${centerLabel} Center settings.`
      );
      return;
    }

    if (!selectedFamilyMemberId) {
      setFamilyCenterStatus("Select a family account first.");
      return;
    }

    setFamilyCenterPreferences((current) => ({
      ...current,
      familyMembers: current.familyMembers.map((member) => {
        if (member.id !== selectedFamilyMemberId) {
          return member;
        }

        return {
          ...member,
          requireContentFilterForFamilyMembers:
            defaultFamilyCenterPreferences.requireContentFilterForFamilyMembers,
          shareWeeklySafetySummary:
            defaultFamilyCenterPreferences.shareWeeklySafetySummary,
          allowDirectMessagesFromNonFriends:
            defaultFamilyCenterPreferences.allowDirectMessagesFromNonFriends,
          alertOnMatureContentInteractions:
            defaultFamilyCenterPreferences.alertOnMatureContentInteractions,
        };
      }),
    }));

    setFamilyCenterStatus(
      `Selected ${centerLabelLower} account controls reset to app defaults. Click Save Changes to persist.`
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const onPickFamilyVerificationFiles = () => {
    familyVerificationFileInputRef.current?.click();
  };

  const onFamilyVerificationFilesChange = (files?: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    const allowedMimeTypes = new Set(["image/jpeg", "image/png", "application/pdf"]);
    const maxFileSizeBytes = 10 * 1024 * 1024;
    const accepted: File[] = [];
    const rejectedNames: string[] = [];

    Array.from(files).forEach((file) => {
      const hasValidType = allowedMimeTypes.has(file.type);
      const hasValidSize = file.size <= maxFileSizeBytes;

      if (hasValidType && hasValidSize) {
        accepted.push(file);
      } else {
        rejectedNames.push(file.name);
      }
    });

    if (accepted.length > 0) {
      setFamilyVerificationFiles((current) => {
        const deduped = [...current];

        accepted.forEach((candidate) => {
          const exists = deduped.some(
            (existing) =>
              existing.name === candidate.name &&
              existing.size === candidate.size &&
              existing.lastModified === candidate.lastModified
          );

          if (!exists) {
            deduped.push(candidate);
          }
        });

        return deduped;
      });
    }

    if (rejectedNames.length > 0) {
      setFamilyVerificationUploadStatus(
        `Some files were skipped (${rejectedNames.join(", ")}). Only JPG, PNG, and PDF up to 10MB are allowed.`
      );
    } else {
      setFamilyVerificationUploadStatus("Files attached. Upload area is now wired and ready for backend integration.");
    }

    if (familyVerificationFileInputRef.current) {
      familyVerificationFileInputRef.current.value = "";
    }
  };

  const onRemoveFamilyVerificationFile = (index: number) => {
    setFamilyVerificationFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
    setFamilyVerificationUploadStatus(null);
  };

  const onSubmitFamilyApplication = async () => {
    if (isFamilyApplicationApproved) {
      setFamilyVerificationUploadStatus(
        `${centerLabel} account is already approved. Remove ${centerLabel} Account to apply again.`
      );
      return;
    }

    if (!familyDesignationInput) {
      setFamilyVerificationUploadStatus(
        isBusinessCenterSection
          ? "Select a business role before submitting."
          : "Select a family designation before submitting."
      );
      return;
    }

    if (isBusinessCenterSection && !familyApplicationSectionInput) {
      setFamilyVerificationUploadStatus("Select a business section before submitting.");
      return;
    }

    if (familyVerificationFiles.length === 0) {
      setFamilyVerificationUploadStatus("Attach at least one verification file before submitting.");
      return;
    }

    try {
      setFamilyVerificationUploadStatus("Preparing application PDF and uploading...");

      const submitFormData = new FormData();
      submitFormData.append(
        isBusinessCenterSection ? "businessDesignation" : "familyDesignation",
        familyDesignationInput
      );
      submitFormData.append("legalName", realName || "");
      submitFormData.append("profileName", profileName || "");
      submitFormData.append("email", data.profileEmail || "");
      submitFormData.append("phone", phoneNumber || "");
      if (isBusinessCenterSection) {
        submitFormData.append("businessSection", familyApplicationSectionInput);
      } else {
        submitFormData.append("dateOfBirth", dateOfBirth || "");
      }

      familyVerificationFiles.forEach((file) => {
        submitFormData.append("files", file);
      });

      const response = await fetch(
        isBusinessCenterSection
          ? "/api/business-application/submit"
          : isSchoolCenterSection
            ? "/api/school-application/submit"
            : "/api/family-application/submit",
        {
        method: "POST",
        body: submitFormData,
        }
      );

      if (!response.ok) {
        let errorMessage = `Submit failed (${response.status})`;
        try {
          const errorPayload = (await response.json()) as { error?: string };
          if (errorPayload?.error) {
            errorMessage = errorPayload.error;
          }
        } catch {
          // ignore JSON parse errors and keep fallback message
        }

        throw new Error(errorMessage);
      }

      const payload = (await response.json()) as {
        familyCenter?: FamilyCenterPreferences;
        businessCenter?: unknown;
        schoolCenter?: unknown;
      };

      const nextCenter = isBusinessCenterSection
        ? normalizeBusinessCenterPreferences(payload.businessCenter)
        : isSchoolCenterSection
          ? normalizeFamilyCenterPreferences(payload.schoolCenter)
          : normalizeFamilyCenterPreferences(payload.familyCenter);
      setFamilyCenterPreferences(nextCenter);
      if (isBusinessCenterSection) {
        setBusinessCenterSnapshot(nextCenter);
      } else if (isSchoolCenterSection) {
        setSchoolCenterSnapshot(nextCenter);
      } else {
        setFamilyCenterSnapshot(nextCenter);
      }
      setFamilyApplicationStatus(nextCenter.familyApplicationStatus || null);
      setFamilyCenterStatus(`${centerLabel} application submitted. Status has been added to the top bar.`);
      setFamilyVerificationUploadStatus("Application submitted successfully.");
      setFamilyVerificationFiles([]);
      if (isBusinessCenterSection) {
        setFamilyApplicationSectionInput("");
      }
      setIsFamilyAccountVerificationPanelOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not submit application. Please try again.";
      setFamilyVerificationUploadStatus(sanitizeFamilyApplicationErrorMessage(message));
    }
  };

  const onRemoveFamilyAccount = async () => {
    try {
      setIsRemovingFamilyAccount(true);
      setFamilyCenterStatus(null);

      const response = await axios.patch<{
        ok: boolean;
        role?: string | null;
        familyCenter?: FamilyCenterPreferences;
        businessCenter?: unknown;
        schoolCenter?: unknown;
      }>(isBusinessCenterSection ? "/api/business-application/remove" : isSchoolCenterSection ? "/api/school-application/remove" : "/api/family-application/remove");

      const nextCenter = isBusinessCenterSection
        ? normalizeBusinessCenterPreferences(response.data?.businessCenter)
        : isSchoolCenterSection
          ? normalizeFamilyCenterPreferences(response.data?.schoolCenter)
          : normalizeFamilyCenterPreferences(response.data?.familyCenter);
      setFamilyCenterPreferences(nextCenter);
      if (isBusinessCenterSection) {
        setBusinessCenterSnapshot(nextCenter);
      } else if (isSchoolCenterSection) {
        setSchoolCenterSnapshot(nextCenter);
      } else {
        setFamilyCenterSnapshot(nextCenter);
      }
      setFamilyApplicationStatus(nextCenter.familyApplicationStatus || null);
      setFamilyDesignationInput(normalizeCenterDesignationInput(nextCenter.familyDesignation, isBusinessCenterSection));
      setProfileRole(response.data?.role ?? null);
      setIsFamilyAccountApplyPanelOpen(false);
      setIsFamilyAccountVerificationPanelOpen(false);
      setFamilyVerificationFiles([]);
      setFamilyVerificationUploadStatus(null);
      setFamilyCenterStatus(`${centerLabel} account removed. Apply is available again.`);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error || error.response?.data || error.message
        : `Could not remove ${centerLabelLower} account.`;

      setFamilyCenterStatus(
        typeof message === "string"
          ? message
          : `Could not remove ${centerLabelLower} account.`
      );
    } finally {
      setIsRemovingFamilyAccount(false);
    }
  };

  const onToggleConnectionProvider = async (providerKey: string) => {
    if (isSavingConnectionProvider) {
      return;
    }

    const isConnected = connectedAccounts.includes(providerKey);
    const isOAuthSupported = connectionProviderOAuthSupport[providerKey] ?? oauthConnectionProviders.has(providerKey);
    if (!isConnected && isOAuthSupported && typeof window !== "undefined") {
      const returnTo = `${window.location.pathname}?settingsSection=connections`;
      window.location.href = `/api/profile/connections/oauth/start?provider=${encodeURIComponent(providerKey)}&returnTo=${encodeURIComponent(returnTo)}`;
      return;
    }

    setConnectionsStatus(null);

    try {
      setIsSavingConnectionProvider(providerKey);

      const response = await axios.post<{
        connectedAccounts?: string[];
        providerAvailability?: Record<string, boolean>;
        providerOAuthSupport?: Record<string, boolean>;
        connected?: boolean;
        error?: string;
      }>("/api/profile/connections", {
        provider: providerKey,
        action: isConnected ? "disconnect" : "connect",
      });

      const nextConnectedAccounts = Array.isArray(response.data?.connectedAccounts)
        ? response.data.connectedAccounts
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim().toLowerCase())
            .filter((value) => connectionProviders.some((provider) => provider.key === value))
        : [];

      setConnectedAccounts(Array.from(new Set(nextConnectedAccounts)));
      setConnectionProviderAvailability(response.data?.providerAvailability ?? {});
      setConnectionProviderOAuthSupport(response.data?.providerOAuthSupport ?? {});

      void loadDetectedRegisteredGames();

      const providerLabel = connectionProviders.find((provider) => provider.key === providerKey)?.label ?? "Provider";
      setConnectionsStatus(
        response.data?.connected
          ? `${providerLabel} connected.`
          : `${providerLabel} disconnected.`
      );
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error ?? "Could not update connections."
        : "Could not update connections.";
      setConnectionsStatus(message);
    } finally {
      setIsSavingConnectionProvider(null);
    }
  };

  const loadDetectedRegisteredGames = useCallback(async () => {
    try {
      setIsLoadingDetectedRegisteredGames(true);

      const response = await axios.get<{
        detectedGames?: RegisteredConnectionGame[];
        providerStates?: Record<string, RegisteredGamesProviderState>;
      }>("/api/profile/registered-games", {
        validateStatus: (status) => status >= 200 && status < 500,
      });

      if (response.status >= 400) {
        setDetectedRegisteredGames([]);
        setRegisteredGamesProviderStates({
          local: {
            source: "none",
            count: 0,
          },
        });
        setRegisteredGamesStatus("Could not load local installed games.");
        return;
      }

      const nativeGames = Array.isArray(response.data?.detectedGames)
        ? response.data.detectedGames.filter(
            (entry): entry is RegisteredConnectionGame => Boolean(entry && typeof entry === "object")
          )
        : [];

      setDetectedRegisteredGames(nativeGames);
      setRegisteredGamesProviderStates({
        ...(response.data?.providerStates ?? {}),
        local: {
          source: "native-installed-scan",
          count: nativeGames.length,
        },
      });
      setRegisteredGamesStatus(null);
    } catch {
      // best-effort load; UI still supports manual games
    } finally {
      setIsLoadingDetectedRegisteredGames(false);
    }
  }, []);

  const loadRunningApps = useCallback(async () => {
    try {
      setIsLoadingRunningApps(true);

      setRunningApps([]);
      setSelectedRunningAppId("");
    } catch {
      setRunningApps([]);
      setSelectedRunningAppId("");
    } finally {
      setIsLoadingRunningApps(false);
    }
  }, []);

  const formatDeviceSessionDate = (value: string | null | undefined) => {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
      return "N/A";
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return "N/A";
    }

    return parsed.toLocaleString();
  };

  const loadDeviceSessions = useCallback(async () => {
    try {
      setIsLoadingDeviceSessions(true);
      setDevicesStatus(null);

      const response = await axios.get<{
        sessions?: DeviceSession[];
      }>("/api/profile/devices");

      const sessions = Array.isArray(response.data?.sessions)
        ? response.data.sessions.filter(
            (entry): entry is DeviceSession =>
              Boolean(entry && typeof entry === "object" && typeof entry.sessionId === "string")
          )
        : [];

      setDeviceSessions(sessions);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error ?? "Could not load devices."
        : "Could not load devices.";
      setDevicesStatus(message);
      setDeviceSessions([]);
    } finally {
      setIsLoadingDeviceSessions(false);
    }
  }, []);

  const onRevokeDeviceSession = async (sessionId: string) => {
    if (deviceSessionActionPending) {
      return;
    }

    try {
      setDeviceSessionActionPending(sessionId);
      setDevicesStatus(null);

      const response = await axios.post<{
        sessions?: DeviceSession[];
        loggedOut?: boolean;
      }>("/api/profile/devices", {
        action: "revoke",
        sessionId,
      });

      if (response.data?.loggedOut) {
        onClose();
        router.push("/sign-in");
        router.refresh();
        return;
      }

      const sessions = Array.isArray(response.data?.sessions)
        ? response.data.sessions.filter(
            (entry): entry is DeviceSession =>
              Boolean(entry && typeof entry === "object" && typeof entry.sessionId === "string")
          )
        : [];

      setDeviceSessions(sessions);
      setDevicesStatus("Device session removed.");
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error ?? "Could not update device session."
        : "Could not update device session.";
      setDevicesStatus(message);
    } finally {
      setDeviceSessionActionPending(null);
    }
  };

  const onLogoutOtherDevices = async () => {
    if (deviceSessionActionPending) {
      return;
    }

    try {
      setDeviceSessionActionPending("logout-others");
      setDevicesStatus(null);

      const response = await axios.post<{
        sessions?: DeviceSession[];
      }>("/api/profile/devices", {
        action: "logout-others",
      });

      const sessions = Array.isArray(response.data?.sessions)
        ? response.data.sessions.filter(
            (entry): entry is DeviceSession =>
              Boolean(entry && typeof entry === "object" && typeof entry.sessionId === "string")
          )
        : [];

      setDeviceSessions(sessions);
      setDevicesStatus("Logged out of other devices.");
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error ?? "Could not log out other devices."
        : "Could not log out other devices.";
      setDevicesStatus(message);
    } finally {
      setDeviceSessionActionPending(null);
    }
  };

  useEffect(() => {
    if (!isOpen || type !== "settings") {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await axios.get<{
          connectedAccounts?: string[];
          providerAvailability?: Record<string, boolean>;
          providerOAuthSupport?: Record<string, boolean>;
        }>("/api/profile/connections");

        if (cancelled) {
          return;
        }

        const linked = Array.isArray(response.data?.connectedAccounts)
          ? response.data.connectedAccounts
              .filter((value): value is string => typeof value === "string")
              .map((value) => value.trim().toLowerCase())
              .filter((value) => connectionProviders.some((provider) => provider.key === value))
          : [];

        setConnectedAccounts(Array.from(new Set(linked)));
        setConnectionProviderAvailability(response.data?.providerAvailability ?? {});
        setConnectionProviderOAuthSupport(response.data?.providerOAuthSupport ?? {});
      } catch {
        if (cancelled) {
          return;
        }
        setConnectionProviderAvailability({});
        setConnectionProviderOAuthSupport({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, type]);

  useEffect(() => {
    if (!isOpen || type !== "settings" || displaySection !== "devices") {
      return;
    }

    void loadDeviceSessions();
  }, [displaySection, isOpen, loadDeviceSessions, type]);

  useEffect(() => {
    if (!isOpen || type !== "settings" || displaySection !== "registeredGames") {
      return;
    }

    void loadDetectedRegisteredGames();
    void loadRunningApps();
  }, [connectedAccounts, displaySection, isOpen, loadDetectedRegisteredGames, loadRunningApps, type]);

  useEffect(() => {
    if (!isModalOpen || typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    const connectionStatus = url.searchParams.get("connectionStatus");
    const connectionError = url.searchParams.get("connectionError");
    const providerKey = String(url.searchParams.get("provider") ?? "").trim().toLowerCase();

    if (!connectionStatus && !connectionError) {
      return;
    }

    const providerLabel =
      connectionProviders.find((provider) => provider.key === providerKey)?.label ?? "Connection";

    if (connectionStatus === "connected") {
      setConnectionsStatus(`${providerLabel} connected.`);
      setActiveSection("connections");
      setDisplaySection("connections");
      setIsSectionVisible(true);
    } else if (connectionError) {
      const readableError = decodeURIComponent(connectionError)
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      setConnectionsStatus(readableError || "Could not connect provider.");
      setActiveSection("connections");
      setDisplaySection("connections");
      setIsSectionVisible(true);
    }

    url.searchParams.delete("connectionStatus");
    url.searchParams.delete("connectionError");
    url.searchParams.delete("provider");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [isModalOpen]);

  const onSubmitBugReport = async () => {
    const normalizedTitle = bugTitle.trim();
    const normalizedSteps = bugSteps.trim();
    const normalizedExpected = bugExpected.trim();
    const normalizedActual = bugActual.trim();

    setBugReportStatus(null);

    if (!normalizedTitle) {
      setBugReportStatus("Please add a short bug title.");
      return;
    }

    if (!normalizedActual) {
      setBugReportStatus("Please describe what happened.");
      return;
    }

    try {
      setIsSubmittingBugReport(true);

      const reason = `[${bugSeverity.toUpperCase()}] ${bugCategory.toUpperCase()} — ${normalizedTitle}`.slice(0, 300);
      const details = [
        `Category: ${bugCategory}`,
        `Severity: ${bugSeverity}`,
        normalizedSteps ? `Steps to reproduce:\n${normalizedSteps}` : "",
        normalizedExpected ? `Expected result:\n${normalizedExpected}` : "",
        `Actual result:\n${normalizedActual}`,
      ]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 4000);

      await axios.post("/api/reports", {
        targetType: "BUG",
        targetId: "IN_ACCORD_APP",
        reason,
        details,
      });

      setBugReportStatus("Bug report submitted. Thanks for helping improve In-Accord.");
      setBugTitle("");
      setBugCategory("general");
      setBugSeverity("medium");
      setBugSteps("");
      setBugExpected("");
      setBugActual("");
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error ?? "Could not submit bug report."
        : "Could not submit bug report.";
      setBugReportStatus(message);
    } finally {
      setIsSubmittingBugReport(false);
    }
  };

  const loadPatronageHistory = useCallback(async () => {
    try {
      setIsLoadingPatronageHistory(true);
      setPatronageStatus(null);

      const response = await axios.get<{
        entries?: PatronageHistoryEntry[];
      }>("/api/patronage");

      setPatronageHistory(
        Array.isArray(response.data?.entries)
          ? response.data.entries.filter(
              (entry): entry is PatronageHistoryEntry =>
                typeof entry?.id === "string" &&
                (entry.donationType === "ONE_TIME" || entry.donationType === "MONTHLY")
            )
          : []
      );
    } catch {
      setPatronageHistory([]);
      setPatronageStatus("Could not load patronage history.");
    } finally {
      setIsLoadingPatronageHistory(false);
    }
  }, []);

  const onSubmitPatronage = async () => {
    const amount = Number(patronageAmount);
    const payerName = patronagePayerName.trim();
    const payerEmail = patronagePayerEmail.trim();

    if (!payerName) {
      setPatronageStatus("Please enter the payer name.");
      return;
    }

    if (!payerEmail || !/^\S+@\S+\.\S+$/.test(payerEmail)) {
      setPatronageStatus("Please enter a valid payer email.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setPatronageStatus("Please enter a valid amount greater than 0.");
      return;
    }

    const amountCents = Math.round(amount * 100);
    if (amountCents <= 0) {
      setPatronageStatus("Amount is too small.");
      return;
    }

    try {
      setIsSubmittingPatronage(true);
      setPatronageStatus(null);

      const response = await axios.post<{
        checkoutUrl?: string | null;
        requiresRedirect?: boolean;
      }>("/api/patronage", {
        donationType: patronageType,
        amountCents,
        currency: "USD",
        note: patronageNote,
        payerName,
        payerEmail,
      });

      const checkoutUrl = String(response.data?.checkoutUrl ?? "").trim();
      if (checkoutUrl) {
        setIsPatronagePaymentPanelOpen(false);
        setPendingPatronageCheckoutUrl(checkoutUrl);
        setPendingPatronageRequest({
          donationType: patronageType,
          amountCents,
          currency: "USD",
          payerName,
          payerEmail,
          note: patronageNote.trim() ? patronageNote.trim() : null,
        });
        setPatronageStatus("Payment request created. Continue in Billing → Payment Request Panel.");
        setActiveSection("billing");
        setDisplaySection("billing");
        setIsSectionVisible(true);
        return;
      }

      setPatronageStatus(
        patronageType === "MONTHLY"
          ? "Monthly patronage request submitted. Thank you for supporting In-Accord."
          : "One-time patronage request submitted. Thank you for supporting In-Accord."
      );
      setPatronageAmount("");
      setPatronageNote("");
      setPatronagePayerName("");
      setPatronagePayerEmail("");
      setIsPatronagePaymentPanelOpen(false);
      setPendingPatronageCheckoutUrl(null);
      setPendingPatronageRequest(null);
      await loadPatronageHistory();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error ?? "Could not submit patronage request."
        : "Could not submit patronage request.";
      setPatronageStatus(message);
    } finally {
      setIsSubmittingPatronage(false);
    }
  };

  const onCreatePatronageIntent = async () => {
    const amount = Number(patronageAmount);
    const payerName = patronagePayerName.trim();
    const payerEmail = patronagePayerEmail.trim();

    if (!payerName) {
      setPatronagePaymentPanelStatus("Please enter the payer name.");
      return;
    }

    if (!payerEmail || !/^\S+@\S+\.\S+$/.test(payerEmail)) {
      setPatronagePaymentPanelStatus("Please enter a valid payer email.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setPatronagePaymentPanelStatus("Please enter a valid amount greater than 0.");
      return;
    }

    const amountCents = Math.round(amount * 100);
    if (amountCents <= 0) {
      setPatronagePaymentPanelStatus("Amount is too small.");
      return;
    }

    try {
      setIsPreparingPatronageIntent(true);
      setPatronagePaymentPanelStatus(null);

      const response = await axios.post<{
        clientSecret?: string;
        publishableKey?: string;
      }>("/api/patronage/intent", {
        donationType: patronageType,
        amountCents,
        currency: "USD",
        note: patronageNote,
        payerName,
        payerEmail,
      });

      const clientSecret = String(response.data?.clientSecret ?? "").trim();
      const publishableKey = String(response.data?.publishableKey ?? "").trim();

      if (!clientSecret || !publishableKey) {
        setPatronagePaymentPanelStatus("Could not initialize payment form.");
        return;
      }

      setPatronageIntentClientSecret(clientSecret);
      setPatronageStripePublishableKey(publishableKey);
      setPatronagePaymentPanelStatus("Payment form ready. Enter card/bank details or choose PayPal if available.");
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error ?? "Could not initialize payment form."
        : "Could not initialize payment form.";
      setPatronagePaymentPanelStatus(message);
    } finally {
      setIsPreparingPatronageIntent(false);
    }
  };

  const onConfirmPatronageIntent = async (paymentIntentId: string) => {
    try {
      const response = await axios.post<{ status?: string }>("/api/patronage/intent-confirm", {
        paymentIntentId,
      });

      if (String(response.data?.status ?? "").toUpperCase() !== "SUCCEEDED") {
        setPatronagePaymentPanelStatus("Payment is still processing. Please wait a moment and refresh history.");
        return;
      }

      setPatronageStatus("Payment confirmed. Thank you for supporting In-Accord.");
      setPatronagePaymentPanelStatus("Payment completed successfully.");
      setPatronageIntentClientSecret(null);
      setPatronageStripePublishableKey(null);
      setPendingPatronageCheckoutUrl(null);
      setPendingPatronageRequest(null);
      setPatronageAmount("");
      setPatronageNote("");
      setPatronagePayerName("");
      setPatronagePayerEmail("");
      setIsPatronagePaymentPanelOpen(false);
      await loadPatronageHistory();
    } catch {
      setPatronagePaymentPanelStatus("Payment finished, but confirmation failed. Please refresh history.");
      await loadPatronageHistory();
    }
  };

  const onCancelLatestPendingPatronage = async () => {
    const latestPending = patronageHistory.find((entry) => entry.status === "PENDING");
    if (!latestPending) {
      setPatronageStatus("No pending patronage request found.");
      return;
    }

    try {
      setIsCancellingPatronage(true);
      setPatronageStatus(null);

      await axios.patch("/api/patronage", {
        id: latestPending.id,
      });

      setPatronageStatus("Pending patronage request canceled.");
      await loadPatronageHistory();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error ?? "Could not cancel patronage request."
        : "Could not cancel patronage request.";
      setPatronageStatus(message);
    } finally {
      setIsCancellingPatronage(false);
    }
  };

  useEffect(() => {
    if (!isModalOpen || activeSection !== "becomePatron") {
      return;
    }

    void loadPatronageHistory();
  }, [activeSection, isModalOpen, loadPatronageHistory]);

  useEffect(() => {
    if (!isModalOpen || activeSection !== "becomePatron" || typeof window === "undefined") {
      return;
    }

    const currentUrl = new URL(window.location.href);
    const patronageState = String(currentUrl.searchParams.get("patronage") ?? "").trim().toLowerCase();
    const patronageSessionId = String(currentUrl.searchParams.get("patronageSessionId") ?? "").trim();
    const hasPatronageParams = currentUrl.searchParams.has("patronage") || currentUrl.searchParams.has("patronageSessionId");

    if (patronageState === "success") {
      setPendingPatronageCheckoutUrl(null);
      setPendingPatronageRequest(null);
      if (patronageSessionId) {
        setPatronageStatus("Checkout completed. Verifying payment status...");

        void axios
          .get<{
            status?: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "REFUNDED";
          }>("/api/patronage/verify", {
            params: {
              sessionId: patronageSessionId,
            },
          })
          .then((response) => {
            const status = response.data?.status;
            if (status === "SUCCEEDED") {
              setPatronageStatus("Payment confirmed. Thank you for supporting In-Accord.");
              return;
            }

            if (status === "PENDING") {
              setPatronageStatus("Payment is still processing. Check back in a moment.");
              return;
            }

            if (status === "FAILED") {
              setPatronageStatus("Payment failed. You can try again whenever you’re ready.");
              return;
            }

            if (status === "CANCELED") {
              setPatronageStatus("Checkout expired or was canceled. You can try again whenever you’re ready.");
              return;
            }

            if (status === "REFUNDED") {
              setPatronageStatus("This patronage payment was refunded.");
              return;
            }

            setPatronageStatus("Checkout completed. Thank you for supporting In-Accord.");
          })
          .catch(() => {
            setPatronageStatus("Checkout completed. We couldn't verify payment yet, but it may still process shortly.");
          })
          .finally(() => {
            void loadPatronageHistory();
          });
      } else {
        setPatronageStatus("Checkout completed. Thank you for supporting In-Accord.");
        void loadPatronageHistory();
      }
    } else if (patronageState === "cancel") {
      setPendingPatronageCheckoutUrl(null);
      setPendingPatronageRequest(null);
      setPatronageStatus("Checkout canceled. You can try again whenever you’re ready.");
    }

    if (hasPatronageParams) {
      currentUrl.searchParams.delete("patronage");
      currentUrl.searchParams.delete("patronageSessionId");
      const nextPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
      window.history.replaceState({}, "", nextPath);
    }
  }, [activeSection, isModalOpen, loadPatronageHistory]);

  const hydrateServerTags = useCallback(async () => {
    try {
      setIsLoadingServerTags(true);
      setServerTagsStatus(null);

      const response = await axios.get<{
        ownedServers?: OwnedServerTag[];
        memberServerTags?: MemberServerTag[];
        selectedServerId?: string | null;
        iconOptions?: ServerTagIconOption[];
      }>("/api/server-tags");

      const owned = Array.isArray(response.data?.ownedServers)
        ? response.data.ownedServers.filter(
            (item): item is OwnedServerTag =>
              typeof item?.serverId === "string" && typeof item?.serverName === "string"
          )
        : [];

      const memberTags = Array.isArray(response.data?.memberServerTags)
        ? response.data.memberServerTags.filter(
            (item): item is MemberServerTag =>
              typeof item?.serverId === "string" &&
              typeof item?.serverName === "string" &&
              typeof item?.tagCode === "string" &&
              typeof item?.iconKey === "string"
          )
        : [];

      const icons = Array.isArray(response.data?.iconOptions)
        ? response.data.iconOptions.filter(
            (item): item is ServerTagIconOption =>
              typeof item?.key === "string" &&
              typeof item?.label === "string" &&
              typeof item?.emoji === "string"
          )
        : [];

      setOwnedServerTags(owned);
      setMemberServerTags(memberTags);
      setServerTagIconOptions(icons);

      const selectedMemberServerId = memberTags.find((item) => item.isSelected)?.serverId ?? "";
      setSelectedProfileServerId(selectedMemberServerId);

      const nextSelectedOwnedServerId =
        selectedOwnedServerId && owned.some((item) => item.serverId === selectedOwnedServerId)
          ? selectedOwnedServerId
          : (owned[0]?.serverId ?? "");

      setSelectedOwnedServerId(nextSelectedOwnedServerId);

      const selectedOwned = owned.find((item) => item.serverId === nextSelectedOwnedServerId);
      setOwnerTagCodeInput(selectedOwned?.tagCode ?? "");

      const selectedIconKey = selectedOwned?.iconKey;
      if (selectedIconKey && icons.some((item) => item.key === selectedIconKey)) {
        setOwnerTagIconKey(selectedIconKey);
      } else if (icons.length > 0) {
        setOwnerTagIconKey(icons[0].key);
      }
    } catch {
      setServerTagsStatus("Could not load server tags.");
    } finally {
      setIsLoadingServerTags(false);
    }
  }, [selectedOwnedServerId]);

  useEffect(() => {
    if (!isModalOpen || activeSection !== "serverBoost") {
      return;
    }

    void hydrateServerTags();
  }, [activeSection, hydrateServerTags, isModalOpen]);

  const onChangeOwnedServer = (serverId: string) => {
    setSelectedOwnedServerId(serverId);
    setServerTagsStatus(null);

    const selectedOwned = ownedServerTags.find((item) => item.serverId === serverId);
    setOwnerTagCodeInput(selectedOwned?.tagCode ?? "");

    if (selectedOwned?.iconKey && serverTagIconOptions.some((item) => item.key === selectedOwned.iconKey)) {
      setOwnerTagIconKey(selectedOwned.iconKey);
    }
  };

  const onSaveOwnedServerTag = async () => {
    if (!selectedOwnedServerId) {
      setServerTagsStatus("Select a server first.");
      return;
    }

    const normalizedTagCode = normalizeOwnerTagCode(ownerTagCodeInput);
    if (normalizedTagCode && !/^[A-Z]{3,4}$/.test(normalizedTagCode)) {
      setServerTagsStatus("Tag must be exactly 3 or 4 uppercase letters.");
      return;
    }

    try {
      setIsSavingServerTags(true);
      setServerTagsStatus(null);

      await axios.patch("/api/server-tags", {
        mode: "owner",
        serverId: selectedOwnedServerId,
        tagCode: normalizedTagCode || null,
        iconKey: ownerTagIconKey,
      });

      setServerTagsStatus(normalizedTagCode ? "Server tag saved." : "Server tag removed.");
      await hydrateServerTags();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error ?? "Could not save server tag."
        : "Could not save server tag.";
      setServerTagsStatus(message);
    } finally {
      setIsSavingServerTags(false);
    }
  };

  const onSelectProfileServerTag = async (serverId: string | null) => {
    try {
      setIsSavingServerTags(true);
      setServerTagsStatus(null);

      const response = await axios.patch<{
        memberServerTags?: MemberServerTag[];
      }>("/api/server-tags", {
        mode: "profile",
        selectedServerId: serverId,
      });

      const updatedMemberTags = Array.isArray(response.data?.memberServerTags)
        ? response.data.memberServerTags.filter(
            (item): item is MemberServerTag =>
              typeof item?.serverId === "string" &&
              typeof item?.serverName === "string" &&
              typeof item?.tagCode === "string" &&
              typeof item?.iconKey === "string"
          )
        : memberServerTags;

      setMemberServerTags(updatedMemberTags);
      setSelectedProfileServerId(updatedMemberTags.find((item) => item.isSelected)?.serverId ?? "");
      setServerTagsStatus(serverId ? "Profile server tag selected." : "Profile server tag cleared.");
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error ?? "Could not select profile tag."
        : "Could not select profile tag.";
      setServerTagsStatus(message);
    } finally {
      setIsSavingServerTags(false);
    }
  };

  const hydrateServerProfiles = useCallback(async () => {
    try {
      setIsLoadingServerProfiles(true);
      setServerProfileStatus(null);

      const response = await axios.get<{ servers?: MemberServerProfileOption[] }>("/api/profile/server");
      const servers = Array.isArray(response.data?.servers)
        ? response.data.servers.filter(
            (item): item is MemberServerProfileOption =>
              typeof item?.serverId === "string" && typeof item?.serverName === "string"
          )
        : [];

      setMemberProfileServers(servers);

      const nextSelectedServerId =
        selectedProfileSettingsServerId &&
        servers.some((item) => item.serverId === selectedProfileSettingsServerId)
          ? selectedProfileSettingsServerId
          : (servers[0]?.serverId ?? "");

      setSelectedProfileSettingsServerId(nextSelectedServerId);

      const selectedServer = servers.find((item) => item.serverId === nextSelectedServerId);
      setServerProfileNameInput(selectedServer?.profileName ?? "");
      const normalizedServerStyle = normalizeProfileNameStyleValue(selectedServer?.profileNameStyle ?? "");
      const serverStyleParts = getProfileNameStyleParts(normalizedServerStyle);
      setServerProfileNameStyleInput(selectedServer?.profileNameStyle ?? "");
      setServerProfileNameFontInput(serverStyleParts.font);
      setServerProfileNameEffectInput(serverStyleParts.effect);
      setServerProfileNameColorInput(serverStyleParts.color);
      setServerProfileCommentInput(selectedServer?.comment ?? "");
      setServerProfileNameplateLabelInput(selectedServer?.nameplateLabel ?? "");
      setServerProfileNameplateColorInput(selectedServer?.nameplateColor ?? "");
      setServerProfileNameplateImageUrlInput(selectedServer?.nameplateImageUrl ?? "");
      setServerProfileImageInput(selectedServer?.imageUrl ?? "");
      setServerProfileAvatarDecorationInput(selectedServer?.avatarDecorationUrl ?? "");
      setServerProfileEffectInput(selectedServer?.profileEffectUrl ?? "");
      setServerProfileBannerInput(selectedServer?.bannerUrl ?? "");
    } catch {
      setServerProfileStatus("Could not load per-server profiles.");
      setMemberProfileServers([]);
      setSelectedProfileSettingsServerId("");
      setServerProfileNameInput("");
      setServerProfileNameStyleInput("");
      setServerProfileNameFontInput("default");
      setServerProfileNameEffectInput("solid");
      setServerProfileNameColorInput("default");
      setServerProfileCommentInput("");
      setServerProfileNameplateLabelInput("");
      setServerProfileNameplateColorInput("");
      setServerProfileNameplateImageUrlInput("");
      setServerProfileImageInput("");
      setServerProfileAvatarDecorationInput("");
      setServerProfileEffectInput("");
      setServerProfileBannerInput("");
    } finally {
      setIsLoadingServerProfiles(false);
    }
  }, [selectedProfileSettingsServerId]);

  useEffect(() => {
    if (!isModalOpen || activeSection !== "profiles") {
      return;
    }

    void hydrateServerProfiles();
  }, [activeSection, hydrateServerProfiles, isModalOpen]);

  const onChangeProfileSettingsServer = (serverId: string) => {
    setSelectedProfileSettingsServerId(serverId);
    setServerProfileStatus(null);

    const selectedServer = memberProfileServers.find((item) => item.serverId === serverId);
    setServerProfileNameInput(selectedServer?.profileName ?? "");
    const normalizedServerStyle = normalizeProfileNameStyleValue(selectedServer?.profileNameStyle ?? "");
    const serverStyleParts = getProfileNameStyleParts(normalizedServerStyle);
    setServerProfileNameStyleInput(selectedServer?.profileNameStyle ?? "");
    setServerProfileNameFontInput(serverStyleParts.font);
    setServerProfileNameEffectInput(serverStyleParts.effect);
    setServerProfileNameColorInput(serverStyleParts.color);
    setServerProfileCommentInput(selectedServer?.comment ?? "");
    setServerProfileNameplateLabelInput(selectedServer?.nameplateLabel ?? "");
    setServerProfileNameplateColorInput(selectedServer?.nameplateColor ?? "");
    setServerProfileNameplateImageUrlInput(selectedServer?.nameplateImageUrl ?? "");
    setServerProfileImageInput(selectedServer?.imageUrl ?? "");
    setServerProfileAvatarDecorationInput(selectedServer?.avatarDecorationUrl ?? "");
    setServerProfileEffectInput(selectedServer?.profileEffectUrl ?? "");
    setServerProfileBannerInput(selectedServer?.bannerUrl ?? "");
  };

  const onSaveServerProfile = async () => {
    if (!selectedProfileSettingsServerId) {
      setServerProfileStatus("Select a server first.");
      return;
    }

    const trimmedProfileName = serverProfileNameInput.trim();
    const trimmedProfileNameStyle = serverProfileNameStyleInput.trim().length > 0
      ? composeProfileNameStyleValue({
          font: serverProfileNameFontInput,
          effect: serverProfileNameEffectInput,
          color: serverProfileNameColorInput,
        })
      : "";
    const trimmedComment = serverProfileCommentInput.trim();
    const trimmedNameplateImageUrl = serverProfileNameplateImageUrlInput.trim();
    const trimmedImageUrl = serverProfileImageInput.trim();
    const inferredServerNameplateLabel = (
      trimmedProfileName ||
      memberProfileServers.find((item) => item.serverId === selectedProfileSettingsServerId)?.effectiveProfileName ||
      profileName ||
      realName ||
      "User"
    )
      .trim()
      .slice(0, 40);
    const trimmedNameplateLabel =
      serverProfileNameplateColorInput.trim().length > 0 || trimmedNameplateImageUrl.length > 0
        ? inferredServerNameplateLabel
        : "";
    const trimmedNameplateColor = serverProfileNameplateColorInput.trim();
    const trimmedAvatarDecorationUrl = serverProfileAvatarDecorationInput.trim();
    const trimmedProfileEffectUrl = serverProfileEffectInput.trim();
    const trimmedBannerUrl = serverProfileBannerInput.trim();

    if (trimmedProfileName.length > 80) {
      setServerProfileStatus("Profile name must be 80 characters or fewer.");
      return;
    }

    if (trimmedComment.length > 280) {
      setServerProfileStatus("Comment must be 280 characters or fewer.");
      return;
    }

    if (trimmedNameplateColor.length > 0 && !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmedNameplateColor)) {
      setServerProfileStatus("Nameplate color must be a valid hex color.");
      return;
    }

    if (trimmedNameplateImageUrl.length > 2048) {
      setServerProfileStatus("Nameplate image URL is too long.");
      return;
    }

    try {
      setIsSavingServerProfile(true);
      setServerProfileStatus(null);

      await axios.patch("/api/profile/server", {
        serverId: selectedProfileSettingsServerId,
        profileName: trimmedProfileName || null,
        profileNameStyle: trimmedProfileNameStyle || null,
        comment: trimmedComment || null,
        nameplateLabel: trimmedNameplateLabel || null,
        nameplateColor: trimmedNameplateLabel ? (trimmedNameplateColor || "#5865f2") : null,
        nameplateImageUrl: trimmedNameplateImageUrl || null,
        imageUrl: trimmedImageUrl || null,
        avatarDecorationUrl: trimmedAvatarDecorationUrl || null,
        profileEffectUrl: trimmedProfileEffectUrl || null,
        bannerUrl: trimmedBannerUrl || null,
      });

      await hydrateServerProfiles();
      setServerProfileStatus(
        trimmedProfileName ||
          trimmedProfileNameStyle ||
          trimmedComment ||
          trimmedNameplateLabel ||
          trimmedNameplateImageUrl ||
          trimmedImageUrl ||
          trimmedAvatarDecorationUrl ||
          trimmedProfileEffectUrl ||
          trimmedBannerUrl
          ? "Server profile saved."
          : "Server profile reset to your global profile."
      );

      window.dispatchEvent(new CustomEvent("inaccord:profile-card-refresh"));
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error ?? "Could not save server profile."
        : "Could not save server profile.";
      setServerProfileStatus(message);
    } finally {
      setIsSavingServerProfile(false);
    }
  };

  const onResetServerProfile = async () => {
    if (!selectedProfileSettingsServerId) {
      setServerProfileStatus("Select a server first.");
      return;
    }

    try {
      setIsSavingServerProfile(true);
      setServerProfileStatus(null);

      await axios.patch("/api/profile/server", {
        serverId: selectedProfileSettingsServerId,
        profileName: null,
        profileNameStyle: null,
        comment: null,
        nameplateLabel: null,
        nameplateColor: null,
        nameplateImageUrl: null,
        imageUrl: null,
        avatarDecorationUrl: null,
        profileEffectUrl: null,
        bannerUrl: null,
      });

      await hydrateServerProfiles();
      setServerProfileNameFontInput("default");
      setServerProfileNameEffectInput("solid");
      setServerProfileNameColorInput("default");
      setServerProfileStatus("Server profile reset to your global profile.");
      window.dispatchEvent(new CustomEvent("inaccord:profile-card-refresh"));
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error ?? "Could not reset server profile."
        : "Could not reset server profile.";
      setServerProfileStatus(message);
    } finally {
      setIsSavingServerProfile(false);
    }
  };

  const applyCustomCss = (cssText: string) => {
    if (typeof document === "undefined") {
      return;
    }

    let styleElement = document.getElementById(CUSTOM_CSS_STYLE_ID) as HTMLStyleElement | null;
    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = CUSTOM_CSS_STYLE_ID;
      document.head.appendChild(styleElement);
    }

    styleElement.textContent = cssText;
  };

  const onSaveCustomCss = () => {
    applyCustomCss(customCss);

    void axios
      .patch("/api/profile/preferences", {
        customCss,
      })
      .then(() => {
        setCustomCssStatus("Custom CSS saved and applied.");
      })
      .catch(() => {
        setCustomCssStatus("Could not save Custom CSS in database.");
      });
  };

  const onResetCustomCss = () => {
    setCustomCss("");
    applyCustomCss("");

    void axios
      .patch("/api/profile/preferences", {
        customCss: "",
      })
      .then(() => {
        setCustomCssStatus("Custom CSS cleared.");
      })
      .catch(() => {
        setCustomCssStatus("Could not clear Custom CSS in database.");
      });
  };

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    let cancelled = false;

    const resolveProfileId = async () => {
      try {
        const response = await axios.get<{
          id?: string;
          name?: string;
          realName?: string;
          profileName?: string | null;
          profileNameStyle?: string | null;
          nameplateLabel?: string | null;
          nameplateColor?: string | null;
          nameplateImageUrl?: string | null;
          pronouns?: string | null;
          comment?: string | null;
          avatarDecorationUrl?: string | null;
          profileEffectUrl?: string | null;
          phoneNumber?: string | null;
          dateOfBirth?: string | null;
          bannerUrl?: string | null;
          role?: string | null;
          presenceStatus?: string | null;
          currentGame?: string | null;
        }>("/api/profile/me");
        if (!cancelled) {
          setResolvedProfileId(response.data?.id ?? null);
          setRealName(response.data?.realName ?? response.data?.name ?? "");
          setProfileName(response.data?.profileName ?? "");
          setDefaultProfileNameDraft(response.data?.profileName ?? "");
          const normalizedDefaultStyle = normalizeProfileNameStyleValue(response.data?.profileNameStyle);
          const defaultStyleParts = getProfileNameStyleParts(normalizedDefaultStyle);
          setDefaultProfileNameStyle(normalizedDefaultStyle);
          setDefaultProfileNameFont(defaultStyleParts.font);
          setDefaultProfileNameEffect(defaultStyleParts.effect);
          setDefaultProfileNameColor(defaultStyleParts.color);
          setDefaultProfileNameStyleStatus(null);
          const hydratedPronouns = response.data?.pronouns ?? "";
          setPronouns(hydratedPronouns);
          setPronounsDraft(hydratedPronouns);
          const hydratedComment = response.data?.comment ?? "";
          setComment(hydratedComment);
          setCommentDraft(hydratedComment);
          const hydratedNameplateLabel = response.data?.nameplateLabel ?? "";
          const hydratedNameplateColor = response.data?.nameplateColor ?? "";
          const hydratedNameplateImageUrl = response.data?.nameplateImageUrl ?? null;
          setNameplateLabel(hydratedNameplateLabel);
          setNameplateColor(hydratedNameplateColor || "");
          setNameplateImageUrl(hydratedNameplateImageUrl);
          setNameplateLabelInput(hydratedNameplateLabel);
          setNameplateColorInput(hydratedNameplateColor || "");
          setNameplateImageUrlInput(hydratedNameplateImageUrl ?? "");
          setNameplateStatus(null);
          const hydratedAvatarDecorationUrl = response.data?.avatarDecorationUrl ?? null;
          setAvatarDecorationUrl(hydratedAvatarDecorationUrl);
          setAvatarDecorationInput(hydratedAvatarDecorationUrl ?? "");
          setAvatarDecorationStatus(null);
          const hydratedProfileEffectUrl = response.data?.profileEffectUrl ?? null;
          setProfileEffectUrl(hydratedProfileEffectUrl);
          setProfileEffectInput(hydratedProfileEffectUrl ?? "");
          setProfileEffectStatus(null);
          const hydratedPhoneNumber = response.data?.phoneNumber ?? "";
          setPhoneNumber(hydratedPhoneNumber);
          setPhoneNumberDraft(hydratedPhoneNumber);
          const hydratedDateOfBirth = response.data?.dateOfBirth ?? "";
          setDateOfBirth(hydratedDateOfBirth);
          setDateOfBirthDraft(hydratedDateOfBirth);
          setDateOfBirthStatus(null);
          setBannerUrl(response.data?.bannerUrl ?? null);
          setProfileRole(response.data?.role ?? data.profileRole ?? null);
          setProfilePresenceStatus(normalizePresenceStatus(response.data?.presenceStatus));
          setProfileCurrentGame(response.data?.currentGame?.trim() || null);
        }
      } catch (error) {
        if (!cancelled) {
          setResolvedProfileId(null);
        }
      }
    };

    void resolveProfileId();

    return () => {
      cancelled = true;
    };
  }, [data.profileRole, isModalOpen]);

  useEffect(() => {
    applyCustomCss(customCss);
  }, [customCss]);

  useEffect(() => {
    applyAccessibilityPreferencesToDocument(accessibilityPreferences);
  }, [accessibilityPreferences]);

  const loadBlockedProfiles = async () => {
    try {
      setIsLoadingBlockedProfiles(true);
      setBlockedProfilesError(null);

      const response = await axios.get<{ blocked?: BlockedProfileSummary[] }>("/api/friends/blocked");

      setBlockedProfiles(
        Array.isArray(response.data?.blocked)
          ? response.data.blocked.filter(
              (entry): entry is BlockedProfileSummary =>
                typeof entry?.profileId === "string" && entry.profileId.trim().length > 0
            )
          : []
      );
    } catch (error) {
      setBlockedProfilesError("Could not load blocked users.");
    } finally {
      setIsLoadingBlockedProfiles(false);
    }
  };

  useEffect(() => {
    if (!isModalOpen || activeSection !== "friendRequests") {
      return;
    }

    void loadBlockedProfiles();
  }, [activeSection, isModalOpen]);

  const onUnblockProfile = async (targetProfileId: string) => {
    if (!targetProfileId || unblockingProfileId) {
      return;
    }

    try {
      setUnblockingProfileId(targetProfileId);
      setBlockedProfilesError(null);

      await axios.delete("/api/friends/blocked", {
        data: {
          profileId: targetProfileId,
        },
      });

      setBlockedProfiles((prev) => prev.filter((entry) => entry.profileId !== targetProfileId));
      router.refresh();
    } catch {
      setBlockedProfilesError("Could not unblock this user.");
    } finally {
      setUnblockingProfileId(null);
    }
  };

  const onSaveProfileName = async (nameOverride?: string) => {
    const trimmedName = (nameOverride ?? profileName).trim();

    setProfileNameError(null);
    setProfileNameSuccess(null);

    if (!trimmedName) {
      setProfileNameError("Profile Name is required.");
      return false;
    }

    if (trimmedName.length > 80) {
      setProfileNameError("Profile Name must be 80 characters or fewer.");
      return false;
    }

    try {
      setIsSavingProfileName(true);

      const response = await axios.patch<{ ok: boolean; profileName: string }>("/api/profile/name", {
        profileName: trimmedName,
      });

      const savedName = response.data?.profileName ?? trimmedName;
      setProfileName(savedName);
      setDefaultProfileNameDraft(savedName);
      setProfileNameSuccess("Profile Name updated.");
      window.dispatchEvent(
        new CustomEvent("inaccord:profile-updated", {
          detail: {
            profileId: resolvedProfileId,
            profileName: savedName,
          },
        })
      );
      router.refresh();
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Failed to update Profile Name";
        setProfileNameError(message);
      } else {
        setProfileNameError("Failed to update Profile Name");
      }
      return false;
    } finally {
      setIsSavingProfileName(false);
    }
  };

  const onSaveDefaultProfileNameStyle = async () => {
    try {
      setIsSavingDefaultProfileNameStyle(true);
      setDefaultProfileNameStyleStatus(null);

      const composedStyleValue = composeProfileNameStyleValue({
        font: defaultProfileNameFont,
        effect: defaultProfileNameEffect,
        color: defaultProfileNameColor,
      });

      const response = await axios.patch<{ ok: boolean; profileNameStyle: string }>(
        "/api/profile/name-style",
        {
          profileNameStyle: composedStyleValue,
        }
      );

      const savedStyle = normalizeProfileNameStyleValue(response.data?.profileNameStyle);
      const savedParts = getProfileNameStyleParts(savedStyle);

      setDefaultProfileNameStyle(savedStyle);
      setDefaultProfileNameFont(savedParts.font);
      setDefaultProfileNameEffect(savedParts.effect);
      setDefaultProfileNameColor(savedParts.color);
      setDefaultProfileNameStyleStatus("Default profile name style saved.");
      window.dispatchEvent(new CustomEvent("inaccord:profile-card-refresh"));
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Failed to save profile name style";
        setDefaultProfileNameStyleStatus(message);
      } else {
        setDefaultProfileNameStyleStatus("Failed to save profile name style");
      }
    } finally {
      setIsSavingDefaultProfileNameStyle(false);
    }
  };

  const onSavePronouns = async (pronounsOverride?: string) => {
    const trimmedPronouns = (pronounsOverride ?? pronouns).trim();

    if (trimmedPronouns.length > 80) {
      setPronounsStatus("Pronouns must be 80 characters or fewer.");
      return false;
    }

    try {
      setIsSavingPronouns(true);
      setPronounsStatus(null);

      const response = await axios.patch<{ ok: boolean; pronouns: string | null }>(
        "/api/profile/pronouns",
        {
          pronouns: trimmedPronouns || null,
        }
      );

      const savedPronouns = response.data?.pronouns ?? "";
      setPronouns(savedPronouns);
      setPronounsDraft(savedPronouns);
      setPronounsStatus(trimmedPronouns ? "Pronouns updated." : "Pronouns cleared.");
      window.dispatchEvent(new CustomEvent("inaccord:profile-card-refresh"));
      router.refresh();
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Failed to update pronouns";
        setPronounsStatus(message);
      } else {
        setPronounsStatus("Failed to update pronouns");
      }
      return false;
    } finally {
      setIsSavingPronouns(false);
    }
  };

  const onSaveComment = async (commentOverride?: string) => {
    const trimmedComment = (commentOverride ?? comment).trim();

    if (trimmedComment.length > 280) {
      setCommentStatus("Comment must be 280 characters or fewer.");
      return false;
    }

    try {
      setIsSavingComment(true);
      setCommentStatus(null);

      const response = await axios.patch<{ ok: boolean; comment: string | null }>(
        "/api/profile/comment",
        {
          comment: trimmedComment || null,
        }
      );

      const savedComment = response.data?.comment ?? "";
      setComment(savedComment);
      setCommentDraft(savedComment);
      setCommentStatus(trimmedComment ? "Comment updated." : "Comment cleared.");
      window.dispatchEvent(new CustomEvent("inaccord:profile-card-refresh"));
      router.refresh();
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Failed to update comment";
        setCommentStatus(message);
      } else {
        setCommentStatus("Failed to update comment");
      }
      return false;
    } finally {
      setIsSavingComment(false);
    }
  };

  const onSavePhoneNumber = async (phoneNumberOverride?: string) => {
    const trimmedPhoneNumber = (phoneNumberOverride ?? phoneNumber).trim();

    if (trimmedPhoneNumber.length > 32) {
      setPhoneNumberStatus("Phone Number must be 32 characters or fewer.");
      return false;
    }

    try {
      setIsSavingPhoneNumber(true);
      setPhoneNumberStatus(null);

      const response = await axios.patch<{ ok: boolean; phoneNumber: string | null }>(
        "/api/profile/phone",
        {
          phoneNumber: trimmedPhoneNumber || null,
        }
      );

      const savedPhoneNumber = response.data?.phoneNumber ?? "";
      setPhoneNumber(savedPhoneNumber);
      setPhoneNumberDraft(savedPhoneNumber);
      setPhoneNumberStatus(trimmedPhoneNumber ? "Phone Number updated." : "Phone Number cleared.");
      router.refresh();
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Failed to update Phone Number";
        setPhoneNumberStatus(message);
      } else {
        setPhoneNumberStatus("Failed to update Phone Number");
      }
      return false;
    } finally {
      setIsSavingPhoneNumber(false);
    }
  };

  const onSaveDateOfBirth = async (dateOfBirthOverride?: string) => {
    const trimmedDateOfBirth = (dateOfBirthOverride ?? dateOfBirth).trim();

    if (trimmedDateOfBirth.length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(trimmedDateOfBirth)) {
      setDateOfBirthStatus("Date Of Birth must use YYYY-MM-DD format.");
      return false;
    }

    try {
      setIsSavingDateOfBirth(true);
      setDateOfBirthStatus(null);

      const response = await axios.patch<{ ok: boolean; dateOfBirth: string | null }>(
        "/api/profile/dob",
        {
          dateOfBirth: trimmedDateOfBirth || null,
        }
      );

      const savedDateOfBirth = response.data?.dateOfBirth ?? "";
      setDateOfBirth(savedDateOfBirth);
      setDateOfBirthDraft(savedDateOfBirth);
      setDateOfBirthStatus(trimmedDateOfBirth ? "Date Of Birth updated." : "Date Of Birth cleared.");
      router.refresh();
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Failed to update Date Of Birth";
        setDateOfBirthStatus(message);
      } else {
        setDateOfBirthStatus("Failed to update Date Of Birth");
      }
      return false;
    } finally {
      setIsSavingDateOfBirth(false);
    }
  };

  const canEditDateOfBirth = isInAccordAdministrator(profileRole ?? data.profileRole) || !dateOfBirth;
  const hasDateOfBirthChanges = canEditDateOfBirth && dateOfBirthDraft !== dateOfBirth;

  useEffect(() => {
    if (activeSection === displaySection) {
      return;
    }

    setIsSectionVisible(false);

    const timer = setTimeout(() => {
      setDisplaySection(activeSection);
      setIsSectionVisible(true);
    }, 120);

    return () => clearTimeout(timer);
  }, [activeSection, displaySection]);

  const onPickAvatar = () => {
    if (isUploadingAvatar) {
      return;
    }

    avatarInputRef.current?.click();
  };

  const onPickAvatarFromPanel = () => {
    if (isUploadingAvatar) {
      return;
    }

    avatarPanelInputRef.current?.click();
  };

  const onPickServerAvatarFromPanel = () => {
    if (isUploadingServerAvatar) {
      return;
    }

    serverAvatarPanelInputRef.current?.click();
  };

  const onAvatarChange = async (file?: File) => {
    if (!file) {
      return;
    }

    try {
      setIsUploadingAvatar(true);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=userImage",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      await axios.patch("/api/profile/avatar", {
        imageUrl: upload.data.url,
      });

      setAvatarUrl(upload.data.url);
      rememberUploadedAvatar(upload.data.url);
      window.dispatchEvent(
        new CustomEvent("inaccord:profile-updated", {
          detail: {
            profileId: resolvedProfileId,
            imageUrl: upload.data.url,
          },
        })
      );
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Upload failed";
        console.error("[SETTINGS_AVATAR_UPLOAD]", error.response?.data ?? error.message);
        window.alert(message);
      } else {
        console.error("[SETTINGS_AVATAR_UPLOAD]", error);
        window.alert("Upload failed");
      }
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
    }
  };

  const onAvatarPanelChange = async (file?: File) => {
    if (!file) {
      return;
    }

    try {
      setIsUploadingAvatar(true);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=userImage",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      await axios.patch("/api/profile/avatar", {
        imageUrl: upload.data.url,
      });

      setAvatarUrl(upload.data.url);
      rememberUploadedAvatar(upload.data.url);
      window.dispatchEvent(
        new CustomEvent("inaccord:profile-updated", {
          detail: {
            profileId: resolvedProfileId,
            imageUrl: upload.data.url,
          },
        })
      );
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Upload failed";
        console.error("[SETTINGS_AVATAR_UPLOAD]", error.response?.data ?? error.message);
        window.alert(message);
      } else {
        console.error("[SETTINGS_AVATAR_UPLOAD]", error);
        window.alert("Upload failed");
      }
    } finally {
      setIsUploadingAvatar(false);
      if (avatarPanelInputRef.current) {
        avatarPanelInputRef.current.value = "";
      }
    }
  };

  const onRemoveAvatarFromPanel = async () => {
    try {
      setIsUploadingAvatar(true);

      await axios.patch("/api/profile/avatar", {
        imageUrl: null,
      });

      setAvatarUrl(null);
      window.dispatchEvent(
        new CustomEvent("inaccord:profile-updated", {
          detail: {
            profileId: resolvedProfileId,
            imageUrl: null,
          },
        })
      );
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Failed to remove avatar";
        console.error("[SETTINGS_AVATAR_REMOVE]", error.response?.data ?? error.message);
        window.alert(message);
      } else {
        console.error("[SETTINGS_AVATAR_REMOVE]", error);
        window.alert("Failed to remove avatar");
      }
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const onServerAvatarPanelChange = async (file?: File) => {
    if (!file) {
      return;
    }

    try {
      setIsUploadingServerAvatar(true);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=userImage",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      const uploadedUrl = String(upload.data?.url ?? "").trim();
      if (!uploadedUrl) {
        throw new Error("Upload did not return a valid URL.");
      }

      setServerProfileImageInput(uploadedUrl);
      setServerProfileStatus("Avatar uploaded. Save server profile to apply.");
      rememberUploadedAvatar(uploadedUrl);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Avatar upload failed";
        setServerProfileStatus(message);
      } else {
        setServerProfileStatus("Avatar upload failed");
      }
    } finally {
      setIsUploadingServerAvatar(false);
      if (serverAvatarPanelInputRef.current) {
        serverAvatarPanelInputRef.current.value = "";
      }
    }
  };

  const onSaveAvatarDecoration = async () => {
    const trimmedAvatarDecorationUrl = avatarDecorationInput.trim();

    try {
      setIsSavingAvatarDecoration(true);
      setAvatarDecorationStatus(null);

      const response = await axios.patch<{ ok: boolean; avatarDecorationUrl: string | null }>(
        "/api/profile/avatar-decoration",
        {
          avatarDecorationUrl: trimmedAvatarDecorationUrl || null,
        }
      );

      const savedAvatarDecorationUrl = response.data?.avatarDecorationUrl ?? null;
      setAvatarDecorationUrl(savedAvatarDecorationUrl);
      setAvatarDecorationInput(savedAvatarDecorationUrl ?? "");
      setAvatarDecorationStatus(savedAvatarDecorationUrl ? "Avatar decoration updated." : "Avatar decoration cleared.");
      window.dispatchEvent(
        new CustomEvent("inaccord:profile-updated", {
          detail: {
            profileId: resolvedProfileId,
            avatarDecorationUrl: savedAvatarDecorationUrl,
          },
        })
      );
      window.dispatchEvent(new CustomEvent("inaccord:profile-card-refresh"));
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Failed to update avatar decoration";
        setAvatarDecorationStatus(message);
      } else {
        setAvatarDecorationStatus("Failed to update avatar decoration");
      }
    } finally {
      setIsSavingAvatarDecoration(false);
    }
  };

  const onSaveProfileEffect = async () => {
    const trimmedProfileEffectUrl = profileEffectInput.trim();

    try {
      setIsSavingProfileEffect(true);
      setProfileEffectStatus(null);

      const response = await axios.patch<{ ok: boolean; profileEffectUrl: string | null }>(
        "/api/profile/profile-effect",
        {
          profileEffectUrl: trimmedProfileEffectUrl || null,
        }
      );

      const savedProfileEffectUrl = response.data?.profileEffectUrl ?? null;
      setProfileEffectUrl(savedProfileEffectUrl);
      setProfileEffectInput(savedProfileEffectUrl ?? "");
      setProfileEffectStatus(savedProfileEffectUrl ? "Profile effect updated." : "Profile effect cleared.");
      window.dispatchEvent(
        new CustomEvent("inaccord:profile-updated", {
          detail: {
            profileId: resolvedProfileId,
            profileEffectUrl: savedProfileEffectUrl,
          },
        })
      );
      window.dispatchEvent(new CustomEvent("inaccord:profile-card-refresh"));
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Failed to update profile effect";
        setProfileEffectStatus(message);
      } else {
        setProfileEffectStatus("Failed to update profile effect");
      }
    } finally {
      setIsSavingProfileEffect(false);
    }
  };

  const onSaveNameplate = async (labelOverride?: string, colorOverride?: string, imageOverride?: string) => {
    const trimmedNameplateLabel = (labelOverride ?? nameplateLabelInput).trim();
    const trimmedNameplateColor = (colorOverride ?? nameplateColorInput).trim();
    const trimmedNameplateImageUrl = (imageOverride ?? nameplateImageUrlInput).trim();

    if (trimmedNameplateLabel.length > 40) {
      setNameplateStatus("Nameplate label must be 40 characters or fewer.");
      return false;
    }

    if (trimmedNameplateColor.length > 0 && !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmedNameplateColor)) {
      setNameplateStatus("Nameplate color must be a valid hex color.");
      return false;
    }

    if (trimmedNameplateImageUrl.length > 2048) {
      setNameplateStatus("Nameplate image URL is too long.");
      return false;
    }

    try {
      setIsSavingNameplate(true);
      setNameplateStatus(null);

      const response = await axios.patch<{
        ok: boolean;
        nameplateLabel: string | null;
        nameplateColor: string | null;
        nameplateImageUrl: string | null;
      }>(
        "/api/profile/nameplate",
        {
          nameplateLabel: trimmedNameplateLabel || null,
          nameplateColor: trimmedNameplateLabel ? (trimmedNameplateColor || "#5865f2") : null,
          nameplateImageUrl: trimmedNameplateImageUrl || null,
        }
      );

      const savedNameplateLabel = response.data?.nameplateLabel ?? "";
      const savedNameplateColor = response.data?.nameplateColor ?? "";
      const savedNameplateImageUrl = response.data?.nameplateImageUrl ?? null;

      setNameplateLabel(savedNameplateLabel);
      setNameplateColor(savedNameplateColor || "");
      setNameplateImageUrl(savedNameplateImageUrl);
      setNameplateLabelInput(savedNameplateLabel);
      setNameplateColorInput(savedNameplateColor || "");
      setNameplateImageUrlInput(savedNameplateImageUrl ?? "");
      setNameplateStatus(savedNameplateLabel ? "Nameplate updated." : "Nameplate cleared.");

      window.dispatchEvent(
        new CustomEvent("inaccord:profile-updated", {
          detail: {
            profileId: resolvedProfileId,
            nameplateLabel: savedNameplateLabel || null,
            nameplateColor: savedNameplateLabel ? (savedNameplateColor || "#5865f2") : null,
            nameplateImageUrl: savedNameplateImageUrl,
          },
        })
      );
      window.dispatchEvent(new CustomEvent("inaccord:profile-card-refresh"));
      router.refresh();
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Failed to update nameplate";
        setNameplateStatus(message);
      } else {
        setNameplateStatus("Failed to update nameplate");
      }
      return false;
    } finally {
      setIsSavingNameplate(false);
    }
  };

  const onPickBanner = () => {
    if (isUploadingBanner) {
      return;
    }

    bannerInputRef.current?.click();
  };

  const onPickServerBanner = () => {
    if (isUploadingServerBanner) {
      return;
    }

    serverBannerInputRef.current?.click();
  };

  const onPickNameplateImage = () => {
    if (isUploadingNameplateImage) {
      return;
    }

    nameplateImageInputRef.current?.click();
  };

  const onPickServerNameplateImage = () => {
    if (isUploadingServerNameplateImage) {
      return;
    }

    serverNameplateImageInputRef.current?.click();
  };

  const onBannerChange = async (file?: File) => {
    if (!file) {
      return;
    }

    try {
      setIsUploadingBanner(true);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=userBanner",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      await axios.patch("/api/profile/banner", {
        bannerUrl: upload.data.url,
      });

      setBannerUrl(upload.data.url);
      rememberUploadedBanner(upload.data.url);
      window.dispatchEvent(
        new CustomEvent("inaccord:profile-updated", {
          detail: {
            profileId: resolvedProfileId,
            bannerUrl: upload.data.url,
          },
        })
      );
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Banner upload failed";
        console.error("[SETTINGS_BANNER_UPLOAD]", error.response?.data ?? error.message);
        window.alert(message);
      } else {
        console.error("[SETTINGS_BANNER_UPLOAD]", error);
        window.alert("Banner upload failed");
      }
    } finally {
      setIsUploadingBanner(false);
      if (bannerInputRef.current) {
        bannerInputRef.current.value = "";
      }
    }
  };

  const onServerBannerChange = async (file?: File) => {
    if (!file) {
      return;
    }

    try {
      setIsUploadingServerBanner(true);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=userBanner",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      const uploadedUrl = String(upload.data?.url ?? "").trim();
      if (!uploadedUrl) {
        throw new Error("Upload did not return a valid URL.");
      }

      setServerProfileBannerInput(uploadedUrl);
      setServerProfileStatus("Banner uploaded. Save server profile to apply.");
      rememberUploadedBanner(uploadedUrl);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Banner upload failed";
        setServerProfileStatus(message);
      } else {
        setServerProfileStatus("Banner upload failed");
      }
    } finally {
      setIsUploadingServerBanner(false);
      if (serverBannerInputRef.current) {
        serverBannerInputRef.current.value = "";
      }
    }
  };

  const onNameplateImageChange = async (file?: File) => {
    if (!file) {
      return;
    }

    try {
      setIsUploadingNameplateImage(true);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=userBanner",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      const uploadedUrl = String(upload.data?.url ?? "").trim();
      if (!uploadedUrl) {
        throw new Error("Upload did not return a valid URL.");
      }

      setNameplateImageUrlInput(uploadedUrl);
      setNameplateStatus("Custom nameplate image uploaded. Save to apply.");
      rememberUploadedBanner(uploadedUrl);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Nameplate image upload failed";
        setNameplateStatus(message);
      } else {
        setNameplateStatus("Nameplate image upload failed");
      }
    } finally {
      setIsUploadingNameplateImage(false);
      if (nameplateImageInputRef.current) {
        nameplateImageInputRef.current.value = "";
      }
    }
  };

  const onServerNameplateImageChange = async (file?: File) => {
    if (!file) {
      return;
    }

    try {
      setIsUploadingServerNameplateImage(true);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=userBanner",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      const uploadedUrl = String(upload.data?.url ?? "").trim();
      if (!uploadedUrl) {
        throw new Error("Upload did not return a valid URL.");
      }

      setServerProfileNameplateImageUrlInput(uploadedUrl);
      setServerProfileStatus("Custom nameplate image uploaded. Save server profile to apply.");
      rememberUploadedBanner(uploadedUrl);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Nameplate image upload failed";
        setServerProfileStatus(message);
      } else {
        setServerProfileStatus("Nameplate image upload failed");
      }
    } finally {
      setIsUploadingServerNameplateImage(false);
      if (serverNameplateImageInputRef.current) {
        serverNameplateImageInputRef.current.value = "";
      }
    }
  };

  const onRemoveBanner = async () => {
    try {
      setIsUploadingBanner(true);
      await axios.patch("/api/profile/banner", {
        bannerUrl: null,
      });
      setBannerUrl(null);
      window.dispatchEvent(
        new CustomEvent("inaccord:profile-updated", {
          detail: {
            profileId: resolvedProfileId,
            bannerUrl: null,
          },
        })
      );
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Failed to remove banner";
        console.error("[SETTINGS_BANNER_REMOVE]", error.response?.data ?? error.message);
        window.alert(message);
      } else {
        console.error("[SETTINGS_BANNER_REMOVE]", error);
        window.alert("Failed to remove banner");
      }
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const onLogout = async () => {
    try {
      setIsLoggingOut(true);
      await axios.post("/api/auth/logout");
      onClose();
      router.push("/sign-in");
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Logout failed";
        console.error("[SETTINGS_LOGOUT]", error.response?.data ?? error.message);
        window.alert(message);
      } else {
        console.error("[SETTINGS_LOGOUT]", error);
        window.alert("Logout failed");
      }
    } finally {
      setIsLoggingOut(false);
    }
  };

  const onChangePassword = async () => {
    const trimmedCurrent = currentPassword.trim();
    const trimmedNext = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();
    const trimmedCredentialPin = credentialPin.trim();
    const trimmedCredentialPinConfirmOne = credentialPinConfirmOne.trim();
    const trimmedCredentialPinConfirmTwo = credentialPinConfirmTwo.trim();

    setPasswordError(null);
    setPasswordSuccess(null);

    if (!trimmedCurrent) {
      setPasswordError("Current password is required.");
      return;
    }

    if (trimmedNext.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }

    if (trimmedNext !== trimmedConfirm) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    if (trimmedCurrent === trimmedNext) {
      setPasswordError("New password must be different from current password.");
      return;
    }

    if (!trimmedCredentialPin || !trimmedCredentialPinConfirmOne || !trimmedCredentialPinConfirmTwo) {
      setPasswordError("Security PIN and both confirmations are required.");
      return;
    }

    if (
      trimmedCredentialPin !== trimmedCredentialPinConfirmOne ||
      trimmedCredentialPin !== trimmedCredentialPinConfirmTwo
    ) {
      setPasswordError("Security PIN confirmations must all match.");
      return;
    }

    try {
      setIsChangingPassword(true);

      await axios.patch("/api/profile/password", {
        currentPassword: trimmedCurrent,
        newPassword: trimmedNext,
        credentialPin: trimmedCredentialPin,
        credentialPinConfirmOne: trimmedCredentialPinConfirmOne,
        credentialPinConfirmTwo: trimmedCredentialPinConfirmTwo,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setCredentialPin("");
      setCredentialPinConfirmOne("");
      setCredentialPinConfirmTwo("");
      setPasswordSuccess("Password updated successfully.");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Failed to update password";
        setPasswordError(message);
      } else {
        setPasswordError("Failed to update password");
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const joinedDateValue = data.profileJoinedAt ? new Date(data.profileJoinedAt) : null;
  const joinedDisplay =
    joinedDateValue && !Number.isNaN(joinedDateValue.getTime())
      ? joinedDateValue.toLocaleString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "Unknown";

  const lastLogonDateValue = data.profileLastLogonAt ? new Date(data.profileLastLogonAt) : null;
  const lastLogonDisplay =
    lastLogonDateValue && !Number.isNaN(lastLogonDateValue.getTime())
      ? lastLogonDateValue.toLocaleString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "Unknown";

  const hasAdminCrown = isInAccordAdministrator(profileRole ?? data.profileRole);
  const hasDeveloperWrench = isInAccordDeveloper(profileRole ?? data.profileRole);
  const hasModeratorShield = isInAccordModerator(profileRole ?? data.profileRole);
  const inAccordStaffRoleLabel = getInAccordStaffLabel(profileRole ?? data.profileRole);
  const familyCenterStatusIsError = Boolean(
    familyCenterStatus &&
      /(required|valid|only|could not|does not match|already|failed|forbidden|unauthorized|missing)/i.test(
        familyCenterStatus
      )
  );
  const profileIcons = resolveProfileIcons({
    userId: resolvedProfileId,
    role: profileRole ?? data.profileRole,
    email: data.profileEmail ?? null,
    createdAt: data.profileJoinedAt ?? null,
  });

  const renderComingSoonSection = (title: string, subtitle: string) => {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="mt-1 text-xs text-[#949ba4]">{subtitle}</p>
          <div className="mt-4 rounded-xl border border-[#5865f2]/25 bg-[#5865f2]/10 px-3 py-2 text-xs text-[#cdd2ff]">
            This section is now available in the menu and ready for feature wiring.
          </div>
        </div>
      </div>
    );
  };

  const renderSectionContent = () => {
    const formatBlockedAt = (value: string | null) => {
      if (!value) {
        return "Unknown";
      }

      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return "Unknown";
      }

      return parsed.toLocaleString();
    };

    if (displaySection === "myAccount") {
      return (
        <div className="space-y-12">
          <div className="mx-auto mt-8 max-h-[88vh] min-h-[80vh] w-full max-w-6xl overflow-y-auto rounded-[2.5rem] border border-black/20 bg-[#1e1f22] p-4 shadow-xl shadow-black/35">
            <p className="text-center text-sm font-medium text-white">Account Actions</p>

            <div className="mx-auto mt-8 w-full max-w-md space-y-3 rounded-3xl border border-white/10 bg-[#232428] p-4">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Password Settings
              </p>

              <div className="relative">
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder="Current password"
                  className="w-full rounded-xl border border-black/25 bg-[#1a1b1e] px-3 py-2 pr-10 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-[#a4aab4] transition hover:text-white"
                  aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                  title={showCurrentPassword ? "Hide current password" : "Show current password"}
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="New password (min 8 chars)"
                  className="w-full rounded-xl border border-black/25 bg-[#1a1b1e] px-3 py-2 pr-10 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-[#a4aab4] transition hover:text-white"
                  aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                  title={showNewPassword ? "Hide new password" : "Show new password"}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm new password"
                  className="w-full rounded-xl border border-black/25 bg-[#1a1b1e] px-3 py-2 pr-10 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-[#a4aab4] transition hover:text-white"
                  aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
                  title={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <div className="relative">
                <input
                  type={showCredentialPin ? "text" : "password"}
                  value={credentialPin}
                  onChange={(event) => setCredentialPin(event.target.value)}
                  placeholder="Security PIN"
                  className="w-full rounded-xl border border-black/25 bg-[#1a1b1e] px-3 py-2 pr-10 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                />
                <button
                  type="button"
                  onClick={() => setShowCredentialPin((current) => !current)}
                  className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-[#a4aab4] transition hover:text-white"
                  aria-label={showCredentialPin ? "Hide security PIN" : "Show security PIN"}
                  title={showCredentialPin ? "Hide security PIN" : "Show security PIN"}
                >
                  {showCredentialPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <input
                type={showCredentialPin ? "text" : "password"}
                value={credentialPinConfirmOne}
                onChange={(event) => setCredentialPinConfirmOne(event.target.value)}
                placeholder="Confirm security PIN (1/2)"
                className="w-full rounded-xl border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              />

              <input
                type={showCredentialPin ? "text" : "password"}
                value={credentialPinConfirmTwo}
                onChange={(event) => setCredentialPinConfirmTwo(event.target.value)}
                placeholder="Confirm security PIN (2/2)"
                className="w-full rounded-xl border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              />

              {passwordError ? (
                <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {passwordError}
                </p>
              ) : null}

              {passwordSuccess ? (
                <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                  {passwordSuccess}
                </p>
              ) : null}

              <Button
                type="button"
                onClick={onChangePassword}
                disabled={isChangingPassword}
                className="w-full bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isChangingPassword ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating...
                  </span>
                ) : (
                  "Update Password"
                )}
              </Button>
            </div>

            <div className="mx-auto mt-6 w-full max-w-md rounded-3xl border border-yellow-500/25 bg-yellow-500/10 p-4">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-yellow-200">
                Patronage
              </p>
              <p className="mt-2 text-center text-xs text-yellow-100/90">
                Open your patron area to submit support or cancel any pending payment.
              </p>
              <Button
                type="button"
                onClick={() => {
                  setActiveSection("becomePatron");
                  setDisplaySection("becomePatron");
                  setIsSectionVisible(true);
                }}
                className="mt-3 w-full border border-yellow-500/35 bg-yellow-500/20 text-yellow-100 hover:bg-yellow-500/30"
              >
                Open Patron Area
              </Button>
            </div>

            <div className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-[#232428] p-4">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Authenticator App
              </p>
              <p className="mt-2 text-center text-xs text-[#b5bac1]">
                Add an authenticator app for extra account security.
              </p>

              <p className="mt-3 text-center text-[11px] text-[#949ba4]">
                Status: {authenticatorAppStatus.enabled ? "Enabled" : authenticatorAppStatus.hasPendingSetup ? "Pending Setup" : "Disabled"}
              </p>

              {authenticatorAppStatus.verifiedAt ? (
                <p className="mt-1 text-center text-[11px] text-[#949ba4]">
                  Verified: {new Date(authenticatorAppStatus.verifiedAt).toLocaleString()}
                </p>
              ) : null}

              {authenticatorAppMessage ? (
                <p className="mt-3 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                  {authenticatorAppMessage}
                </p>
              ) : null}

              <div className="mt-3 grid grid-cols-1 gap-2">
                {!authenticatorAppStatus.enabled ? (
                  <Button
                    type="button"
                    onClick={() => void onStartAuthenticatorAppSetup()}
                    disabled={isAuthenticatorAppBusy}
                    className="w-full bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isAuthenticatorAppBusy ? "Working..." : authenticatorAppStatus.hasPendingSetup ? "Regenerate Setup Key" : "Set Up Authenticator App"}
                  </Button>
                ) : null}

                <Button
                  type="button"
                  onClick={() => setIsAuthenticatorAppModalOpen(true)}
                  className="w-full border border-white/15 bg-[#1a1b1e] text-[#dbdee1] hover:bg-[#2a2b30]"
                >
                  {authenticatorAppStatus.enabled ? "Manage Authenticator App" : "Open Setup Popup"}
                </Button>
              </div>
            </div>

            <Dialog open={isAuthenticatorAppModalOpen} onOpenChange={setIsAuthenticatorAppModalOpen}>
              <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Authenticator App</DialogTitle>
                  <DialogDescription className="text-[#949ba4]">
                    Add an authenticator app for extra account security.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  <p className="text-xs text-[#949ba4]">
                    Status: {authenticatorAppStatus.enabled ? "Enabled" : authenticatorAppStatus.hasPendingSetup ? "Pending Setup" : "Disabled"}
                  </p>

                  {(authenticatorSetupSecret || authenticatorSetupUri) ? (
                    <div className="space-y-2 rounded-xl border border-white/10 bg-[#1a1b1e] p-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Manual key</p>
                        <p className="mt-1 break-all rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-xs text-white">
                          {authenticatorSetupSecret}
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">OTP URI</p>
                        <p className="mt-1 break-all rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-[#b5bac1]">
                          {authenticatorSetupUri}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          onClick={() => void onCopyAuthenticatorSecret()}
                          className="h-8 border border-white/15 bg-[#1a1b1e] px-3 text-xs text-[#dbdee1] hover:bg-[#2a2b30]"
                        >
                          Copy Key
                        </Button>
                        <Button
                          type="button"
                          onClick={() => void onCopyAuthenticatorUri()}
                          className="h-8 border border-white/15 bg-[#1a1b1e] px-3 text-xs text-[#dbdee1] hover:bg-[#2a2b30]"
                        >
                          Copy URI
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {(authenticatorAppStatus.enabled || authenticatorAppStatus.hasPendingSetup || authenticatorSetupSecret) ? (
                    <input
                      type="text"
                      value={authenticatorCodeInput}
                      onChange={(event) => {
                        const digitsOnly = event.target.value.replace(/\D/g, "").slice(0, 6);
                        setAuthenticatorCodeInput(digitsOnly);
                        setAuthenticatorAppMessage(null);
                      }}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="Enter 6-digit code"
                      className="w-full rounded-xl border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                    />
                  ) : null}

                  {authenticatorAppMessage ? (
                    <p className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                      {authenticatorAppMessage}
                    </p>
                  ) : null}
                </div>

                <DialogFooter className="gap-2 sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    {(authenticatorAppStatus.hasPendingSetup || authenticatorSetupSecret) && !authenticatorAppStatus.enabled ? (
                      <Button
                        type="button"
                        onClick={() => void onVerifyAuthenticatorAppSetup()}
                        disabled={isAuthenticatorAppBusy || authenticatorCodeInput.trim().length !== 6}
                        className="border border-emerald-500/35 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isAuthenticatorAppBusy ? "Verifying..." : "Verify & Enable"}
                      </Button>
                    ) : null}

                    {authenticatorAppStatus.enabled ? (
                      <Button
                        type="button"
                        onClick={() => void onDisableAuthenticatorApp()}
                        disabled={isAuthenticatorAppBusy || authenticatorCodeInput.trim().length !== 6}
                        className="border border-rose-500/35 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isAuthenticatorAppBusy ? "Disabling..." : "Disable Authenticator App"}
                      </Button>
                    ) : null}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAuthenticatorAppModalOpen(false)}
                  >
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-[#232428] p-4">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Security Key
              </p>
              <p className="mt-2 text-center text-xs text-[#b5bac1]">
                Register a physical security key for stronger sign-in protection.
              </p>
              <Button
                type="button"
                onClick={() => void onOpenSecurityKeyModal()}
                className="mt-3 w-full bg-[#5865f2] text-white hover:bg-[#4752c4]"
              >
                Manage Security Keys
              </Button>

              <p className="mt-2 text-center text-[11px] text-[#949ba4]">
                Keys registered: {securityKeys.length}
              </p>
            </div>

            <Dialog open={isSecurityKeyModalOpen} onOpenChange={setIsSecurityKeyModalOpen}>
              <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Security Key</DialogTitle>
                  <DialogDescription className="text-[#949ba4]">
                    Register and manage physical security keys.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  <Button
                    type="button"
                    onClick={() => void onRegisterSecurityKey()}
                    disabled={isSecurityKeyBusy}
                    className="w-full bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSecurityKeyBusy ? "Working..." : "Register New Security Key"}
                  </Button>

                  <div className="max-h-60 space-y-2 overflow-y-auto">
                    {securityKeys.length === 0 ? (
                      <p className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                        No security keys registered yet.
                      </p>
                    ) : (
                      securityKeys.map((key) => (
                        <div
                          key={key.id}
                          className="rounded-md border border-white/10 bg-black/20 px-3 py-2"
                        >
                          <p className="text-xs font-semibold text-white">{key.nickname || "Security Key"}</p>
                          <p className="mt-1 text-[11px] text-[#949ba4]">
                            Added: {key.createdAt ? new Date(key.createdAt).toLocaleString() : "Unknown"}
                          </p>
                          {key.transports.length > 0 ? (
                            <p className="mt-1 text-[11px] text-[#949ba4]">
                              Transports: {key.transports.join(", ")}
                            </p>
                          ) : null}
                          <div className="mt-2 flex justify-end">
                            <Button
                              type="button"
                              onClick={() => void onDeleteSecurityKey(key.id)}
                              disabled={isSecurityKeyBusy}
                              className="h-7 border border-rose-500/35 bg-rose-500/15 px-3 text-xs text-rose-200 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {securityKeyMessage ? (
                    <p className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                      {securityKeyMessage}
                    </p>
                  ) : null}
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsSecurityKeyModalOpen(false)}
                  >
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-[#232428] p-4">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                SMS
              </p>
              <p className="mt-2 text-center text-xs text-[#b5bac1]">
                Add SMS-based verification as an additional sign-in factor.
              </p>
              <Button
                type="button"
                onClick={() => void onOpenSmsModal()}
                className="mt-3 w-full bg-[#5865f2] text-white hover:bg-[#4752c4]"
              >
                Manage SMS
              </Button>

              <p className="mt-2 text-center text-[11px] text-[#949ba4]">
                Status: {smsAuthStatus.enabled ? "Enabled" : smsAuthStatus.hasPendingVerification ? "Pending Verification" : "Disabled"}
              </p>
              {smsAuthStatus.maskedPhoneNumber ? (
                <p className="mt-1 text-center text-[11px] text-[#949ba4]">Phone: {smsAuthStatus.maskedPhoneNumber}</p>
              ) : null}
            </div>

            <Dialog open={isSmsModalOpen} onOpenChange={setIsSmsModalOpen}>
              <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>SMS Verification</DialogTitle>
                  <DialogDescription className="text-[#949ba4]">
                    Add SMS-based verification as an additional sign-in factor.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  <p className="text-xs text-[#949ba4]">
                    Status: {smsAuthStatus.enabled ? "Enabled" : smsAuthStatus.hasPendingVerification ? "Pending Verification" : "Disabled"}
                  </p>

                  {!smsAuthStatus.enabled ? (
                    <input
                      type="tel"
                      value={smsPhoneInput}
                      onChange={(event) => {
                        setSmsPhoneInput(event.target.value);
                        setSmsMessage(null);
                      }}
                      placeholder="Phone number (+15551234567)"
                      className="w-full rounded-xl border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                    />
                  ) : null}

                  {(smsAuthStatus.hasPendingVerification || smsAuthStatus.enabled) ? (
                    <input
                      type="text"
                      value={smsCodeInput}
                      onChange={(event) => {
                        const digitsOnly = event.target.value.replace(/\D/g, "").slice(0, 6);
                        setSmsCodeInput(digitsOnly);
                        setSmsMessage(null);
                      }}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="Enter 6-digit SMS code"
                      className="w-full rounded-xl border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                    />
                  ) : null}

                  {smsMessage ? (
                    <p className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                      {smsMessage}
                    </p>
                  ) : null}
                </div>

                <DialogFooter className="gap-2 sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    {!smsAuthStatus.enabled ? (
                      <Button
                        type="button"
                        onClick={() => void onSendSmsCode()}
                        disabled={isSmsBusy || !smsPhoneInput.trim()}
                        className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSmsBusy ? "Sending..." : smsAuthStatus.hasPendingVerification ? "Resend Code" : "Send Code"}
                      </Button>
                    ) : null}

                    {smsAuthStatus.hasPendingVerification ? (
                      <Button
                        type="button"
                        onClick={() => void onVerifySmsCode()}
                        disabled={isSmsBusy || smsCodeInput.trim().length !== 6}
                        className="border border-emerald-500/35 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSmsBusy ? "Verifying..." : "Verify & Enable"}
                      </Button>
                    ) : null}

                    {smsAuthStatus.enabled ? (
                      <Button
                        type="button"
                        onClick={() => void onDisableSms()}
                        disabled={isSmsBusy}
                        className="border border-rose-500/35 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSmsBusy ? "Disabling..." : "Disable SMS"}
                      </Button>
                    ) : null}
                  </div>

                  <Button type="button" variant="outline" onClick={() => setIsSmsModalOpen(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="mx-auto w-full max-w-md rounded-3xl border border-rose-500/20 bg-rose-950/20 p-4 pb-8">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-rose-200">
                Delete Account
              </p>
              <p className="mt-2 text-center text-xs text-rose-100/90">
                Permanently remove your account and all associated data.
              </p>
              <Button
                type="button"
                disabled
                className="mb-4 mt-3 w-full border border-rose-500/35 bg-rose-600/80 text-white hover:bg-rose-600/80 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Delete Account (Coming Soon)
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (displaySection === "profiles") {
      const selectedServer = memberProfileServers.find(
        (item) => item.serverId === selectedProfileSettingsServerId
      );
      const previewDisplayName =
        serverProfileNameInput.trim() || selectedServer?.effectiveProfileName || profileName || realName || "User";
      const previewProfileNameStyle =
        serverProfileNameStyleInput.trim() ||
        selectedServer?.effectiveProfileNameStyle ||
        defaultProfileNameStyle;
      const previewComment =
        serverProfileCommentInput.trim() || selectedServer?.effectiveComment || comment || "";
      const previewNameplateLabel =
        serverProfileNameplateLabelInput.trim() || selectedServer?.effectiveNameplateLabel || nameplateLabel || "";
      const previewNameplateColor =
        serverProfileNameplateColorInput.trim() || selectedServer?.effectiveNameplateColor || nameplateColor || "#5865f2";
      const previewNameplateImageUrl =
        serverProfileNameplateImageUrlInput.trim() || selectedServer?.effectiveNameplateImageUrl || nameplateImageUrl || null;
      const previewAvatarUrl =
        serverProfileImageInput.trim() ||
        selectedServer?.imageUrl ||
        selectedServer?.effectiveImageUrl ||
        avatarUrl ||
        null;
      const previewAvatarDecorationUrl =
        serverProfileAvatarDecorationInput.trim() ||
        selectedServer?.effectiveAvatarDecorationUrl ||
        avatarDecorationUrl ||
        null;
      const previewProfileEffectUrl =
        serverProfileEffectInput.trim() ||
        selectedServer?.effectiveProfileEffectUrl ||
        profileEffectUrl ||
        null;
      const previewBannerUrl =
        serverProfileBannerInput.trim() ||
        selectedServer?.bannerUrl ||
        selectedServer?.effectiveBannerUrl ||
        bannerUrl ||
        null;
      const resolvedPreviewBannerUrl = resolveBannerUrl(previewBannerUrl);
      const resolvedServerBannerPanelPreviewUrl = resolveBannerUrl(
        serverProfileBannerInput.trim() ||
          selectedServer?.bannerUrl ||
          selectedServer?.effectiveBannerUrl ||
          bannerUrl ||
          null
      );

      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Per-Server Profiles</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Customize how your profile appears in each server you&apos;re a member of.
            </p>

            {isLoadingServerProfiles ? (
              <p className="mt-3 inline-flex items-center gap-2 text-xs text-[#b5bac1]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading server profiles...
              </p>
            ) : memberProfileServers.length === 0 ? (
              <p className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#949ba4]">
                Join a server to configure a per-server profile.
              </p>
            ) : (
              <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                    Server
                  </label>
                  <select
                    value={selectedProfileSettingsServerId}
                    onChange={(event) => onChangeProfileSettingsServer(event.target.value)}
                    disabled={isSavingServerProfile}
                    className="h-9 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {memberProfileServers.map((item) => (
                      <option key={item.serverId} value={item.serverId}>
                        {item.serverName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-[#1a1b1e] p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                      Live Preview
                    </p>

                    <div className="relative mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#111214] text-[#dbdee1] shadow-lg shadow-black/40">
                      <ProfileEffectLayer src={previewProfileEffectUrl} />
                      <div className="relative h-24 bg-linear-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
                        {resolvedPreviewBannerUrl ? (
                          <BannerImage
                            src={resolvedPreviewBannerUrl}
                            alt="Profile preview banner"
                            className="object-cover"
                          />
                        ) : null}
                      </div>

                      <div className="relative p-3 pt-9">
                        <div className="absolute -top-10 left-3 rounded-full border-4 border-[#111214]">
                          <UserAvatar
                            src={previewAvatarUrl ?? undefined}
                            decorationSrc={previewAvatarDecorationUrl}
                            className="h-20 w-20"
                          />
                        </div>

                        <div className="min-w-0">
                          <ProfileIconRow icons={profileIcons} className="mb-1" />
                          <NameplatePill
                            label={previewNameplateLabel}
                            color={previewNameplateColor}
                            imageUrl={previewNameplateImageUrl}
                            className="mb-1"
                          />
                          <ProfileNameWithServerTag
                            name={previewDisplayName}
                            profileId={resolvedProfileId}
                            nameClassName={`text-base font-bold text-white ${getProfileNameStyleClass(
                              previewProfileNameStyle
                            )}`}
                          />
                          <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-[#949ba4]">
                            In-Accord Profile Preview
                          </p>
                        </div>

                        <div className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] p-3 text-xs">
                          <div className="space-y-1 text-[#dbdee1]">
                            <p>Name: {previewDisplayName}</p>
                            <p>Pronouns: {pronouns.trim() || "Not set"}</p>
                            <p>Comment: {previewComment || "Not set"}</p>
                            <p>Server: {selectedServer?.serverName ?? "Selected server"}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="mt-2 text-[11px] text-[#949ba4]">
                      Preview updates as you edit name/banner values.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                        profile tweaks
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          onClick={() => setIsServerBannerPanelOpen(true)}
                          disabled={isSavingServerProfile}
                          className="h-8 border border-white/15 bg-[#1a1b1e] px-3 text-xs text-[#dbdee1] hover:bg-[#2a2b30] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          BANNER
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setIsServerProfileNameStylesPanelOpen(true)}
                          disabled={isSavingServerProfile}
                          className="h-8 border border-white/15 bg-[#1a1b1e] px-3 text-xs text-[#dbdee1] hover:bg-[#2a2b30] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Profile Name Styles
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setIsServerNameplatePanelOpen(true)}
                          disabled={isSavingServerProfile}
                          className="h-8 border border-white/15 bg-[#1a1b1e] px-3 text-xs text-[#dbdee1] hover:bg-[#2a2b30] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Nameplate
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setIsServerAvatarPanelOpen(true)}
                          disabled={isSavingServerProfile}
                          className="h-8 border border-white/15 bg-[#1a1b1e] px-3 text-xs text-[#dbdee1] hover:bg-[#2a2b30] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Avatar
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setIsServerAvatarDecorationPanelOpen(true)}
                          disabled={isSavingServerProfile}
                          className="h-8 border border-white/15 bg-[#1a1b1e] px-3 text-xs text-[#dbdee1] hover:bg-[#2a2b30] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Avatar Decoration
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setIsServerProfileEffectPanelOpen(true)}
                          disabled={isSavingServerProfile}
                          className="h-8 border border-white/15 bg-[#1a1b1e] px-3 text-xs text-[#dbdee1] hover:bg-[#2a2b30] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Profile Effect
                        </Button>
                      </div>
                      {serverProfileImageInput.trim() ? (
                        <p className="mt-1 text-[11px] text-[#949ba4]">Custom avatar set.</p>
                      ) : null}
                      {serverProfileBannerInput.trim() ? (
                        <p className="mt-1 text-[11px] text-[#949ba4]">Custom URL set.</p>
                      ) : null}
                      {serverProfileAvatarDecorationInput.trim() ? (
                        <p className="mt-1 text-[11px] text-[#949ba4]">Custom decoration set.</p>
                      ) : null}
                      {serverProfileEffectInput.trim() ? (
                        <p className="mt-1 text-[11px] text-[#949ba4]">Custom profile effect set.</p>
                      ) : null}
                      {serverProfileNameplateLabelInput.trim() ? (
                        <p className="mt-1 text-[11px] text-[#949ba4]">Custom nameplate set.</p>
                      ) : null}
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                        Server profile name
                      </label>
                      <input
                        type="text"
                        value={serverProfileNameInput}
                        onChange={(event) => {
                          setServerProfileNameInput(event.target.value);
                          setServerProfileStatus(null);
                        }}
                        maxLength={80}
                        placeholder={profileName || realName || "Use global profile name"}
                        disabled={isSavingServerProfile}
                        className="w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <p className="mt-1 text-[11px] text-[#949ba4]">Leave blank to use your global profile name.</p>

                      <div className="mt-3">
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                          Pronouns
                        </label>
                        <input
                          type="text"
                          value={pronouns}
                          onChange={(event) => {
                            setPronouns(event.target.value);
                            setPronounsStatus(null);
                          }}
                          maxLength={40}
                          placeholder="e.g. she/her"
                          disabled={isSavingPronouns}
                          className="w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="text-[11px] text-[#949ba4]">Optional and shown on your profile card.</p>
                          <Button
                            type="button"
                            onClick={() => void onSavePronouns()}
                            disabled={isSavingPronouns}
                            className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isSavingPronouns ? (
                              <span className="inline-flex items-center gap-2">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Saving...
                              </span>
                            ) : (
                              "Save Pronouns"
                            )}
                          </Button>
                        </div>

                        {pronounsStatus ? (
                          <p className="mt-2 rounded-md border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#b5bac1]">
                            {pronounsStatus}
                          </p>
                        ) : null}

                        <label className="mt-3 mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                          Server comment
                        </label>
                        <textarea
                          value={serverProfileCommentInput}
                          onChange={(event) => {
                            setServerProfileCommentInput(event.target.value);
                            setServerProfileStatus(null);
                          }}
                          maxLength={280}
                          rows={4}
                          placeholder="Add a server-specific comment"
                          disabled={isSavingServerProfile}
                          className="w-full resize-y rounded-md border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                        <p className="mt-1 text-[11px] text-[#949ba4]">Leave blank to use your global comment.</p>

                      </div>
                    </div>

                    <div className="rounded-md border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#dbdee1]">
                      <p>
                        Current for {selectedServer?.serverName ?? "selected server"}: {" "}
                        <span className="font-semibold text-white">
                          {selectedServer?.effectiveProfileName || "Global profile name"}
                        </span>
                      </p>
                      <p className="mt-1 text-[#b5bac1]">
                        Nameplate: {selectedServer?.nameplateLabel ? "Custom nameplate set" : (selectedServer?.effectiveNameplateLabel ? "Global nameplate" : "No nameplate")}
                      </p>
                      <p className="mt-1 text-[#b5bac1]">
                        Avatar: {selectedServer?.imageUrl ? "Custom avatar set" : (selectedServer?.effectiveImageUrl ? "Global avatar" : "No avatar")}
                      </p>
                      <p className="mt-1 text-[#b5bac1]">
                        Decoration: {selectedServer?.avatarDecorationUrl ? "Custom decoration set" : (selectedServer?.effectiveAvatarDecorationUrl ? "Global decoration" : "No decoration")}
                      </p>
                      <p className="mt-1 text-[#b5bac1]">
                        Effect: {selectedServer?.profileEffectUrl ? "Custom effect set" : (selectedServer?.effectiveProfileEffectUrl ? "Global effect" : "No effect")}
                      </p>
                      <p className="mt-1 text-[#b5bac1]">
                        Banner: {selectedServer?.bannerUrl ? "Custom banner set" : (selectedServer?.effectiveBannerUrl ? "Global banner" : "No banner")}
                      </p>
                      <p className="mt-1 text-[#b5bac1]">
                        Comment: {selectedServer?.comment ? "Custom comment set" : (selectedServer?.effectiveComment ? "Global comment" : "No comment")}
                      </p>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        onClick={onResetServerProfile}
                        disabled={isSavingServerProfile}
                        className="border border-rose-500/35 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Reset to Global
                      </Button>
                      <Button
                        type="button"
                        onClick={onSaveServerProfile}
                        disabled={isSavingServerProfile}
                        className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSavingServerProfile ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving...
                          </span>
                        ) : (
                          "Save Server Profile"
                        )}
                      </Button>
                    </div>

                    <Dialog open={isServerBannerPanelOpen} onOpenChange={setIsServerBannerPanelOpen}>
                      <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Edit Server Banner URL</DialogTitle>
                          <DialogDescription className="text-[#949ba4]">
                            Set a server-specific banner URL. Leave blank to fall back to your global banner.
                          </DialogDescription>
                        </DialogHeader>

                        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#111214]">
                          <div className="relative h-28 bg-linear-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
                            {resolvedServerBannerPanelPreviewUrl ? (
                              <BannerImage
                                src={resolvedServerBannerPanelPreviewUrl}
                                alt="Server banner preview"
                                className="object-cover"
                              />
                            ) : null}
                          </div>
                        </div>

                        <input
                          type="text"
                          value={serverProfileBannerInput}
                          onChange={(event) => {
                            setServerProfileBannerInput(event.target.value);
                            setServerProfileStatus(null);
                          }}
                          placeholder="https://..."
                          disabled={isSavingServerProfile}
                          className="w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35 disabled:cursor-not-allowed disabled:opacity-60"
                        />

                        <input
                          ref={serverBannerInputRef}
                          className="hidden"
                          type="file"
                          accept="image/*"
                          onChange={(event) => onServerBannerChange(event.target.files?.[0])}
                        />

                        {uploadedBannerThumbnails.length > 0 ? (
                          <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                              Uploaded Banners
                            </p>
                            <div className="grid grid-cols-4 gap-2">
                              {uploadedBannerThumbnails.map((thumbnailUrl) => (
                                <button
                                  key={`server-banner-thumb-${thumbnailUrl}`}
                                  type="button"
                                  onClick={() => {
                                    setServerProfileBannerInput(thumbnailUrl);
                                    setServerProfileStatus(null);
                                  }}
                                  className="overflow-hidden rounded-md border border-white/15 bg-[#111214] transition hover:border-[#5865f2]/60"
                                  title="Use this uploaded banner"
                                >
                                  <div className="relative h-10 w-full">
                                    <BannerImage
                                      src={thumbnailUrl}
                                      alt="Uploaded banner thumbnail"
                                      className="object-cover"
                                    />
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <DialogFooter className="gap-2 sm:justify-between">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setServerProfileBannerInput("");
                                setServerProfileStatus(null);
                              }}
                              disabled={isUploadingServerBanner}
                            >
                              Remove
                            </Button>
                            <Button
                              type="button"
                              onClick={onPickServerBanner}
                              disabled={isUploadingServerBanner}
                              className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isUploadingServerBanner ? (
                                <span className="inline-flex items-center gap-2">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Uploading...
                                </span>
                              ) : (
                                "Upload Banner"
                              )}
                            </Button>
                          </div>
                          <Button
                            type="button"
                            onClick={() => setIsServerBannerPanelOpen(false)}
                            className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
                          >
                            Done
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Dialog open={isServerAvatarPanelOpen} onOpenChange={setIsServerAvatarPanelOpen}>
                      <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Avatar</DialogTitle>
                          <DialogDescription className="text-[#949ba4]">
                            Upload a server avatar for this server only.
                          </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                          <div className="rounded-xl border border-white/10 bg-[#1a1b1e] p-4">
                            <div className="flex items-center gap-3">
                              <div className="relative overflow-hidden rounded-full">
                                <ProfileEffectLayer src={previewProfileEffectUrl} className="rounded-full" />
                                <UserAvatar
                                  src={previewAvatarUrl ?? undefined}
                                  decorationSrc={previewAvatarDecorationUrl}
                                  className="h-14 w-14"
                                />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-white">Current Avatar</p>
                                <p className="text-xs text-[#949ba4]">Server profile avatar</p>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2">
                            {uploadedAvatarThumbnails.length > 0 ? (
                              <div className="mr-auto rounded-lg border border-white/10 bg-black/20 p-2">
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                                  Uploaded Avatars
                                </p>
                                <div className="grid grid-cols-6 gap-2">
                                  {uploadedAvatarThumbnails.map((thumbnailUrl) => (
                                    <button
                                      key={`server-avatar-thumb-${thumbnailUrl}`}
                                      type="button"
                                      onClick={() => {
                                        setServerProfileImageInput(thumbnailUrl);
                                        setServerProfileStatus("Avatar selected. Save server profile to apply.");
                                        rememberUploadedAvatar(thumbnailUrl);
                                      }}
                                      className="overflow-hidden rounded-full border border-white/15 bg-[#111214] transition hover:border-[#5865f2]/60"
                                      title="Use this uploaded avatar"
                                    >
                                      <div className="relative h-10 w-10">
                                        <Image
                                          src={thumbnailUrl}
                                          alt="Uploaded avatar thumbnail"
                                          fill
                                          className="object-cover"
                                          unoptimized
                                        />
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {serverProfileImageInput.trim() ? (
                              <Button
                                type="button"
                                onClick={() => {
                                  setServerProfileImageInput("");
                                  setServerProfileStatus("Server avatar cleared. Save server profile to apply.");
                                }}
                                disabled={isUploadingServerAvatar}
                                className="border border-rose-500/35 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Remove Avatar
                              </Button>
                            ) : null}

                            <Button
                              type="button"
                              onClick={onPickServerAvatarFromPanel}
                              disabled={isUploadingServerAvatar}
                              className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isUploadingServerAvatar ? (
                                <span className="inline-flex items-center gap-2">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Uploading...
                                </span>
                              ) : (
                                "Upload Avatar"
                              )}
                            </Button>

                            <Button type="button" variant="outline" onClick={() => setIsServerAvatarPanelOpen(false)}>
                              Close
                            </Button>
                          </div>

                          <input
                            ref={serverAvatarPanelInputRef}
                            className="hidden"
                            type="file"
                            accept="image/*"
                            onChange={(event) => onServerAvatarPanelChange(event.target.files?.[0])}
                          />
                        </div>

                        <DialogFooter className="gap-2 sm:justify-between">
                          <div className="text-xs text-[#949ba4]">Save server profile to apply avatar changes.</div>
                          <Button
                            type="button"
                            onClick={() => setIsServerAvatarPanelOpen(false)}
                            className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
                          >
                            Done
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Dialog open={isServerAvatarDecorationPanelOpen} onOpenChange={setIsServerAvatarDecorationPanelOpen}>
                      <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Avatar Decoration</DialogTitle>
                          <DialogDescription className="text-[#949ba4]">
                            Set a server-specific avatar decoration. Leave blank to use your global decoration.
                          </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                          <div className="rounded-xl border border-white/10 bg-[#1a1b1e] p-4">
                            <div className="flex items-center gap-3">
                              <div className="relative overflow-hidden rounded-full">
                                <ProfileEffectLayer src={previewProfileEffectUrl} className="rounded-full" />
                                <UserAvatar
                                  src={previewAvatarUrl ?? undefined}
                                  decorationSrc={previewAvatarDecorationUrl}
                                  className="h-14 w-14"
                                />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-white">Current Decoration</p>
                                <p className="text-xs text-[#949ba4]">Server profile decoration preview</p>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                              Avatar Decoration URL
                            </p>
                            <input
                              type="text"
                              value={serverProfileAvatarDecorationInput}
                              onChange={(event) => {
                                setServerProfileAvatarDecorationInput(event.target.value);
                                setServerProfileStatus(null);
                              }}
                              placeholder="https://..."
                              disabled={isSavingServerProfile}
                              className="mt-2 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                            <div className="mt-2 flex flex-wrap justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  setServerProfileAvatarDecorationInput("");
                                  setServerProfileStatus(null);
                                }}
                                disabled={isSavingServerProfile}
                              >
                                Clear
                              </Button>
                              <Button type="button" variant="outline" onClick={() => setIsServerAvatarDecorationPanelOpen(false)}>
                                Close
                              </Button>
                            </div>
                          </div>
                        </div>

                        <DialogFooter className="gap-2 sm:justify-between">
                          <div className="text-xs text-[#949ba4]">Save server profile to apply decoration changes.</div>
                          <Button
                            type="button"
                            onClick={() => setIsServerAvatarDecorationPanelOpen(false)}
                            className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
                          >
                            Done
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Dialog open={isServerProfileEffectPanelOpen} onOpenChange={setIsServerProfileEffectPanelOpen}>
                      <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Profile Effect</DialogTitle>
                          <DialogDescription className="text-[#949ba4]">
                            Set a server-specific profile effect. Leave blank to use your global effect.
                          </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#111214] text-[#dbdee1]">
                            <ProfileEffectLayer src={previewProfileEffectUrl} />
                            <div className="relative h-24 bg-linear-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
                              {resolvedPreviewBannerUrl ? (
                                <BannerImage
                                  src={resolvedPreviewBannerUrl}
                                  alt="Server profile effect preview banner"
                                  className="object-cover"
                                />
                              ) : null}
                            </div>

                            <div className="relative p-3 pt-9">
                              <div className="absolute -top-10 left-3 rounded-full border-4 border-[#111214]">
                                <UserAvatar
                                  src={previewAvatarUrl ?? undefined}
                                  decorationSrc={previewAvatarDecorationUrl}
                                  className="h-20 w-20"
                                />
                              </div>

                              <div className="min-w-0">
                                <p className={`text-base font-bold text-white ${getProfileNameStyleClass(previewProfileNameStyle)}`}>
                                  {previewDisplayName}
                                </p>
                                <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-[#949ba4]">
                                  Server profile effect preview
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                              Profile Effect URL
                            </p>
                            <input
                              type="text"
                              value={serverProfileEffectInput}
                              onChange={(event) => {
                                setServerProfileEffectInput(event.target.value);
                                setServerProfileStatus(null);
                              }}
                              placeholder="https://..."
                              disabled={isSavingServerProfile}
                              className="mt-2 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                            <div className="mt-2 flex flex-wrap justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  setServerProfileEffectInput("");
                                  setServerProfileStatus(null);
                                }}
                                disabled={isSavingServerProfile}
                              >
                                Clear
                              </Button>
                              <Button type="button" variant="outline" onClick={() => setIsServerProfileEffectPanelOpen(false)}>
                                Close
                              </Button>
                            </div>
                          </div>
                        </div>

                        <DialogFooter className="gap-2 sm:justify-between">
                          <div className="text-xs text-[#949ba4]">Save server profile to apply effect changes.</div>
                          <Button
                            type="button"
                            onClick={() => setIsServerProfileEffectPanelOpen(false)}
                            className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
                          >
                            Done
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Dialog open={isServerNameplatePanelOpen} onOpenChange={setIsServerNameplatePanelOpen}>
                      <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Edit Server Nameplate</DialogTitle>
                          <DialogDescription className="text-[#949ba4]">
                            Create a server nameplate banner behind your profile name.
                          </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-3">

                          <input
                            ref={serverNameplateImageInputRef}
                            className="hidden"
                            type="file"
                            accept="image/*"
                            onChange={(event) => onServerNameplateImageChange(event.target.files?.[0])}
                          />

                          <div>
                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                              Banner color
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                              {NAMEPLATE_COLOR_PRESETS.map((preset) => {
                                const isActive = (serverProfileNameplateColorInput || "#5865f2").toLowerCase() === preset.color.toLowerCase();

                                return (
                                  <button
                                    key={`server-nameplate-preset-${preset.key}`}
                                    type="button"
                                    disabled={isSavingServerProfile}
                                    onClick={() => {
                                      setServerProfileNameplateColorInput(preset.color);
                                      setServerProfileStatus(null);
                                    }}
                                    className={`overflow-hidden rounded-md border text-left transition ${
                                      isActive
                                        ? "border-white/70 ring-2 ring-white/25"
                                        : "border-white/15 hover:border-white/35"
                                    } disabled:cursor-not-allowed disabled:opacity-60`}
                                  >
                                    <span className="block h-6" style={{ backgroundColor: preset.color }} />
                                    <span className="block bg-[#1a1b1e] px-2 py-1 text-[10px] text-[#dbdee1]">{preset.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                              Custom Nameplate Image
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                onClick={onPickServerNameplateImage}
                                disabled={isUploadingServerNameplateImage}
                                className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isUploadingServerNameplateImage ? "Uploading..." : "Upload Image"}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  setServerProfileNameplateImageUrlInput("");
                                  setServerProfileStatus(null);
                                }}
                                disabled={isUploadingServerNameplateImage}
                              >
                                Remove Image
                              </Button>
                            </div>

                            {uploadedBannerThumbnails.length > 0 ? (
                              <div className="mt-2 grid grid-cols-4 gap-2">
                                {uploadedBannerThumbnails.map((thumbnailUrl) => (
                                  <button
                                    key={`server-nameplate-thumb-${thumbnailUrl}`}
                                    type="button"
                                    onClick={() => {
                                      setServerProfileNameplateImageUrlInput(thumbnailUrl);
                                      setServerProfileStatus(null);
                                    }}
                                    className="overflow-hidden rounded-md border border-white/15 bg-[#111214] transition hover:border-[#5865f2]/60"
                                    title="Use this uploaded image"
                                  >
                                    <div className="relative h-10 w-full">
                                      <Image
                                        src={thumbnailUrl}
                                        alt="Uploaded nameplate thumbnail"
                                        fill
                                        className="object-cover"
                                        unoptimized
                                      />
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          <div className="rounded-lg border border-white/10 bg-[#15161a] p-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                              Live Nameplate Preview
                            </p>
                            <div
                              className="relative mt-2 overflow-hidden rounded-md border border-white/10 bg-[#111214] px-3 py-2"
                              style={
                                serverProfileNameplateImageUrlInput.trim()
                                  ? {
                                      backgroundImage: `url(${serverProfileNameplateImageUrlInput.trim()})`,
                                      backgroundSize: "cover",
                                      backgroundPosition: "center",
                                    }
                                  : undefined
                              }
                            >
                              <span
                                className="absolute inset-0"
                                style={{
                                  backgroundColor: `${(serverProfileNameplateColorInput || "#5865f2").trim()}33`,
                                }}
                              />
                              <span
                                className="absolute inset-y-0 left-0 w-1.5"
                                style={{
                                  backgroundColor: (serverProfileNameplateColorInput || "#5865f2").trim(),
                                }}
                              />
                              <p className="relative truncate pl-1 text-sm font-semibold text-white">
                                    {previewDisplayName}
                              </p>
                            </div>
                          </div>
                        </div>

                        <DialogFooter className="gap-2 sm:justify-between">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setServerProfileNameplateLabelInput("");
                              setServerProfileNameplateColorInput("");
                              setServerProfileNameplateImageUrlInput("");
                              setServerProfileStatus(null);
                            }}
                          >
                            Clear
                          </Button>
                          <Button
                            type="button"
                            onClick={() => setIsServerNameplatePanelOpen(false)}
                            className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
                          >
                            Done
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Dialog
                      open={isServerProfileNameStylesPanelOpen}
                      onOpenChange={setIsServerProfileNameStylesPanelOpen}
                    >
                      <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Profile Name Styles (Server)</DialogTitle>
                          <DialogDescription className="text-[#949ba4]">
                            Make your profile name look fancy in this server. This is separate from your default profile style.
                          </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-3">
                          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                                Server profile style override
                              </p>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  if (serverProfileNameStyleInput.trim()) {
                                    setServerProfileNameStyleInput("");
                                    const fallbackParts = getProfileNameStyleParts(defaultProfileNameStyle);
                                    setServerProfileNameFontInput(fallbackParts.font);
                                    setServerProfileNameEffectInput(fallbackParts.effect);
                                    setServerProfileNameColorInput(fallbackParts.color);
                                  } else {
                                    setServerProfileNameStyleInput(
                                      composeProfileNameStyleValue({
                                        font: serverProfileNameFontInput,
                                        effect: serverProfileNameEffectInput,
                                        color: serverProfileNameColorInput,
                                      })
                                    );
                                  }
                                  setServerProfileStatus(null);
                                }}
                                disabled={isSavingServerProfile}
                                className="h-7 px-2 text-[11px]"
                              >
                                {serverProfileNameStyleInput.trim() ? "Use Default" : "Override"}
                              </Button>
                            </div>

                            <p className="mt-1 text-[11px] text-[#949ba4]">
                              Server: {selectedServer?.serverName ?? "Selected server"}
                            </p>

                            <div className="mt-3 space-y-3">
                              <div>
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                                  Font
                                </label>
                                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                                  {PROFILE_NAME_FONT_OPTIONS.map((option) => {
                                    const isActive = serverProfileNameFontInput === option.key;
                                    const iconClass =
                                      option.key === "bold"
                                        ? "font-black"
                                        : option.key === "italic"
                                        ? "italic font-semibold"
                                        : option.key === "mono"
                                        ? "font-mono"
                                        : option.key === "serif"
                                        ? "font-serif"
                                        : "";

                                    return (
                                      <button
                                        key={`server-font-${option.key}`}
                                        type="button"
                                        disabled={isSavingServerProfile}
                                        onClick={() => {
                                          const next = option.key as ProfileNameFontKey;
                                          setServerProfileNameFontInput(next);
                                          setServerProfileNameStyleInput(
                                            composeProfileNameStyleValue({
                                              font: next,
                                              effect: serverProfileNameEffectInput,
                                              color: serverProfileNameColorInput,
                                            })
                                          );
                                          setServerProfileStatus(null);
                                        }}
                                        title={option.description}
                                        className={`aspect-square rounded-md border p-1 text-[10px] leading-tight transition flex flex-col items-center justify-center text-center ${
                                          isActive
                                            ? "border-[#5865f2]/70 bg-[#5865f2]/20 text-white"
                                            : "border-white/15 bg-[#1a1b1e] text-[#c8ccd1] hover:bg-[#2a2b30]"
                                        } disabled:cursor-not-allowed disabled:opacity-60`}
                                      >
                                        <span className={`block text-4xl leading-none ${iconClass}`}>Aa</span>
                                        <span className="mt-0.5 block truncate">{option.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div>
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                                  Effect
                                </label>
                                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                                  {PROFILE_NAME_EFFECT_OPTIONS.map((option) => {
                                    const isActive = serverProfileNameEffectInput === option.key;
                                    const icon =
                                      option.key === "solid"
                                        ? "⬤"
                                        : option.key === "gradient"
                                        ? "🌈"
                                        : option.key === "neon"
                                        ? "✨"
                                        : option.key === "toon"
                                        ? "🎭"
                                        : "💥";

                                    return (
                                      <button
                                        key={`server-effect-${option.key}`}
                                        type="button"
                                        disabled={isSavingServerProfile}
                                        onClick={() => {
                                          const next = option.key as ProfileNameEffectKey;
                                          setServerProfileNameEffectInput(next);
                                          setServerProfileNameStyleInput(
                                            composeProfileNameStyleValue({
                                              font: serverProfileNameFontInput,
                                              effect: next,
                                              color: serverProfileNameColorInput,
                                            })
                                          );
                                          setServerProfileStatus(null);
                                        }}
                                        title={option.description}
                                        className={`aspect-square rounded-md border p-1 text-[10px] leading-tight transition flex flex-col items-center justify-center text-center ${
                                          isActive
                                            ? "border-[#5865f2]/70 bg-[#5865f2]/20 text-white"
                                            : "border-white/15 bg-[#1a1b1e] text-[#c8ccd1] hover:bg-[#2a2b30]"
                                        } disabled:cursor-not-allowed disabled:opacity-60`}
                                      >
                                        <span className="block text-4xl leading-none">{icon}</span>
                                        <span className="mt-0.5 block truncate">{option.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div>
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                                  Color
                                </label>
                                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                                  {PROFILE_NAME_COLOR_OPTIONS.map((option) => {
                                    const isActive = serverProfileNameColorInput === option.key;
                                    const dotClass =
                                      option.key === "blurb"
                                        ? "bg-[#7b88ff]"
                                        : option.key === "sunset"
                                        ? "bg-[#ff8a5b]"
                                        : option.key === "frost"
                                        ? "bg-[#66d9ff]"
                                        : option.key === "ruby"
                                        ? "bg-[#ff6b81]"
                                        : "bg-white/70";

                                    return (
                                      <button
                                        key={`server-color-${option.key}`}
                                        type="button"
                                        disabled={isSavingServerProfile}
                                        onClick={() => {
                                          const next = option.key as ProfileNameColorKey;
                                          setServerProfileNameColorInput(next);
                                          setServerProfileNameStyleInput(
                                            composeProfileNameStyleValue({
                                              font: serverProfileNameFontInput,
                                              effect: serverProfileNameEffectInput,
                                              color: next,
                                            })
                                          );
                                          setServerProfileStatus(null);
                                        }}
                                        title={option.description}
                                        className={`aspect-square rounded-md border p-1 text-[10px] leading-tight transition flex flex-col items-center justify-center text-center ${
                                          isActive
                                            ? "border-[#5865f2]/70 bg-[#5865f2]/20 text-white"
                                            : "border-white/15 bg-[#1a1b1e] text-[#c8ccd1] hover:bg-[#2a2b30]"
                                        } disabled:cursor-not-allowed disabled:opacity-60`}
                                      >
                                        <span className={`mx-auto block h-7 w-7 rounded-full ${dotClass}`} />
                                        <span className="mt-0.5 block truncate">{option.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#b5bac1]">
                            Preview:{" "}
                            <span
                              className={`text-sm text-white ${getProfileNameStyleClass(
                                serverProfileNameStyleInput.trim()
                                  ? composeProfileNameStyleValue({
                                      font: serverProfileNameFontInput,
                                      effect: serverProfileNameEffectInput,
                                      color: serverProfileNameColorInput,
                                    })
                                  : defaultProfileNameStyle
                              )}`}
                            >
                              {previewDisplayName}
                            </span>
                          </div>

                          <div className="rounded-lg border border-white/10 bg-[#15161a] px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                              Live Sample
                            </p>
                            <p
                              className={`mt-1 text-sm text-white ${getProfileNameStyleClass(
                                serverProfileNameStyleInput.trim()
                                  ? composeProfileNameStyleValue({
                                      font: serverProfileNameFontInput,
                                      effect: serverProfileNameEffectInput,
                                      color: serverProfileNameColorInput,
                                    })
                                  : defaultProfileNameStyle
                              )}`}
                            >
                              The quick brown fox jumps over the lazy dog.
                            </p>
                          </div>

                          <DialogFooter className="gap-2 sm:justify-between">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                const resetStyle = selectedServer?.profileNameStyle ?? "";
                                const normalizedResetStyle = normalizeProfileNameStyleValue(
                                  resetStyle || defaultProfileNameStyle
                                );
                                const resetParts = getProfileNameStyleParts(normalizedResetStyle);
                                setServerProfileNameStyleInput(resetStyle);
                                setServerProfileNameFontInput(resetParts.font);
                                setServerProfileNameEffectInput(resetParts.effect);
                                setServerProfileNameColorInput(resetParts.color);
                                setServerProfileStatus(null);
                              }}
                              disabled={isSavingServerProfile}
                            >
                              Reset Style
                            </Button>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                onClick={() => void onSaveServerProfile()}
                                disabled={isSavingServerProfile}
                                className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isSavingServerProfile ? "Saving..." : "Save Server Style"}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsServerProfileNameStylesPanelOpen(false)}
                              >
                                Close
                              </Button>
                            </div>
                          </DialogFooter>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </div>
            )}

            {serverProfileStatus ? (
              <p className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                {serverProfileStatus}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    if (displaySection === "appearance") {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Switch Color Modes</p>
            <div className="mt-3">
              <ModeToggle />
            </div>
          </div>

          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Plugins - Comming Soon!</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Manage Plugins and review uploaded plugin assets.
            </p>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                All Plugins
              </p>

              <ul className="mt-3 space-y-2 text-sm text-[#dbdee1]">
                <li className="rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      <span className="text-[#949ba4]">Plugins Installed:</span>{" "}
                      <span className="text-white">{installedPluginsCountLabel}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => setIsPluginsInstalledPanelOpen(true)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-black/20 text-[#dbdee1] transition hover:bg-white/10"
                      aria-label="Open Plugins Installed panel"
                      title="Open Plugins Installed panel"
                    >
                      <Puzzle className="h-4 w-4" />
                    </button>
                  </div>
                </li>

                <li className="rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      <span className="text-[#949ba4]">Downloaded Plugins:</span>{" "}
                      <span className="text-white">{downloadedPlugins.length.toString().padStart(2, "0")}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => setIsDownloadedPluginsPanelOpen(true)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-black/20 text-[#dbdee1] transition hover:bg-white/10"
                      aria-label="Open Downloaded Plugins panel"
                      title="Open Downloaded Plugins panel"
                    >
                      <Puzzle className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              </ul>

              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#949ba4]">
                <span>No plugin uploads found yet.</span>

                <button
                  type="button"
                  onClick={() => setIsPluginUploadsPanelOpen(true)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-black/20 text-[#dbdee1] transition hover:bg-white/10"
                  aria-label="Open Plugin Uploads panel"
                  title="Open Plugin Uploads panel"
                >
                  <Puzzle className="h-4 w-4" />
                </button>
              </div>
            </div>

            <Dialog open={isPluginsInstalledPanelOpen} onOpenChange={setIsPluginsInstalledPanelOpen}>
              <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Plugins Installed</DialogTitle>
                  <DialogDescription className="text-[#949ba4]">
                    View plugins installed for this user.
                  </DialogDescription>
                </DialogHeader>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                    Installed Plugins: {installedPluginsCountLabel}
                  </p>

                  {downloadedPlugins.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-sm text-[#dbdee1]">
                      {downloadedPlugins.map((pluginName, index) => (
                        <li
                          key={`${pluginName}-${index}`}
                          className="rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2"
                        >
                          {pluginName}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#949ba4]">
                      No installed plugins found.
                    </p>
                  )}
                </div>

                <DialogFooter>
                  <Button type="button" onClick={() => setIsPluginsInstalledPanelOpen(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isDownloadedPluginsPanelOpen} onOpenChange={setIsDownloadedPluginsPanelOpen}>
              <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Downloaded Plugins</DialogTitle>
                  <DialogDescription className="text-[#949ba4]">
                    View downloaded plugins for this user.
                  </DialogDescription>
                </DialogHeader>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                    Downloaded Plugins: {downloadedPlugins.length.toString().padStart(2, "0")}
                  </p>

                  {downloadedPlugins.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-sm text-[#dbdee1]">
                      {downloadedPlugins.map((pluginName, index) => (
                        <li
                          key={`downloaded-${pluginName}-${index}`}
                          className="rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2"
                        >
                          {pluginName}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#949ba4]">
                      No downloaded plugins found.
                    </p>
                  )}
                </div>

                <DialogFooter>
                  <Button type="button" onClick={() => setIsDownloadedPluginsPanelOpen(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isPluginUploadsPanelOpen} onOpenChange={setIsPluginUploadsPanelOpen}>
              <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Plugin Uploads</DialogTitle>
                  <DialogDescription className="text-[#949ba4]">
                    View plugin upload status and uploaded assets.
                  </DialogDescription>
                </DialogHeader>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                    Plugin Uploads
                  </p>

                  <ul className="mt-3 space-y-2 text-sm text-[#dbdee1]">
                    <li className="rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2">
                      <span className="text-[#949ba4]">Upload Queue:</span>{" "}
                      <span className="text-white">Empty</span>
                    </li>
                    <li className="rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2">
                      <span className="text-[#949ba4]">Last Upload:</span>{" "}
                      <span className="text-white">None</span>
                    </li>
                  </ul>

                  <p className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#949ba4]">
                    No plugin uploads found yet.
                  </p>
                </div>

                <DialogFooter>
                  <Button type="button" onClick={() => setIsPluginUploadsPanelOpen(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Custom CSS</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Add CSS overrides to personalize your interface.
            </p>
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCustomCssEditorOpen(true)}
                className="border-white/20 bg-transparent text-white hover:bg-white/10"
              >
                Pop Out Editor
              </Button>
            </div>
            <textarea
              rows={15}
              value={customCss}
              onChange={(event) => {
                setCustomCss(event.target.value);
                setCustomCssStatus(null);
              }}
              placeholder="/* Paste your custom CSS here */"
              className="mt-3 w-full resize-y rounded-xl border border-black/25 bg-[#1a1b1e] px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
            />
            {customCssStatus ? (
              <p className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                {customCssStatus}
              </p>
            ) : null}
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onResetCustomCss}
                className="border-white/20 bg-transparent text-white hover:bg-white/10"
              >
                Reset CSS
              </Button>
              <Button
                type="button"
                onClick={onSaveCustomCss}
                className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
              >
                Save CSS
              </Button>
            </div>
          </div>

          <Dialog open={isCustomCssEditorOpen} onOpenChange={setIsCustomCssEditorOpen}>
            <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-[90vw]">
              <DialogHeader>
                <DialogTitle>Custom CSS Editor</DialogTitle>
                <DialogDescription className="text-[#949ba4]">
                  Edit your Custom CSS in a larger pop-out editor.
                </DialogDescription>
              </DialogHeader>

              <textarea
                rows={22}
                value={customCss}
                onChange={(event) => {
                  setCustomCss(event.target.value);
                  setCustomCssStatus(null);
                }}
                placeholder="/* Paste your custom CSS here */"
                className="w-full resize-y rounded-xl border border-black/25 bg-[#1a1b1e] px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              />

              {customCssStatus ? (
                <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                  {customCssStatus}
                </p>
              ) : null}

              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onResetCustomCss}
                  className="border-white/20 bg-transparent text-white hover:bg-white/10"
                >
                  Reset CSS
                </Button>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCustomCssEditorOpen(false)}
                    className="border-white/20 bg-transparent text-white hover:bg-white/10"
                  >
                    Close
                  </Button>
                  <Button type="button" onClick={onSaveCustomCss} className="bg-[#5865f2] text-white hover:bg-[#4752c4]">
                    Save CSS
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      );
    }

    if (displaySection === "contentSocial") {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Social Controls</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Choose who can reach you and how social interactions are handled.
            </p>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Allow private messages from server members</p>
                  <p className="text-xs text-[#949ba4]">If disabled, only friends can PM you directly.</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setContentSocialPreferences((current) => ({
                      ...current,
                      allowDirectMessagesFromServerMembers: !current.allowDirectMessagesFromServerMembers,
                    }));
                    setContentSocialStatus(null);
                  }}
                  className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
                    contentSocialPreferences.allowDirectMessagesFromServerMembers
                      ? "border-emerald-400/50 bg-emerald-500/40"
                      : "border-zinc-600 bg-zinc-700"
                  }`}
                  aria-pressed={contentSocialPreferences.allowDirectMessagesFromServerMembers}
                  aria-label="Toggle private messages from server members"
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                      contentSocialPreferences.allowDirectMessagesFromServerMembers ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Allow friend requests</p>
                  <p className="text-xs text-[#949ba4]">Disable to prevent new incoming friend requests.</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setContentSocialPreferences((current) => ({
                      ...current,
                      allowFriendRequests: !current.allowFriendRequests,
                    }));
                    setContentSocialStatus(null);
                  }}
                  className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
                    contentSocialPreferences.allowFriendRequests
                      ? "border-emerald-400/50 bg-emerald-500/40"
                      : "border-zinc-600 bg-zinc-700"
                  }`}
                  aria-pressed={contentSocialPreferences.allowFriendRequests}
                  aria-label="Toggle friend requests"
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                      contentSocialPreferences.allowFriendRequests ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Content Filters</p>
            <p className="mt-1 text-xs text-[#949ba4]">Tune how sensitive content is previewed in your client.</p>

            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Mature content filter
              </label>

              <select
                value={contentSocialPreferences.matureContentFilter}
                onChange={(event) => {
                  const next = event.target.value as ContentSocialPreferences["matureContentFilter"];
                  setContentSocialPreferences((current) => ({
                    ...current,
                    matureContentFilter: next,
                  }));
                  setContentSocialStatus(null);
                }}
                className="h-9 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              >
                <option value="strict">Strict (blur all potentially sensitive media)</option>
                <option value="moderate">Moderate (blur only flagged previews)</option>
                <option value="off">Off (show all previews)</option>
              </select>

              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Hide sensitive link previews</p>
                  <p className="text-xs text-[#949ba4]">Mask preview cards that are flagged as sensitive.</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setContentSocialPreferences((current) => ({
                      ...current,
                      hideSensitiveLinkPreviews: !current.hideSensitiveLinkPreviews,
                    }));
                    setContentSocialStatus(null);
                  }}
                  className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
                    contentSocialPreferences.hideSensitiveLinkPreviews
                      ? "border-emerald-400/50 bg-emerald-500/40"
                      : "border-zinc-600 bg-zinc-700"
                  }`}
                  aria-pressed={contentSocialPreferences.hideSensitiveLinkPreviews}
                  aria-label="Toggle sensitive link previews"
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                      contentSocialPreferences.hideSensitiveLinkPreviews ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {contentSocialStatus ? (
                <p className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                  {contentSocialStatus}
                </p>
              ) : null}

              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  onClick={onSaveContentSocialPreferences}
                  disabled={isSavingContentSocialPreferences}
                  className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingContentSocialPreferences ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    "Save Content & Social"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (displaySection === "bugReporting") {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Bug Reporting</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Found a bug? Send details directly to staff so it shows up in the Issues & Bugs queue.
            </p>

            <div className="mt-3 grid gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_160px_160px]">
                <input
                  type="text"
                  value={bugTitle}
                  onChange={(event) => {
                    setBugTitle(event.target.value);
                    setBugReportStatus(null);
                  }}
                  maxLength={140}
                  placeholder="Short title (e.g. Settings modal freezes on save)"
                  className="h-9 rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                />

                <select
                  value={bugCategory}
                  onChange={(event) => {
                    setBugCategory(event.target.value);
                    setBugReportStatus(null);
                  }}
                  className="h-9 rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                >
                  <option value="general">General</option>
                  <option value="ui">UI / UX</option>
                  <option value="performance">Performance</option>
                  <option value="chat">Chat</option>
                  <option value="notifications">Notifications</option>
                  <option value="profile">Profiles</option>
                  <option value="settings">Settings</option>
                </select>

                <select
                  value={bugSeverity}
                  onChange={(event) => {
                    setBugSeverity(event.target.value as typeof bugSeverity);
                    setBugReportStatus(null);
                  }}
                  className="h-9 rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <textarea
                value={bugSteps}
                onChange={(event) => {
                  setBugSteps(event.target.value);
                  setBugReportStatus(null);
                }}
                rows={4}
                maxLength={1200}
                placeholder="Steps to reproduce (optional)"
                className="w-full resize-y rounded-md border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              />

              <textarea
                value={bugExpected}
                onChange={(event) => {
                  setBugExpected(event.target.value);
                  setBugReportStatus(null);
                }}
                rows={3}
                maxLength={800}
                placeholder="Expected result (optional)"
                className="w-full resize-y rounded-md border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              />

              <textarea
                value={bugActual}
                onChange={(event) => {
                  setBugActual(event.target.value);
                  setBugReportStatus(null);
                }}
                rows={4}
                maxLength={1600}
                placeholder="What happened? (required)"
                className="w-full resize-y rounded-md border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              />

              {bugReportStatus ? (
                <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                  {bugReportStatus}
                </p>
              ) : null}

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => void onSubmitBugReport()}
                  disabled={isSubmittingBugReport}
                  className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmittingBugReport ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </span>
                  ) : (
                    "Submit Bug Report"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (displaySection === "becomePatron") {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Become a Patron</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Support In-Accord with a one-time donation or monthly patronage.
            </p>

            <div className="mt-3 grid gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="rounded-lg border border-white/10 bg-[#15161a] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#b5bac1]">Payment Information Panel</p>
                <p className="mt-1 text-xs text-[#949ba4]">
                  Press <span className="font-semibold text-white">Create Payment Request</span> to open a dedicated payment information popup panel.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
                <select
                  value={patronageType}
                  onChange={(event) => {
                    setPatronageType(event.target.value as "ONE_TIME" | "MONTHLY");
                    setPatronageStatus(null);
                    setPendingPatronageCheckoutUrl(null);
                    setPendingPatronageRequest(null);
                  }}
                  className="h-9 rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                >
                  <option value="ONE_TIME">One-Time</option>
                  <option value="MONTHLY">Monthly</option>
                </select>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={patronageAmount}
                  onChange={(event) => {
                    setPatronageAmount(event.target.value);
                    setPatronageStatus(null);
                    setPendingPatronageCheckoutUrl(null);
                    setPendingPatronageRequest(null);
                  }}
                  placeholder="Amount in USD"
                  className="h-9 rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                />
              </div>

              <textarea
                value={patronageNote}
                onChange={(event) => {
                  setPatronageNote(event.target.value);
                  setPatronageStatus(null);
                  setPendingPatronageCheckoutUrl(null);
                  setPendingPatronageRequest(null);
                }}
                rows={3}
                maxLength={500}
                placeholder="Optional note"
                className="w-full resize-y rounded-md border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              />

              {pendingPatronageCheckoutUrl ? (
                <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                  Payment request is ready. Open the <span className="font-semibold">Billing</span> panel to continue payment.
                </p>
              ) : null}

              {patronageStatus ? (
                <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                  {patronageStatus}
                </p>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void onCancelLatestPendingPatronage()}
                  disabled={isCancellingPatronage || !patronageHistory.some((entry) => entry.status === "PENDING")}
                  className="border-rose-500/35 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCancellingPatronage ? "Canceling..." : "Cancel Pending"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadPatronageHistory()}
                  disabled={isLoadingPatronageHistory}
                  className="border-white/20 bg-transparent text-white hover:bg-white/10"
                >
                  {isLoadingPatronageHistory ? "Refreshing..." : "Refresh History"}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setIsPatronagePaymentPanelOpen(true);
                    setPatronageIntentClientSecret(null);
                    setPatronageStripePublishableKey(null);
                    setPatronagePaymentPanelStatus(null);
                  }}
                  disabled={isSubmittingPatronage}
                  className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmittingPatronage ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Opening Panel...
                    </span>
                  ) : (
                    "Create Payment Request"
                  )}
                </Button>
              </div>
            </div>
          </div>

          <Dialog open={isPatronagePaymentPanelOpen} onOpenChange={setIsPatronagePaymentPanelOpen}>
            <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Payment Information</DialogTitle>
                <DialogDescription>
                  Fill in payer details, then load the in-app secure payment form. Card/bank details are entered directly below. PayPal appears if enabled in Stripe.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={patronagePayerName}
                    onChange={(event) => {
                      setPatronagePayerName(event.target.value);
                      setPatronageStatus(null);
                      setPendingPatronageCheckoutUrl(null);
                      setPendingPatronageRequest(null);
                    }}
                    placeholder="Payer full name"
                    className="h-9 rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                  />
                  <input
                    type="email"
                    value={patronagePayerEmail}
                    onChange={(event) => {
                      setPatronagePayerEmail(event.target.value);
                      setPatronageStatus(null);
                      setPendingPatronageCheckoutUrl(null);
                      setPendingPatronageRequest(null);
                    }}
                    placeholder="Payer email"
                    className="h-9 rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                  />
                </div>

                <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                  <p>Type: {patronageType === "MONTHLY" ? "Monthly" : "One-Time"}</p>
                  <p>Amount: {patronageAmount || "0"} USD</p>
                </div>

                {patronageStripePromise && patronageElementsOptions ? (
                  <Elements stripe={patronageStripePromise} options={patronageElementsOptions}>
                    <PatronageEmbeddedPaymentForm
                      onSuccess={onConfirmPatronageIntent}
                      onErrorMessage={(message) => setPatronagePaymentPanelStatus(message || null)}
                    />
                  </Elements>
                ) : null}

                {patronagePaymentPanelStatus ? (
                  <p className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                    {patronagePaymentPanelStatus}
                  </p>
                ) : null}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPatronagePaymentPanelOpen(false)}
                  className="border-white/20 bg-transparent text-white hover:bg-white/10"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void onCreatePatronageIntent()}
                  disabled={isPreparingPatronageIntent}
                  className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPreparingPatronageIntent ? "Loading Form..." : "Load Card/Bank + PayPal Form"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Your Patronage History</p>
            <p className="mt-1 text-xs text-[#949ba4]">Recent donations and patronage requests tied to your account.</p>

            <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/20">
              <div className="grid grid-cols-[0.8fr_0.8fr_0.9fr_1fr] gap-2 border-b border-white/10 bg-[#1a1b1e] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                <p>Type</p>
                <p>Status</p>
                <p>Amount</p>
                <p>Created</p>
              </div>

              <div>
                {isLoadingPatronageHistory ? (
                  <p className="px-3 py-3 text-xs text-[#b5bac1]">Loading history...</p>
                ) : patronageHistory.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-[#949ba4]">No patronage records yet.</p>
                ) : (
                  patronageHistory.map((entry, index) => (
                    <div
                      key={entry.id}
                      className={`grid grid-cols-[0.8fr_0.8fr_0.9fr_1fr] gap-2 px-3 py-2 text-xs text-[#dbdee1] ${
                        index % 2 === 0 ? "bg-[#17181b]" : "bg-[#1d1f24]"
                      }`}
                    >
                      <p>{entry.donationType === "ONE_TIME" ? "One-Time" : "Monthly"}</p>
                      <p>{entry.status}</p>
                      <p>{(entry.amountCents / 100).toFixed(2)} {entry.currency}</p>
                      <p>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "N/A"}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (displaySection === "billing") {
      const hasPendingPatronage = patronageHistory.some((entry) => entry.status === "PENDING");
      const latestSucceeded = patronageHistory.find((entry) => entry.status === "SUCCEEDED");

      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Payment Information</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Patron payments are handled through secure Stripe Checkout. This app does not collect raw card/bank numbers. Enter card/bank details on the Stripe page.
            </p>

            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-[#b5bac1]">
              <p>• Checkout provider: Stripe</p>
              <p>• Supported at checkout: cards and Stripe-supported methods for your region</p>
              <p>• Stored on In-Accord: no raw card numbers</p>
              <p>
                • Latest successful payment: {latestSucceeded ? `${(latestSucceeded.amountCents / 100).toFixed(2)} ${latestSucceeded.currency}` : "None yet"}
              </p>
              <p>
                • Pending payment request: {hasPendingPatronage ? "Yes" : "No"}
              </p>
            </div>

            {pendingPatronageCheckoutUrl ? (
              <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                <p className="font-semibold">Pending Stripe Checkout</p>
                <p className="mt-1 break-all text-emerald-200/90">{pendingPatronageCheckoutUrl}</p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        window.open(pendingPatronageCheckoutUrl, "_blank", "noopener,noreferrer");
                      }
                    }}
                    className="h-8 bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-500"
                  >
                    Open Stripe Checkout
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setPendingPatronageCheckoutUrl(null)}
                    className="h-8 border border-white/20 bg-transparent px-3 text-xs text-white hover:bg-white/10"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            ) : null}

            {patronageStatus ? (
              <p className="mt-3 rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                {patronageStatus}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    if (displaySection === "notifications") {
      const notificationRows: Array<{
        key: keyof NotificationPreferences;
        title: string;
        description: string;
      }> = [
        {
          key: "enableDesktopNotifications",
          title: "Desktop Notifications",
          description: "Show system notifications when In-Accord is open.",
        },
        {
          key: "enableSoundEffects",
          title: "Sound Effects",
          description: "Play sounds for message and app events.",
        },
        {
          key: "emailNotifications",
          title: "Email Notifications",
          description: "Send summary notifications to your account email.",
        },
        {
          key: "notifyOnDirectMessages",
          title: "Direct Message Alerts",
          description: "Notify when someone sends you a direct message.",
        },
        {
          key: "notifyOnReplies",
          title: "Reply Alerts",
          description: "Notify when someone replies to one of your messages.",
        },
        {
          key: "notifyOnServerMessages",
          title: "Server Message Alerts",
          description: "Notify for server channel activity based on your subscriptions.",
        },
      ];

      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Notification Preferences</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Notification toggles can be configured here.
            </p>
          </div>

          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <div className="space-y-2">
              {notificationRows.map((item) => (
                <div key={`notification-setting-${item.key}`} className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-[#949ba4]">{item.description}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setNotificationPreferences((current) => ({
                        ...current,
                        [item.key]: !current[item.key],
                      }));
                      setNotificationStatus(null);
                    }}
                    className={`inline-flex h-7 w-12 items-center rounded-full border transition ${
                      notificationPreferences[item.key]
                        ? "border-emerald-400/50 bg-emerald-500/40"
                        : "border-zinc-600 bg-zinc-700"
                    }`}
                    aria-pressed={notificationPreferences[item.key]}
                    aria-label={`Toggle ${item.title}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                        notificationPreferences[item.key] ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}

              <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-white">Enable @Mentions</p>
                  <p className="mt-1 text-xs text-[#949ba4]">
                    When enabled, typing <span className="font-semibold text-[#c9cdfb]">@</span> in chat suggests users and server roles.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onToggleMentions}
                  className={`inline-flex h-7 w-12 items-center rounded-full border transition ${
                    mentionsEnabled
                      ? "border-emerald-400/50 bg-emerald-500/40"
                      : "border-zinc-600 bg-zinc-700"
                  }`}
                  aria-pressed={mentionsEnabled}
                  aria-label="Toggle @Mentions"
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                      mentionsEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                @Mentions: <span className="font-semibold text-white">{mentionsEnabled ? "On" : "Off"}</span>
              </p>
              <Button
                type="button"
                onClick={() => void onSaveNotificationPreferences()}
                disabled={isSavingNotificationPreferences}
                className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingNotificationPreferences ? "Saving..." : "Save Notifications"}
              </Button>
            </div>

            {notificationStatus ? (
              <p className="mt-3 rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                {notificationStatus}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    if (displaySection === "textImages") {
      const textImageRows: Array<{
        key: keyof TextImagesPreferences;
        title: string;
        description: string;
      }> = [
        {
          key: "showEmbeds",
          title: "Show Embeds",
          description: "Render rich embeds for supported links in chat.",
        },
        {
          key: "showLinkPreviews",
          title: "Show Link Previews",
          description: "Display preview cards for links shared in messages.",
        },
        {
          key: "showInlineMedia",
          title: "Show Inline Media",
          description: "Show images and media inline instead of as plain attachments.",
        },
        {
          key: "autoplayGifs",
          title: "Autoplay GIFs",
          description: "Automatically animate GIF media in chat.",
        },
        {
          key: "autoplayStickers",
          title: "Autoplay Stickers",
          description: "Automatically animate sticker content where available.",
        },
        {
          key: "convertEmoticons",
          title: "Convert Emoticons to Emoji",
          description: "Turn text emoticons like :) into emoji when possible.",
        },
      ];

      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Text &amp; Images Preferences</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Control how text, links, and media are displayed throughout chat.
            </p>
          </div>

          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <div className="space-y-2">
              {textImageRows.map((item) => (
                <div key={`text-images-setting-${item.key}`} className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-[#949ba4]">{item.description}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setTextImagesPreferences((current) => ({
                        ...current,
                        [item.key]: !current[item.key],
                      }));
                      setTextImagesStatus(null);
                    }}
                    className={`inline-flex h-7 w-12 items-center rounded-full border transition ${
                      textImagesPreferences[item.key]
                        ? "border-emerald-400/50 bg-emerald-500/40"
                        : "border-zinc-600 bg-zinc-700"
                    }`}
                    aria-pressed={textImagesPreferences[item.key]}
                    aria-label={`Toggle ${item.title}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                        textImagesPreferences[item.key] ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                Inline media: <span className="font-semibold text-white">{textImagesPreferences.showInlineMedia ? "On" : "Off"}</span>
              </p>
              <Button
                type="button"
                onClick={() => void onSaveTextImagesPreferences()}
                disabled={isSavingTextImagesPreferences}
                className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingTextImagesPreferences ? "Saving..." : "Save Text & Images"}
              </Button>
            </div>

            {textImagesStatus ? (
              <p className="mt-3 rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                {textImagesStatus}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    if (displaySection === "emoji") {
      const uploadedEmojiUrls = emojiPreferences.uploadedEmojiUrls;

      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Emoji Settings</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Configure emoji picker behavior and quick reactions.
            </p>

            <div className="mt-3 space-y-2">
              {([
                {
                  key: "showComposerEmojiButton",
                  title: "Show Composer Emoji Button",
                  description: "Display a quick emoji button next to chat input tools.",
                },
                {
                  key: "compactReactionButtons",
                  title: "Compact Reaction Buttons",
                  description: "Use tighter spacing for message reaction chips.",
                },
              ] as const).map((item) => (
                <div key={`emoji-setting-${item.key}`} className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-[#949ba4]">{item.description}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setEmojiPreferences((current) => ({
                        ...current,
                        [item.key]: !current[item.key],
                      }));
                      setEmojiStatus(null);
                    }}
                    className={`inline-flex h-7 w-12 items-center rounded-full border transition ${
                      emojiPreferences[item.key]
                        ? "border-emerald-400/50 bg-emerald-500/40"
                        : "border-zinc-600 bg-zinc-700"
                    }`}
                    aria-pressed={emojiPreferences[item.key]}
                    aria-label={`Toggle ${item.title}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                        emojiPreferences[item.key] ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Default Composer Emoji
              </label>
              <input
                value={emojiPreferences.defaultComposerEmoji}
                onChange={(event) => {
                  setEmojiPreferences((current) => ({
                    ...current,
                    defaultComposerEmoji: event.target.value,
                  }));
                  setEmojiStatus(null);
                }}
                placeholder="😊"
                className="mt-1 h-9 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              />
              <p className="mt-1 text-[11px] text-[#949ba4]">
                Used by the quick emoji button in chat input.
              </p>
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Favorite Emojis (space separated)
              </label>
              <textarea
                value={emojiFavoritesInput}
                onChange={(event) => {
                  setEmojiFavoritesInput(event.target.value);
                  setEmojiStatus(null);
                }}
                placeholder="😀 😂 😍 🔥 👏 🎉 👍 👀"
                className="mt-1 min-h-18 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              />
              <p className="mt-1 text-[11px] text-[#949ba4]">
                Controls quick reaction options in message emoji picker.
              </p>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                  Preview ({uploadedEmojiUrls.length})
                </p>
                <p className="mt-1 text-[11px] text-[#949ba4]">
                  Uploaded emojis appear here immediately.
                </p>

                {uploadedEmojiUrls.length === 0 ? (
                  <p className="mt-2 text-[11px] text-[#949ba4]">No uploaded emojis yet.</p>
                ) : (
                  <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-6">
                    {uploadedEmojiUrls.map((url) => (
                      <div key={`uploaded-emoji-${url}`} className="group relative">
                        <div className="relative h-10 w-10 overflow-hidden rounded-md border border-white/10 bg-[#15161a]">
                          <Image
                            src={url}
                            alt="Uploaded emoji"
                            fill
                            className="object-contain"
                            unoptimized
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setEmojiPreferences((current) => ({
                              ...current,
                              uploadedEmojiUrls: current.uploadedEmojiUrls.filter((item) => item !== url),
                            }));
                            setEmojiStatus("Emoji removed from library. Click Save Emoji to persist.");
                          }}
                          className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full border border-rose-500/50 bg-rose-500/70 text-[10px] text-white group-hover:inline-flex"
                          aria-label="Remove uploaded emoji"
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                  Upload Emoji
                </p>
                <p className="mt-1 text-[11px] text-[#949ba4]">
                  Upload multiple emoji images at once (PNG, JPG, GIF, WEBP, SVG).
                </p>

                <div className="mt-2 rounded-md border border-white/10 bg-[#1a1b1e] p-2">
                  <FileUpload
                    endpoint="emojiImage"
                    value={emojiUploadDraftUrl}
                    multiple
                    onChange={(value) => {
                      const uploadedUrl = String(value ?? "").trim();
                      setEmojiUploadDraftUrl(uploadedUrl);
                    }}
                    onUploadComplete={(urls) => {
                      const uploadedUrls = urls
                        .map((item) => String(item ?? "").trim())
                        .filter((item) => item.length > 0);

                      if (uploadedUrls.length === 0) {
                        setEmojiStatus("Upload finished, but no emoji URL was returned.");
                        return;
                      }

                      setEmojiPreferences((current) => ({
                        ...current,
                        uploadedEmojiUrls: [...uploadedUrls, ...current.uploadedEmojiUrls]
                          .filter((item, index, arr) => arr.indexOf(item) === index)
                          .slice(0, 120),
                      }));
                      setEmojiStatus(
                        uploadedUrls.length === 1
                          ? "1 emoji uploaded. Click Save Emoji to persist."
                          : `${uploadedUrls.length} emojis uploaded. Click Save Emoji to persist.`
                      );
                    }}
                    onUploadError={(message) => {
                      setEmojiStatus(`Upload failed: ${message}`);
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                Composer button: <span className="font-semibold text-white">{emojiPreferences.showComposerEmojiButton ? "On" : "Off"}</span>
              </p>
              <Button
                type="button"
                onClick={() => void onSaveEmojiPreferences()}
                disabled={isSavingEmojiPreferences}
                className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingEmojiPreferences ? "Saving..." : "Save Emoji"}
              </Button>
            </div>

            {emojiStatus ? (
              <p className="mt-3 rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                {emojiStatus}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    if (displaySection === "stickers") {
      const uploadedStickerUrls = stickerPreferences.uploadedStickerUrls;

      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Sticker Settings</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Configure sticker picker behavior and quick send options.
            </p>

            <div className="mt-3 space-y-2">
              {([
                {
                  key: "showComposerStickerButton",
                  title: "Show Composer Sticker Button",
                  description: "Display a quick sticker button next to chat input tools.",
                },
                {
                  key: "preferAnimatedStickers",
                  title: "Prefer Animated Stickers",
                  description: "Prefer animated sticker variants when available.",
                },
              ] as const).map((item) => (
                <div key={`sticker-setting-${item.key}`} className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-[#949ba4]">{item.description}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setStickerPreferences((current) => ({
                        ...current,
                        [item.key]: !current[item.key],
                      }));
                      setStickerStatus(null);
                    }}
                    className={`inline-flex h-7 w-12 items-center rounded-full border transition ${
                      stickerPreferences[item.key]
                        ? "border-emerald-400/50 bg-emerald-500/40"
                        : "border-zinc-600 bg-zinc-700"
                    }`}
                    aria-pressed={stickerPreferences[item.key]}
                    aria-label={`Toggle ${item.title}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                        stickerPreferences[item.key] ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Default Composer Sticker URL
              </label>
              <input
                value={stickerPreferences.defaultComposerStickerUrl}
                onChange={(event) => {
                  setStickerPreferences((current) => ({
                    ...current,
                    defaultComposerStickerUrl: event.target.value,
                  }));
                  setStickerStatus(null);
                }}
                placeholder="https://... or /uploads/..."
                className="mt-1 h-9 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              />
              <p className="mt-1 text-[11px] text-[#949ba4]">
                Used as the default sticker quick-send option.
              </p>
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Favorite Stickers (URLs; newline, comma, or space separated)
              </label>
              <textarea
                value={stickerFavoritesInput}
                onChange={(event) => {
                  setStickerFavoritesInput(event.target.value);
                  setStickerStatus(null);
                }}
                placeholder="https://cdn.example.com/sticker-1.webp"
                className="mt-1 min-h-18 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              />
              <p className="mt-1 text-[11px] text-[#949ba4]">
                Controls sticker quick-pick options in sticker picker UI.
              </p>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                  Preview ({uploadedStickerUrls.length})
                </p>
                <p className="mt-1 text-[11px] text-[#949ba4]">
                  Uploaded stickers appear here immediately.
                </p>

                {uploadedStickerUrls.length === 0 ? (
                  <p className="mt-2 text-[11px] text-[#949ba4]">No uploaded stickers yet.</p>
                ) : (
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {uploadedStickerUrls.map((url) => (
                      <div key={`uploaded-sticker-${url}`} className="group relative">
                        <div className="relative h-16 w-full overflow-hidden rounded-md border border-white/10 bg-[#15161a]">
                          <Image
                            src={url}
                            alt="Uploaded sticker"
                            fill
                            className="object-contain"
                            unoptimized
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setStickerPreferences((current) => ({
                              ...current,
                              uploadedStickerUrls: current.uploadedStickerUrls.filter((item) => item !== url),
                            }));
                            setStickerStatus("Sticker removed from library. Click Save Stickers to persist.");
                          }}
                          className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full border border-rose-500/50 bg-rose-500/70 text-[10px] text-white group-hover:inline-flex"
                          aria-label="Remove uploaded sticker"
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                  Upload Stickers
                </p>
                <p className="mt-1 text-[11px] text-[#949ba4]">
                  Upload multiple sticker images at once (PNG, JPG, GIF, WEBP, SVG).
                </p>

                <div className="mt-2 rounded-md border border-white/10 bg-[#1a1b1e] p-2">
                  <FileUpload
                    endpoint="emojiImage"
                    value={stickerUploadDraftUrl}
                    multiple
                    onChange={(value) => {
                      const uploadedUrl = String(value ?? "").trim();
                      setStickerUploadDraftUrl(uploadedUrl);
                    }}
                    onUploadComplete={(urls) => {
                      const uploadedUrls = urls
                        .map((item) => String(item ?? "").trim())
                        .filter((item) => item.length > 0);

                      if (uploadedUrls.length === 0) {
                        setStickerStatus("Upload finished, but no sticker URL was returned.");
                        return;
                      }

                      setStickerPreferences((current) => ({
                        ...current,
                        uploadedStickerUrls: [...uploadedUrls, ...current.uploadedStickerUrls]
                          .filter((item, index, arr) => arr.indexOf(item) === index)
                          .slice(0, 120),
                      }));
                      setStickerStatus(
                        uploadedUrls.length === 1
                          ? "1 sticker uploaded. Click Save Stickers to persist."
                          : `${uploadedUrls.length} stickers uploaded. Click Save Stickers to persist.`
                      );
                    }}
                    onUploadError={(message) => {
                      setStickerStatus(`Upload failed: ${message}`);
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                Composer button: <span className="font-semibold text-white">{stickerPreferences.showComposerStickerButton ? "On" : "Off"}</span>
              </p>
              <Button
                type="button"
                onClick={() => void onSaveStickerPreferences()}
                disabled={isSavingStickerPreferences}
                className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingStickerPreferences ? "Saving..." : "Save Stickers"}
              </Button>
            </div>

            {stickerStatus ? (
              <p className="mt-3 rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                {stickerStatus}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    if (displaySection === "language") {
      const selectedLanguageLabel =
        languageOptions.find((option) => option.value === languagePreference)?.label ?? "System Default";
      const browserLanguage =
        typeof navigator !== "undefined" && navigator.language ? navigator.language : "Unknown";

      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Display Language</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Choose your preferred language for In-Accord settings and interface text.
            </p>

            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Language
              </label>

              <select
                value={languagePreference}
                onChange={(event) => {
                  setLanguagePreference(event.target.value);
                  setLanguagePreferenceStatus(null);
                }}
                className="h-9 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              >
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <div className="mt-3 rounded-md border border-white/10 bg-[#15161a] px-3 py-2 text-xs text-[#b5bac1]">
                <p>
                  Selected: <span className="font-semibold text-white">{selectedLanguageLabel}</span>
                </p>
                <p className="mt-1">
                  Browser detected: <span className="font-semibold text-white">{browserLanguage}</span>
                </p>
              </div>

              {languagePreferenceStatus ? (
                <p className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                  {languagePreferenceStatus}
                </p>
              ) : null}

              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  onClick={onSaveLanguagePreference}
                  disabled={isSavingLanguagePreference}
                  className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingLanguagePreference ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    "Save Language"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (displaySection === "keybinds") {
      const keybindRows: Array<{
        key: Exclude<keyof KeybindPreferences, "enableCustomKeybinds">;
        label: string;
        description: string;
      }> = [
        {
          key: "openCommandPalette",
          label: "Open Command Palette",
          description: "Used for quick command/action search.",
        },
        {
          key: "focusServerSearch",
          label: "Focus Server Search",
          description: "Moves focus to server/channel search input.",
        },
        {
          key: "toggleMute",
          label: "Toggle Mute",
          description: "Toggle your current voice mute state.",
        },
        {
          key: "toggleDeafen",
          label: "Toggle Deafen",
          description: "Toggle your current voice deafen state.",
        },
        {
          key: "toggleCamera",
          label: "Toggle Camera",
          description: "Toggle camera in active video sessions.",
        },
      ];

      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Keybind Preferences</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Configure keyboard shortcuts used by the In-Accord client.
            </p>

            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">Enable Custom Keybinds</p>
                  <p className="mt-1 text-xs text-[#949ba4]">
                    Turn this on to use the custom keybinds below.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setKeybindPreferences((current) => ({
                      ...current,
                      enableCustomKeybinds: !current.enableCustomKeybinds,
                    }));
                    setKeybindStatus(null);
                  }}
                  className={`inline-flex h-7 w-12 items-center rounded-full border transition ${
                    keybindPreferences.enableCustomKeybinds
                      ? "border-emerald-400/50 bg-emerald-500/40"
                      : "border-zinc-600 bg-zinc-700"
                  }`}
                  aria-pressed={keybindPreferences.enableCustomKeybinds}
                  aria-label="Toggle custom keybinds"
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                      keybindPreferences.enableCustomKeybinds ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {keybindRows.map((item) => (
                <div key={`keybind-row-${item.key}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-sm font-medium text-white">{item.label}</p>
                  <p className="mt-1 text-xs text-[#949ba4]">{item.description}</p>
                  <input
                    value={keybindPreferences[item.key]}
                    onChange={(event) => {
                      setKeybindPreferences((current) => ({
                        ...current,
                        [item.key]: event.target.value,
                      }));
                      setKeybindStatus(null);
                    }}
                    placeholder="Ctrl+Shift+K"
                    className="mt-2 h-9 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                  />
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                Custom keybinds: <span className="font-semibold text-white">{keybindPreferences.enableCustomKeybinds ? "On" : "Off"}</span>
              </p>
              <Button
                type="button"
                onClick={() => void onSaveKeybindPreferences()}
                disabled={isSavingKeybindPreferences}
                className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingKeybindPreferences ? "Saving..." : "Save Keybinds"}
              </Button>
            </div>

            {keybindStatus ? (
              <p className="mt-3 rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                {keybindStatus}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    if (displaySection === "advanced") {
      const advancedToggleRows: Array<{
        key: Exclude<keyof AdvancedPreferences, "diagnosticsLevel">;
        title: string;
        description: string;
      }> = [
        {
          key: "enableHardwareAcceleration",
          title: "Hardware Acceleration",
          description: "Use GPU acceleration where available for smoother rendering.",
        },
        {
          key: "openLinksInApp",
          title: "Open Links In-App",
          description: "Open supported links inside In-Accord instead of external browser windows.",
        },
        {
          key: "confirmBeforeQuit",
          title: "Confirm Before Quit",
          description: "Show a confirmation prompt before closing the app.",
        },
        {
          key: "enableDebugOverlay",
          title: "Debug Overlay",
          description: "Display additional runtime diagnostics in overlay panels.",
        },
        {
          key: "enableSpellCheck",
          title: "Spell Check",
          description: "Enable desktop spell checking across sign-in, chat, and other text inputs.",
        },
      ];

      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Advanced Preferences</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Configure advanced app behavior and diagnostics controls.
            </p>

            <div className="mt-3 space-y-2">
              {advancedToggleRows.map((item) => (
                <div key={`advanced-setting-${item.key}`} className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-[#949ba4]">{item.description}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setAdvancedPreferences((current) => ({
                        ...current,
                        [item.key]: !current[item.key],
                      }));
                      setAdvancedStatus(null);
                    }}
                    className={`inline-flex h-7 w-12 items-center rounded-full border transition ${
                      advancedPreferences[item.key]
                        ? "border-emerald-400/50 bg-emerald-500/40"
                        : "border-zinc-600 bg-zinc-700"
                    }`}
                    aria-pressed={advancedPreferences[item.key]}
                    aria-label={`Toggle ${item.title}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                        advancedPreferences[item.key] ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Diagnostics Level
              </p>

              <div className="mt-2 inline-flex rounded-md border border-white/10 bg-[#1a1b1e] p-1">
                {([
                  { value: "off", label: "Off" },
                  { value: "basic", label: "Basic" },
                  { value: "verbose", label: "Verbose" },
                ] as const).map((option) => {
                  const selected = advancedPreferences.diagnosticsLevel === option.value;

                  return (
                    <button
                      key={`advanced-diagnostics-${option.value}`}
                      type="button"
                      onClick={() => {
                        setAdvancedPreferences((current) => ({
                          ...current,
                          diagnosticsLevel: option.value,
                        }));
                        setAdvancedStatus(null);
                      }}
                      className={`h-8 rounded px-3 text-xs font-medium transition ${
                        selected
                          ? "bg-[#5865f2] text-white"
                          : "text-[#b5bac1] hover:bg-white/10 hover:text-white"
                      }`}
                      aria-pressed={selected}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-[#949ba4]">
                Choose how much runtime diagnostics the app should collect and surface.
              </p>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                Diagnostics: <span className="font-semibold text-white">{advancedPreferences.diagnosticsLevel}</span>
              </p>
              <Button
                type="button"
                onClick={() => void onSaveAdvancedPreferences()}
                disabled={isSavingAdvancedPreferences}
                className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingAdvancedPreferences ? "Saving..." : "Save Advanced"}
              </Button>
            </div>

            {advancedStatus ? (
              <p className="mt-3 rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                {advancedStatus}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    if (displaySection === "streamerMode") {
      const streamerModeRows: Array<{
        key: Exclude<keyof StreamerModePreferences, "enabled">;
        title: string;
        description: string;
      }> = [
        {
          key: "hidePersonalInfo",
          title: "Hide Personal Info",
          description: "Mask profile identifiers and personal details while streaming.",
        },
        {
          key: "hideInviteLinks",
          title: "Hide Invite Links",
          description: "Redact or suppress visible invite links in app surfaces.",
        },
        {
          key: "hideNotificationContent",
          title: "Hide Notification Content",
          description: "Suppress message body previews in on-screen notification content.",
        },
        {
          key: "suppressSounds",
          title: "Suppress Sounds",
          description: "Mute non-essential app sounds while Streamer Mode is enabled.",
        },
      ];

      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Streamer Mode</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Control streamer mode privacy options.
            </p>

            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">Enable Streamer Mode</p>
                  <p className="mt-1 text-xs text-[#949ba4]">Apply privacy-first behavior designed for live streaming.</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setStreamerModePreferences((current) => ({
                      ...current,
                      enabled: !current.enabled,
                    }));
                    setStreamerModeStatus(null);
                  }}
                  className={`inline-flex h-7 w-12 items-center rounded-full border transition ${
                    streamerModePreferences.enabled
                      ? "border-emerald-400/50 bg-emerald-500/40"
                      : "border-zinc-600 bg-zinc-700"
                  }`}
                  aria-pressed={streamerModePreferences.enabled}
                  aria-label="Toggle streamer mode"
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                      streamerModePreferences.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {streamerModeRows.map((item) => (
                <div key={`streamer-mode-setting-${item.key}`} className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-[#949ba4]">{item.description}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setStreamerModePreferences((current) => ({
                        ...current,
                        [item.key]: !current[item.key],
                      }));
                      setStreamerModeStatus(null);
                    }}
                    className={`inline-flex h-7 w-12 items-center rounded-full border transition ${
                      streamerModePreferences[item.key]
                        ? "border-emerald-400/50 bg-emerald-500/40"
                        : "border-zinc-600 bg-zinc-700"
                    }`}
                    aria-pressed={streamerModePreferences[item.key]}
                    aria-label={`Toggle ${item.title}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                        streamerModePreferences[item.key] ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                Status: <span className="font-semibold text-white">{streamerModePreferences.enabled ? "Enabled" : "Disabled"}</span>
              </p>
              <Button
                type="button"
                onClick={() => void onSaveStreamerModePreferences()}
                disabled={isSavingStreamerModePreferences}
                className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingStreamerModePreferences ? "Saving..." : "Save Streamer Mode"}
              </Button>
            </div>

            {streamerModeStatus ? (
              <p className="mt-3 rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                {streamerModeStatus}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    if (displaySection === "gameOverlay") {
      const toggleRows: Array<{
        key: Exclude<keyof GameOverlayPreferences, "opacity" | "position">;
        title: string;
        description: string;
      }> = [
        {
          key: "enabled",
          title: "Enable In-Game Overlay",
          description: "Show the In-Accord game overlay while supported games are active.",
        },
        {
          key: "showPerformanceStats",
          title: "Show Performance Stats",
          description: "Display FPS/latency indicators in the overlay UI.",
        },
        {
          key: "enableClickThrough",
          title: "Enable Click-Through",
          description: "Allow mouse input to pass through overlay when not focused.",
        },
      ];

      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Game Overlay</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Configure in-game overlay behavior.
            </p>

            <div className="mt-3 space-y-2">
              {toggleRows.map((item) => (
                <div key={`game-overlay-setting-${item.key}`} className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-[#949ba4]">{item.description}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setGameOverlayPreferences((current) => ({
                        ...current,
                        [item.key]: !current[item.key],
                      }));
                      setGameOverlayStatus(null);
                    }}
                    className={`inline-flex h-7 w-12 items-center rounded-full border transition ${
                      gameOverlayPreferences[item.key]
                        ? "border-emerald-400/50 bg-emerald-500/40"
                        : "border-zinc-600 bg-zinc-700"
                    }`}
                    aria-pressed={gameOverlayPreferences[item.key]}
                    aria-label={`Toggle ${item.title}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                        gameOverlayPreferences[item.key] ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Overlay Opacity ({gameOverlayPreferences.opacity}%)
              </label>
              <input
                type="range"
                min={20}
                max={100}
                step={1}
                value={gameOverlayPreferences.opacity}
                onChange={(event) => {
                  setGameOverlayPreferences((current) => ({
                    ...current,
                    opacity: Number(event.target.value),
                  }));
                  setGameOverlayStatus(null);
                }}
                className="mt-2 w-full"
              />
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Overlay Position
              </label>
              <select
                value={gameOverlayPreferences.position}
                onChange={(event) => {
                  const nextPosition = event.target.value as GameOverlayPreferences["position"];
                  setGameOverlayPreferences((current) => ({
                    ...current,
                    position: nextPosition,
                  }));
                  setGameOverlayStatus(null);
                }}
                className="mt-2 h-9 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              >
                <option value="top-left">Top Left</option>
                <option value="top-right">Top Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="bottom-right">Bottom Right</option>
              </select>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                Status: <span className="font-semibold text-white">{gameOverlayPreferences.enabled ? "Enabled" : "Disabled"}</span>
              </p>
              <Button
                type="button"
                onClick={() => void onSaveGameOverlayPreferences()}
                disabled={isSavingGameOverlayPreferences}
                className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingGameOverlayPreferences ? "Saving..." : "Save Game Overlay"}
              </Button>
            </div>

            {gameOverlayStatus ? (
              <p className="mt-3 rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                {gameOverlayStatus}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    if (displaySection === "activityPrivacy") {
      const toggleRows: Array<{
        key: Exclude<keyof ActivityPrivacyPreferences, "activityVisibility">;
        title: string;
        description: string;
      }> = [
        {
          key: "shareActivityStatus",
          title: "Share Activity Status",
          description: "Allow others to see when you are active and what you're doing.",
        },
        {
          key: "shareCurrentGame",
          title: "Share Current Game",
          description: "Show your currently played game in profile and friend list contexts.",
        },
        {
          key: "allowFriendJoinRequests",
          title: "Allow Friend Join Requests",
          description: "Permit friends to request joining your activity when supported.",
        },
        {
          key: "allowSpectateRequests",
          title: "Allow Spectate Requests",
          description: "Allow friends to request spectating your active sessions.",
        },
        {
          key: "logActivityHistory",
          title: "Log Activity History",
          description: "Store recent activity history for quick resume and insights.",
        },
      ];

      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Activity Privacy</p>
            <p className="mt-1 text-xs text-[#949ba4]">Control how your activity is shared.</p>

            <div className="mt-3 space-y-2">
              {toggleRows.map((item) => (
                <div key={`activity-privacy-setting-${item.key}`} className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-[#949ba4]">{item.description}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setActivityPrivacyPreferences((current) => ({
                        ...current,
                        [item.key]: !current[item.key],
                      }));
                      setActivityPrivacyStatus(null);
                    }}
                    className={`inline-flex h-7 w-12 items-center rounded-full border transition ${
                      activityPrivacyPreferences[item.key]
                        ? "border-emerald-400/50 bg-emerald-500/40"
                        : "border-zinc-600 bg-zinc-700"
                    }`}
                    aria-pressed={activityPrivacyPreferences[item.key]}
                    aria-label={`Toggle ${item.title}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                        activityPrivacyPreferences[item.key] ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Activity Visibility
              </label>
              <select
                value={activityPrivacyPreferences.activityVisibility}
                onChange={(event) => {
                  const nextValue = event.target.value as ActivityPrivacyPreferences["activityVisibility"];
                  setActivityPrivacyPreferences((current) => ({
                    ...current,
                    activityVisibility: nextValue,
                  }));
                  setActivityPrivacyStatus(null);
                }}
                className="mt-2 h-9 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              >
                <option value="everyone">Everyone</option>
                <option value="friends">Friends Only</option>
                <option value="none">No One</option>
              </select>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                Visibility: <span className="font-semibold text-white">{activityPrivacyPreferences.activityVisibility}</span>
              </p>
              <Button
                type="button"
                onClick={() => void onSaveActivityPrivacyPreferences()}
                disabled={isSavingActivityPrivacyPreferences}
                className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingActivityPrivacyPreferences ? "Saving..." : "Save Activity Privacy"}
              </Button>
            </div>

            {activityPrivacyStatus ? (
              <p className="mt-3 rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                {activityPrivacyStatus}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    if (displaySection === "registeredGames") {
      const connectedProviderKeys = connectionProviders
        .map((provider) => provider.key)
        .filter((providerKey) => connectedAccounts.includes(providerKey));

      const detectedGames = detectedRegisteredGames
        .filter((game) => !registeredGamesPreferences.hiddenGameIds.includes(game.id));

      const localInstalledCount = registeredGamesProviderStates.local?.count ?? detectedGames.length;
      const localInstalledSource = registeredGamesProviderStates.local?.source;
      const localInstalledSourceLabel =
        localInstalledSource === "native-installed-scan"
          ? "native-scan"
          : localInstalledSource === "unsupported-platform"
            ? "unsupported-platform"
            : localInstalledSource === "none"
              ? "native-unavailable"
              : localInstalledSource;

      const visibleDetectedGames = registeredGamesPreferences.showDetectedGames ? detectedGames : [];
      const visibleManualGames = registeredGamesPreferences.manualGames.filter(
        (game) => !registeredGamesPreferences.hiddenGameIds.includes(game.id)
      );

      const manualProviderOptions = Array.from(
        new Set(["manual", ...connectedProviderKeys])
      );

      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">Registered Games</p>
                <p className="mt-1 text-xs text-[#949ba4]">
                  Shows only games installed on this device, plus any manual entries you add.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setRegisteredGamesPreferences((current) => ({
                    ...current,
                    showDetectedGames: !current.showDetectedGames,
                  }));
                  setRegisteredGamesStatus(null);
                }}
                className={`inline-flex h-7 w-12 items-center rounded-full border transition ${
                  registeredGamesPreferences.showDetectedGames
                    ? "border-emerald-400/50 bg-emerald-500/40"
                    : "border-zinc-600 bg-zinc-700"
                }`}
                aria-pressed={registeredGamesPreferences.showDetectedGames}
                aria-label="Toggle detected games"
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                    registeredGamesPreferences.showDetectedGames ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/20 px-2 py-1 text-[11px] text-emerald-200">
                Local Installed: {localInstalledCount} found{localInstalledSourceLabel ? ` (${localInstalledSourceLabel})` : ""}
              </span>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {visibleDetectedGames.length > 0 ? (
                visibleDetectedGames.map((game) => (
                  <div key={`detected-game-${game.id}`} className="rounded-lg border border-white/10 bg-black/20 p-2">
                    <div className="flex items-start gap-2">
                      <div className="h-16 w-28 overflow-hidden rounded-md border border-white/10 bg-[#111]">
                        {game.thumbnailUrl ? (
                          <img src={game.thumbnailUrl} alt={`${game.name} thumbnail`} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-[#949ba4]">No Image</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{game.name}</p>
                        <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-[#949ba4]">{game.provider}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-[#b5bac1]">{game.shortDescription}</p>
                      </div>
                    </div>

                    <div className="mt-2 flex justify-end">
                      <Button
                        type="button"
                        onClick={() => {
                          setRegisteredGamesPreferences((current) => ({
                            ...current,
                            hiddenGameIds: Array.from(new Set([...current.hiddenGameIds, game.id])).slice(0, 240),
                          }));
                          setRegisteredGamesStatus(null);
                        }}
                        className="h-7 bg-[#3f4248] px-2 text-xs text-white hover:bg-[#4a4e55]"
                      >
                        Hide
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="col-span-full rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-xs text-[#949ba4]">
                  No installed games detected on this device (or all detected games are hidden).
                </p>
              )}
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Add a game manually</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <select
                  value={selectedRunningAppId}
                  onChange={(event) => setSelectedRunningAppId(event.target.value)}
                  className="h-9 rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                >
                  {runningApps.length > 0 ? (
                    runningApps.map((entry) => (
                      <option key={`running-app-${entry.id}`} value={entry.id}>
                        {entry.label} ({entry.processName})
                      </option>
                    ))
                  ) : (
                    <option value="">
                      {isLoadingRunningApps ? "Loading running apps..." : "No running apps available"}
                    </option>
                  )}
                </select>

                <Button
                  type="button"
                  onClick={() => void loadRunningApps()}
                  className="h-8 bg-[#3f4248] px-3 text-xs text-white hover:bg-[#4a4e55]"
                >
                  {isLoadingRunningApps ? "Refreshing..." : "Refresh Running Apps"}
                </Button>

                <Button
                  type="button"
                  onClick={onAddRunningAppRegisteredGame}
                  disabled={runningApps.length === 0 || !selectedRunningAppId}
                  className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Add Running App
                </Button>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input
                  value={manualGameNameInput}
                  onChange={(event) => setManualGameNameInput(event.target.value)}
                  placeholder="Game name"
                  className="h-9 rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                />
                <select
                  value={manualGameProviderInput}
                  onChange={(event) => setManualGameProviderInput(event.target.value)}
                  className="h-9 rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                >
                  {manualProviderOptions.map((providerKey) => (
                    <option key={`manual-game-provider-${providerKey}`} value={providerKey}>
                      {providerKey}
                    </option>
                  ))}
                </select>
                <input
                  value={manualGameThumbnailInput}
                  onChange={(event) => setManualGameThumbnailInput(event.target.value)}
                  placeholder="Thumbnail URL (optional)"
                  className="h-9 rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                />
                <input
                  value={manualGameDescriptionInput}
                  onChange={(event) => setManualGameDescriptionInput(event.target.value)}
                  placeholder="Short details"
                  className="h-9 rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                />
              </div>

              <div className="mt-2 flex justify-end">
                <Button
                  type="button"
                  onClick={onAddManualRegisteredGame}
                  className="h-8 bg-[#3f4248] px-3 text-xs text-white hover:bg-[#4a4e55]"
                >
                  Add Manual Game
                </Button>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {visibleManualGames.length > 0 ? (
                visibleManualGames.map((game) => (
                  <div key={`manual-game-${game.id}`} className="rounded-lg border border-white/10 bg-black/20 p-2">
                    <div className="flex items-start gap-2">
                      <div className="h-16 w-28 overflow-hidden rounded-md border border-white/10 bg-[#111]">
                        {game.thumbnailUrl ? (
                          <img src={game.thumbnailUrl} alt={`${game.name} thumbnail`} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-[#949ba4]">No Image</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{game.name}</p>
                        <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-[#949ba4]">{game.provider}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-[#b5bac1]">{game.shortDescription || "Manually added game."}</p>
                      </div>
                    </div>

                    <div className="mt-2 flex justify-end gap-2">
                      <Button
                        type="button"
                        onClick={() => {
                          setRegisteredGamesPreferences((current) => ({
                            ...current,
                            manualGames: current.manualGames.filter((entry) => entry.id !== game.id),
                          }));
                          setRegisteredGamesStatus(null);
                        }}
                        className="h-7 bg-[#3f4248] px-2 text-xs text-white hover:bg-[#4a4e55]"
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="col-span-full rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-xs text-[#949ba4]">
                  No manual games added yet.
                </p>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                Showing <span className="font-semibold text-white">{visibleDetectedGames.length + visibleManualGames.length}</span> games
              </p>
              <Button
                type="button"
                onClick={() => void onSaveRegisteredGamesPreferences()}
                disabled={isSavingRegisteredGamesPreferences}
                className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingRegisteredGamesPreferences ? "Saving..." : "Save Registered Games"}
              </Button>
            </div>

            {registeredGamesStatus ? (
              <p className="mt-3 rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                {registeredGamesStatus}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    if (displaySection === "connections") {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">Connected Accounts</p>
                <p className="mt-1 text-xs text-[#949ba4]">
                  Connect or disconnect external profiles used by your In-Accord account.
                </p>
              </div>

              <span className="rounded bg-[#3f4248] px-2 py-1 text-xs text-[#dbdee1]">
                Connected: {connectedAccounts.length}
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {connectionProviders.map((provider) => {
                const isConnected = connectedAccounts.includes(provider.key);
                const isSaving = isSavingConnectionProvider === provider.key;
                const isProviderConfigured = connectionProviderAvailability[provider.key] !== false;
                const isOAuthSupported = connectionProviderOAuthSupport[provider.key] ?? oauthConnectionProviders.has(provider.key);
                const canConnect = isConnected || (isProviderConfigured && isOAuthSupported);
                const connectLabel = isConnected ? "Disconnect" : isOAuthSupported ? "Connect" : "Coming Soon";

                return (
                  <div
                    key={provider.key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">
                        {connectedAccounts.includes(provider.key) && (registeredGamesProviderStates[provider.key]?.count ?? 0) > 0
                          ? "🎮 "
                          : ""}
                        {provider.label}
                      </p>
                      <p className="truncate text-xs text-[#949ba4]">{provider.description}</p>
                      {!isProviderConfigured ? (
                        <p className="mt-1 text-[10px] text-amber-300">Provider is not configured on this server yet.</p>
                      ) : !isOAuthSupported ? (
                        <p className="mt-1 text-[10px] text-[#949ba4]">Connect flow is not available for this provider yet.</p>
                      ) : null}
                    </div>

                    <Button
                      type="button"
                      onClick={() => onToggleConnectionProvider(provider.key)}
                      disabled={Boolean(isSavingConnectionProvider) || !canConnect}
                      className={`h-8 px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
                        isConnected
                          ? "border border-rose-500/35 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
                          : isOAuthSupported
                            ? "border border-emerald-500/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                            : "border border-white/20 bg-white/5 text-[#949ba4]"
                      }`}
                    >
                      {isSaving ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Saving...
                        </span>
                      ) : (
                        connectLabel
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>

            {connectionsStatus ? (
              <p className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                {connectionsStatus}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    if (displaySection === "devices") {
      const activeCount = deviceSessions.length;

      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">Signed-in Devices</p>
                <p className="mt-1 text-xs text-[#949ba4]">
                  Manage active sessions for your account.
                </p>
              </div>

              <span className="rounded bg-[#3f4248] px-2 py-1 text-xs text-[#dbdee1]">
                Active: {activeCount}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => void loadDeviceSessions()}
                disabled={isLoadingDeviceSessions || Boolean(deviceSessionActionPending)}
                className="h-8 border border-[#5865f2]/35 bg-[#5865f2]/15 px-3 text-xs font-semibold text-[#cdd4ff] hover:bg-[#5865f2]/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoadingDeviceSessions ? "Refreshing..." : "Refresh"}
              </Button>
              <Button
                type="button"
                onClick={() => void onLogoutOtherDevices()}
                disabled={Boolean(deviceSessionActionPending) || deviceSessions.length <= 1}
                className="h-8 border border-rose-500/35 bg-rose-500/15 px-3 text-xs font-semibold text-rose-200 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deviceSessionActionPending === "logout-others" ? "Working..." : "Log Out Other Devices"}
              </Button>
            </div>

            <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {isLoadingDeviceSessions ? (
                <p className="text-xs text-[#b5bac1]">Loading devices...</p>
              ) : deviceSessions.length === 0 ? (
                <p className="text-xs text-[#b5bac1]">No active device sessions found.</p>
              ) : (
                deviceSessions.map((session) => {
                  const pending = deviceSessionActionPending === session.sessionId;

                  return (
                    <div
                      key={session.sessionId}
                      className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">
                            {session.deviceName}
                            {session.isCurrent ? (
                              <span className="ml-2 rounded border border-emerald-500/35 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-200">
                                Current
                              </span>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-[#949ba4]" title={session.userAgent || "Unknown user agent"}>
                            {session.userAgent || "Unknown user agent"}
                          </p>
                          <p className="mt-1 text-[11px] text-[#b5bac1]">
                            IP: {session.ipAddress || "Unknown"} · Created: {formatDeviceSessionDate(session.createdAt)} · Last Seen: {formatDeviceSessionDate(session.lastSeenAt)}
                          </p>
                        </div>

                        <Button
                          type="button"
                          onClick={() => void onRevokeDeviceSession(session.sessionId)}
                          disabled={Boolean(deviceSessionActionPending)}
                          className="h-8 border border-rose-500/35 bg-rose-500/15 px-3 text-xs font-semibold text-rose-200 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {pending ? "Working..." : session.isCurrent ? "Log Out" : "Remove"}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {devicesStatus ? (
              <p className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                {devicesStatus}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    if (displaySection === "OtherDeveloper") {
      return (
        <OtherDeveloperPanel
          apps={OtherApps}
          bots={OtherBots}
          botGhost={botGhostIntegration}
          botAutoImportOnSave={OtherBotAutoImportOnSave}
          isSaving={isSavingOtherConfigs}
          status={OtherConfigsStatus}
          onStatusChange={setOtherConfigsStatus}
          onSavingChange={setIsSavingOtherConfigs}
          onAppsChange={setOtherApps}
          onBotsChange={setOtherBots}
          onBotGhostChange={setBotGhostIntegration}
          onBotAutoImportOnSaveChange={setOtherBotAutoImportOnSave}
        />
      );
    }

    if (displaySection === "serverBoost") {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">SERVER TAGS</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Server owners can configure one 3–4 letter tag and icon per server. Members can select one server tag to display next to their profile name.
            </p>

            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Owner Setup</p>

              {isLoadingServerTags ? (
                <p className="mt-2 inline-flex items-center gap-2 text-xs text-[#b5bac1]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading server tag settings...
                </p>
              ) : ownedServerTags.length === 0 ? (
                <p className="mt-2 text-xs text-[#949ba4]">You don&apos;t own any servers yet.</p>
              ) : (
                <>
                  <label className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Owned server</label>
                  <select
                    value={selectedOwnedServerId}
                    onChange={(event) => onChangeOwnedServer(event.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                  >
                    {ownedServerTags.map((item) => (
                      <option key={item.serverId} value={item.serverId}>
                        {item.serverName}
                      </option>
                    ))}
                  </select>

                  <div className="mt-3 flex items-center gap-2">
                    <input
                      value={ownerTagCodeInput}
                      onChange={(event) => {
                        setOwnerTagCodeInput(normalizeOwnerTagCode(event.target.value));
                        setServerTagsStatus(null);
                      }}
                      maxLength={4}
                      placeholder="TAG"
                      className="h-9 w-28 rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-center text-sm font-bold uppercase tracking-[0.08em] text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                    />

                    <span className="text-xs text-[#949ba4]">3–4 uppercase letters</span>
                  </div>

                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Icon</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {serverTagIconOptions.map((iconOption) => (
                      <button
                        key={iconOption.key}
                        type="button"
                        onClick={() => {
                          setOwnerTagIconKey(iconOption.key);
                          setServerTagsStatus(null);
                        }}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs transition ${
                          ownerTagIconKey === iconOption.key
                            ? "border-[#5865f2]/60 bg-[#5865f2]/20 text-white"
                            : "border-white/15 bg-[#1a1b1e] text-[#dbdee1] hover:bg-[#2a2b30]"
                        }`}
                      >
                        <span>{iconOption.emoji}</span>
                        <span>{iconOption.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      type="button"
                      onClick={onSaveOwnedServerTag}
                      disabled={isSavingServerTags}
                      className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingServerTags ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving...
                        </span>
                      ) : (
                        "Save Server Tag"
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Your Profile Tag</p>

              {memberServerTags.length === 0 ? (
                <p className="mt-2 text-xs text-[#949ba4]">No server tags are available from servers you&apos;re in.</p>
              ) : (
                <div className="mt-2 space-y-3">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                    Select server tag
                  </label>
                  <select
                    value={selectedProfileServerId}
                    onChange={(event) => {
                      const nextServerId = event.target.value;
                      setSelectedProfileServerId(nextServerId);
                      void onSelectProfileServerTag(nextServerId || null);
                    }}
                    disabled={isSavingServerTags}
                    className="h-9 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">None</option>
                    {memberServerTags.map((item) => (
                      <option key={item.serverId} value={item.serverId}>
                        {`${item.iconEmoji} ${item.tagCode} — ${item.serverName}`}
                      </option>
                    ))}
                  </select>

                  <div className="rounded-md border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#dbdee1]">
                    {memberServerTags.find((item) => item.serverId === selectedProfileServerId) ? (
                      <span className="inline-flex items-center gap-2">
                        <span>Current:</span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#5865f2]/35 bg-[#5865f2]/15 px-2 py-0.5 font-semibold uppercase tracking-[0.06em] text-[#d7dcff]">
                          <span>
                            {memberServerTags.find((item) => item.serverId === selectedProfileServerId)?.iconEmoji}
                          </span>
                          <span>
                            {memberServerTags.find((item) => item.serverId === selectedProfileServerId)?.tagCode}
                          </span>
                        </span>
                        <span className="text-[#b5bac1]">
                          {memberServerTags.find((item) => item.serverId === selectedProfileServerId)?.serverName}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[#949ba4]">Current: None</span>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => {
                        setSelectedProfileServerId("");
                        void onSelectProfileServerTag(null);
                      }}
                      disabled={isSavingServerTags || !selectedProfileServerId}
                      className="h-8 border border-rose-500/35 bg-rose-500/15 px-3 text-xs text-rose-200 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Remove Tag
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {serverTagsStatus ? (
              <p className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                {serverTagsStatus}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    if (displaySection === "friendRequests") {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">Blocked Users</p>
                <p className="mt-1 text-xs text-[#949ba4]">
                  People you block can&apos;t send new requests or message you directly.
                </p>
              </div>

              <span className="rounded bg-[#3f4248] px-2 py-1 text-xs text-[#dbdee1]">
                Total: {blockedProfiles.length}
              </span>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
              {isLoadingBlockedProfiles ? (
                <p className="inline-flex items-center gap-2 text-xs text-[#b5bac1]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading blocked users...
                </p>
              ) : blockedProfiles.length === 0 ? (
                <p className="text-xs text-[#949ba4]">You have no blocked users.</p>
              ) : (
                <div className="space-y-2">
                  {blockedProfiles.map((blocked) => (
                    <div
                      key={blocked.profileId}
                      className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2"
                    >
                      <UserAvatar src={blocked.imageUrl ?? undefined} className="h-8 w-8" />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">
                          <ProfileNameWithServerTag
                            name={blocked.displayName || blocked.profileId}
                            profileId={blocked.profileId}
                          />
                        </p>
                        <p className="truncate text-xs text-[#949ba4]">
                          {blocked.email || blocked.profileId} • Blocked {formatBlockedAt(blocked.blockedAt)}
                        </p>
                      </div>

                      <Button
                        type="button"
                        onClick={() => onUnblockProfile(blocked.profileId)}
                        disabled={unblockingProfileId === blocked.profileId}
                        className="h-8 border border-emerald-500/35 bg-emerald-500/15 px-3 text-xs text-emerald-200 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {unblockingProfileId === blocked.profileId ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Unblocking...
                          </span>
                        ) : (
                          "Unblock"
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {blockedProfilesError ? (
              <p className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {blockedProfilesError}
              </p>
            ) : null}

            <div className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              <p className="inline-flex items-center gap-1.5 font-semibold">
                <Ban className="h-3.5 w-3.5" />
                Tip
              </p>
              <p className="mt-1 text-rose-100/90">
                Use the block button on a user card from chat or online users to add them here.
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (displaySection === "dataPrivacy") {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Data & Privacy Controls</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Manage account discoverability, presence visibility, diagnostics, and data retention behavior.
            </p>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Profile discoverable</p>
                  <p className="text-xs text-[#949ba4]">Allow your profile to appear in discovery-style user searches.</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setDataPrivacyPreferences((current) => ({
                      ...current,
                      profileDiscoverable: !current.profileDiscoverable,
                    }));
                    setDataPrivacyStatus(null);
                  }}
                  className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
                    dataPrivacyPreferences.profileDiscoverable
                      ? "border-emerald-400/50 bg-emerald-500/40"
                      : "border-zinc-600 bg-zinc-700"
                  }`}
                  aria-pressed={dataPrivacyPreferences.profileDiscoverable}
                  aria-label="Toggle profile discoverability"
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                      dataPrivacyPreferences.profileDiscoverable ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Show presence to non-friends</p>
                  <p className="text-xs text-[#949ba4]">If off, only friends can see your active/idle presence status.</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setDataPrivacyPreferences((current) => ({
                      ...current,
                      showPresenceToNonFriends: !current.showPresenceToNonFriends,
                    }));
                    setDataPrivacyStatus(null);
                  }}
                  className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
                    dataPrivacyPreferences.showPresenceToNonFriends
                      ? "border-emerald-400/50 bg-emerald-500/40"
                      : "border-zinc-600 bg-zinc-700"
                  }`}
                  aria-pressed={dataPrivacyPreferences.showPresenceToNonFriends}
                  aria-label="Toggle non-friend presence visibility"
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                      dataPrivacyPreferences.showPresenceToNonFriends ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Allow usage diagnostics</p>
                  <p className="text-xs text-[#949ba4]">Share anonymous diagnostics to help improve stability and performance.</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setDataPrivacyPreferences((current) => ({
                      ...current,
                      allowUsageDiagnostics: !current.allowUsageDiagnostics,
                    }));
                    setDataPrivacyStatus(null);
                  }}
                  className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
                    dataPrivacyPreferences.allowUsageDiagnostics
                      ? "border-emerald-400/50 bg-emerald-500/40"
                      : "border-zinc-600 bg-zinc-700"
                  }`}
                  aria-pressed={dataPrivacyPreferences.allowUsageDiagnostics}
                  aria-label="Toggle usage diagnostics"
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                      dataPrivacyPreferences.allowUsageDiagnostics ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Data Retention</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Choose how aggressively non-essential preference telemetry should be retained.
            </p>

            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Retention Mode
              </label>

              <select
                value={dataPrivacyPreferences.retentionMode}
                onChange={(event) => {
                  setDataPrivacyPreferences((current) => ({
                    ...current,
                    retentionMode: event.target.value as DataPrivacyPreferences["retentionMode"],
                  }));
                  setDataPrivacyStatus(null);
                }}
                className="h-9 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              >
                <option value="standard">Standard (recommended)</option>
                <option value="minimal">Minimal (privacy-first)</option>
              </select>

              <p className="mt-2 text-[11px] text-[#949ba4]">
                Minimal mode limits retention of non-essential preference-level diagnostics where possible.
              </p>

              {dataPrivacyStatus ? (
                <p className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                  {dataPrivacyStatus}
                </p>
              ) : null}

              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  onClick={onSaveDataPrivacyPreferences}
                  disabled={isSavingDataPrivacyPreferences}
                  className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingDataPrivacyPreferences ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    "Save Data & Privacy"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (displaySection === "familyCenter" || displaySection === "businessCenter" || displaySection === "schoolCenter") {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">{centerLabel} Center Controls</p>
                <p className="mt-1 text-xs text-[#949ba4]">
                  Select a {centerLabel.toLowerCase()} account to configure {centerLabel.toLowerCase()} oversight controls.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {familyApplicationStatus ? (
                  <span className="inline-flex h-8 items-center rounded-md border border-emerald-500/35 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-200">
                    Status: {formattedFamilyApplicationStatus}
                  </span>
                ) : null}

                <Button
                  type="button"
                  onClick={() => setIsFamilyAccountApplyPanelOpen(true)}
                  disabled={isFamilyApplicationApproved || isRemovingFamilyAccount}
                  className={`h-8 px-3 text-xs text-white disabled:cursor-not-allowed disabled:opacity-70 ${
                    isFamilyApplicationApproved
                      ? "bg-zinc-500 hover:bg-zinc-500"
                      : "bg-[#5865f2] hover:bg-[#4752c4]"
                  }`}
                >
                  Apply for {centerLabel} Account
                </Button>

                {isFamilyApplicationApproved ? (
                  <Button
                    type="button"
                    onClick={() => void onRemoveFamilyAccount()}
                    disabled={isRemovingFamilyAccount}
                    className="h-8 border border-rose-500/35 bg-rose-500/15 px-3 text-xs text-rose-200 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isRemovingFamilyAccount ? "Removing..." : `Remove ${centerLabel} Account`}
                  </Button>
                ) : null}
              </div>
            </div>

            {!isFamilyCenterEditable ? (
              <p className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                {centerLabel} Center fields are view-only. Only {centerLabel} or Administrator roles can edit settings.
              </p>
            ) : null}

            <Dialog open={isFamilyAccountApplyPanelOpen} onOpenChange={setIsFamilyAccountApplyPanelOpen}>
              <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Apply for {centerLabel} Account</DialogTitle>
                  <DialogDescription className="text-[#949ba4]">
                    Start a {centerLabel} Account request for your profile setup.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">What happens next</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-[#b5bac1]">
                      <li>Submit your Business account details for review.</li>
                      <li>Upload your ID and A.O.I. for verification.</li>
                      <li>In-Accord staff validates account eligibility.</li>
                      <li>{centerLabel} Center permissions are enabled after approval.</li>
                    </ul>
                  </div>
                </div>

                <DialogFooter className="gap-2 sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => setIsFamilyAccountApplyPanelOpen(false)}>
                    Close
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setIsFamilyAccountApplyPanelOpen(false);
                      setIsFamilyAccountVerificationPanelOpen(true);
                    }}
                    className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
                  >
                    Continue
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog
              open={isFamilyAccountVerificationPanelOpen}
              onOpenChange={setIsFamilyAccountVerificationPanelOpen}
            >
              <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>ID Verification Upload</DialogTitle>
                  <DialogDescription className="text-[#949ba4]">
                    Upload a valid government-issued ID to continue your {centerLabel} Account application.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  <input
                    ref={familyVerificationFileInputRef}
                    className="hidden"
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf"
                    multiple
                    onChange={(event) => onFamilyVerificationFilesChange(event.target.files)}
                  />

                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Verification checklist</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-[#b5bac1]">
                      <li>Upload front and back images when required.</li>
                      <li>
                        {isBusinessCenterSection
                          ? "Ensure your legal name and business role details are accurate."
                          : "Ensure your legal name and date of birth are readable."}
                      </li>
                      <li>Supported formats: JPG, PNG, PDF.</li>
                    </ul>
                  </div>

                  <div className="rounded-lg border border-dashed border-white/20 bg-[#15161a] p-4 text-center">
                    <p className="text-sm font-semibold text-white">Upload Area</p>
                    <p className="mt-1 text-xs text-[#949ba4]">Attach ID files now. Backend upload submission can be connected next.</p>

                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                      <Button
                        type="button"
                        onClick={onPickFamilyVerificationFiles}
                        className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4]"
                      >
                        Choose Files
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setFamilyVerificationFiles([]);
                          setFamilyVerificationUploadStatus(null);
                        }}
                        disabled={familyVerificationFiles.length === 0}
                      >
                        Clear Files
                      </Button>
                    </div>

                    {familyVerificationFiles.length > 0 ? (
                      <div className="mt-3 rounded-md border border-white/10 bg-black/30 p-2 text-left">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                          Attached Files ({familyVerificationFiles.length})
                        </p>
                        <div className="space-y-1.5">
                          {familyVerificationFiles.map((file, index) => (
                            <div
                              key={`${file.name}-${file.lastModified}-${index}`}
                              className="flex items-center justify-between gap-2 rounded border border-white/10 bg-[#1a1b1e] px-2 py-1.5"
                            >
                              <p className="truncate text-[11px] text-[#dbdee1]">
                                {file.name} <span className="text-[#949ba4]">({formatFileSize(file.size)})</span>
                              </p>
                              <Button
                                type="button"
                                onClick={() => onRemoveFamilyVerificationFile(index)}
                                className="h-6 border border-rose-500/35 bg-rose-500/15 px-2 text-[10px] text-rose-200 hover:bg-rose-500/25"
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-[#949ba4]">No files attached yet.</p>
                    )}

                    {familyVerificationUploadStatus ? (
                      <p className="mt-2 text-[11px] text-[#b5bac1]">{familyVerificationUploadStatus}</p>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">User Details</p>

                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-[#c6cad1]">Legal Name</label>
                        <input
                          type="text"
                          value={realName || "Not set"}
                          readOnly
                          className="h-8 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-2.5 text-xs text-[#b5bac1] outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-[#c6cad1]">Profile Name</label>
                        <input
                          type="text"
                          value={profileName || "Not set"}
                          readOnly
                          className="h-8 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-2.5 text-xs text-[#b5bac1] outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-[#c6cad1]">Email</label>
                        <input
                          type="text"
                          value={data.profileEmail || "Not set"}
                          readOnly
                          className="h-8 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-2.5 text-xs text-[#b5bac1] outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-[#c6cad1]">Phone</label>
                        <input
                          type="text"
                          value={phoneNumber || "Not set"}
                          readOnly
                          className="h-8 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-2.5 text-xs text-[#b5bac1] outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-[#c6cad1]">
                          {isBusinessCenterSection ? "Business Section" : "Date of Birth"}
                        </label>
                        {isBusinessCenterSection ? (
                          <select
                            value={familyApplicationSectionInput}
                            onChange={(event) => setFamilyApplicationSectionInput(event.target.value)}
                            className="h-8 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-2.5 text-xs text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                          >
                            <option value="">Select business section</option>
                            {businessSectionOptions.map((option) => (
                              <option key={`business-application-section-${option}`} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={dateOfBirth || "Not set"}
                            readOnly
                            className="h-8 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-2.5 text-xs text-[#b5bac1] outline-none"
                          />
                        )}
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-[#c6cad1]">
                          {isBusinessCenterSection ? "Business Role" : "Family Designation"}
                        </label>
                        <select
                          value={familyDesignationInput}
                          onChange={(event) => setFamilyDesignationInput(event.target.value)}
                          className="h-8 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-2.5 text-xs text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                        >
                          <option value="">{isBusinessCenterSection ? "Select business role" : "Select designation"}</option>
                          {isBusinessCenterSection
                            ? businessRoleGroups.map((group) => (
                                <optgroup key={`business-verification-role-group-${group.label}`} label={group.label}>
                                  {group.options.map((option) => (
                                    <option key={`business-verification-role-${option}`} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </optgroup>
                              ))
                            : familyDesignationOptions.map((option) => (
                                <option key={`family-designation-${option}`} value={option}>
                                  {option}
                                </option>
                              ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <DialogFooter className="gap-2 sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsFamilyAccountVerificationPanelOpen(false)}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    onClick={onSubmitFamilyApplication}
                    disabled={
                      !familyDesignationInput ||
                      familyVerificationFiles.length === 0 ||
                      (isBusinessCenterSection && !familyApplicationSectionInput)
                    }
                    className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
                  >
                    Submit Application
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Profile Name
              </label>
              <select
                value={selectedFamilyMemberId}
                onChange={(event) => {
                  setSelectedFamilyMemberId(event.target.value);
                  setFamilyCenterStatus(null);
                }}
                disabled={familyCenterPreferences.familyMembers.length === 0 || !isFamilyCenterEditable}
                className="h-9 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {familyCenterPreferences.familyMembers.length === 0 ? (
                  <option value="">No {centerLabel.toLowerCase()} accounts available</option>
                ) : null}
                {familyCenterPreferences.familyMembers.map((member) => (
                  <option key={`family-member-select-${member.id}`} value={member.id}>
                    {(member.childName || "Profile Name").trim()} — {member.accountIdentifier}
                  </option>
                ))}
              </select>

              {selectedFamilyMember ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-[#949ba4]">
                    Editing oversight for <span className="font-semibold text-[#dbdee1]">{selectedFamilyMember.childName || "Profile Name"}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      onClick={onCopyDefaultsToSelectedChild}
                      disabled={!selectedFamilyMember || !isFamilyCenterEditable}
                      className="h-7 border border-[#5865f2]/35 bg-[#5865f2]/15 px-2 text-[11px] text-[#d7dcff] hover:bg-[#5865f2]/25 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Copy Defaults
                    </Button>
                    <Button
                      type="button"
                      onClick={onResetSelectedChildToAppDefaults}
                      disabled={!selectedFamilyMember || !isFamilyCenterEditable}
                      className="h-7 border border-zinc-500/35 bg-zinc-500/15 px-2 text-[11px] text-zinc-200 hover:bg-zinc-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Reset to App Defaults
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-[#949ba4]">Add and select a {centerLabel.toLowerCase()} account to edit oversight controls.</p>
              )}
            </div>

            <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Require content filter for {centerLabel.toLowerCase()} members</p>
                  <p className="text-xs text-[#949ba4]">Enforces stricter filtering for supervised household profiles.</p>
                </div>

                <button
                  type="button"
                  onClick={() => updateSelectedFamilyMemberOversight("requireContentFilterForFamilyMembers")}
                  disabled={!selectedFamilyMember || !isFamilyCenterEditable}
                  className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
                    selectedFamilyMember?.requireContentFilterForFamilyMembers
                      ? "border-emerald-400/50 bg-emerald-500/40"
                      : "border-zinc-600 bg-zinc-700"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                  aria-pressed={selectedFamilyMember?.requireContentFilterForFamilyMembers ?? false}
                  aria-label="Toggle family content filter requirement"
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                      selectedFamilyMember?.requireContentFilterForFamilyMembers ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Share weekly safety summary</p>
                  <p className="text-xs text-[#949ba4]">Provides a weekly summary of moderation and safety-related activity.</p>
                </div>

                <button
                  type="button"
                  onClick={() => updateSelectedFamilyMemberOversight("shareWeeklySafetySummary")}
                  disabled={!selectedFamilyMember || !isFamilyCenterEditable}
                  className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
                    selectedFamilyMember?.shareWeeklySafetySummary
                      ? "border-emerald-400/50 bg-emerald-500/40"
                      : "border-zinc-600 bg-zinc-700"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                  aria-pressed={selectedFamilyMember?.shareWeeklySafetySummary ?? false}
                  aria-label="Toggle weekly safety summary"
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                      selectedFamilyMember?.shareWeeklySafetySummary ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Allow private messages from non-friends</p>
                  <p className="text-xs text-[#949ba4]">When off, {centerLabel.toLowerCase()}-managed accounts can only receive PMs from friends.</p>
                </div>

                <button
                  type="button"
                  onClick={() => updateSelectedFamilyMemberOversight("allowDirectMessagesFromNonFriends")}
                  disabled={!selectedFamilyMember || !isFamilyCenterEditable}
                  className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
                    selectedFamilyMember?.allowDirectMessagesFromNonFriends
                      ? "border-emerald-400/50 bg-emerald-500/40"
                      : "border-zinc-600 bg-zinc-700"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                  aria-pressed={selectedFamilyMember?.allowDirectMessagesFromNonFriends ?? false}
                  aria-label="Toggle private messages from non-friends"
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                      selectedFamilyMember?.allowDirectMessagesFromNonFriends ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Alert on mature content interactions</p>
                  <p className="text-xs text-[#949ba4]">Flags interactions with mature content for review in {centerLabel.toLowerCase()} oversight workflows.</p>
                </div>

                <button
                  type="button"
                  onClick={() => updateSelectedFamilyMemberOversight("alertOnMatureContentInteractions")}
                  disabled={!selectedFamilyMember || !isFamilyCenterEditable}
                  className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
                    selectedFamilyMember?.alertOnMatureContentInteractions
                      ? "border-emerald-400/50 bg-emerald-500/40"
                      : "border-zinc-600 bg-zinc-700"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                  aria-pressed={selectedFamilyMember?.alertOnMatureContentInteractions ?? false}
                  aria-label="Toggle mature content interaction alerts"
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                      selectedFamilyMember?.alertOnMatureContentInteractions ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">{centerLabel} Members</p>
                  <p className="text-[11px] text-[#949ba4]">
                    Add and manage linked {centerLabel.toLowerCase()} accounts for {centerLabel} Center oversight.
                  </p>
                </div>
                <span className="inline-flex h-6 items-center rounded-md border border-white/15 bg-white/5 px-2 text-[10px] font-semibold text-[#d7dcff]">
                  Total: {familyCenterPreferences.familyMembers.length}
                </span>
              </div>

              <div className="mt-3 space-y-3">
                <div className="rounded-lg border border-white/10 bg-[#1a1b1e] p-2.5">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                    Add {centerLabel} Account
                  </p>

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <input
                      type="text"
                      value={familyMemberNameInput}
                      onChange={(event) => {
                        setFamilyMemberNameInput(event.target.value);
                        setFamilyCenterStatus(null);
                      }}
                      maxLength={60}
                      placeholder={isBusinessCenterSection ? "Company Name" : "Family Name"}
                      required
                      disabled={!isFamilyCenterEditable}
                      className="h-8 rounded-md border border-black/25 bg-[#131417] px-2.5 text-xs text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                    />

                    {isBusinessCenterSection ? (
                      <input
                        type="email"
                        value={familyMemberEmailInput}
                        onChange={(event) => {
                          setFamilyMemberEmailInput(event.target.value);
                          setFamilyCenterStatus(null);
                        }}
                        maxLength={160}
                        placeholder="Email"
                        required
                        disabled={!isFamilyCenterEditable}
                        className="h-8 rounded-md border border-black/25 bg-[#131417] px-2.5 text-xs text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                      />
                    ) : (
                      <select
                        value={familyMemberRelationInput}
                        onChange={(event) => {
                          setFamilyMemberRelationInput(event.target.value);
                          setFamilyCenterStatus(null);
                        }}
                        required
                        disabled={!isFamilyCenterEditable}
                        className="h-8 rounded-md border border-black/25 bg-[#131417] px-2.5 text-xs text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                      >
                        <option value="">Family Relation</option>
                        {familyMemberRelationOptions.map((option) => (
                          <option key={`family-member-relation-${option}`} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    )}

                    <input
                      type="text"
                      value={familyMemberAccountInput}
                      onChange={(event) => {
                        setFamilyMemberAccountInput(event.target.value);
                        setFamilyCenterStatus(null);
                      }}
                      maxLength={160}
                      placeholder="Profile Name"
                      required
                      disabled={!isFamilyCenterEditable}
                      className="h-8 rounded-md border border-black/25 bg-[#131417] px-2.5 text-xs text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                    />

                    {isBusinessCenterSection ? (
                      <select
                        value={familyMemberSectionInput}
                        onChange={(event) => {
                          setFamilyMemberSectionInput(event.target.value);
                          setFamilyCenterStatus(null);
                        }}
                        required
                        disabled={!isFamilyCenterEditable}
                        className="h-8 rounded-md border border-black/25 bg-[#131417] px-2.5 text-xs text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                      >
                        <option value="">Business Section</option>
                        {businessSectionOptions.map((option) => (
                          <option key={`business-section-option-${option}`} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : null}

                    {isBusinessCenterSection ? null : (
                      <input
                        type="text"
                        value={familyMemberDateOfBirthInput}
                        onChange={(event) => {
                          setFamilyMemberDateOfBirthInput(event.target.value);
                          setFamilyCenterStatus(null);
                        }}
                        inputMode="numeric"
                        pattern="\\d{4}[-/]\\d{2}[-/]\\d{2}"
                        maxLength={10}
                        placeholder="YYYY-MM-DD or YYYY/MM/DD"
                        title="Use format YYYY-MM-DD or YYYY/MM/DD"
                        required
                        disabled={!isFamilyCenterEditable}
                        className="h-8 rounded-md border border-black/25 bg-[#131417] px-2.5 text-xs text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                      />
                    )}

                    {isBusinessCenterSection ? (
                      <select
                        value={familyMemberRelationInput}
                        onChange={(event) => {
                          setFamilyMemberRelationInput(event.target.value);
                          setFamilyCenterStatus(null);
                        }}
                        required
                        disabled={!isFamilyCenterEditable}
                        className="h-8 rounded-md border border-black/25 bg-[#131417] px-2.5 text-xs text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                      >
                        <option value="">Business Role</option>
                        {businessRoleGroups.map((group) => (
                          <optgroup key={`business-role-group-${group.label}`} label={group.label}>
                            {group.options.map((option) => (
                              <option key={`business-role-option-${option}`} value={option}>
                                {option}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="email"
                        value={familyMemberEmailInput}
                        onChange={(event) => {
                          setFamilyMemberEmailInput(event.target.value);
                          setFamilyCenterStatus(null);
                        }}
                        maxLength={160}
                        placeholder="Email"
                        required
                        disabled={!isFamilyCenterEditable}
                        className="h-8 rounded-md border border-black/25 bg-[#131417] px-2.5 text-xs text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                      />
                    )}

                    <input
                      type="tel"
                      value={familyMemberPhoneInput}
                      onChange={(event) => {
                        setFamilyMemberPhoneInput(event.target.value);
                        setFamilyCenterStatus(null);
                      }}
                      maxLength={32}
                      placeholder="Phone"
                      required
                      disabled={!isFamilyCenterEditable}
                      className="h-8 rounded-md border border-black/25 bg-[#131417] px-2.5 text-xs text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                    />

                    <div>
                      <input
                        type="password"
                        value={familyMemberPasswordInput}
                        onChange={(event) => {
                          setFamilyMemberPasswordInput(event.target.value);
                          setFamilyCenterStatus(null);
                        }}
                        maxLength={128}
                        placeholder="Password"
                        required
                        disabled={!isFamilyCenterEditable}
                        className="h-8 w-full rounded-md border border-black/25 bg-[#131417] px-2.5 text-xs text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                      />
                      <p className={`mt-1 text-[10px] ${familyMemberPasswordStrength.className}`}>
                        {familyMemberPasswordStrength.label}
                      </p>
                    </div>

                    <div>
                      <input
                        type="password"
                        value={familyMemberRepeatPasswordInput}
                        onChange={(event) => {
                          setFamilyMemberRepeatPasswordInput(event.target.value);
                          setFamilyCenterStatus(null);
                        }}
                        maxLength={128}
                        placeholder="Repeat Password"
                        required
                        disabled={!isFamilyCenterEditable}
                        className="h-8 w-full rounded-md border border-black/25 bg-[#131417] px-2.5 text-xs text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                      />
                      <p className={`mt-1 text-[10px] ${familyMemberRepeatPasswordStrength.className}`}>
                        {familyMemberRepeatPasswordStrength.label}
                        {familyMemberRepeatPasswordInput.trim().length > 0
                          ? familyMemberRepeatPasswordInput.trim() === familyMemberPasswordInput.trim()
                            ? " • Matches"
                            : " • Does not match"
                          : ""}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      onClick={onAddFamilyMember}
                      disabled={!isFamilyCenterEditable || isCreatingFamilyMemberAccount}
                      className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4]"
                    >
                      {isCreatingFamilyMemberAccount ? "Creating account..." : "Add Account"}
                    </Button>
                  </div>

                  {familyCenterStatus ? (
                    <p
                      className={`mt-2 rounded-md border px-2.5 py-2 text-xs ${
                        familyCenterStatusIsError
                          ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
                          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                      }`}
                    >
                      {familyCenterStatus}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-lg border border-white/10 bg-[#1a1b1e] p-2.5">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                    Existing Members
                  </p>

                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {familyCenterPreferences.familyMembers.length === 0 ? (
                      <div className="rounded-lg border border-white/10 bg-[#131417] px-3 py-2 text-xs text-[#949ba4]">
                        <p>
                          {isBusinessCenterSection && isFamilyApplicationApproved
                            ? "Business account approved. Add your first business member above to get started."
                            : `No ${centerLabel.toLowerCase()} accounts added yet.`}
                        </p>

                        {isBusinessCenterSection && isFamilyApplicationApproved ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              onClick={onSeedApprovedBusinessMember}
                              disabled={!isFamilyCenterEditable}
                              className="h-7 border border-indigo-400/35 bg-indigo-500/15 px-2 text-[11px] text-indigo-200 hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Add My Business Profile
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      familyCenterPreferences.familyMembers.map((member) => {
                        const lifecycle = member.linkedUserId
                          ? familyMemberLifecycleByUserId[member.linkedUserId]
                          : null;
                        const state = lifecycle?.state ?? member.familyLinkState;
                        const stateLabel =
                          state === "managed-under-16"
                            ? "Managed <16"
                            : state === "eligible-16-plus"
                            ? "16+ eligible"
                            : "Normal";

                        return (
                          <div
                            key={member.id}
                            className={`rounded-lg border px-2.5 py-2 ${
                              member.id === selectedFamilyMemberId
                                ? "border-[#5865f2]/60 bg-[#232953]"
                                : "border-white/10 bg-[#131417]"
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="truncate text-xs font-semibold text-white">
                                {member.childName || "Profile Name"}
                              </p>
                              {isBusinessCenterSection ? <BusinessMemberIcon /> : null}
                              <span className="inline-flex h-5 items-center rounded-md border border-white/15 bg-white/5 px-1.5 text-[10px] font-semibold text-[#d7dcff]">
                                {stateLabel}
                              </span>
                              {member.childRelation ? (
                                <span className="inline-flex h-5 items-center rounded-md border border-white/10 bg-black/20 px-1.5 text-[10px] text-[#b5bac1]">
                                  {isBusinessCenterSection ? `Pronouns: ${member.childRelation}` : member.childRelation}
                                </span>
                              ) : null}
                              {isBusinessCenterSection && member.childSection ? (
                                <span className="inline-flex h-5 items-center rounded-md border border-indigo-400/30 bg-indigo-500/10 px-1.5 text-[10px] text-indigo-200">
                                  Section: {member.childSection}
                                </span>
                              ) : null}
                            </div>

                            <p className="mt-0.5 truncate text-[11px] text-[#949ba4]">
                              {member.accountIdentifier}
                              {member.childDateOfBirth ? ` • DOB ${member.childDateOfBirth}` : ""}
                            </p>
                            <p className="truncate text-[11px] text-[#949ba4]">
                              {member.childEmail || "No email"}
                              {member.childPhone ? ` • ${member.childPhone}` : ""}
                            </p>
                            {member.linkedUserId ? (
                              <p className="truncate text-[11px] text-[#949ba4]">Linked: {member.linkedUserId}</p>
                            ) : (
                              <p className="truncate text-[11px] text-amber-300">Linked {centerLabel.toLowerCase()} account: not created</p>
                            )}

                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Button
                                type="button"
                                onClick={() => setSelectedFamilyMemberId(member.id)}
                                disabled={!isFamilyCenterEditable}
                                className="h-7 border border-[#5865f2]/35 bg-[#5865f2]/15 px-2 text-[11px] text-[#d7dcff] hover:bg-[#5865f2]/25"
                              >
                                Oversight
                              </Button>

                              <Button
                                type="button"
                                onClick={() => void onConvertFamilyMemberToNormal(member)}
                                disabled={
                                  !member.linkedUserId ||
                                  !familyMemberLifecycleByUserId[member.linkedUserId]?.canConvertToNormal ||
                                  isConvertingFamilyMemberUserId === member.linkedUserId ||
                                  !isFamilyCenterEditable
                                }
                                className="h-7 border border-emerald-500/35 bg-emerald-500/15 px-2 text-[11px] text-emerald-200 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isConvertingFamilyMemberUserId === member.linkedUserId ? "Converting..." : "Convert"}
                              </Button>

                              <Button
                                type="button"
                                onClick={() => onRemoveFamilyMember(member.id)}
                                disabled={!isFamilyCenterEditable}
                                className="h-7 border border-rose-500/35 bg-rose-500/15 px-2 text-[11px] text-rose-200 hover:bg-rose-500/25"
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            {familyCenterStatus ? (
              <p className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                {familyCenterStatus}
              </p>
            ) : null}

            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                onClick={onSaveFamilyCenterPreferences}
                disabled={isSavingFamilyCenterPreferences || !isFamilyCenterEditable}
                className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingFamilyCenterPreferences ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </span>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (displaySection === "voiceVideo") {
      const canControlVoiceCamera = isVoiceSessionActive && isVoiceVideoSession;
      const canControlAnyCamera = canControlVoiceCamera || isPmVideoSessionActive;
      const isCameraOn = canControlVoiceCamera ? isVoiceCameraOn : isPmCameraOn;

      const onToggleMute = () => {
        const next = !isVoiceMuted;
        setIsVoiceMuted(next);
        window.dispatchEvent(new CustomEvent(VOICE_TOGGLE_MUTE_EVENT, { detail: { isMuted: next } }));
      };

      const onToggleDeafen = () => {
        const next = !isVoiceDeafened;
        setIsVoiceDeafened(next);
        window.dispatchEvent(new CustomEvent(VOICE_TOGGLE_DEAFEN_EVENT, { detail: { isDeafened: next } }));
      };

      const onToggleCamera = () => {
        if (!canControlAnyCamera) {
          return;
        }

        const next = !isCameraOn;

        if (canControlVoiceCamera) {
          setIsVoiceCameraOn(next);
          window.dispatchEvent(new CustomEvent(VOICE_TOGGLE_CAMERA_EVENT, { detail: { isCameraOn: next } }));
        }

        if (isPmVideoSessionActive) {
          setIsPmCameraOn(next);
          window.dispatchEvent(new CustomEvent(PM_TOGGLE_CAMERA_EVENT, { detail: { isCameraOn: next } }));
        }
      };

      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Voice &amp; Video Controls</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Live controls are wired to your active voice channel and PM video sessions.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Voice Session</p>
                <p className="mt-1 text-xs text-[#dbdee1]">
                  {isVoiceSessionActive ? "Connected" : "Not connected"}
                  {isVoiceSessionActive ? (isVoiceVideoSession ? " • Video channel" : " • Audio channel") : ""}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">PM Video</p>
                <p className="mt-1 text-xs text-[#dbdee1]">{isPmVideoSessionActive ? "Active" : "Not active"}</p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Button
                type="button"
                onClick={onToggleMute}
                className={`justify-start gap-2 border ${
                  isVoiceMuted
                    ? "border-amber-400/35 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                    : "border-emerald-500/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                }`}
              >
                {isVoiceMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {isVoiceMuted ? "Unmute" : "Mute"}
              </Button>

              <Button
                type="button"
                onClick={onToggleDeafen}
                className={`justify-start gap-2 border ${
                  isVoiceDeafened
                    ? "border-amber-400/35 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                    : "border-emerald-500/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                }`}
              >
                {isVoiceDeafened ? <VolumeX className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
                {isVoiceDeafened ? "Undeafen" : "Deafen"}
              </Button>

              <Button
                type="button"
                onClick={onToggleCamera}
                disabled={!canControlAnyCamera}
                className={`justify-start gap-2 border ${
                  !canControlAnyCamera
                    ? "border-white/15 bg-black/20 text-[#949ba4] hover:bg-black/20 disabled:cursor-not-allowed disabled:opacity-70"
                    : isCameraOn
                    ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                    : "border-amber-400/35 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                }`}
              >
                {isCameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                {isCameraOn ? "Turn Camera Off" : "Turn Camera On"}
              </Button>
            </div>

            <p className="mt-3 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
              {canControlAnyCamera
                ? isPmVideoSessionActive && canControlVoiceCamera
                  ? "Camera control is currently wired to both voice video and PM video sessions."
                  : canControlVoiceCamera
                  ? "Camera control is currently wired to your active voice video channel."
                  : "Camera control is currently wired to your active PM video session."
                : "Join a voice video channel or start a PM video call to enable camera controls."}
            </p>
          </div>
        </div>
      );
    }

    if (displaySection === "accessibility") {
      const accessibilityRows: Array<{
        key: Exclude<keyof AccessibilityPreferences, "messageSpacing">;
        title: string;
        description: string;
      }> = [
        {
          key: "preferReducedMotion",
          title: "Reduced Motion",
          description: "Limit animations and motion-heavy UI transitions where possible.",
        },
        {
          key: "highContrastMode",
          title: "High Contrast Mode",
          description: "Increase contrast for text and controls to improve readability.",
        },
        {
          key: "largerChatFont",
          title: "Larger Chat Font",
          description: "Use a larger default chat font size in message views.",
        },
        {
          key: "enableScreenReaderAnnouncements",
          title: "Screen Reader Announcements",
          description: "Announce new message updates for assistive technology.",
        },
      ];

      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Accessibility Preferences</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Tune readability and interaction comfort for your chat experience.
            </p>
          </div>

          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <div className="space-y-2">
              {accessibilityRows.map((item) => (
                <div key={`accessibility-setting-${item.key}`} className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-[#949ba4]">{item.description}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setAccessibilityPreferences((current) => ({
                        ...current,
                        [item.key]: !current[item.key],
                      }));
                      setAccessibilityStatus(null);
                    }}
                    className={`inline-flex h-7 w-12 items-center rounded-full border transition ${
                      accessibilityPreferences[item.key]
                        ? "border-emerald-400/50 bg-emerald-500/40"
                        : "border-zinc-600 bg-zinc-700"
                    }`}
                    aria-pressed={accessibilityPreferences[item.key]}
                    aria-label={`Toggle ${item.title}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                        accessibilityPreferences[item.key] ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Message Spacing
              </p>

              <div className="mt-2 inline-flex rounded-md border border-white/10 bg-[#1a1b1e] p-1">
                {([
                  { value: "compact", label: "Compact" },
                  { value: "comfortable", label: "Comfortable" },
                ] as const).map((option) => {
                  const selected = accessibilityPreferences.messageSpacing === option.value;

                  return (
                    <button
                      key={`accessibility-message-spacing-${option.value}`}
                      type="button"
                      onClick={() => {
                        setAccessibilityPreferences((current) => ({
                          ...current,
                          messageSpacing: option.value,
                        }));
                        setAccessibilityStatus(null);
                      }}
                      className={`h-8 rounded px-3 text-xs font-medium transition ${
                        selected
                          ? "bg-[#5865f2] text-white"
                          : "text-[#b5bac1] hover:bg-white/10 hover:text-white"
                      }`}
                      aria-pressed={selected}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                Contrast: <span className="font-semibold text-white">{accessibilityPreferences.highContrastMode ? "High" : "Default"}</span>
              </p>

              <Button
                type="button"
                onClick={() => void onSaveAccessibilityPreferences()}
                disabled={isSavingAccessibilityPreferences}
                className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingAccessibilityPreferences ? "Saving..." : "Save Accessibility"}
              </Button>
            </div>

            {accessibilityStatus ? (
              <p className="mt-3 rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
                {accessibilityStatus}
              </p>
            ) : null}
          </div>
        </div>
      );
    }



    return renderComingSoonSection(sectionLabelMap[displaySection], sectionDescriptionMap[displaySection]);
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={onClose}>
      <DialogContent className="settings-theme-scope settings-scrollbar theme-settings-shell flex h-[85vh] max-h-[85vh] w-[85vw] max-w-[85vw] flex-col overflow-hidden rounded-xl border-black/30 bg-[#2b2d31] p-0 text-[#dbdee1] [&_input]:max-w-full [&_input]:min-w-0 [&_textarea]:max-w-full [&_textarea]:min-w-0 [&_button]:max-w-full [&_button]:min-w-0">
        <DialogTitle className="sr-only">User Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Edit account, appearance, notification, and privacy settings.
        </DialogDescription>

        <div className="grid min-h-0 flex-1 grid-cols-[1fr_260px] overflow-hidden">
          <aside className="theme-settings-rail settings-scrollbar order-2 flex h-full min-h-0 flex-col overflow-y-auto border-l border-black/20 bg-[#2b2d31] p-4 pt-2">
            <nav className="settings-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {visibleSectionGroups.map((group) => (
                <div key={group.label} className="space-y-1">
                  {(() => {
                    const isCollapsed = Boolean(collapsedSectionGroups[group.label]);

                    return (
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedSectionGroups((current) => ({
                            ...current,
                            [group.label]: !current[group.label],
                          }))
                        }
                        className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-[#949ba4] transition hover:bg-[#35373c] hover:text-[#c8ccd1]"
                        aria-expanded={!isCollapsed}
                        aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${group.label}`}
                      >
                        <span>{group.label}</span>
                        {isCollapsed ? (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        )}
                      </button>
                    );
                  })()}

                  {!collapsedSectionGroups[group.label] && group.sections.map((section) => {
                    const isActive = activeSection === section;
                    const SectionIcon = sectionIconMap[section];

                    return (
                      <button
                        key={section}
                        type="button"
                        onClick={() => setActiveSection(section)}
                        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                          isActive
                            ? "bg-[#404249] font-semibold text-white"
                            : "text-[#b5bac1] hover:bg-[#35373c] hover:text-[#f2f3f5]"
                        }`}
                      >
                        <SectionIcon className="h-4 w-4 shrink-0" />
                        {sectionLabelMap[section]}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            <p className="mt-4 rounded-md border border-black/20 bg-[#232428] px-3 py-2 text-xs leading-5 text-[#949ba4] whitespace-normal wrap-break-word">
              Choose a category on the right
              <br />
              and edit details on the left.
            </p>

            <button
              type="button"
              onClick={onLogout}
              disabled={isLoggingOut}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-rose-500/30 bg-rose-600/15 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-600/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoggingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              {isLoggingOut ? "Logging out..." : "Log out"}
            </button>
          </aside>

          <section className="theme-settings-content order-1 min-h-0 overflow-hidden">
            <div
              className={`transition-all duration-200 ${
                isSectionVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
              }`}
            >
              <div className="theme-settings-content-header sticky top-0 z-10 border-b border-black/20 bg-[#2b2d31]/95 px-6 py-4 backdrop-blur">
                <h3 className={`text-xl font-bold text-white ${displaySection === "myAccount" ? "text-center" : ""}`}>
                  {sectionLabelMap[displaySection]}
                </h3>
                <p className={`mt-1 text-sm text-[#949ba4] ${displaySection === "myAccount" ? "text-center" : ""}`}>
                  {sectionDescriptionMap[displaySection]}
                </p>
              </div>

              <div className="settings-scrollbar theme-settings-content-body h-[calc(85vh-78px)] overflow-y-auto px-6 py-5">
                {displaySection === "myAccount" ? (
                  <div className="mx-auto mb-6 w-full max-w-md overflow-hidden rounded-[2.5rem] border border-white/15 bg-[#1f2024] p-4 shadow-2xl shadow-black/45">
                    <div className="mx-auto w-full max-w-[24rem] space-y-3">
                      <input
                        ref={bannerInputRef}
                        className="hidden"
                        type="file"
                        accept="image/*"
                        onChange={(event) => onBannerChange(event.target.files?.[0])}
                      />

                      <input
                        ref={avatarInputRef}
                        className="hidden"
                        type="file"
                        accept="image/*"
                        onChange={(event) => onAvatarChange(event.target.files?.[0])}
                      />

                      <p className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                        Account Information
                      </p>

                      <div className="rounded-lg border border-white/10 bg-[#1a1b1e] p-3 text-xs">
                        <div className="space-y-1 text-[#dbdee1]">
                          <p>
                            <span className="text-[#949ba4]">Name:</span>{" "}
                            <span className="text-white">
                              {realName || profileName || data.profileEmail?.split("@")[0] || resolvedProfileId || "Deleted User"}
                            </span>
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[#949ba4]">Date Of Birth:</span>
                            <input
                              type="date"
                              value={dateOfBirthDraft}
                              onChange={(event) => {
                                setDateOfBirthDraft(event.target.value);
                                setDateOfBirthStatus(null);
                              }}
                              disabled={isSavingDateOfBirth || !canEditDateOfBirth}
                              className="h-6 rounded-md border border-black/25 bg-[#111214] px-2.5 text-[11px] text-white outline-none focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                            {canEditDateOfBirth && (hasDateOfBirthChanges || isSavingDateOfBirth) ? (
                              <>
                                <Button
                                  type="button"
                                  onClick={() => {
                                    void onSaveDateOfBirth(dateOfBirthDraft);
                                  }}
                                  disabled={isSavingDateOfBirth}
                                  className="h-6 bg-[#5865f2] px-2.5 text-[11px] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isSavingDateOfBirth ? "Saving..." : "Save"}
                                </Button>
                                <Button
                                  type="button"
                                  onClick={() => {
                                    setDateOfBirthDraft(dateOfBirth || "");
                                    setDateOfBirthStatus(null);
                                  }}
                                  disabled={isSavingDateOfBirth}
                                  className="h-6 border border-white/15 bg-[#1a1b1e] px-2.5 text-[11px] text-[#dbdee1] hover:bg-[#2a2b30] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : null}
                          </div>
                          {!canEditDateOfBirth ? (
                            <p className="text-[10px] text-[#b5bac1]">
                              Date Of Birth is locked after first save. Only an Administrator can edit it.
                            </p>
                          ) : null}
                          {dateOfBirthStatus ? (
                            <p className="text-[10px] text-[#b5bac1]">{dateOfBirthStatus}</p>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[#949ba4]">Phone Number:</span>
                            {isEditingPhoneNumberInline ? (
                              <>
                                <input
                                  type="text"
                                  value={phoneNumberDraft}
                                  style={{ width: "6rem", minWidth: "6rem", maxWidth: "6rem" }}
                                  onChange={(event) => {
                                    setPhoneNumberDraft(event.target.value);
                                    setPhoneNumberStatus(null);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                      setPhoneNumberDraft(phoneNumber || "");
                                      setPhoneNumberStatus(null);
                                      setIsEditingPhoneNumberInline(false);
                                      return;
                                    }

                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      void (async () => {
                                        const isSaved = await onSavePhoneNumber(phoneNumberDraft);
                                        if (isSaved) {
                                          setIsEditingPhoneNumberInline(false);
                                        }
                                      })();
                                    }
                                  }}
                                  maxLength={32}
                                  placeholder="Phone Number"
                                  disabled={isSavingPhoneNumber}
                                  className="h-5 rounded-md border border-black/25 bg-[#111214] px-2.5 text-[11px] text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35 disabled:cursor-not-allowed disabled:opacity-60"
                                />
                                <Button
                                  type="button"
                                  onClick={() => {
                                    void (async () => {
                                      const isSaved = await onSavePhoneNumber(phoneNumberDraft);
                                      if (isSaved) {
                                        setIsEditingPhoneNumberInline(false);
                                      }
                                    })();
                                  }}
                                  disabled={isSavingPhoneNumber}
                                  className="h-6 bg-[#5865f2] px-2.5 text-[11px] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isSavingPhoneNumber ? "Saving..." : "Save"}
                                </Button>
                                <Button
                                  type="button"
                                  onClick={() => {
                                    setPhoneNumberDraft(phoneNumber || "");
                                    setPhoneNumberStatus(null);
                                    setIsEditingPhoneNumberInline(false);
                                  }}
                                  className="h-6 border border-white/15 bg-[#1a1b1e] px-2.5 text-[11px] text-[#dbdee1] hover:bg-[#2a2b30]"
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setPhoneNumberDraft(phoneNumber || "");
                                  setPhoneNumberStatus(null);
                                  setIsEditingPhoneNumberInline(true);
                                }}
                                style={{ width: "6rem", minWidth: "6rem", maxWidth: "6rem" }}
                                className="h-6 rounded-md border border-black/25 bg-[#111214] px-2.5 text-left text-[11px] text-white transition hover:border-[#5865f2]/70 hover:bg-[#17181b]"
                                title="Click to edit phone number"
                              >
                                {phoneNumber.trim() || "Not set"}
                              </button>
                            )}
                          </div>
                          {phoneNumberStatus ? (
                            <p className="text-[10px] text-[#b5bac1]">{phoneNumberStatus}</p>
                          ) : null}
                          <p>
                            <span className="text-[#949ba4]">Email:</span>{" "}
                            <span className="text-white">{data.profileEmail || "No email"}</span>
                          </p>
                          <p>
                            <span className="text-[#949ba4]">Status:</span>{" "}
                            <span className="text-white">{formatPresenceStatusLabel(profilePresenceStatus, { showGameIcon: Boolean(profileCurrentGame?.trim()) })}</span>
                          </p>
                          <p>
                            <span className="text-[#949ba4]">Role:</span>{" "}
                            <span className="text-white">{inAccordStaffRoleLabel ?? "Member"}</span>
                          </p>
                          <p>
                            <span className="text-[#949ba4]">Last logon:</span>{" "}
                            <span className="text-white">{lastLogonDisplay}</span>
                          </p>
                          <p>
                            <span className="text-[#949ba4]">Created:</span>{" "}
                            <span className="text-white">{joinedDisplay}</span>
                          </p>
                        </div>
                      </div>

                    </div>
                  </div>
                ) : null}

                {displaySection === "myAccount" ? (
                  <div className="mx-auto mb-6 w-full max-w-5xl rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-sm font-medium text-white">Default Profile</p>
                    <p className="mt-1 text-xs text-[#949ba4]">
                      Edit your global profile using the same layout as server profile edits.
                    </p>

                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-[#1a1b1e] p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                          Live Preview
                        </p>

                        <div className="relative mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#111214] text-[#dbdee1] shadow-lg shadow-black/40">
                          <ProfileEffectLayer src={profileEffectInput.trim() || profileEffectUrl} />
                          <div className="relative h-24 bg-linear-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
                            {resolveBannerUrl(bannerUrl) ? (
                              <BannerImage
                                src={resolveBannerUrl(bannerUrl) as string}
                                alt="Default profile preview banner"
                                className="object-cover"
                              />
                            ) : null}
                          </div>

                          <div className="relative p-3 pt-9">
                            <div className="absolute -top-10 left-3 rounded-full border-4 border-[#111214]">
                              <UserAvatar
                                src={avatarUrl ?? undefined}
                                decorationSrc={avatarDecorationInput.trim() || avatarDecorationUrl}
                                className="h-20 w-20"
                              />
                            </div>

                            <div className="min-w-0">
                              <ProfileIconRow icons={profileIcons} className="mb-1" />
                              <NameplatePill
                                label={nameplateLabelInput.trim() || nameplateLabel}
                                color={nameplateColorInput || nameplateColor}
                                imageUrl={nameplateImageUrlInput || nameplateImageUrl}
                                className="mb-1"
                              />
                              <ProfileNameWithServerTag
                                name={defaultProfileNameDraft.trim() || profileName || realName || "User"}
                                profileId={resolvedProfileId}
                                nameClassName={`text-base font-bold text-white ${getProfileNameStyleClass(
                                  composeProfileNameStyleValue({
                                    font: defaultProfileNameFont,
                                    effect: defaultProfileNameEffect,
                                    color: defaultProfileNameColor,
                                  })
                                )}`}
                              />
                              <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-[#949ba4]">
                                Global Profile Preview
                              </p>
                            </div>

                            <div className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] p-3 text-xs">
                              <div className="space-y-1 text-[#dbdee1]">
                                <p>Pronouns: {pronounsDraft.trim() || pronouns.trim() || "Not set"}</p>
                                <p>Comment: {commentDraft.trim() || comment.trim() || "Not set"}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <p className="mt-2 text-[11px] text-[#949ba4]">
                          Preview updates as you edit your default profile values.
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                            profile tweaks
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              onClick={() => setIsDefaultBannerPanelOpen(true)}
                              disabled={isUploadingBanner}
                              className="h-8 border border-white/15 bg-[#1a1b1e] px-3 text-xs text-[#dbdee1] hover:bg-[#2a2b30] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              BANNER
                            </Button>
                            <Button
                              type="button"
                              onClick={() => setIsAvatarPanelOpen(true)}
                              className="h-8 border border-white/15 bg-[#1a1b1e] px-3 text-xs text-[#dbdee1] hover:bg-[#2a2b30]"
                            >
                              Avatar
                            </Button>
                            <Button
                              type="button"
                              onClick={() => setIsDefaultProfileNameStylesPanelOpen(true)}
                              className="h-8 border border-white/15 bg-[#1a1b1e] px-3 text-xs text-[#dbdee1] hover:bg-[#2a2b30]"
                            >
                              Profile Name Styles
                            </Button>
                            <Button
                              type="button"
                              onClick={() => setIsNameplatePanelOpen(true)}
                              className="h-8 border border-white/15 bg-[#1a1b1e] px-3 text-xs text-[#dbdee1] hover:bg-[#2a2b30]"
                            >
                              Nameplate
                            </Button>
                            <Button
                              type="button"
                              onClick={() => setIsAvatarDecorationPanelOpen(true)}
                              className="h-8 border border-white/15 bg-[#1a1b1e] px-3 text-xs text-[#dbdee1] hover:bg-[#2a2b30]"
                            >
                              Avatar Decoration
                            </Button>
                            <Button
                              type="button"
                              onClick={() => setIsProfileEffectPanelOpen(true)}
                              className="h-8 border border-white/15 bg-[#1a1b1e] px-3 text-xs text-[#dbdee1] hover:bg-[#2a2b30]"
                            >
                              Profile Effect
                            </Button>
                          </div>
                          {nameplateLabelInput.trim() || nameplateLabel ? (
                            <p className="mt-1 text-[11px] text-[#949ba4]">Nameplate set.</p>
                          ) : null}
                          {profileEffectInput.trim() || profileEffectUrl ? (
                            <p className="mt-1 text-[11px] text-[#949ba4]">Profile effect set.</p>
                          ) : null}
                          {nameplateStatus ? (
                            <p className="mt-1 text-[11px] text-[#949ba4]">{nameplateStatus}</p>
                          ) : null}
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                            Default profile name
                          </label>
                          <input
                            type="text"
                            value={defaultProfileNameDraft}
                            onChange={(event) => {
                              setDefaultProfileNameDraft(event.target.value);
                              setProfileNameError(null);
                              setProfileNameSuccess(null);
                            }}
                            maxLength={80}
                            placeholder={realName || "Use your account name"}
                            disabled={isSavingProfileName}
                            className="w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                          <div className="mt-2 flex justify-end">
                            <Button
                              type="button"
                              onClick={() => void onSaveProfileName(defaultProfileNameDraft)}
                              disabled={isSavingProfileName}
                              className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isSavingProfileName ? "Saving..." : "Save Name"}
                            </Button>
                          </div>
                          {profileNameError ? (
                            <p className="mt-2 rounded-md border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                              {profileNameError}
                            </p>
                          ) : null}
                          {profileNameSuccess ? (
                            <p className="mt-2 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                              {profileNameSuccess}
                            </p>
                          ) : null}
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                            Pronouns
                          </label>
                          <input
                            type="text"
                            value={pronounsDraft}
                            onChange={(event) => {
                              setPronounsDraft(event.target.value);
                              setPronounsStatus(null);
                            }}
                            maxLength={80}
                            placeholder="e.g. she/her"
                            disabled={isSavingPronouns}
                            className="w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                          <div className="mt-2 flex justify-end">
                            <Button
                              type="button"
                              onClick={() => void onSavePronouns(pronounsDraft)}
                              disabled={isSavingPronouns}
                              className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isSavingPronouns ? "Saving..." : "Save Pronouns"}
                            </Button>
                          </div>
                          {pronounsStatus ? (
                            <p className="mt-2 rounded-md border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#b5bac1]">
                              {pronounsStatus}
                            </p>
                          ) : null}
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                            Default comment
                          </label>
                          <textarea
                            value={commentDraft}
                            onChange={(event) => {
                              setCommentDraft(event.target.value);
                              setCommentStatus(null);
                            }}
                            maxLength={280}
                            rows={4}
                            placeholder="Add a default comment"
                            disabled={isSavingComment}
                            className="w-full resize-y rounded-md border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                          <div className="mt-2 flex justify-end">
                            <Button
                              type="button"
                              onClick={() => void onSaveComment(commentDraft)}
                              disabled={isSavingComment}
                              className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isSavingComment ? "Saving..." : "Save Comment"}
                            </Button>
                          </div>
                          {commentStatus ? (
                            <p className="mt-2 rounded-md border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#b5bac1]">
                              {commentStatus}
                            </p>
                          ) : null}
                        </div>

                        <Dialog open={isNameplatePanelOpen} onOpenChange={setIsNameplatePanelOpen}>
                          <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>Edit Nameplate</DialogTitle>
                              <DialogDescription className="text-[#949ba4]">
                                Create a banner nameplate behind your profile name.
                              </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-3">
                              <input
                                ref={nameplateImageInputRef}
                                className="hidden"
                                type="file"
                                accept="image/*"
                                onChange={(event) => onNameplateImageChange(event.target.files?.[0])}
                              />

                              <div>
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                                  Banner color
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                  {NAMEPLATE_COLOR_PRESETS.map((preset) => {
                                    const isActive = (nameplateColorInput || "#5865f2").toLowerCase() === preset.color.toLowerCase();

                                    return (
                                      <button
                                        key={`default-nameplate-preset-${preset.key}`}
                                        type="button"
                                        disabled={isSavingNameplate}
                                        onClick={() => {
                                          setNameplateColorInput(preset.color);
                                          setNameplateStatus(null);
                                        }}
                                        className={`overflow-hidden rounded-md border text-left transition ${
                                          isActive
                                            ? "border-white/70 ring-2 ring-white/25"
                                            : "border-white/15 hover:border-white/35"
                                        } disabled:cursor-not-allowed disabled:opacity-60`}
                                      >
                                        <span className="block h-6" style={{ backgroundColor: preset.color }} />
                                        <span className="block bg-[#1a1b1e] px-2 py-1 text-[10px] text-[#dbdee1]">{preset.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                                  Custom Nameplate Image
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    onClick={onPickNameplateImage}
                                    disabled={isUploadingNameplateImage}
                                    className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {isUploadingNameplateImage ? "Uploading..." : "Upload Image"}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                      setNameplateImageUrlInput("");
                                      setNameplateStatus(null);
                                    }}
                                    disabled={isUploadingNameplateImage}
                                  >
                                    Remove Image
                                  </Button>
                                </div>

                                {uploadedBannerThumbnails.length > 0 ? (
                                  <div className="mt-2 grid grid-cols-4 gap-2">
                                    {uploadedBannerThumbnails.map((thumbnailUrl) => (
                                      <button
                                        key={`default-nameplate-thumb-${thumbnailUrl}`}
                                        type="button"
                                        onClick={() => {
                                          setNameplateImageUrlInput(thumbnailUrl);
                                          setNameplateStatus(null);
                                        }}
                                        className="overflow-hidden rounded-md border border-white/15 bg-[#111214] transition hover:border-[#5865f2]/60"
                                        title="Use this uploaded image"
                                      >
                                        <div className="relative h-10 w-full">
                                          <Image
                                            src={thumbnailUrl}
                                            alt="Uploaded nameplate thumbnail"
                                            fill
                                            className="object-cover"
                                            unoptimized
                                          />
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>

                              <div className="rounded-lg border border-white/10 bg-[#15161a] p-2">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                                  Live Nameplate Preview
                                </p>
                                <div
                                  className="relative mt-2 overflow-hidden rounded-md border border-white/10 bg-[#111214] px-3 py-2"
                                  style={
                                    nameplateImageUrlInput.trim()
                                      ? {
                                          backgroundImage: `url(${nameplateImageUrlInput.trim()})`,
                                          backgroundSize: "cover",
                                          backgroundPosition: "center",
                                        }
                                      : undefined
                                  }
                                >
                                  <span
                                    className="absolute inset-0"
                                    style={{
                                      backgroundColor: `${(nameplateColorInput || "#5865f2").trim()}33`,
                                    }}
                                  />
                                  <span
                                    className="absolute inset-y-0 left-0 w-1.5"
                                    style={{
                                      backgroundColor: (nameplateColorInput || "#5865f2").trim(),
                                    }}
                                  />
                                  <p className="relative truncate pl-1 text-sm font-semibold text-white">
                                    {defaultProfileNameDraft.trim() || profileName || realName || "User"}
                                  </p>
                                </div>
                              </div>

                              {nameplateStatus ? (
                                <p className="rounded-md border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#b5bac1]">
                                  {nameplateStatus}
                                </p>
                              ) : null}
                            </div>

                            <DialogFooter className="gap-2 sm:justify-between">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  setNameplateLabelInput("");
                                  setNameplateColorInput("");
                                  setNameplateImageUrlInput("");
                                  setNameplateStatus(null);
                                }}
                                disabled={isSavingNameplate}
                              >
                                Clear
                              </Button>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  onClick={() =>
                                    void onSaveNameplate(
                                      nameplateColorInput.trim() || nameplateImageUrlInput.trim()
                                        ? (defaultProfileNameDraft.trim() || profileName || realName || "User").slice(0, 40)
                                        : "",
                                      nameplateColorInput,
                                      nameplateImageUrlInput
                                    )
                                  }
                                  disabled={isSavingNameplate}
                                  className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isSavingNameplate ? "Saving..." : "Save"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => setIsNameplatePanelOpen(false)}
                                >
                                  Close
                                </Button>
                              </div>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>

                        <Dialog open={isDefaultBannerPanelOpen} onOpenChange={setIsDefaultBannerPanelOpen}>
                          <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>Edit Banner</DialogTitle>
                              <DialogDescription className="text-[#949ba4]">
                                Manage your global profile banner from this panel.
                              </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4">
                              <div className="overflow-hidden rounded-xl border border-white/10 bg-[#111214]">
                                <div className="relative h-28 bg-linear-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
                                  {resolveBannerUrl(bannerUrl) ? (
                                    <BannerImage
                                      src={resolveBannerUrl(bannerUrl) as string}
                                      alt="Default profile banner preview"
                                      className="object-cover"
                                    />
                                  ) : null}
                                </div>
                              </div>

                              {uploadedBannerThumbnails.length > 0 ? (
                                <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                                    Uploaded Banners
                                  </p>
                                  <div className="grid grid-cols-4 gap-2">
                                    {uploadedBannerThumbnails.map((thumbnailUrl) => (
                                      <button
                                        key={`default-banner-thumb-${thumbnailUrl}`}
                                        type="button"
                                        onClick={() => {
                                          setBannerUrl(thumbnailUrl);
                                          void axios.patch("/api/profile/banner", { bannerUrl: thumbnailUrl });
                                          window.dispatchEvent(
                                            new CustomEvent("inaccord:profile-updated", {
                                              detail: {
                                                profileId: resolvedProfileId,
                                                bannerUrl: thumbnailUrl,
                                              },
                                            })
                                          );
                                        }}
                                        className="overflow-hidden rounded-md border border-white/15 bg-[#111214] transition hover:border-[#5865f2]/60"
                                        title="Use this uploaded banner"
                                      >
                                        <div className="relative h-10 w-full">
                                          <BannerImage
                                            src={resolveBannerUrl(thumbnailUrl) ?? thumbnailUrl}
                                            alt="Uploaded banner thumbnail"
                                            className="object-cover"
                                          />
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              <div className="flex flex-wrap justify-end gap-2">
                                {bannerUrl ? (
                                  <Button
                                    type="button"
                                    onClick={() => void onRemoveBanner()}
                                    disabled={isUploadingBanner}
                                    className="border border-rose-500/35 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Remove Banner
                                  </Button>
                                ) : null}

                                <Button
                                  type="button"
                                  onClick={onPickBanner}
                                  disabled={isUploadingBanner}
                                  className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isUploadingBanner ? (
                                    <span className="inline-flex items-center gap-2">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      Uploading...
                                    </span>
                                  ) : (
                                    "Upload Banner"
                                  )}
                                </Button>

                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => setIsDefaultBannerPanelOpen(false)}
                                >
                                  Close
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>

                        <Dialog
                          open={isDefaultProfileNameStylesPanelOpen}
                          onOpenChange={setIsDefaultProfileNameStylesPanelOpen}
                        >
                          <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Profile Name Styles (Default)</DialogTitle>
                              <DialogDescription className="text-[#949ba4]">
                                Make your default profile name look fancy. Server profile styles are configured separately.
                              </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-3">
                              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                                  Default profile name style sections
                                </p>

                                <div className="mt-3 space-y-3">
                                  <div>
                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                                      Font
                                    </label>
                                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                                      {PROFILE_NAME_FONT_OPTIONS.map((option) => {
                                        const isActive = defaultProfileNameFont === option.key;
                                        const iconClass =
                                          option.key === "bold"
                                            ? "font-black"
                                            : option.key === "italic"
                                            ? "italic font-semibold"
                                            : option.key === "mono"
                                            ? "font-mono"
                                            : option.key === "serif"
                                            ? "font-serif"
                                            : "";

                                        return (
                                          <button
                                            key={`default-font-${option.key}`}
                                            type="button"
                                            disabled={isSavingDefaultProfileNameStyle}
                                            onClick={() => {
                                              const next = option.key as ProfileNameFontKey;
                                              setDefaultProfileNameFont(next);
                                              setDefaultProfileNameStyle(
                                                composeProfileNameStyleValue({
                                                  font: next,
                                                  effect: defaultProfileNameEffect,
                                                  color: defaultProfileNameColor,
                                                })
                                              );
                                              setDefaultProfileNameStyleStatus(null);
                                            }}
                                            title={option.description}
                                            className={`aspect-square rounded-md border p-1 text-[10px] leading-tight transition flex flex-col items-center justify-center text-center ${
                                              isActive
                                                ? "border-[#5865f2]/70 bg-[#5865f2]/20 text-white"
                                                : "border-white/15 bg-[#1a1b1e] text-[#c8ccd1] hover:bg-[#2a2b30]"
                                            } disabled:cursor-not-allowed disabled:opacity-60`}
                                          >
                                            <span className={`block text-4xl leading-none ${iconClass}`}>Aa</span>
                                            <span className="mt-0.5 block truncate">{option.label}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <div>
                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                                      Effect
                                    </label>
                                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                                      {PROFILE_NAME_EFFECT_OPTIONS.map((option) => {
                                        const isActive = defaultProfileNameEffect === option.key;
                                        const icon =
                                          option.key === "solid"
                                            ? "⬤"
                                            : option.key === "gradient"
                                            ? "🌈"
                                            : option.key === "neon"
                                            ? "✨"
                                            : option.key === "toon"
                                            ? "🎭"
                                            : "💥";

                                        return (
                                          <button
                                            key={`default-effect-${option.key}`}
                                            type="button"
                                            disabled={isSavingDefaultProfileNameStyle}
                                            onClick={() => {
                                              const next = option.key as ProfileNameEffectKey;
                                              setDefaultProfileNameEffect(next);
                                              setDefaultProfileNameStyle(
                                                composeProfileNameStyleValue({
                                                  font: defaultProfileNameFont,
                                                  effect: next,
                                                  color: defaultProfileNameColor,
                                                })
                                              );
                                              setDefaultProfileNameStyleStatus(null);
                                            }}
                                            title={option.description}
                                            className={`aspect-square rounded-md border p-1 text-[10px] leading-tight transition flex flex-col items-center justify-center text-center ${
                                              isActive
                                                ? "border-[#5865f2]/70 bg-[#5865f2]/20 text-white"
                                                : "border-white/15 bg-[#1a1b1e] text-[#c8ccd1] hover:bg-[#2a2b30]"
                                            } disabled:cursor-not-allowed disabled:opacity-60`}
                                          >
                                            <span className="block text-4xl leading-none">{icon}</span>
                                            <span className="mt-0.5 block truncate">{option.label}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <div>
                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                                      Color
                                    </label>
                                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                                      {PROFILE_NAME_COLOR_OPTIONS.map((option) => {
                                        const isActive = defaultProfileNameColor === option.key;
                                        const dotClass =
                                          option.key === "blurb"
                                            ? "bg-[#7b88ff]"
                                            : option.key === "sunset"
                                            ? "bg-[#ff8a5b]"
                                            : option.key === "frost"
                                            ? "bg-[#66d9ff]"
                                            : option.key === "ruby"
                                            ? "bg-[#ff6b81]"
                                            : "bg-white/70";

                                        return (
                                          <button
                                            key={`default-color-${option.key}`}
                                            type="button"
                                            disabled={isSavingDefaultProfileNameStyle}
                                            onClick={() => {
                                              const next = option.key as ProfileNameColorKey;
                                              setDefaultProfileNameColor(next);
                                              setDefaultProfileNameStyle(
                                                composeProfileNameStyleValue({
                                                  font: defaultProfileNameFont,
                                                  effect: defaultProfileNameEffect,
                                                  color: next,
                                                })
                                              );
                                              setDefaultProfileNameStyleStatus(null);
                                            }}
                                            title={option.description}
                                            className={`aspect-square rounded-md border p-1 text-[10px] leading-tight transition flex flex-col items-center justify-center text-center ${
                                              isActive
                                                ? "border-[#5865f2]/70 bg-[#5865f2]/20 text-white"
                                                : "border-white/15 bg-[#1a1b1e] text-[#c8ccd1] hover:bg-[#2a2b30]"
                                            } disabled:cursor-not-allowed disabled:opacity-60`}
                                          >
                                            <span className={`mx-auto block h-7 w-7 rounded-full ${dotClass}`} />
                                            <span className="mt-0.5 block truncate">{option.label}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-2 rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#b5bac1]">
                                  Preview:{" "}
                                  <span
                                    className={`text-sm text-white ${getProfileNameStyleClass(
                                      composeProfileNameStyleValue({
                                        font: defaultProfileNameFont,
                                        effect: defaultProfileNameEffect,
                                        color: defaultProfileNameColor,
                                      })
                                    )}`}
                                  >
                                    {defaultProfileNameDraft.trim() || profileName || realName || "User"}
                                  </span>
                                </div>
                                <div className="mt-2 rounded-lg border border-white/10 bg-[#15161a] px-3 py-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                                    Live Sample
                                  </p>
                                  <p
                                    className={`mt-1 text-sm text-white ${getProfileNameStyleClass(
                                      composeProfileNameStyleValue({
                                        font: defaultProfileNameFont,
                                        effect: defaultProfileNameEffect,
                                        color: defaultProfileNameColor,
                                      })
                                    )}`}
                                  >
                                    The quick brown fox jumps over the lazy dog.
                                  </p>
                                </div>
                              </div>

                              {defaultProfileNameStyleStatus ? (
                                <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                                  {defaultProfileNameStyleStatus}
                                </p>
                              ) : null}

                              <div className="flex flex-wrap justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => {
                                    const resetParts = getProfileNameStyleParts(DEFAULT_PROFILE_NAME_STYLE);
                                    setDefaultProfileNameStyle(DEFAULT_PROFILE_NAME_STYLE);
                                    setDefaultProfileNameFont(resetParts.font);
                                    setDefaultProfileNameEffect(resetParts.effect);
                                    setDefaultProfileNameColor(resetParts.color);
                                    setDefaultProfileNameStyleStatus(null);
                                  }}
                                  disabled={isSavingDefaultProfileNameStyle}
                                >
                                  Reset Style
                                </Button>
                                <Button
                                  type="button"
                                  onClick={() => void onSaveDefaultProfileNameStyle()}
                                  disabled={isSavingDefaultProfileNameStyle}
                                  className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isSavingDefaultProfileNameStyle ? (
                                    <span className="inline-flex items-center gap-2">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      Saving...
                                    </span>
                                  ) : (
                                    "Save Default Style"
                                  )}
                                </Button>
                                <Button type="button" variant="outline" onClick={() => setIsDefaultProfileNameStylesPanelOpen(false)}>
                                  Close
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>

                        <Dialog open={isAvatarPanelOpen} onOpenChange={setIsAvatarPanelOpen}>
                          <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>Avatar</DialogTitle>
                              <DialogDescription className="text-[#949ba4]">
                                Upload a global avatar used when a server profile avatar is not set.
                              </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4">
                              <div className="rounded-xl border border-white/10 bg-[#1a1b1e] p-4">
                                <div className="flex items-center gap-3">
                                  <div className="relative overflow-hidden rounded-full">
                                    <ProfileEffectLayer src={profileEffectInput.trim() || profileEffectUrl} className="rounded-full" />
                                    <UserAvatar
                                      src={avatarUrl ?? undefined}
                                      decorationSrc={avatarDecorationInput.trim() || avatarDecorationUrl}
                                      className="h-14 w-14"
                                    />
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-white">Current Avatar</p>
                                    <p className="text-xs text-[#949ba4]">Global profile avatar</p>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center justify-end gap-2">
                                {uploadedAvatarThumbnails.length > 0 ? (
                                  <div className="mr-auto rounded-lg border border-white/10 bg-black/20 p-2">
                                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                                      Uploaded Avatars
                                    </p>
                                    <div className="grid grid-cols-6 gap-2">
                                      {uploadedAvatarThumbnails.map((thumbnailUrl) => (
                                        <button
                                          key={`avatar-thumb-${thumbnailUrl}`}
                                          type="button"
                                          onClick={() => {
                                            setAvatarUrl(thumbnailUrl);
                                            rememberUploadedAvatar(thumbnailUrl);
                                            void axios.patch("/api/profile/avatar", {
                                              imageUrl: thumbnailUrl,
                                            }).then(() => {
                                              window.dispatchEvent(
                                                new CustomEvent("inaccord:profile-updated", {
                                                  detail: {
                                                    profileId: resolvedProfileId,
                                                    imageUrl: thumbnailUrl,
                                                  },
                                                })
                                              );
                                              router.refresh();
                                            });
                                          }}
                                          className="overflow-hidden rounded-full border border-white/15 bg-[#111214] transition hover:border-[#5865f2]/60"
                                          title="Use this uploaded avatar"
                                        >
                                          <div className="relative h-10 w-10">
                                            <Image
                                              src={thumbnailUrl}
                                              alt="Uploaded avatar thumbnail"
                                              fill
                                              className="object-cover"
                                              unoptimized
                                            />
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}

                                {avatarUrl ? (
                                  <Button
                                    type="button"
                                    onClick={() => void onRemoveAvatarFromPanel()}
                                    disabled={isUploadingAvatar}
                                    className="border border-rose-500/35 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Remove Avatar
                                  </Button>
                                ) : null}

                                <Button
                                  type="button"
                                  onClick={onPickAvatarFromPanel}
                                  disabled={isUploadingAvatar}
                                  className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isUploadingAvatar ? (
                                    <span className="inline-flex items-center gap-2">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      Uploading...
                                    </span>
                                  ) : (
                                    "Upload Avatar"
                                  )}
                                </Button>

                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => setIsAvatarPanelOpen(false)}
                                >
                                  Close
                                </Button>
                              </div>

                              <input
                                ref={avatarPanelInputRef}
                                className="hidden"
                                type="file"
                                accept="image/*"
                                onChange={(event) => onAvatarPanelChange(event.target.files?.[0])}
                              />
                            </div>
                          </DialogContent>
                        </Dialog>

                        <Dialog open={isAvatarDecorationPanelOpen} onOpenChange={setIsAvatarDecorationPanelOpen}>
                          <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>Avatar Decoration</DialogTitle>
                              <DialogDescription className="text-[#949ba4]">
                                Set the decoration overlay for your global avatar.
                              </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4">
                              <div className="rounded-xl border border-white/10 bg-[#1a1b1e] p-4">
                                <div className="flex items-center gap-3">
                                  <div className="relative overflow-hidden rounded-full">
                                    <ProfileEffectLayer src={profileEffectInput.trim() || profileEffectUrl} className="rounded-full" />
                                    <UserAvatar
                                      src={avatarUrl ?? undefined}
                                      decorationSrc={avatarDecorationInput.trim() || avatarDecorationUrl}
                                      className="h-14 w-14"
                                    />
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-white">Current Decoration</p>
                                    <p className="text-xs text-[#949ba4]">Global avatar decoration preview</p>
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                                  Avatar Decoration URL
                                </p>
                                <input
                                  type="text"
                                  value={avatarDecorationInput}
                                  onChange={(event) => {
                                    setAvatarDecorationInput(event.target.value);
                                    setAvatarDecorationStatus(null);
                                  }}
                                  placeholder="https://..."
                                  disabled={isSavingAvatarDecoration}
                                  className="mt-2 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35 disabled:cursor-not-allowed disabled:opacity-60"
                                />

                                {avatarDecorationStatus ? (
                                  <p className="mt-2 rounded-md border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#b5bac1]">
                                    {avatarDecorationStatus}
                                  </p>
                                ) : null}

                                <div className="mt-2 flex flex-wrap justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                      setAvatarDecorationInput("");
                                      setAvatarDecorationStatus(null);
                                    }}
                                    disabled={isSavingAvatarDecoration}
                                  >
                                    Clear
                                  </Button>
                                  <Button
                                    type="button"
                                    onClick={() => void onSaveAvatarDecoration()}
                                    disabled={isSavingAvatarDecoration}
                                    className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {isSavingAvatarDecoration ? (
                                      <span className="inline-flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Saving...
                                      </span>
                                    ) : (
                                      "Save Decoration"
                                    )}
                                  </Button>
                                  <Button type="button" variant="outline" onClick={() => setIsAvatarDecorationPanelOpen(false)}>
                                    Close
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>

                        <Dialog open={isProfileEffectPanelOpen} onOpenChange={setIsProfileEffectPanelOpen}>
                          <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>Profile Effect</DialogTitle>
                              <DialogDescription className="text-[#949ba4]">
                                Set the animated effect layer for your global profile.
                              </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4">
                              <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#111214] text-[#dbdee1]">
                                <ProfileEffectLayer src={profileEffectInput.trim() || profileEffectUrl} />
                                <div className="relative h-24 bg-linear-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
                                  {resolveBannerUrl(bannerUrl) ? (
                                    <BannerImage
                                      src={resolveBannerUrl(bannerUrl) as string}
                                      alt="Profile effect preview banner"
                                      className="object-cover"
                                    />
                                  ) : null}
                                </div>

                                <div className="relative p-3 pt-9">
                                  <div className="absolute -top-10 left-3 rounded-full border-4 border-[#111214]">
                                    <UserAvatar
                                      src={avatarUrl ?? undefined}
                                      decorationSrc={avatarDecorationInput.trim() || avatarDecorationUrl}
                                      className="h-20 w-20"
                                    />
                                  </div>

                                  <div className="min-w-0">
                                    <p className="text-base font-bold text-white">
                                      {defaultProfileNameDraft.trim() || profileName || realName || "User"}
                                    </p>
                                    <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-[#949ba4]">
                                      Global profile effect preview
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                                  Profile Effect URL
                                </p>
                                <input
                                  type="text"
                                  value={profileEffectInput}
                                  onChange={(event) => {
                                    setProfileEffectInput(event.target.value);
                                    setProfileEffectStatus(null);
                                  }}
                                  placeholder="https://..."
                                  disabled={isSavingProfileEffect}
                                  className="mt-2 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35 disabled:cursor-not-allowed disabled:opacity-60"
                                />

                                {profileEffectStatus ? (
                                  <p className="mt-2 rounded-md border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#b5bac1]">
                                    {profileEffectStatus}
                                  </p>
                                ) : null}

                                <div className="mt-2 flex flex-wrap justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                      setProfileEffectInput("");
                                      setProfileEffectStatus(null);
                                    }}
                                    disabled={isSavingProfileEffect}
                                  >
                                    Clear
                                  </Button>
                                  <Button
                                    type="button"
                                    onClick={() => void onSaveProfileEffect()}
                                    disabled={isSavingProfileEffect}
                                    className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {isSavingProfileEffect ? (
                                      <span className="inline-flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Saving...
                                      </span>
                                    ) : (
                                      "Save Effect"
                                    )}
                                  </Button>
                                  <Button type="button" variant="outline" onClick={() => setIsProfileEffectPanelOpen(false)}>
                                    Close
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </div>
                ) : null}

                {renderSectionContent()}

              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};
