"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import {
  Accessibility,
  Activity,
  Ban,
  Baby,
  Bell,
  CreditCard,
  Camera,
  Crown,
  Gamepad2,
  Gift,
  IdCard,
  ImageIcon,
  Keyboard,
  Languages,
  Loader2,
  Link2,
  LogOut,
  Mic,
  Monitor,
  Palette,
  Puzzle,
  Radio,
  Receipt,
  Smile,
  Sticker,
  Tags,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  User,
  UserPlus,
  Wrench,
  LockKeyhole,
  Eye,
  EyeOff,
} from "lucide-react";
import axios from "axios";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { ModeToggle } from "@/components/mode-toggle";
import { ModeratorLineIcon } from "@/components/moderator-line-icon";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NameplatePill } from "@/components/nameplate-pill";
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
import { getInAccordStaffLabel, isInAccordAdministrator, isInAccordDeveloper, isInAccordModerator } from "@/lib/in-accord-admin";
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
import { normalizePresenceStatus, presenceStatusLabelMap } from "@/lib/presence-status";
import { resolveProfileIcons } from "@/lib/profile-icons";

type SettingsSection =
  | "myAccount"
  | "profiles"
  | "contentSocial"
  | "dataPrivacy"
  | "familyCenter"
  | "authorizedApps"
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
      "familyCenter",
      "authorizedApps",
      "devices",
      "connections",
      "friendRequests",
      "serverBoost",
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
];

const sectionLabelMap: Record<SettingsSection, string> = {
  myAccount: "My Account",
  profiles: "Profiles",
  contentSocial: "Content & Social",
  dataPrivacy: "Data & Privacy",
  familyCenter: "Family Center",
  authorizedApps: "Authorized Apps",
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
  contentSocial: "Control social and content visibility preferences.",
  dataPrivacy: "Review data, privacy, and safety controls.",
  familyCenter: "Configure family center and parental controls.",
  authorizedApps: "Review third-party authorized app access.",
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
  contentSocial: Smile,
  dataPrivacy: LockKeyhole,
  familyCenter: Baby,
  authorizedApps: ShieldCheck,
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

type ConnectionProvider = {
  key: string;
  label: string;
  description: string;
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
  avatarDecorationUrl?: string | null;
  bannerUrl: string | null;
  effectiveProfileName?: string | null;
  effectiveProfileNameStyle?: string | null;
  effectiveComment?: string | null;
  effectiveNameplateLabel?: string | null;
  effectiveNameplateColor?: string | null;
  effectiveNameplateImageUrl?: string | null;
  effectiveAvatarDecorationUrl?: string | null;
  effectiveBannerUrl?: string | null;
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

export const SettingsModal = () => {
  const router = useRouter();
  const { isOpen, onClose, type, data } = useModal();
  const [activeSection, setActiveSection] = useState<SettingsSection>("myAccount");
  const [displaySection, setDisplaySection] = useState<SettingsSection>("myAccount");
  const [isSectionVisible, setIsSectionVisible] = useState(true);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [isUploadingServerBanner, setIsUploadingServerBanner] = useState(false);
  const [isUploadingNameplateImage, setIsUploadingNameplateImage] = useState(false);
  const [isUploadingServerNameplateImage, setIsUploadingServerNameplateImage] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSavingProfileName, setIsSavingProfileName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
  const [phoneNumber, setPhoneNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [profileRole, setProfileRole] = useState<string | null>(data.profileRole ?? null);
  const [profilePresenceStatus, setProfilePresenceStatus] = useState(
    normalizePresenceStatus(data.profilePresenceStatus)
  );
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
  const [languagePreference, setLanguagePreference] = useState<string>("system");
  const [isSavingLanguagePreference, setIsSavingLanguagePreference] = useState(false);
  const [languagePreferenceStatus, setLanguagePreferenceStatus] = useState<string | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<string[]>([]);
  const [isSavingConnectionProvider, setIsSavingConnectionProvider] = useState<string | null>(null);
  const [connectionsStatus, setConnectionsStatus] = useState<string | null>(null);
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
  const [serverProfileAvatarDecorationInput, setServerProfileAvatarDecorationInput] = useState("");
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
  const [isNameplatePanelOpen, setIsNameplatePanelOpen] = useState(false);
  const [isDefaultBannerPanelOpen, setIsDefaultBannerPanelOpen] = useState(false);
  const [isServerBannerPanelOpen, setIsServerBannerPanelOpen] = useState(false);
  const [isServerNameplatePanelOpen, setIsServerNameplatePanelOpen] = useState(false);
  const [isServerAvatarDecorationPanelOpen, setIsServerAvatarDecorationPanelOpen] = useState(false);
  const [isPluginsInstalledPanelOpen, setIsPluginsInstalledPanelOpen] = useState(false);
  const [isDownloadedPluginsPanelOpen, setIsDownloadedPluginsPanelOpen] = useState(false);
  const [isPluginUploadsPanelOpen, setIsPluginUploadsPanelOpen] = useState(false);
  const [downloadedPlugins, setDownloadedPlugins] = useState<string[]>([]);
  const [blockedProfiles, setBlockedProfiles] = useState<BlockedProfileSummary[]>([]);
  const [isLoadingBlockedProfiles, setIsLoadingBlockedProfiles] = useState(false);
  const [blockedProfilesError, setBlockedProfilesError] = useState<string | null>(null);
  const [unblockingProfileId, setUnblockingProfileId] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const avatarPanelInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const serverBannerInputRef = useRef<HTMLInputElement | null>(null);
  const nameplateImageInputRef = useRef<HTMLInputElement | null>(null);
  const serverNameplateImageInputRef = useRef<HTMLInputElement | null>(null);

  const isModalOpen = isOpen && type === "settings";

  const installedPluginsCount = useMemo(() => downloadedPlugins.length, [downloadedPlugins.length]);

  const installedPluginsCountLabel = useMemo(
    () => installedPluginsCount.toString().padStart(2, "0"),
    [installedPluginsCount]
  );

  const sections = useMemo<SettingsSection[]>(() => sectionGroups.flatMap((group) => group.sections), []);

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
    setProfileNameError(null);
    setProfileNameSuccess(null);
    setPronounsStatus(null);
    setCommentStatus(null);
    setPhoneNumberStatus(null);
    setDateOfBirthStatus(null);
  }, [data.profileName, data.profilePresenceStatus, data.profileRealName, data.profileRole, isModalOpen]);

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
          languagePreference?: string;
          connectedAccounts?: unknown;
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
        setLanguagePreference(language);
        setLanguagePreferenceStatus(null);
        setConnectedAccounts(Array.from(new Set(linked)));
        setConnectionsStatus(null);
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
        setLanguagePreference("system");
        setLanguagePreferenceStatus(null);
        setConnectedAccounts([]);
        setConnectionsStatus(null);
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

  const onToggleConnectionProvider = async (providerKey: string) => {
    if (isSavingConnectionProvider) {
      return;
    }

    const isCurrentlyConnected = connectedAccounts.includes(providerKey);
    const nextConnectedAccounts = isCurrentlyConnected
      ? connectedAccounts.filter((value) => value !== providerKey)
      : Array.from(new Set([...connectedAccounts, providerKey]));

    setConnectedAccounts(nextConnectedAccounts);
    setConnectionsStatus(null);

    try {
      setIsSavingConnectionProvider(providerKey);

      await axios.patch("/api/profile/preferences", {
        connectedAccounts: nextConnectedAccounts,
      });

      setConnectionsStatus(
        isCurrentlyConnected
          ? `${connectionProviders.find((provider) => provider.key === providerKey)?.label ?? "Provider"} disconnected.`
          : `${connectionProviders.find((provider) => provider.key === providerKey)?.label ?? "Provider"} connected.`
      );
    } catch {
      setConnectedAccounts(connectedAccounts);
      setConnectionsStatus("Could not update connections.");
    } finally {
      setIsSavingConnectionProvider(null);
    }
  };

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
      setServerProfileAvatarDecorationInput(selectedServer?.avatarDecorationUrl ?? "");
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
      setServerProfileAvatarDecorationInput("");
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
    setServerProfileAvatarDecorationInput(selectedServer?.avatarDecorationUrl ?? "");
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
        avatarDecorationUrl: trimmedAvatarDecorationUrl || null,
        bannerUrl: trimmedBannerUrl || null,
      });

      await hydrateServerProfiles();
      setServerProfileStatus(
        trimmedProfileName ||
          trimmedProfileNameStyle ||
          trimmedComment ||
          trimmedNameplateLabel ||
          trimmedNameplateImageUrl ||
          trimmedAvatarDecorationUrl ||
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
        avatarDecorationUrl: null,
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
          phoneNumber?: string | null;
          dateOfBirth?: string | null;
          bannerUrl?: string | null;
          role?: string | null;
          presenceStatus?: string | null;
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

    if (trimmedPronouns.length > 40) {
      setPronounsStatus("Pronouns must be 40 characters or fewer.");
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

    try {
      setIsChangingPassword(true);

      await axios.patch("/api/profile/password", {
        currentPassword: trimmedCurrent,
        newPassword: trimmedNext,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
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
          <div className="mx-auto mt-8 h-[80vh] w-[80%] max-w-none rounded-[2.5rem] border border-black/20 bg-[#1e1f22] p-4 shadow-xl shadow-black/35">
            <p className="text-center text-sm font-medium text-white">Account Actions</p>

            <div className="mx-auto mt-8 w-full max-w-[28rem] space-y-3 rounded-3xl border border-white/10 bg-[#232428] p-4">
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

            <div className="mx-auto w-full max-w-[28rem] py-10">
              <div className="h-[6px] rounded-full bg-[#d9d9d9] shadow-[0_0_10px_rgba(217,217,217,0.45)]" />
            </div>

            <div className="mx-auto w-full max-w-[28rem] rounded-3xl border border-white/10 bg-[#232428] p-4">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Authenticator App
              </p>
              <p className="mt-2 text-center text-xs text-[#b5bac1]">
                Add an authenticator app for extra account security.
              </p>
              <Button
                type="button"
                disabled
                className="mt-3 w-full bg-[#5865f2]/60 text-white hover:bg-[#5865f2]/60 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Coming Soon
              </Button>
            </div>

            <div className="mx-auto w-full max-w-[28rem] py-10">
              <div className="h-[6px] rounded-full bg-[#d9d9d9] shadow-[0_0_10px_rgba(217,217,217,0.45)]" />
            </div>

            <div className="mx-auto w-full max-w-[28rem] rounded-3xl border border-white/10 bg-[#232428] p-4">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Security Key
              </p>
              <p className="mt-2 text-center text-xs text-[#b5bac1]">
                Register a physical security key for stronger sign-in protection.
              </p>
              <Button
                type="button"
                disabled
                className="mt-3 w-full bg-[#5865f2]/60 text-white hover:bg-[#5865f2]/60 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Coming Soon
              </Button>
            </div>

            <div className="mx-auto w-full max-w-[28rem] py-10">
              <div className="h-[6px] rounded-full bg-[#d9d9d9] shadow-[0_0_10px_rgba(217,217,217,0.45)]" />
            </div>

            <div className="mx-auto w-full max-w-[28rem] rounded-3xl border border-white/10 bg-[#232428] p-4">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                SMS
              </p>
              <p className="mt-2 text-center text-xs text-[#b5bac1]">
                Add SMS-based verification as an additional sign-in factor.
              </p>
              <Button
                type="button"
                disabled
                className="mt-3 w-full bg-[#5865f2]/60 text-white hover:bg-[#5865f2]/60 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Coming Soon
              </Button>
            </div>

            <div className="mx-auto w-full max-w-[28rem] py-10">
              <div className="h-[6px] rounded-full bg-[#d9d9d9] shadow-[0_0_10px_rgba(217,217,217,0.45)]" />
            </div>

            <div className="mx-auto w-full max-w-[28rem] rounded-3xl border border-rose-500/20 bg-rose-950/20 p-4 pb-8">
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

              <div className="py-10">
                <div className="h-[6px] w-full rounded-full bg-[#d9d9d9] shadow-[0_0_10px_rgba(217,217,217,0.45)]" />
              </div>
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
      const previewAvatarDecorationUrl =
        serverProfileAvatarDecorationInput.trim() ||
        selectedServer?.effectiveAvatarDecorationUrl ||
        avatarDecorationUrl ||
        null;
      const previewBannerUrl =
        serverProfileBannerInput.trim() || selectedServer?.effectiveBannerUrl || bannerUrl || null;

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

                    <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#111214] text-[#dbdee1] shadow-lg shadow-black/40">
                      <div className="relative h-24 bg-linear-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
                        {previewBannerUrl ? (
                          <Image
                            src={previewBannerUrl}
                            alt="Profile preview banner"
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : null}
                      </div>

                      <div className="relative p-3 pt-9">
                        <div className="absolute -top-10 left-3 rounded-full border-4 border-[#111214]">
                          <UserAvatar
                            src={avatarUrl ?? undefined}
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
                          onClick={() => setIsServerAvatarDecorationPanelOpen(true)}
                          disabled={isSavingServerProfile}
                          className="h-8 border border-white/15 bg-[#1a1b1e] px-3 text-xs text-[#dbdee1] hover:bg-[#2a2b30] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Avatar Decoration
                        </Button>
                      </div>
                      {serverProfileBannerInput.trim() ? (
                        <p className="mt-1 text-[11px] text-[#949ba4]">Custom URL set.</p>
                      ) : null}
                      {serverProfileAvatarDecorationInput.trim() ? (
                        <p className="mt-1 text-[11px] text-[#949ba4]">Custom decoration set.</p>
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
                        Decoration: {selectedServer?.avatarDecorationUrl ? "Custom decoration set" : (selectedServer?.effectiveAvatarDecorationUrl ? "Global decoration" : "No decoration")}
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
                            {(serverProfileBannerInput.trim() || selectedServer?.effectiveBannerUrl || bannerUrl) ? (
                              <Image
                                src={serverProfileBannerInput.trim() || selectedServer?.effectiveBannerUrl || bannerUrl || ""}
                                alt="Server banner preview"
                                fill
                                className="object-cover"
                                unoptimized
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
                                    <Image
                                      src={thumbnailUrl}
                                      alt="Uploaded banner thumbnail"
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

                    <Dialog open={isServerAvatarDecorationPanelOpen} onOpenChange={setIsServerAvatarDecorationPanelOpen}>
                      <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Edit Server Avatar Decoration URL</DialogTitle>
                          <DialogDescription className="text-[#949ba4]">
                            Set a server-specific avatar decoration overlay URL. Leave blank to use your global decoration.
                          </DialogDescription>
                        </DialogHeader>

                        <input
                          type="text"
                          value={serverProfileAvatarDecorationInput}
                          onChange={(event) => {
                            setServerProfileAvatarDecorationInput(event.target.value);
                            setServerProfileStatus(null);
                          }}
                          placeholder="https://..."
                          disabled={isSavingServerProfile}
                          className="w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35 disabled:cursor-not-allowed disabled:opacity-60"
                        />

                        <DialogFooter className="gap-2 sm:justify-between">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setServerProfileAvatarDecorationInput("");
                              setServerProfileStatus(null);
                            }}
                          >
                            Clear
                          </Button>
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
              <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-[42rem]">
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
              <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-[42rem]">
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
              <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-[42rem]">
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

    if (displaySection === "notifications") {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Notification Preferences</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Notification toggles can be configured here.
            </p>
          </div>

          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <div className="flex items-center justify-between gap-4">
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

            <p className="mt-3 rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
              Current status: <span className="font-semibold text-white">{mentionsEnabled ? "On" : "Off"}</span>
            </p>
          </div>
        </div>
      );
    }

    if (displaySection === "emoji") {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Emoji Settings</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Emoji menu is now available in the settings rail.
            </p>
            <div className="mt-4 rounded-xl border border-[#5865f2]/25 bg-[#5865f2]/10 px-3 py-2 text-xs text-[#cdd2ff]">
              Next step: wire favorite emoji sets, default reaction style, and per-device emoji input preferences.
            </div>
          </div>
        </div>
      );
    }

    if (displaySection === "stickers") {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Sticker Settings</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Stickers menu is now available in the settings rail.
            </p>
            <div className="mt-4 rounded-xl border border-[#5865f2]/25 bg-[#5865f2]/10 px-3 py-2 text-xs text-[#cdd2ff]">
              Next step: wire sticker packs, sticker autoplay/preview behavior, and sticker upload defaults.
            </div>
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

                return (
                  <div
                    key={provider.key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{provider.label}</p>
                      <p className="truncate text-xs text-[#949ba4]">{provider.description}</p>
                    </div>

                    <Button
                      type="button"
                      onClick={() => onToggleConnectionProvider(provider.key)}
                      disabled={Boolean(isSavingConnectionProvider)}
                      className={`h-8 px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
                        isConnected
                          ? "border border-rose-500/35 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
                          : "border border-emerald-500/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                      }`}
                    >
                      {isSaving ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Saving...
                        </span>
                      ) : isConnected ? (
                        "Disconnect"
                      ) : (
                        "Connect"
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
      return renderComingSoonSection("Data & Privacy", "Privacy controls and account safety settings can be managed here.");
    }

    return renderComingSoonSection(sectionLabelMap[displaySection], sectionDescriptionMap[displaySection]);
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={onClose}>
      <DialogContent className="settings-theme-scope settings-scrollbar theme-settings-shell flex h-[85vh] max-h-[85vh] w-[85vw] max-w-[85vw] flex-col overflow-hidden rounded-3xl border-black/30 bg-[#2b2d31] p-0 text-[#dbdee1]">
        <DialogTitle className="sr-only">User Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Edit account, appearance, notification, and privacy settings.
        </DialogDescription>

        <div className="grid min-h-0 flex-1 grid-cols-[1fr_260px] overflow-hidden">
          <aside className="theme-settings-rail settings-scrollbar order-2 flex h-full min-h-0 flex-col overflow-y-auto rounded-r-3xl border-l border-black/20 bg-[#232428] p-4 pt-2 shadow-2xl shadow-black/40">
            <nav className="settings-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {sectionGroups.map((group) => (
                <div key={group.label} className="space-y-1">
                  <p className="px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#949ba4]">
                    {group.label}
                  </p>

                  {group.sections.map((section) => {
                    const isActive = activeSection === section;
                    const SectionIcon = sectionIconMap[section];

                    return (
                      <button
                        key={section}
                        type="button"
                        onClick={() => setActiveSection(section)}
                        className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm transition-colors ${
                          isActive
                            ? "bg-[#404249] font-semibold text-white"
                            : "text-[#b5bac1] hover:bg-[#3f4248] hover:text-[#f2f3f5]"
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

            <p className="mt-4 rounded-2xl border border-black/20 bg-[#1e1f22] px-3 py-2 text-xs leading-5 text-[#949ba4] whitespace-normal break-words shadow-lg shadow-black/35">
              Choose a category on the right and edit details on the left.
            </p>

            <button
              type="button"
              onClick={onLogout}
              disabled={isLoggingOut}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-600/15 px-3 py-2 text-sm font-semibold text-rose-200 shadow-lg shadow-black/35 transition hover:bg-rose-600/25 disabled:cursor-not-allowed disabled:opacity-60"
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
              <div className="theme-settings-content-header sticky top-0 z-10 border-b border-black/20 bg-[#2b2d31]/95 px-6 py-4 shadow-lg shadow-black/35 backdrop-blur">
                <h3 className={`text-xl font-bold text-white ${displaySection === "myAccount" ? "text-center" : ""}`}>
                  {sectionLabelMap[displaySection]}
                </h3>
                <p className={`mt-1 text-sm text-[#949ba4] ${displaySection === "myAccount" ? "text-center" : ""}`}>
                  {sectionDescriptionMap[displaySection]}
                </p>
              </div>

              <div className="settings-scrollbar theme-settings-content-body h-[calc(85vh-78px)] overflow-y-auto px-6 py-5">
                {displaySection === "myAccount" ? (
                  <div className="mx-auto mb-6 w-full max-w-[28rem] overflow-hidden rounded-[2.5rem] border border-white/15 bg-[#1f2024] p-4 shadow-2xl shadow-black/45">
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
                              {realName || profileName || data.profileEmail?.split("@")[0] || resolvedProfileId || "Unknown User"}
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
                            <span className="text-white">{presenceStatusLabelMap[profilePresenceStatus]}</span>
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

                        <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#111214] text-[#dbdee1] shadow-lg shadow-black/40">
                          <div className="relative h-24 bg-linear-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
                            {bannerUrl ? (
                              <Image
                                src={bannerUrl}
                                alt="Default profile preview banner"
                                fill
                                className="object-cover"
                                unoptimized
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
                              onClick={() => setIsAvatarPanelOpen(true)}
                              className="h-8 border border-white/15 bg-[#1a1b1e] px-3 text-xs text-[#dbdee1] hover:bg-[#2a2b30]"
                            >
                              Avatar Decoration
                            </Button>
                          </div>
                          {nameplateLabelInput.trim() || nameplateLabel ? (
                            <p className="mt-1 text-[11px] text-[#949ba4]">Nameplate set.</p>
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
                            maxLength={40}
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
                                  {bannerUrl ? (
                                    <Image
                                      src={bannerUrl}
                                      alt="Default profile banner preview"
                                      fill
                                      className="object-cover"
                                      unoptimized
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
                                          <Image
                                            src={thumbnailUrl}
                                            alt="Uploaded banner thumbnail"
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
                                  <UserAvatar
                                    src={avatarUrl ?? undefined}
                                    decorationSrc={avatarDecorationUrl}
                                    className="h-14 w-14"
                                  />
                                  <div>
                                    <p className="text-sm font-semibold text-white">Current Avatar</p>
                                    <p className="text-xs text-[#949ba4]">Global profile avatar</p>
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
                      </div>
                    </div>
                  </div>
                ) : null}

                {displaySection === "myAccount" ? (
                  <div className="mx-auto w-full max-w-[32rem] py-10">
                    <div className="h-[6px] rounded-full bg-[#d9d9d9] shadow-[0_0_10px_rgba(217,217,217,0.45)]" />
                  </div>
                ) : null}

                {renderSectionContent()}

                <div className="mt-6 flex justify-end">
                  <Button
                    type="button"
                    onClick={onClose}
                    className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
                  >
                    Done
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};
