"use client";

import axios from "axios";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera, Loader2, Pause, Pencil, Play, Plus, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProfileNameWithServerTag } from "@/components/profile-name-with-server-tag";
import { UserAvatar } from "@/components/user-avatar";
import { useModal } from "@/hooks/use-modal-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  name: z.string().min(1, { message: "Server name is required" }),
  imageUrl: z.string().min(1, { message: "Server image is required" }),
  bannerUrl: z.string().optional(),
  bannerFit: z.enum(["cover", "contain", "scale"]).optional(),
  bannerScale: z.number().min(0.25).max(2).optional(),
});

type ServerSettingsSection =
  | "overview"
  | "boostStatus"
  | "roles"
  | "members"
  | "invites"
  | "integrations"
  | "serverGuide"
  | "onboarding"
  | "emoji"
  | "stickers"
  | "soundboard"
  | "moderation"
  | "autoMod"
  | "auditLog"
  | "bans"
  | "security"
  | "raidProtection"
  | "rulesScreening"
  | "welcomeScreen"
  | "safetyAlerts"
  | "communityOverview"
  | "safetySetup"
  | "serverInsights"
  | "partnerProgram"
  | "discovery"
  | "serverTemplate"
  | "customInviteLink"
  | "vanityUrl"
  | "widget"
  | "webhooks"
  | "integrationsPermissions"
  | "installedApps"
  | "deleteServer";

const SETTINGS_SECTIONS: Array<{
  heading?: string;
  items: Array<{ key: ServerSettingsSection; label: string }>;
}> = [
  {
    items: [
      { key: "overview", label: "Overview" },
      { key: "boostStatus", label: "Server Boost Status" },
      { key: "roles", label: "Roles" },
      { key: "members", label: "Members" },
      { key: "invites", label: "Invites" },
      { key: "integrations", label: "Integrations" },
      { key: "serverGuide", label: "Server Guide" },
      { key: "onboarding", label: "Onboarding" },
      { key: "emoji", label: "Emoji" },
      { key: "stickers", label: "Stickers" },
      { key: "soundboard", label: "Sound EFX" },
    ],
  },
  {
    heading: "Moderation",
    items: [
      { key: "moderation", label: "Moderation" },
      { key: "autoMod", label: "AutoMod" },
      { key: "auditLog", label: "Audit Log" },
      { key: "bans", label: "Bans" },
      { key: "security", label: "Security" },
      { key: "raidProtection", label: "Raid Protection" },
      { key: "rulesScreening", label: "Membership Screening" },
      { key: "welcomeScreen", label: "Welcome Screen" },
      { key: "safetyAlerts", label: "Safety Alerts" },
    ],
  },
  {
    heading: "Community",
    items: [
      { key: "communityOverview", label: "Community Overview" },
      { key: "safetySetup", label: "Safety Setup" },
      { key: "serverInsights", label: "Server Insights" },
      { key: "partnerProgram", label: "Partner Program" },
      { key: "discovery", label: "Discovery" },
      { key: "customInviteLink", label: "Custom Invite Link" },
      { key: "vanityUrl", label: "Vanity URL" },
      { key: "widget", label: "Widget" },
      { key: "serverTemplate", label: "Server Template" },
    ],
  },
  {
    heading: "Apps",
    items: [
      { key: "webhooks", label: "Webhooks" },
      { key: "integrationsPermissions", label: "Integration Permissions" },
      { key: "installedApps", label: "Installed Apps" },
    ],
  },
  {
    heading: "Danger Zone",
    items: [{ key: "deleteServer", label: "Delete Server" }],
  },
];

const SECTION_TITLES: Record<ServerSettingsSection, string> = {
  overview: "Server Overview",
  boostStatus: "Server Boost Status",
  roles: "Roles",
  members: "Members",
  invites: "Invites",
  integrations: "Integrations",
  serverGuide: "Server Guide",
  onboarding: "Onboarding",
  emoji: "Emoji",
  stickers: "Stickers",
  soundboard: "Sound EFX",
  moderation: "Moderation",
  autoMod: "AutoMod",
  auditLog: "Audit Log",
  bans: "Bans",
  security: "Security",
  raidProtection: "Raid Protection",
  rulesScreening: "Membership Screening",
  welcomeScreen: "Welcome Screen",
  safetyAlerts: "Safety Alerts",
  safetySetup: "Safety Setup",
  serverInsights: "Server Insights",
  partnerProgram: "Partner Program",
  discovery: "Discovery",
  customInviteLink: "Custom Invite Link",
  vanityUrl: "Vanity URL",
  webhooks: "Webhooks",
  integrationsPermissions: "Integration Permissions",
  installedApps: "Installed Apps",
  serverTemplate: "Server Template",
  communityOverview: "Community Overview",
  widget: "Widget",
  deleteServer: "Delete Server",
};

type GenericSectionSettings = {
  enabled: boolean;
  visibility: "standard" | "strict" | "custom";
  notes: string;
};

const GENERIC_SECTION_DESCRIPTIONS: Partial<Record<ServerSettingsSection, string>> = {
  boostStatus: "Manage boost perks, level progress, and reward visibility.",
  members: "Review member-level settings and access behavior.",
  invites: "Configure invite creation and expiration defaults.",
  integrations: "Control connected integrations and their behavior.",
  serverGuide: "Configure guide content and channel recommendations.",
  onboarding: "Adjust onboarding prompts and suggested channels.",
  moderation: "Set moderation defaults and automated enforcement behavior.",
  autoMod: "Tune auto moderation triggers and actions.",
  auditLog: "Configure audit visibility and retention options.",
  bans: "Manage ban handling defaults and logging behavior.",
  security: "Configure server security posture and protections.",
  raidProtection: "Set anti-raid sensitivity and action thresholds.",
  rulesScreening: "Manage membership screening and acceptance flow.",
  welcomeScreen: "Customize welcome content for new members.",
  safetyAlerts: "Configure safety alert delivery and severity handling.",
  communityOverview: "Manage community-level server settings.",
  safetySetup: "Configure recommended safety defaults.",
  serverInsights: "Adjust server metrics and insights preferences.",
  partnerProgram: "Manage partner program visibility and settings.",
  discovery: "Control server discovery eligibility and metadata.",
  serverTemplate: "Manage server template defaults and publishing.",
  customInviteLink: "Configure custom invite link behavior.",
  vanityUrl: "Manage vanity URL availability and redirects.",
  widget: "Configure embeddable widget behavior and access.",
  webhooks: "Manage webhook permissions and delivery options.",
  integrationsPermissions: "Control app integration permission defaults.",
  installedApps: "Manage app availability and access scope.",
};

const SERVER_GUIDE_USAGE: Partial<Record<ServerSettingsSection, string>> = {
  overview: "Set icon, name, and banner. Use Save Changes at the bottom to apply updates.",
  boostStatus: "Review boost progress and perks, then adjust related server promotion settings.",
  roles: "Create roles, edit permissions, and assign members to define access levels.",
  members: "Review member list and role distribution to verify access and moderation coverage.",
  invites: "Track invite links, who created them, usage counts, and remove stale links.",
  integrations: "Manage bots and integrations. Use Boot, Ban, and Kick controls to moderate bots.",
  serverGuide: "Use this guide page to learn what every settings component does and where to configure it.",
  onboarding: "Configure onboarding prompts and recommended channels for new members.",
  emoji: "Create and manage custom emoji assets, including enable/disable and delete actions.",
  stickers: "Upload and manage custom stickers for server expression and branding.",
  soundboard: "Add and manage Sound EFX clips. Enable/disable or delete clips as needed.",
  moderation: "Tune moderation defaults and combine with AutoMod and safety controls.",
  autoMod: "Define automated moderation checks and enforcement behavior.",
  auditLog: "Review administrative actions to understand recent changes and moderation events.",
  bans: "Manage banned members and enforce long-term safety boundaries.",
  security: "Adjust server protection posture, including risk-sensitive controls.",
  raidProtection: "Increase anti-raid sensitivity and response actions during suspicious spikes.",
  rulesScreening: "Set membership screening requirements before users can fully participate.",
  welcomeScreen: "Customize first impressions with welcome text and highlighted channels.",
  safetyAlerts: "Configure alert visibility and review high-priority server safety notices.",
  communityOverview: "Manage community feature readiness and participation standards.",
  safetySetup: "Walk through baseline safety recommendations for your server.",
  serverInsights: "Review growth and engagement analytics to guide server improvements.",
  partnerProgram: "Manage partner-related settings, eligibility visibility, and readiness.",
  discovery: "Tune public discoverability details and discovery-facing metadata.",
  customInviteLink: "Manage custom invite behavior and consistency of shared invite links.",
  vanityUrl: "Configure and maintain your branded invite URL.",
  widget: "Control external widget visibility and embed behavior.",
  webhooks: "Manage webhook endpoints and integration message delivery behavior.",
  integrationsPermissions: "Set default integration permission scope for installed apps.",
  installedApps: "Review installed applications and keep only trusted integrations active.",
  serverTemplate: "Capture server structure into reusable templates and keep them current.",
  deleteServer: "Permanently remove the server and all related data. Use with extreme caution.",
};

const SERVER_GUIDE_ENTRIES = SETTINGS_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({
    key: item.key,
    heading: section.heading ?? "General",
    label: item.label,
  }))
);

const DEFAULT_EMOJI_TILES = [
  "😀", "😄", "😁", "😎", "🥳", "🤖", "👋", "💬", "🔥", "✨",
  "🎉", "💯", "✅", "📌", "🚀", "🌈", "🎮", "🎵", "📢", "🛠️",
  "💡", "🧠", "🎯", "📚", "🌟", "🍕", "☕", "🐧", "🦊", "🐱",
  "🐶", "🐸", "❤️", "💙", "💜", "🖤",
] as const;

const createDefaultStickerDataUrl = (emoji: string, topColor: string, bottomColor: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${topColor}"/><stop offset="100%" stop-color="${bottomColor}"/></linearGradient></defs><rect width="256" height="256" rx="36" fill="url(#g)"/><circle cx="200" cy="56" r="22" fill="rgba(255,255,255,0.35)"/><text x="128" y="154" text-anchor="middle" font-size="120">${emoji}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const DEFAULT_STICKER_TILES = [
  { name: "hype", emoji: "🎉", top: "#4338ca", bottom: "#06b6d4" },
  { name: "gg", emoji: "🏆", top: "#b45309", bottom: "#f59e0b" },
  { name: "lol", emoji: "😂", top: "#0f766e", bottom: "#14b8a6" },
  { name: "cheers", emoji: "🥂", top: "#7c3aed", bottom: "#ec4899" },
  { name: "thinking", emoji: "🤔", top: "#334155", bottom: "#64748b" },
  { name: "love", emoji: "❤️", top: "#be123c", bottom: "#fb7185" },
  { name: "fire", emoji: "🔥", top: "#c2410c", bottom: "#fb923c" },
  { name: "wave", emoji: "👋", top: "#1d4ed8", bottom: "#60a5fa" },
] as const;

const DEFAULT_STICKER_TILE_ITEMS = DEFAULT_STICKER_TILES.map((item) => ({
  name: item.name,
  emoji: item.emoji,
  imageUrl: createDefaultStickerDataUrl(item.emoji, item.top, item.bottom),
}));

const createToneWavDataUrl = (frequency: number, durationMs = 360) => {
  const sampleRate = 8000;
  const totalSamples = Math.max(1, Math.floor((sampleRate * durationMs) / 1000));
  const dataSize = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  for (let sampleIndex = 0; sampleIndex < totalSamples; sampleIndex += 1) {
    const time = sampleIndex / sampleRate;
    const envelope = Math.exp((-3 * sampleIndex) / totalSamples);
    const sampleValue = Math.sin(2 * Math.PI * frequency * time) * envelope;
    view.setInt16(44 + sampleIndex * 2, Math.max(-1, Math.min(1, sampleValue)) * 32767, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 1) {
    binary += String.fromCharCode(bytes[byteIndex]);
  }

  return `data:audio/wav;base64,${btoa(binary)}`;
};

const DEFAULT_SOUND_TILE_DEFS = [
  { key: "ping", label: "Ping", frequency: 540 },
  { key: "pop", label: "Pop", frequency: 760 },
  { key: "spark", label: "Spark", frequency: 960 },
  { key: "clink", label: "Clink", frequency: 1180 },
  { key: "bloop", label: "Bloop", frequency: 430 },
  { key: "zap", label: "Zap", frequency: 1320 },
] as const;

const createDefaultGenericSectionSettings = (): Record<ServerSettingsSection, GenericSectionSettings> => {
  const sections = Object.keys(SECTION_TITLES) as ServerSettingsSection[];

  return sections.reduce(
    (accumulator, sectionKey) => {
      accumulator[sectionKey] = {
        enabled: true,
        visibility: "standard",
        notes: "",
      };
      return accumulator;
    },
    {} as Record<ServerSettingsSection, GenericSectionSettings>
  );
};

type ServerRoleItem = {
  id: string;
  name: string;
  color: string;
  iconUrl: string | null;
  position: number;
  isManaged: boolean;
  memberCount?: number;
};

type RoleMemberItem = {
  memberId: string;
  profileId: string;
  displayName: string;
  email: string | null;
  imageUrl: string | null;
  isAssigned: boolean;
};

type ServerEmojiStickerAsset = {
  id: string;
  serverId: string;
  assetType: "EMOJI" | "STICKER";
  name: string;
  emoji: string | null;
  imageUrl: string | null;
  isEnabled: boolean;
  createdByProfileId: string | null;
  createdByName: string;
  createdAt: string | null;
  updatedAt: string | null;
};

type ServerEmojiStickerSummary = {
  totalAssets: number;
  emojiAssets: number;
  stickerAssets: number;
  activeAssets: number;
};

type ServerSoundEfxItem = {
  id: string;
  serverId: string;
  name: string;
  audioUrl: string;
  isEnabled: boolean;
  createdByProfileId: string | null;
  createdByName: string;
  createdAt: string | null;
  updatedAt: string | null;
};

type ServerSoundEfxSummary = {
  total: number;
  active: number;
};

type ServerMembersPanelItem = {
  id: string;
  role: string;
  profileId: string;
  profile: {
    name: string;
    email: string;
    imageUrl: string | null;
  };
};

type ServerInvitePanelItem = {
  code: string;
  createdAt: string;
  source: "created" | "regenerated";
  createdByProfileId?: string;
  createdByName?: string | null;
  createdByEmail?: string | null;
  createdByImageUrl?: string | null;
  usedCount?: number;
};

type IntegrationBotPanelItem = {
  id: string;
  role: string;
  profileId: string;
  profile: {
    name: string;
    email: string;
    imageUrl: string | null;
  };
  isBooted: boolean;
  isBanned: boolean;
};

type OnboardingPromptItem = {
  id: string;
  question: string;
  options: string[];
  required: boolean;
  multiple: boolean;
};

type OnboardingConfig = {
  enabled: boolean;
  welcomeMessage: string;
  bannerPreset: string;
  bannerUrl: string;
  checklistChannelIds: string[];
  resourceChannelIds: string[];
  prompts: OnboardingPromptItem[];
  updatedAt: string;
};

type OnboardingChannel = {
  id: string;
  name: string;
  type: "TEXT" | "AUDIO" | "VIDEO";
};

const DEFAULT_ONBOARDING_CONFIG: OnboardingConfig = {
  enabled: false,
  welcomeMessage: "Welcome to the server! Complete onboarding to unlock your best channels.",
  bannerPreset: "aurora",
  bannerUrl: "",
  checklistChannelIds: [],
  resourceChannelIds: [],
  prompts: [],
  updatedAt: new Date(0).toISOString(),
};

const ONBOARDING_BANNER_PRESETS = [
  { key: "aurora", label: "Aurora", value: "linear-gradient(135deg, #4f46e5 0%, #0ea5e9 45%, #22d3ee 100%)" },
  { key: "sunset", label: "Sunset", value: "linear-gradient(135deg, #f97316 0%, #ef4444 45%, #ec4899 100%)" },
  { key: "midnight", label: "Midnight", value: "linear-gradient(135deg, #0f172a 0%, #1e293b 45%, #334155 100%)" },
  { key: "forest", label: "Forest", value: "linear-gradient(135deg, #166534 0%, #15803d 45%, #22c55e 100%)" },
] as const;

export const EditServerModal = () => {
  const { isOpen, onClose, onOpen, type, data } = useModal();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<ServerSettingsSection>("overview");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [roles, setRoles] = useState<ServerRoleItem[]>([]);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  const [serverMemberTotal, setServerMemberTotal] = useState(0);
  const [canManageRoles, setCanManageRoles] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState("#99aab5");
  const [newRoleIconUrl, setNewRoleIconUrl] = useState("");
  const [isCreateRolePopupOpen, setIsCreateRolePopupOpen] = useState(false);
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [isUploadingNewRoleIcon, setIsUploadingNewRoleIcon] = useState(false);
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [isRoleEditorPopupOpen, setIsRoleEditorPopupOpen] = useState(false);
  const [editRoleName, setEditRoleName] = useState("");
  const [editRoleColor, setEditRoleColor] = useState("#99aab5");
  const [editRoleIconUrl, setEditRoleIconUrl] = useState("");
  const [isUploadingEditRoleIcon, setIsUploadingEditRoleIcon] = useState(false);
  const [roleMembers, setRoleMembers] = useState<RoleMemberItem[]>([]);
  const [isLoadingRoleMembers, setIsLoadingRoleMembers] = useState(false);
  const [roleMembersError, setRoleMembersError] = useState<string | null>(null);
  const [canManageRoleMembers, setCanManageRoleMembers] = useState(false);
  const [togglingMemberId, setTogglingMemberId] = useState<string | null>(null);
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [emojiStickerAssets, setEmojiStickerAssets] = useState<ServerEmojiStickerAsset[]>([]);
  const [emojiStickerSummary, setEmojiStickerSummary] = useState<ServerEmojiStickerSummary | null>(null);
  const [canManageEmojiStickers, setCanManageEmojiStickers] = useState(false);
  const [isLoadingEmojiStickers, setIsLoadingEmojiStickers] = useState(false);
  const [emojiStickerStatusFilter, setEmojiStickerStatusFilter] = useState<"ALL" | "ACTIVE" | "DISABLED">("ALL");
  const [emojiStickersError, setEmojiStickersError] = useState<string | null>(null);
  const [emojiStickerActionSuccess, setEmojiStickerActionSuccess] = useState<string | null>(null);
  const [emojiStickerActionItemId, setEmojiStickerActionItemId] = useState<string | null>(null);
  const [creatingEmojiSticker, setCreatingEmojiSticker] = useState(false);
  const [newEmojiName, setNewEmojiName] = useState("");
  const [newEmojiValue, setNewEmojiValue] = useState("");
  const [newStickerName, setNewStickerName] = useState("");
  const [newStickerValue, setNewStickerValue] = useState("");
  const [soundEfxItems, setSoundEfxItems] = useState<ServerSoundEfxItem[]>([]);
  const [soundEfxSummary, setSoundEfxSummary] = useState<ServerSoundEfxSummary | null>(null);
  const [canManageSoundEfx, setCanManageSoundEfx] = useState(false);
  const [isLoadingSoundEfx, setIsLoadingSoundEfx] = useState(false);
  const [soundEfxStatusFilter, setSoundEfxStatusFilter] = useState<"ALL" | "ACTIVE" | "DISABLED">("ALL");
  const [soundEfxError, setSoundEfxError] = useState<string | null>(null);
  const [soundEfxActionSuccess, setSoundEfxActionSuccess] = useState<string | null>(null);
  const [soundEfxActionItemId, setSoundEfxActionItemId] = useState<string | null>(null);
  const [playingSoundTileId, setPlayingSoundTileId] = useState<string | null>(null);
  const [playingSoundProgressPercent, setPlayingSoundProgressPercent] = useState(0);
  const [creatingSoundEfx, setCreatingSoundEfx] = useState(false);
  const [newSoundEfxName, setNewSoundEfxName] = useState("");
  const [newSoundEfxUrl, setNewSoundEfxUrl] = useState("");
  const [membersPanelItems, setMembersPanelItems] = useState<ServerMembersPanelItem[]>([]);
  const [isLoadingMembersPanel, setIsLoadingMembersPanel] = useState(false);
  const [membersPanelError, setMembersPanelError] = useState<string | null>(null);
  const [invitePanelItems, setInvitePanelItems] = useState<ServerInvitePanelItem[]>([]);
  const [isLoadingInvitePanel, setIsLoadingInvitePanel] = useState(false);
  const [invitePanelError, setInvitePanelError] = useState<string | null>(null);
  const [invitePanelSuccess, setInvitePanelSuccess] = useState<string | null>(null);
  const [invitePanelActionCode, setInvitePanelActionCode] = useState<string | null>(null);
  const [integrationBots, setIntegrationBots] = useState<IntegrationBotPanelItem[]>([]);
  const [isLoadingIntegrationBots, setIsLoadingIntegrationBots] = useState(false);
  const [integrationBotsError, setIntegrationBotsError] = useState<string | null>(null);
  const [integrationBotsSuccess, setIntegrationBotsSuccess] = useState<string | null>(null);
  const [integrationBotActionMemberId, setIntegrationBotActionMemberId] = useState<string | null>(null);
  const [onboardingConfig, setOnboardingConfig] = useState<OnboardingConfig>(DEFAULT_ONBOARDING_CONFIG);
  const [onboardingChannels, setOnboardingChannels] = useState<OnboardingChannel[]>([]);
  const [isLoadingOnboarding, setIsLoadingOnboarding] = useState(false);
  const [isSavingOnboarding, setIsSavingOnboarding] = useState(false);
  const [isUploadingOnboardingBanner, setIsUploadingOnboardingBanner] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [onboardingSuccess, setOnboardingSuccess] = useState<string | null>(null);
  const [canManageOnboarding, setCanManageOnboarding] = useState(false);
  const [serverGuideQuery, setServerGuideQuery] = useState("");
  const [serverGuideScrollTop, setServerGuideScrollTop] = useState(0);
  const [serverGuideViewportHeight, setServerGuideViewportHeight] = useState(460);
  const [genericSectionSettings, setGenericSectionSettings] = useState<Record<ServerSettingsSection, GenericSectionSettings>>(
    () => createDefaultGenericSectionSettings()
  );
  const [genericSectionSaveMessage, setGenericSectionSaveMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const newRoleIconInputRef = useRef<HTMLInputElement | null>(null);
  const editRoleIconInputRef = useRef<HTMLInputElement | null>(null);
  const onboardingBannerInputRef = useRef<HTMLInputElement | null>(null);
  const serverGuideListRef = useRef<HTMLDivElement | null>(null);
  const soundPreviewAudioRef = useRef<HTMLAudioElement | null>(null);

  const isModalOpen = isOpen && type === "editServer";
  const { server } = data;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      imageUrl: "",
      bannerUrl: "",
      bannerFit: "cover",
      bannerScale: 1,
    },
  });

  useEffect(() => {
    if (server) {
      form.setValue("name", server.name);
      form.setValue("imageUrl", server.imageUrl);
      form.setValue(
        "bannerUrl",
        (server as { bannerUrl?: string | null }).bannerUrl ?? ""
      );
      form.setValue(
        "bannerFit",
        ((server as { bannerFit?: "cover" | "contain" | "scale" | null }).bannerFit ?? "cover") as
          | "cover"
          | "contain"
          | "scale"
      );
      form.setValue(
        "bannerScale",
        (server as { bannerScale?: number | null }).bannerScale ?? 1
      );
    }
  }, [server, form]);

  useEffect(() => {
    if (!isModalOpen) {
      setActiveSection("overview");
      setRoles([]);
      setRolesError(null);
      setCanManageRoles(false);
      setServerMemberTotal(0);
      setSelectedRoleId(null);
      setNewRoleName("");
      setNewRoleColor("#99aab5");
      setNewRoleIconUrl("");
      setIsCreateRolePopupOpen(false);
      setIsRoleEditorPopupOpen(false);
      setEditRoleName("");
      setEditRoleColor("#99aab5");
      setEditRoleIconUrl("");
      setRoleMembers([]);
      setRoleMembersError(null);
      setCanManageRoleMembers(false);
      setTogglingMemberId(null);
      setAddMemberSearch("");
      setIsUploadingNewRoleIcon(false);
      setIsUploadingEditRoleIcon(false);
      setEmojiStickerAssets([]);
      setEmojiStickerSummary(null);
      setCanManageEmojiStickers(false);
      setIsLoadingEmojiStickers(false);
      setEmojiStickerStatusFilter("ALL");
      setEmojiStickersError(null);
      setEmojiStickerActionSuccess(null);
      setEmojiStickerActionItemId(null);
      setCreatingEmojiSticker(false);
      setNewEmojiName("");
      setNewEmojiValue("");
      setNewStickerName("");
      setNewStickerValue("");
      setSoundEfxItems([]);
      setSoundEfxSummary(null);
      setCanManageSoundEfx(false);
      setIsLoadingSoundEfx(false);
      setSoundEfxStatusFilter("ALL");
      setSoundEfxError(null);
      setSoundEfxActionSuccess(null);
      setSoundEfxActionItemId(null);
      setPlayingSoundTileId(null);
      setPlayingSoundProgressPercent(0);
      setCreatingSoundEfx(false);
      setNewSoundEfxName("");
      setNewSoundEfxUrl("");
      setMembersPanelItems([]);
      setIsLoadingMembersPanel(false);
      setMembersPanelError(null);
      setInvitePanelItems([]);
      setIsLoadingInvitePanel(false);
      setInvitePanelError(null);
      setInvitePanelSuccess(null);
      setInvitePanelActionCode(null);
      setIntegrationBots([]);
      setIsLoadingIntegrationBots(false);
      setIntegrationBotsError(null);
      setIntegrationBotsSuccess(null);
      setIntegrationBotActionMemberId(null);
      setOnboardingConfig(DEFAULT_ONBOARDING_CONFIG);
      setOnboardingChannels([]);
      setIsLoadingOnboarding(false);
      setIsSavingOnboarding(false);
      setIsUploadingOnboardingBanner(false);
      setOnboardingError(null);
      setOnboardingSuccess(null);
      setCanManageOnboarding(false);
      setServerGuideQuery("");
      setServerGuideScrollTop(0);
      setGenericSectionSettings(createDefaultGenericSectionSettings());
      setGenericSectionSaveMessage(null);
    }
  }, [isModalOpen]);

  useEffect(() => {
    setGenericSectionSaveMessage(null);
  }, [activeSection]);

  useEffect(() => {
    if (!isModalOpen || activeSection !== "roles" || !isRoleEditorPopupOpen || !server?.id || !selectedRoleId) {
      return;
    }

    let cancelled = false;

    const loadRoleMembers = async () => {
      try {
        setIsLoadingRoleMembers(true);
        setRoleMembersError(null);

        const response = await axios.get<{
          members?: RoleMemberItem[];
          canManageRoleMembers?: boolean;
        }>(`/api/servers/${server.id}/roles/${selectedRoleId}/members`);

        if (cancelled) {
          return;
        }

        setRoleMembers(response.data.members ?? []);
        setCanManageRoleMembers(Boolean(response.data.canManageRoleMembers));
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (axios.isAxiosError(error)) {
          const message =
            (error.response?.data as { error?: string })?.error ||
            (typeof error.response?.data === "string" ? error.response.data : "") ||
            error.message;
          setRoleMembersError(message || "Failed to load role members.");
        } else {
          setRoleMembersError("Failed to load role members.");
        }

        setRoleMembers([]);
      } finally {
        if (!cancelled) {
          setIsLoadingRoleMembers(false);
        }
      }
    };

    void loadRoleMembers();

    return () => {
      cancelled = true;
    };
  }, [activeSection, isModalOpen, isRoleEditorPopupOpen, selectedRoleId, server?.id]);

  useEffect(() => {
    if (!isModalOpen || activeSection !== "roles" || !server?.id) {
      return;
    }

    let cancelled = false;

    const loadRoles = async () => {
      try {
        setIsLoadingRoles(true);
        setRolesError(null);

        const response = await axios.get<{
          roles?: ServerRoleItem[];
          totalMembers?: number;
          canManageRoles?: boolean;
        }>(`/api/servers/${server.id}/roles`);

        if (cancelled) {
          return;
        }

        const nextRoles = response.data.roles ?? [];
        setRoles(nextRoles);
        setServerMemberTotal(Number(response.data.totalMembers ?? 0));
        setCanManageRoles(Boolean(response.data.canManageRoles));

        const initialRole = nextRoles[0] ?? null;

        setSelectedRoleId(initialRole?.id ?? null);
        setEditRoleName(initialRole?.name ?? "");
        setEditRoleColor(initialRole?.color ?? "#99aab5");
        setEditRoleIconUrl(initialRole?.iconUrl ?? "");
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (axios.isAxiosError(error)) {
          const message =
            (error.response?.data as { error?: string })?.error ||
            (typeof error.response?.data === "string" ? error.response.data : "") ||
            error.message;
          setRolesError(message || "Failed to load roles.");
        } else {
          setRolesError("Failed to load roles.");
        }

        setRoles([]);
        setServerMemberTotal(0);
      } finally {
        if (!cancelled) {
          setIsLoadingRoles(false);
        }
      }
    };

    void loadRoles();

    return () => {
      cancelled = true;
    };
  }, [activeSection, isModalOpen, server?.id]);

  const loadInvitePanel = useCallback(async () => {
    if (!server?.id) {
      return;
    }

    try {
      setIsLoadingInvitePanel(true);
      setInvitePanelError(null);

      const response = await axios.get<{
        invites?: ServerInvitePanelItem[];
      }>(`/api/servers/${server.id}/invites`);

      setInvitePanelItems(response.data.invites ?? []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          error.message;
        setInvitePanelError(message || "Failed to load server invites.");
      } else {
        setInvitePanelError("Failed to load server invites.");
      }

      setInvitePanelItems([]);
    } finally {
      setIsLoadingInvitePanel(false);
    }
  }, [server?.id]);

  useEffect(() => {
    if (!isModalOpen || activeSection !== "invites") {
      return;
    }

    void loadInvitePanel();
  }, [activeSection, isModalOpen, loadInvitePanel]);

  const onDeleteInvite = async (code: string) => {
    if (!server?.id || !code || invitePanelActionCode) {
      return;
    }

    try {
      setInvitePanelError(null);
      setInvitePanelSuccess(null);
      setInvitePanelActionCode(code);

      const response = await axios.delete<{ rotated?: boolean }>(`/api/servers/${server.id}/invites`, {
        data: { code },
      });

      setInvitePanelSuccess(
        response.data?.rotated
          ? "Invite deleted. Active invite was rotated to keep the server joinable."
          : "Invite deleted."
      );

      await loadInvitePanel();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          error.message;
        setInvitePanelError(message || "Failed to delete invite.");
      } else {
        setInvitePanelError("Failed to delete invite.");
      }
    } finally {
      setInvitePanelActionCode(null);
    }
  };

  const loadIntegrationBots = useCallback(async () => {
    if (!server?.id) {
      return;
    }

    try {
      setIsLoadingIntegrationBots(true);
      setIntegrationBotsError(null);

      const response = await axios.get<{
        bots?: IntegrationBotPanelItem[];
      }>(`/api/servers/${server.id}/integrations/bots`);

      setIntegrationBots(response.data.bots ?? []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          error.message;
        setIntegrationBotsError(message || "Failed to load integrations bots.");
      } else {
        setIntegrationBotsError("Failed to load integrations bots.");
      }

      setIntegrationBots([]);
    } finally {
      setIsLoadingIntegrationBots(false);
    }
  }, [server?.id]);

  useEffect(() => {
    if (!isModalOpen || activeSection !== "integrations") {
      return;
    }

    void loadIntegrationBots();
  }, [activeSection, isModalOpen, loadIntegrationBots]);

  const loadOnboardingConfig = useCallback(async () => {
    if (!server?.id) {
      return;
    }

    try {
      setIsLoadingOnboarding(true);
      setOnboardingError(null);

      const response = await axios.get<{
        canManageOnboarding?: boolean;
        channels?: OnboardingChannel[];
        config?: OnboardingConfig;
      }>(`/api/servers/${server.id}/onboarding`);

      setCanManageOnboarding(Boolean(response.data.canManageOnboarding));
      setOnboardingChannels(response.data.channels ?? []);
      setOnboardingConfig(response.data.config ?? DEFAULT_ONBOARDING_CONFIG);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          error.message;
        setOnboardingError(message || "Failed to load onboarding settings.");
      } else {
        setOnboardingError("Failed to load onboarding settings.");
      }

      setCanManageOnboarding(false);
      setOnboardingChannels([]);
      setOnboardingConfig(DEFAULT_ONBOARDING_CONFIG);
    } finally {
      setIsLoadingOnboarding(false);
    }
  }, [server?.id]);

  useEffect(() => {
    if (!isModalOpen || activeSection !== "onboarding") {
      return;
    }

    void loadOnboardingConfig();
  }, [activeSection, isModalOpen, loadOnboardingConfig]);

  const onToggleOnboardingChannel = (channelId: string, target: "checklist" | "resource") => {
    setOnboardingSuccess(null);
    setOnboardingError(null);

    setOnboardingConfig((previous) => {
      const key = target === "checklist" ? "checklistChannelIds" : "resourceChannelIds";
      const existing = new Set(previous[key]);
      if (existing.has(channelId)) {
        existing.delete(channelId);
      } else {
        existing.add(channelId);
      }

      return {
        ...previous,
        [key]: Array.from(existing),
      };
    });
  };

  const onAddOnboardingPrompt = () => {
    setOnboardingSuccess(null);
    setOnboardingError(null);

    setOnboardingConfig((previous) => ({
      ...previous,
      prompts: [
        ...previous.prompts,
        {
          id: `prompt-${Date.now()}`,
          question: "",
          options: [""],
          required: false,
          multiple: false,
        },
      ],
    }));
  };

  const onUpdateOnboardingPrompt = (promptId: string, update: Partial<OnboardingPromptItem>) => {
    setOnboardingSuccess(null);
    setOnboardingError(null);

    setOnboardingConfig((previous) => ({
      ...previous,
      prompts: previous.prompts.map((promptItem) =>
        promptItem.id === promptId ? { ...promptItem, ...update } : promptItem
      ),
    }));
  };

  const onRemoveOnboardingPrompt = (promptId: string) => {
    setOnboardingSuccess(null);
    setOnboardingError(null);

    setOnboardingConfig((previous) => ({
      ...previous,
      prompts: previous.prompts.filter((promptItem) => promptItem.id !== promptId),
    }));
  };

  const onSaveOnboarding = async () => {
    if (!server?.id || isSavingOnboarding || !canManageOnboarding) {
      return;
    }

    try {
      setIsSavingOnboarding(true);
      setOnboardingError(null);
      setOnboardingSuccess(null);

      const sanitizedPrompts = onboardingConfig.prompts
        .map((promptItem) => ({
          ...promptItem,
          question: promptItem.question.trim(),
          options: promptItem.options.map((optionItem) => optionItem.trim()).filter(Boolean),
        }))
        .filter((promptItem) => promptItem.question.length > 0);

      const response = await axios.patch<{
        canManageOnboarding?: boolean;
        channels?: OnboardingChannel[];
        config?: OnboardingConfig;
      }>(`/api/servers/${server.id}/onboarding`, {
        ...onboardingConfig,
        prompts: sanitizedPrompts,
      });

      setCanManageOnboarding(Boolean(response.data.canManageOnboarding));
      setOnboardingChannels(response.data.channels ?? onboardingChannels);
      setOnboardingConfig(response.data.config ?? onboardingConfig);
      setOnboardingSuccess("Onboarding settings saved.");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          error.message;
        setOnboardingError(message || "Failed to save onboarding settings.");
      } else {
        setOnboardingError("Failed to save onboarding settings.");
      }
    } finally {
      setIsSavingOnboarding(false);
    }
  };

  const onPickOnboardingBanner = () => {
    if (!canManageOnboarding || isUploadingOnboardingBanner || isSavingOnboarding) {
      return;
    }

    onboardingBannerInputRef.current?.click();
  };

  const onOnboardingBannerChange = async (file?: File) => {
    if (!file || !canManageOnboarding) {
      return;
    }

    try {
      setOnboardingError(null);
      setOnboardingSuccess(null);
      setIsUploadingOnboardingBanner(true);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=serverImage",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      setOnboardingConfig((previous) => ({
        ...previous,
        bannerUrl: upload.data.url,
      }));
      setOnboardingSuccess("Onboarding banner uploaded. Save onboarding to persist it.");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Onboarding banner upload failed.";
        setOnboardingError(message);
      } else {
        setOnboardingError("Onboarding banner upload failed.");
      }
    } finally {
      setIsUploadingOnboardingBanner(false);
      if (onboardingBannerInputRef.current) {
        onboardingBannerInputRef.current.value = "";
      }
    }
  };

  const onIntegrationBotAction = async (
    botItem: IntegrationBotPanelItem,
    action: "BOOT" | "UNBOOT" | "BAN" | "UNBAN" | "KICK"
  ) => {
    if (!server?.id || integrationBotActionMemberId) {
      return;
    }

    try {
      setIntegrationBotsError(null);
      setIntegrationBotsSuccess(null);
      setIntegrationBotActionMemberId(botItem.id);

      await axios.post(`/api/servers/${server.id}/integrations/bots`, {
        action,
        memberId: botItem.id,
        profileId: botItem.profileId,
      });

      setIntegrationBotsSuccess(
        action === "KICK"
          ? "Bot kicked from server."
          : action === "BAN"
            ? "Bot banned and removed from server."
            : action === "UNBAN"
              ? "Bot unbanned."
              : action === "UNBOOT"
                ? "Bot unbooted."
                : "Bot booted."
      );

      await loadIntegrationBots();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          error.message;
        setIntegrationBotsError(message || "Failed to apply bot action.");
      } else {
        setIntegrationBotsError("Failed to apply bot action.");
      }
    } finally {
      setIntegrationBotActionMemberId(null);
    }
  };

  const isLoading = form.formState.isSubmitting;
  const imageUrl = form.watch("imageUrl") || "";
  const bannerUrl = form.watch("bannerUrl") || "";
  const bannerFit = form.watch("bannerFit") || "cover";
  const bannerScale = form.watch("bannerScale") || 1;

  const onPickImage = () => {
    if (isUploadingImage || isLoading) {
      return;
    }

    fileInputRef.current?.click();
  };

  const onImageChange = async (file?: File) => {
    if (!file) {
      return;
    }

    try {
      setSubmitError(null);
      setIsUploadingImage(true);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=serverImage",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      form.setValue("imageUrl", upload.data.url, {
        shouldDirty: true,
        shouldValidate: true,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Image upload failed.";
        setSubmitError(message);
      } else {
        setSubmitError("Image upload failed.");
      }
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const onPickBanner = () => {
    if (isUploadingBanner || isLoading) {
      return;
    }

    bannerInputRef.current?.click();
  };

  const onBannerChange = async (file?: File) => {
    if (!file) {
      return;
    }

    try {
      setSubmitError(null);
      setIsUploadingBanner(true);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=serverImage",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      form.setValue("bannerUrl", upload.data.url, {
        shouldDirty: true,
        shouldValidate: true,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Banner upload failed.";
        setSubmitError(message);
      } else {
        setSubmitError("Banner upload failed.");
      }
    } finally {
      setIsUploadingBanner(false);
      if (bannerInputRef.current) {
        bannerInputRef.current.value = "";
      }
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setSubmitError(null);
      await axios.patch(`/api/servers/${server?.id}`, values);

      form.reset();
      router.refresh();
      onClose();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          typeof error.response?.data === "string"
            ? error.response.data
            : error.response?.data?.message;
        setSubmitError(message || "Failed to update server.");
      } else {
        setSubmitError("Failed to update server.");
      }
      console.log(error);
    }
  }

  const handleClose = () => {
    form.reset();
    setSubmitError(null);
    setIsUploadingImage(false);
    setIsUploadingBanner(false);
    onClose();
  }

  const onSelectRole = (role: ServerRoleItem) => {
    setSelectedRoleId(role.id);
    setEditRoleName(role.name);
    setEditRoleColor(role.color);
    setEditRoleIconUrl(role.iconUrl ?? "");
    setIsRoleEditorPopupOpen(true);
  };

  const onPickNewRoleIcon = () => {
    if (!canManageRoles || isUploadingNewRoleIcon || isCreatingRole) {
      return;
    }

    newRoleIconInputRef.current?.click();
  };

  const onPickEditRoleIcon = () => {
    if (!canManageRoles || isUploadingEditRoleIcon || isSavingRole) {
      return;
    }

    editRoleIconInputRef.current?.click();
  };

  const onNewRoleIconChange = async (file?: File) => {
    if (!file || !canManageRoles) {
      return;
    }

    try {
      setIsUploadingNewRoleIcon(true);
      setRolesError(null);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=serverImage",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      setNewRoleIconUrl(upload.data.url);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Role icon upload failed.";
        setRolesError(message);
      } else {
        setRolesError("Role icon upload failed.");
      }
    } finally {
      setIsUploadingNewRoleIcon(false);
      if (newRoleIconInputRef.current) {
        newRoleIconInputRef.current.value = "";
      }
    }
  };

  const onEditRoleIconChange = async (file?: File) => {
    if (!file || !canManageRoles) {
      return;
    }

    try {
      setIsUploadingEditRoleIcon(true);
      setRolesError(null);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=serverImage",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      setEditRoleIconUrl(upload.data.url);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Role icon upload failed.";
        setRolesError(message);
      } else {
        setRolesError("Role icon upload failed.");
      }
    } finally {
      setIsUploadingEditRoleIcon(false);
      if (editRoleIconInputRef.current) {
        editRoleIconInputRef.current.value = "";
      }
    }
  };

  const onCreateRole = async () => {
    if (!server?.id || !canManageRoles || isCreatingRole) {
      return;
    }

    const name = newRoleName.trim();
    if (!name) {
      setRolesError("Role name is required.");
      return;
    }

    try {
      setRolesError(null);
      setIsCreatingRole(true);

      const response = await axios.post<{ role?: ServerRoleItem }>(`/api/servers/${server.id}/roles`, {
        name,
        color: newRoleColor,
        iconUrl: newRoleIconUrl || null,
      });

      const role = response.data.role;
      if (!role) {
        setRolesError("Failed to create role.");
        return;
      }

      const next = [...roles, role].sort((a, b) => a.position - b.position);
      setRoles(next);
      setSelectedRoleId(role.id);
      setEditRoleName(role.name);
      setEditRoleColor(role.color);
      setEditRoleIconUrl(role.iconUrl ?? "");
      setNewRoleName("");
      setNewRoleColor("#99aab5");
      setNewRoleIconUrl("");
      setIsCreateRolePopupOpen(false);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          error.message;
        setRolesError(message || "Failed to create role.");
      } else {
        setRolesError("Failed to create role.");
      }
    } finally {
      setIsCreatingRole(false);
    }
  };

  const onSaveRole = async () => {
    if (!server?.id || !selectedRoleId || !canManageRoles || isSavingRole) {
      return;
    }

    const name = editRoleName.trim();
    if (!name) {
      setRolesError("Role name is required.");
      return;
    }

    try {
      setRolesError(null);
      setIsSavingRole(true);

      const response = await axios.patch<{ role?: ServerRoleItem }>(
        `/api/servers/${server.id}/roles/${selectedRoleId}`,
        {
          name,
          color: editRoleColor,
          iconUrl: editRoleIconUrl || null,
        }
      );

      const role = response.data.role;
      if (!role) {
        setRolesError("Failed to save role.");
        return;
      }

      setRoles((prev) => prev.map((item) => (item.id === role.id ? role : item)));
      setEditRoleName(role.name);
      setEditRoleColor(role.color);
      setEditRoleIconUrl(role.iconUrl ?? "");
      setIsRoleEditorPopupOpen(false);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          error.message;
        setRolesError(message || "Failed to save role.");
      } else {
        setRolesError("Failed to save role.");
      }
    } finally {
      setIsSavingRole(false);
    }
  };

  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null;
  const normalizedAddMemberSearch = addMemberSearch.trim().toLowerCase();
  const assignedRoleMembers = roleMembers.filter((memberItem) => memberItem.isAssigned);
  const addableRoleMembers = roleMembers.filter((memberItem) => {
    if (!normalizedAddMemberSearch) {
      return false;
    }

    if (memberItem.isAssigned) {
      return false;
    }

    const haystack = `${memberItem.displayName} ${memberItem.email ?? ""} ${memberItem.profileId}`.toLowerCase();
    return haystack.includes(normalizedAddMemberSearch);
  });

  const onToggleRoleMember = async (memberItem: RoleMemberItem) => {
    if (!server?.id || !selectedRoleId || !canManageRoleMembers || togglingMemberId) {
      return;
    }

    try {
      setRoleMembersError(null);
      setTogglingMemberId(memberItem.memberId);

      if (memberItem.isAssigned) {
        await axios.delete(`/api/servers/${server.id}/roles/${selectedRoleId}/members`, {
          data: { memberId: memberItem.memberId },
        });
      } else {
        await axios.post(`/api/servers/${server.id}/roles/${selectedRoleId}/members`, {
          memberId: memberItem.memberId,
        });
      }

      setRoleMembers((prev) =>
        prev.map((item) =>
          item.memberId === memberItem.memberId
            ? { ...item, isAssigned: !item.isAssigned }
            : item
        )
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          error.message;
        setRoleMembersError(message || "Failed to update role member.");
      } else {
        setRoleMembersError("Failed to update role member.");
      }
    } finally {
      setTogglingMemberId(null);
    }
  };

  const activeEmojiStickerType =
    activeSection === "emoji" ? "EMOJI" : activeSection === "stickers" ? "STICKER" : null;

  const loadEmojiStickers = useCallback(
    async (assetType: "EMOJI" | "STICKER") => {
      if (!server?.id) {
        return;
      }

      try {
        setIsLoadingEmojiStickers(true);
        setEmojiStickersError(null);

        const query = new URLSearchParams();
        query.set("assetType", assetType);
        query.set("status", emojiStickerStatusFilter);

        const response = await fetch(`/api/servers/${server.id}/emoji-stickers?${query.toString()}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });

        if (!response.ok) {
          const message = (await response.text()) || `Failed to load emoji/stickers (${response.status})`;
          throw new Error(message);
        }

        const payload = (await response.json()) as {
          assets?: ServerEmojiStickerAsset[];
          summary?: ServerEmojiStickerSummary;
          canManageEmojiStickers?: boolean;
        };

        setEmojiStickerAssets(payload.assets ?? []);
        setEmojiStickerSummary(
          payload.summary ?? {
            totalAssets: 0,
            emojiAssets: 0,
            stickerAssets: 0,
            activeAssets: 0,
          }
        );
        setCanManageEmojiStickers(Boolean(payload.canManageEmojiStickers));
      } catch (error) {
        console.error("[EDIT_SERVER_EMOJI_STICKERS_LOAD]", error);
        setEmojiStickerAssets([]);
        setEmojiStickerSummary(null);
        setCanManageEmojiStickers(false);
        setEmojiStickersError(error instanceof Error ? error.message : "Unable to load emoji and stickers.");
      } finally {
        setIsLoadingEmojiStickers(false);
      }
    },
    [emojiStickerStatusFilter, server?.id]
  );

  useEffect(() => {
    if (!isModalOpen || !activeEmojiStickerType) {
      return;
    }

    void loadEmojiStickers(activeEmojiStickerType);
  }, [activeEmojiStickerType, isModalOpen, loadEmojiStickers]);

  const onCreateEmojiSticker = async () => {
    if (!server?.id || !activeEmojiStickerType || creatingEmojiSticker) {
      return;
    }

    const isEmoji = activeEmojiStickerType === "EMOJI";
    const name = (isEmoji ? newEmojiName : newStickerName).trim().toLowerCase();
    const value = (isEmoji ? newEmojiValue : newStickerValue).trim();

    setEmojiStickersError(null);
    setEmojiStickerActionSuccess(null);

    if (!/^[a-z0-9_]{2,32}$/.test(name)) {
      setEmojiStickersError("Name must be 2-32 chars and use lowercase letters, numbers, or underscore.");
      return;
    }

    if (!value) {
      setEmojiStickersError(isEmoji ? "Enter an emoji character." : "Enter a sticker URL or app-relative path.");
      return;
    }

    try {
      setCreatingEmojiSticker(true);

      const response = await fetch(`/api/servers/${server.id}/emoji-stickers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assetType: activeEmojiStickerType,
          name,
          emoji: isEmoji ? value : undefined,
          imageUrl: !isEmoji ? value : undefined,
        }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to create ${isEmoji ? "emoji" : "sticker"} (${response.status})`;
        throw new Error(message);
      }

      if (isEmoji) {
        setNewEmojiName("");
        setNewEmojiValue("");
      } else {
        setNewStickerName("");
        setNewStickerValue("");
      }

      setEmojiStickerActionSuccess(`${isEmoji ? "Emoji" : "Sticker"} saved.`);
      await loadEmojiStickers(activeEmojiStickerType);
    } catch (error) {
      console.error("[EDIT_SERVER_EMOJI_STICKERS_CREATE]", error);
      setEmojiStickersError(
        error instanceof Error ? error.message : `Unable to create ${isEmoji ? "emoji" : "sticker"}.`
      );
    } finally {
      setCreatingEmojiSticker(false);
    }
  };

  const onEmojiStickerAction = async (itemId: string, action: "ENABLE" | "DISABLE" | "DELETE") => {
    if (!server?.id || !activeEmojiStickerType) {
      return;
    }

    setEmojiStickersError(null);
    setEmojiStickerActionSuccess(null);

    try {
      setEmojiStickerActionItemId(itemId);

      const response = await fetch(`/api/servers/${server.id}/emoji-stickers`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemId,
          action,
        }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to apply action (${response.status})`;
        throw new Error(message);
      }

      setEmojiStickerActionSuccess(
        action === "DELETE"
          ? "Asset deleted."
          : action === "ENABLE"
            ? "Asset enabled."
            : "Asset disabled."
      );

      await loadEmojiStickers(activeEmojiStickerType);
    } catch (error) {
      console.error("[EDIT_SERVER_EMOJI_STICKERS_ACTION]", error);
      setEmojiStickersError(error instanceof Error ? error.message : "Unable to update asset.");
    } finally {
      setEmojiStickerActionItemId(null);
    }
  };

  const loadSoundEfx = useCallback(async () => {
    if (!server?.id) {
      return;
    }

    try {
      setIsLoadingSoundEfx(true);
      setSoundEfxError(null);

      const query = new URLSearchParams();
      query.set("status", soundEfxStatusFilter);

      const response = await fetch(`/api/servers/${server.id}/sound-efx?${query.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to load sound EFX (${response.status})`;
        throw new Error(message);
      }

      const payload = (await response.json()) as {
        soundEfx?: ServerSoundEfxItem[];
        summary?: ServerSoundEfxSummary;
        canManageSoundEfx?: boolean;
      };

      setSoundEfxItems(payload.soundEfx ?? []);
      setSoundEfxSummary(payload.summary ?? { total: 0, active: 0 });
      setCanManageSoundEfx(Boolean(payload.canManageSoundEfx));
    } catch (error) {
      console.error("[EDIT_SERVER_SOUND_EFX_LOAD]", error);
      setSoundEfxItems([]);
      setSoundEfxSummary(null);
      setCanManageSoundEfx(false);
      setSoundEfxError(error instanceof Error ? error.message : "Unable to load sound EFX.");
    } finally {
      setIsLoadingSoundEfx(false);
    }
  }, [server?.id, soundEfxStatusFilter]);

  useEffect(() => {
    if (!isModalOpen || activeSection !== "soundboard") {
      return;
    }

    void loadSoundEfx();
  }, [activeSection, isModalOpen, loadSoundEfx]);

  useEffect(() => {
    if (activeSection !== "soundboard") {
      if (soundPreviewAudioRef.current) {
        soundPreviewAudioRef.current.pause();
        soundPreviewAudioRef.current.currentTime = 0;
      }
      setPlayingSoundTileId(null);
      setPlayingSoundProgressPercent(0);
    }
  }, [activeSection]);

  const onCreateSoundEfx = async () => {
    if (!server?.id || creatingSoundEfx) {
      return;
    }

    const name = newSoundEfxName.trim().toLowerCase();
    const audioUrl = newSoundEfxUrl.trim();

    setSoundEfxError(null);
    setSoundEfxActionSuccess(null);

    if (!/^[a-z0-9_]{2,32}$/.test(name)) {
      setSoundEfxError("Name must be 2-32 chars and use lowercase letters, numbers, or underscore.");
      return;
    }

    if (!audioUrl) {
      setSoundEfxError("Enter a sound URL or app-relative path.");
      return;
    }

    try {
      setCreatingSoundEfx(true);

      const response = await fetch(`/api/servers/${server.id}/sound-efx`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, audioUrl }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to create sound EFX (${response.status})`;
        throw new Error(message);
      }

      setNewSoundEfxName("");
      setNewSoundEfxUrl("");
      setSoundEfxActionSuccess("Sound EFX saved.");
      await loadSoundEfx();
    } catch (error) {
      console.error("[EDIT_SERVER_SOUND_EFX_CREATE]", error);
      setSoundEfxError(error instanceof Error ? error.message : "Unable to create sound EFX.");
    } finally {
      setCreatingSoundEfx(false);
    }
  };

  const onSoundEfxAction = async (itemId: string, action: "ENABLE" | "DISABLE" | "DELETE") => {
    if (!server?.id) {
      return;
    }

    setSoundEfxError(null);
    setSoundEfxActionSuccess(null);

    try {
      setSoundEfxActionItemId(itemId);

      const response = await fetch(`/api/servers/${server.id}/sound-efx`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ itemId, action }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to apply action (${response.status})`;
        throw new Error(message);
      }

      setSoundEfxActionSuccess(
        action === "DELETE"
          ? "Sound EFX deleted."
          : action === "ENABLE"
            ? "Sound EFX enabled."
            : "Sound EFX disabled."
      );

      await loadSoundEfx();
    } catch (error) {
      console.error("[EDIT_SERVER_SOUND_EFX_ACTION]", error);
      setSoundEfxError(error instanceof Error ? error.message : "Unable to update sound EFX.");
    } finally {
      setSoundEfxActionItemId(null);
    }
  };

  const onPlaySoundTile = async (tileId: string, audioUrl: string) => {
    const normalizedAudioUrl = String(audioUrl ?? "").trim();
    if (!normalizedAudioUrl) {
      return;
    }

    const audio = soundPreviewAudioRef.current ?? new Audio();
    soundPreviewAudioRef.current = audio;

    if (playingSoundTileId === tileId && !audio.paused) {
      audio.pause();
      audio.currentTime = 0;
      setPlayingSoundTileId(null);
      setPlayingSoundProgressPercent(0);
      return;
    }

    try {
      audio.pause();
      audio.src = normalizedAudioUrl;
      audio.currentTime = 0;
      setPlayingSoundProgressPercent(0);
      audio.ontimeupdate = () => {
        const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
        if (!duration) {
          setPlayingSoundProgressPercent(0);
          return;
        }

        setPlayingSoundProgressPercent(Math.max(0, Math.min(100, (audio.currentTime / duration) * 100)));
      };
      audio.onended = () => {
        setPlayingSoundTileId((current) => (current === tileId ? null : current));
        setPlayingSoundProgressPercent(0);
      };

      await audio.play();
      setPlayingSoundTileId(tileId);
      setSoundEfxError(null);
    } catch {
      setPlayingSoundTileId(null);
      setPlayingSoundProgressPercent(0);
      setSoundEfxError("Unable to play this Sound EFX tile.");
    }
  };

  useEffect(() => {
    if (!isModalOpen || activeSection !== "members" || !server?.id) {
      return;
    }

    let cancelled = false;

    const loadMembersPanel = async () => {
      try {
        setIsLoadingMembersPanel(true);
        setMembersPanelError(null);

        const response = await axios.get<{
          members?: ServerMembersPanelItem[];
        }>(`/api/servers/${server.id}/members`);

        if (cancelled) {
          return;
        }

        setMembersPanelItems(response.data.members ?? []);
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (axios.isAxiosError(error)) {
          const message =
            (error.response?.data as { error?: string })?.error ||
            (typeof error.response?.data === "string" ? error.response.data : "") ||
            error.message;
          setMembersPanelError(message || "Failed to load server members.");
        } else {
          setMembersPanelError("Failed to load server members.");
        }

        setMembersPanelItems([]);
      } finally {
        if (!cancelled) {
          setIsLoadingMembersPanel(false);
        }
      }
    };

    void loadMembersPanel();

    return () => {
      cancelled = true;
    };
  }, [activeSection, isModalOpen, server?.id]);

  const activeSectionDescription =
    GENERIC_SECTION_DESCRIPTIONS[activeSection] ??
    `Configure settings for ${SECTION_TITLES[activeSection].toLowerCase()}.`;

  const hasDedicatedSectionPanel =
    activeSection === "roles" ||
    activeSection === "onboarding" ||
    activeSection === "serverGuide" ||
    activeSection === "integrations" ||
    activeSection === "soundboard" ||
    activeSection === "deleteServer" ||
    Boolean(activeEmojiStickerType);

  const onboardingTextChannels = onboardingChannels.filter((channelItem) => channelItem.type === "TEXT");
  const onboardingSelectedPreset =
    ONBOARDING_BANNER_PRESETS.find((item) => item.key === onboardingConfig.bannerPreset) ?? ONBOARDING_BANNER_PRESETS[0];
  const onboardingPreviewLabel = onboardingConfig.bannerUrl ? "Custom uploaded banner" : `${onboardingSelectedPreset.label} preset`;
  const defaultSoundTiles = useMemo(
    () =>
      DEFAULT_SOUND_TILE_DEFS.map((item) => ({
        id: `default-${item.key}`,
        name: item.label,
        audioUrl: createToneWavDataUrl(item.frequency),
      })),
    []
  );

  const activeGenericSectionSettings = genericSectionSettings[activeSection];

  const filteredServerGuideEntries = useMemo(() => {
    const normalizedQuery = serverGuideQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return SERVER_GUIDE_ENTRIES;
    }

    return SERVER_GUIDE_ENTRIES.filter((entry) => {
      const searchableText = `${entry.label} ${entry.heading} ${SECTION_TITLES[entry.key]} ${GENERIC_SECTION_DESCRIPTIONS[entry.key] ?? ""} ${SERVER_GUIDE_USAGE[entry.key] ?? ""}`.toLowerCase();
      return searchableText.includes(normalizedQuery);
    });
  }, [serverGuideQuery]);

  const groupedServerGuideEntries = useMemo(() => {
    return filteredServerGuideEntries.reduce<Record<string, typeof filteredServerGuideEntries>>((accumulator, entry) => {
      if (!accumulator[entry.heading]) {
        accumulator[entry.heading] = [];
      }

      accumulator[entry.heading].push(entry);
      return accumulator;
    }, {});
  }, [filteredServerGuideEntries]);

  const FLAT_SERVER_GUIDE_ROW_HEIGHT = 156;
  const SERVER_GUIDE_OVERSCAN = 6;
  const sortedServerGuideEntries = useMemo(
    () =>
      [...filteredServerGuideEntries].sort((leftEntry, rightEntry) => {
        if (leftEntry.heading === rightEntry.heading) {
          return leftEntry.label.localeCompare(rightEntry.label);
        }

        return leftEntry.heading.localeCompare(rightEntry.heading);
      }),
    [filteredServerGuideEntries]
  );

  const serverGuideVisibleRange = useMemo(() => {
    const total = sortedServerGuideEntries.length;
    if (total === 0) {
      return {
        startIndex: 0,
        endIndex: 0,
      };
    }

    const startIndex = Math.max(0, Math.floor(serverGuideScrollTop / FLAT_SERVER_GUIDE_ROW_HEIGHT) - SERVER_GUIDE_OVERSCAN);
    const visibleRowCount = Math.ceil(serverGuideViewportHeight / FLAT_SERVER_GUIDE_ROW_HEIGHT) + SERVER_GUIDE_OVERSCAN * 2;
    const endIndex = Math.min(total, startIndex + visibleRowCount);

    return { startIndex, endIndex };
  }, [serverGuideScrollTop, serverGuideViewportHeight, sortedServerGuideEntries.length]);

  const visibleServerGuideEntries = useMemo(
    () => sortedServerGuideEntries.slice(serverGuideVisibleRange.startIndex, serverGuideVisibleRange.endIndex),
    [serverGuideVisibleRange.endIndex, serverGuideVisibleRange.startIndex, sortedServerGuideEntries]
  );

  const serverGuideTopSpacerHeight = serverGuideVisibleRange.startIndex * FLAT_SERVER_GUIDE_ROW_HEIGHT;
  const serverGuideBottomSpacerHeight = Math.max(
    0,
    (sortedServerGuideEntries.length - serverGuideVisibleRange.endIndex) * FLAT_SERVER_GUIDE_ROW_HEIGHT
  );

  useEffect(() => {
    if (!isModalOpen || activeSection !== "serverGuide") {
      return;
    }

    const syncGuideViewportHeight = () => {
      const nextHeight = serverGuideListRef.current?.clientHeight ?? 460;
      setServerGuideViewportHeight(nextHeight);
    };

    syncGuideViewportHeight();

    window.addEventListener("resize", syncGuideViewportHeight);

    return () => {
      window.removeEventListener("resize", syncGuideViewportHeight);
    };
  }, [activeSection, isModalOpen]);

  useEffect(() => {
    if (activeSection !== "serverGuide") {
      return;
    }

    setServerGuideScrollTop(0);
    if (serverGuideListRef.current) {
      serverGuideListRef.current.scrollTop = 0;
    }
  }, [activeSection, serverGuideQuery]);

  const onSaveGenericSectionSettings = () => {
    setGenericSectionSaveMessage(`${SECTION_TITLES[activeSection]} settings saved.`);
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={handleClose}>
      <DialogContent className="settings-theme-scope settings-scrollbar theme-settings-shell flex h-[85vh] max-h-[85vh] w-[85vw] max-w-[85vw] flex-col overflow-hidden rounded-3xl border-black/30 bg-[#2b2d31] p-0 text-[#dbdee1]">
        <DialogTitle className="sr-only">Server Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Edit server overview settings.
        </DialogDescription>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} suppressHydrationWarning className="flex min-h-0 flex-1 flex-col">
            <div className="grid min-h-0 flex-1 grid-cols-[1fr_260px] overflow-hidden">
              <section className="theme-settings-content order-1 flex h-full min-h-0 flex-col overflow-hidden bg-[#313338]">
                <DialogHeader className="theme-settings-content-header sticky top-0 z-10 border-b border-black/20 bg-[#2b2d31]/95 px-8 pb-4 pt-6 text-left shadow-lg shadow-black/35 backdrop-blur">
                  <DialogTitle className="text-xl font-semibold text-white">
                    {SECTION_TITLES[activeSection]}
                  </DialogTitle>
                  <DialogDescription className="pt-1 text-sm text-zinc-300">
                    {activeSection === "overview"
                      ? "Customize your server's appearance and identity."
                      : activeSectionDescription}
                  </DialogDescription>
                </DialogHeader>

                {activeSection !== "overview" ? (
                  <div
                    key={activeSection}
                    className="settings-scrollbar theme-settings-content-body min-h-0 flex-1 overflow-y-scroll overflow-x-hidden space-y-4 px-8 py-6"
                    style={{ scrollbarGutter: "stable" }}
                  >
                    {activeSection === "roles" ? (
                      <div className="rounded-xl border border-zinc-700 bg-[#2B2D31] p-3">
                          <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-zinc-200">
                              Server Roles
                            </p>
                            <span className="rounded bg-[#1e1f22] px-2.5 py-1 text-xs text-zinc-300">
                              {roles.length}
                            </span>
                          </div>

                          <div className="mb-3">
                            <Button
                              type="button"
                              onClick={() => setIsCreateRolePopupOpen(true)}
                              disabled={!canManageRoles}
                              className="w-full bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Create Role
                            </Button>
                          </div>

                          <div className="mb-2 grid grid-cols-[1fr_96px_80px] items-center px-2 text-xs font-semibold text-zinc-300">
                            <span className="text-left">Roles - {roles.length}</span>
                            <span className="text-center">Members: {serverMemberTotal}</span>
                            <span className="text-right">Edit</span>
                          </div>

                          <div className="max-h-[320px] space-y-1 overflow-y-auto overflow-x-hidden pr-1">
                            {isLoadingRoles ? (
                              <div className="flex items-center gap-2 rounded-md bg-[#1e1f22] px-3 py-2 text-sm text-zinc-300">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading roles...
                              </div>
                            ) : roles.length === 0 ? (
                              <p className="rounded-md bg-[#1e1f22] px-3 py-2 text-xs text-zinc-400">No roles found.</p>
                            ) : (
                              roles.map((role) => (
                                <button
                                  key={role.id}
                                  type="button"
                                  onClick={() => onSelectRole(role)}
                                  className={cn(
                                    "grid w-full grid-cols-[1fr_96px_80px] items-center gap-2 rounded-md px-2 py-2.5 text-left text-base transition",
                                    selectedRoleId === role.id
                                      ? "bg-[#404249] text-white"
                                      : "text-zinc-300 hover:bg-[#36393f]"
                                  )}
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    {role.iconUrl ? (
                                      <span className="relative inline-flex h-6 w-6 overflow-hidden rounded-sm border border-zinc-600">
                                        <Image src={role.iconUrl} alt={`${role.name} icon`} fill className="object-cover" unoptimized />
                                      </span>
                                    ) : (
                                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-sm border border-zinc-600 bg-[#1e1f22] text-xs font-semibold uppercase text-zinc-200">
                                        {role.name.slice(0, 1)}
                                      </span>
                                    )}
                                    <span className="truncate">{role.name}</span>
                                    {role.isManaged ? (
                                      <span className="rounded bg-black/25 px-1.5 py-0.5 text-[11px] text-zinc-300">
                                        System
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className="text-center">
                                    <span className="inline-flex w-12 items-center justify-center rounded bg-black/25 px-1.5 py-0.5 text-xs text-zinc-200">
                                      {role.memberCount ?? 0}
                                    </span>
                                  </span>
                                  <span className="inline-flex items-center justify-end">
                                    <Pencil className="h-4.5 w-4.5 shrink-0 text-zinc-300" aria-label="Edit role" />
                                  </span>
                                </button>
                              ))
                            )}
                          </div>


                        {!canManageRoles ? (
                          <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                            Only the server owner can add or edit roles.
                          </p>
                        ) : null}

                        {rolesError ? (
                          <p className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                            {rolesError}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {activeSection === "roles" && isCreateRolePopupOpen ? (
                      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
                        <div className="w-full max-w-[520px] rounded-xl border border-zinc-700 bg-[#2B2D31] p-4 shadow-2xl shadow-black/60">
                          <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-semibold text-white">Create Role</p>
                            <button
                              type="button"
                              onClick={() => setIsCreateRolePopupOpen(false)}
                              className="rounded p-1 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                              aria-label="Close create role popup"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Role Name</p>
                              <input
                                value={newRoleName}
                                onChange={(event) => setNewRoleName(event.target.value)}
                                placeholder="Role name"
                                className="h-10 w-full rounded-md border border-zinc-700 bg-[#15161a] px-3 text-sm text-white outline-none focus:border-indigo-500"
                                disabled={!canManageRoles || isCreatingRole}
                              />
                            </div>

                            <div>
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Role Color</p>
                              <input
                                value={newRoleColor}
                                onChange={(event) => setNewRoleColor(event.target.value)}
                                placeholder="#99aab5"
                                className="h-10 w-full rounded-md border border-zinc-700 bg-[#15161a] px-3 text-sm text-white outline-none focus:border-indigo-500"
                                disabled={!canManageRoles || isCreatingRole}
                              />
                            </div>

                            <div>
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Role Icon</p>
                              <p className="mb-2 text-[11px] text-zinc-500">Pick an icon file or paste an icon URL.</p>
                              <div className="flex items-center gap-2">
                                <input
                                  value={newRoleIconUrl}
                                  onChange={(event) => setNewRoleIconUrl(event.target.value)}
                                  placeholder="https://..."
                                  className="h-10 flex-1 rounded-md border border-zinc-700 bg-[#15161a] px-3 text-sm text-white outline-none focus:border-indigo-500"
                                  disabled={!canManageRoles || isCreatingRole || isUploadingNewRoleIcon}
                                />
                                <Button
                                  type="button"
                                  onClick={onPickNewRoleIcon}
                                  disabled={!canManageRoles || isCreatingRole || isUploadingNewRoleIcon}
                                  className="h-10 bg-[#4e5058] px-3 text-xs text-white hover:bg-[#5d6069]"
                                >
                                  {isUploadingNewRoleIcon ? "Uploading..." : "Pick Icon"}
                                </Button>
                              </div>
                              <input
                                ref={newRoleIconInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(event) => void onNewRoleIconChange(event.target.files?.[0])}
                              />

                              <div className="mt-2">
                                {newRoleIconUrl ? (
                                  <span className="relative inline-flex h-10 w-10 overflow-hidden rounded-md border border-zinc-700">
                                    <Image src={newRoleIconUrl} alt="New role icon preview" fill className="object-cover" unoptimized />
                                  </span>
                                ) : (
                                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-700 bg-[#1e1f22] text-lg font-semibold uppercase text-zinc-300">
                                    {newRoleName.slice(0, 1) || "R"}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              onClick={() => setIsCreateRolePopupOpen(false)}
                              className="bg-transparent text-zinc-300 hover:bg-white/10"
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              onClick={onCreateRole}
                              disabled={!canManageRoles || isCreatingRole}
                              className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
                            >
                              {isCreatingRole ? "Creating..." : "Create Role"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {activeSection === "roles" && isRoleEditorPopupOpen && selectedRole ? (
                      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
                        <div className="w-full max-w-[560px] rounded-xl border border-zinc-700 bg-[#2B2D31] p-4 shadow-2xl shadow-black/60">
                          <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-semibold text-white">Role Editor</p>
                            <button
                              type="button"
                              onClick={() => setIsRoleEditorPopupOpen(false)}
                              className="rounded p-1 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                              aria-label="Close role editor popup"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Role Name</p>
                              <input
                                value={editRoleName}
                                onChange={(event) => setEditRoleName(event.target.value)}
                                className="h-10 w-full rounded-md border border-zinc-700 bg-[#1e1f22] px-3 text-sm text-white outline-none focus:border-indigo-500"
                                disabled={!canManageRoles || isSavingRole}
                              />
                            </div>

                            <div>
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Role Color</p>
                              <div className="flex items-center gap-2">
                                <input
                                  value={editRoleColor}
                                  onChange={(event) => setEditRoleColor(event.target.value)}
                                  className="h-10 flex-1 rounded-md border border-zinc-700 bg-[#1e1f22] px-3 text-sm text-white outline-none focus:border-indigo-500"
                                  disabled={!canManageRoles || isSavingRole || isUploadingEditRoleIcon}
                                />
                                <span
                                  className="inline-flex h-8 w-8 rounded-full border border-zinc-700"
                                  style={{ backgroundColor: editRoleColor || "#99aab5" }}
                                />
                              </div>
                            </div>

                            <div>
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Role Icon</p>
                              <p className="mb-2 text-[11px] text-zinc-500">Pick an icon file or paste an icon URL.</p>
                              <div className="flex items-center gap-2">
                                <input
                                  value={editRoleIconUrl}
                                  onChange={(event) => setEditRoleIconUrl(event.target.value)}
                                  placeholder="https://..."
                                  className="h-10 flex-1 rounded-md border border-zinc-700 bg-[#1e1f22] px-3 text-sm text-white outline-none focus:border-indigo-500"
                                  disabled={!canManageRoles || isSavingRole || isUploadingEditRoleIcon}
                                />
                                <Button
                                  type="button"
                                  onClick={onPickEditRoleIcon}
                                  disabled={!canManageRoles || isSavingRole || isUploadingEditRoleIcon}
                                  className="h-10 bg-[#4e5058] px-3 text-xs text-white hover:bg-[#5d6069]"
                                >
                                  {isUploadingEditRoleIcon ? "Uploading..." : "Pick Icon"}
                                </Button>
                                <Button
                                  type="button"
                                  onClick={() => setEditRoleIconUrl("")}
                                  disabled={!canManageRoles || isSavingRole || isUploadingEditRoleIcon}
                                  className="h-10 bg-transparent px-3 text-xs text-zinc-300 hover:bg-white/10"
                                >
                                  Remove
                                </Button>
                              </div>

                              <input
                                ref={editRoleIconInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(event) => void onEditRoleIconChange(event.target.files?.[0])}
                              />

                              <div className="mt-2">
                                {editRoleIconUrl ? (
                                  <span className="relative inline-flex h-10 w-10 overflow-hidden rounded-md border border-zinc-700">
                                    <Image src={editRoleIconUrl} alt="Role icon preview" fill className="object-cover" unoptimized />
                                  </span>
                                ) : (
                                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-700 bg-[#1e1f22] text-lg font-semibold uppercase text-zinc-300">
                                    {editRoleName.slice(0, 1) || "R"}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div>
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Members with this role</p>
                              <div className="max-h-[220px] space-y-1 overflow-y-auto overflow-x-hidden rounded-md border border-zinc-700 bg-[#1e1f22] p-2">
                                {isLoadingRoleMembers ? (
                                  <div className="flex items-center gap-2 px-2 py-2 text-xs text-zinc-300">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Loading members...
                                  </div>
                                ) : assignedRoleMembers.length === 0 ? (
                                  <p className="px-2 py-2 text-xs text-zinc-400">No users currently have this role.</p>
                                ) : (
                                  assignedRoleMembers.map((memberItem) => (
                                    <div key={memberItem.memberId} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-black/20">
                                      <UserAvatar src={memberItem.imageUrl ?? undefined} className="h-7 w-7" />
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-medium text-white">
                                          <ProfileNameWithServerTag
                                            name={memberItem.displayName}
                                            profileId={memberItem.profileId}
                                            memberId={memberItem.memberId}
                                          />
                                        </p>
                                        <p className="truncate text-[11px] text-zinc-400">{memberItem.email || memberItem.profileId}</p>
                                      </div>
                                      <Button
                                        type="button"
                                        onClick={() => void onToggleRoleMember(memberItem)}
                                        disabled={!canManageRoleMembers || togglingMemberId === memberItem.memberId}
                                        className="h-7 bg-rose-600/80 px-2 text-[11px] text-white hover:bg-rose-600"
                                      >
                                        {togglingMemberId === memberItem.memberId ? "..." : "Remove"}
                                      </Button>
                                    </div>
                                  ))
                                )}
                              </div>

                              {!canManageRoleMembers ? (
                                <p className="mt-2 text-[11px] text-amber-300">Only the server owner can change role members.</p>
                              ) : null}

                              {roleMembersError ? (
                                <p className="mt-2 text-[11px] text-rose-300">{roleMembersError}</p>
                              ) : null}
                            </div>

                            <div>
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Add members to this role</p>
                              <input
                                value={addMemberSearch}
                                onChange={(event) => setAddMemberSearch(event.target.value)}
                                placeholder="Search users by name, email, or ID"
                                className="h-9 w-full rounded-md border border-zinc-700 bg-[#1e1f22] px-3 text-xs text-white outline-none focus:border-indigo-500"
                                disabled={!canManageRoleMembers || isLoadingRoleMembers}
                              />

                              <div className="mt-2 max-h-[180px] space-y-1 overflow-y-auto overflow-x-hidden rounded-md border border-zinc-700 bg-[#1e1f22] p-2">
                                {isLoadingRoleMembers ? (
                                  <div className="flex items-center gap-2 px-2 py-2 text-xs text-zinc-300">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Loading users...
                                  </div>
                                ) : addableRoleMembers.length === 0 ? (
                                  <p className="px-2 py-2 text-xs text-zinc-400">
                                    {normalizedAddMemberSearch
                                      ? "No users match your search."
                                      : "Type in search to find users."}
                                  </p>
                                ) : (
                                  addableRoleMembers.map((memberItem) => (
                                    <div key={`add-${memberItem.memberId}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-black/20">
                                      <UserAvatar src={memberItem.imageUrl ?? undefined} className="h-7 w-7" />
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-medium text-white">
                                          <ProfileNameWithServerTag
                                            name={memberItem.displayName}
                                            profileId={memberItem.profileId}
                                            memberId={memberItem.memberId}
                                          />
                                        </p>
                                        <p className="truncate text-[11px] text-zinc-400">{memberItem.email || memberItem.profileId}</p>
                                      </div>
                                      <Button
                                        type="button"
                                        onClick={() => void onToggleRoleMember(memberItem)}
                                        disabled={!canManageRoleMembers || togglingMemberId === memberItem.memberId}
                                        className="h-7 bg-emerald-600/80 px-2 text-[11px] text-white hover:bg-emerald-600"
                                      >
                                        {togglingMemberId === memberItem.memberId ? "..." : "Add"}
                                      </Button>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              onClick={() => setIsRoleEditorPopupOpen(false)}
                              className="bg-transparent text-zinc-300 hover:bg-white/10"
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              onClick={onSaveRole}
                              disabled={!canManageRoles || isSavingRole}
                              className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
                            >
                              {isSavingRole ? "Saving..." : "Save Role"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {activeSection === "members" ? (
                      <div className="space-y-4">
                        <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Total members</p>
                          <p className="mt-1 text-2xl font-semibold text-zinc-100">{membersPanelItems.length}</p>
                        </div>

                        {membersPanelError ? (
                          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                            {membersPanelError}
                          </p>
                        ) : null}

                        <div className="max-h-[420px] space-y-2 overflow-y-auto overflow-x-hidden pr-1">
                          {isLoadingMembersPanel ? (
                            <div className="flex items-center gap-2 rounded-md border border-zinc-700 bg-[#2B2D31] px-3 py-2 text-sm text-zinc-300">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading members...
                            </div>
                          ) : membersPanelItems.length === 0 ? (
                            <p className="rounded-md border border-zinc-700 bg-[#2B2D31] px-3 py-2 text-xs text-zinc-400">
                              No members found for this server.
                            </p>
                          ) : (
                            membersPanelItems.map((memberItem) => (
                              <div key={memberItem.id} className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-[#2B2D31] px-3 py-2">
                                <UserAvatar src={memberItem.profile.imageUrl ?? undefined} className="h-9 w-9" />

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-zinc-100">
                                    <ProfileNameWithServerTag
                                      name={memberItem.profile.name}
                                      profileId={memberItem.profileId}
                                      memberId={memberItem.id}
                                    />
                                  </p>
                                  <p className="truncate text-xs text-zinc-400">
                                    {memberItem.profile.email || memberItem.profileId}
                                  </p>
                                </div>

                                <span className="rounded bg-black/25 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-200">
                                  {memberItem.role}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ) : activeSection === "invites" ? (
                      <div className="space-y-4">
                        <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Total invites</p>
                          <p className="mt-1 text-2xl font-semibold text-zinc-100">{invitePanelItems.length}</p>
                        </div>

                        {invitePanelError ? (
                          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                            {invitePanelError}
                          </p>
                        ) : null}

                        {invitePanelSuccess ? (
                          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                            {invitePanelSuccess}
                          </p>
                        ) : null}

                        <div className="max-h-[420px] space-y-2 overflow-y-auto overflow-x-hidden pr-1">
                          {isLoadingInvitePanel ? (
                            <div className="flex items-center gap-2 rounded-md border border-zinc-700 bg-[#2B2D31] px-3 py-2 text-sm text-zinc-300">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading invites...
                            </div>
                          ) : invitePanelItems.length === 0 ? (
                            <p className="rounded-md border border-zinc-700 bg-[#2B2D31] px-3 py-2 text-xs text-zinc-400">
                              No invite history found for this server.
                            </p>
                          ) : (
                            invitePanelItems.map((inviteItem) => (
                              <div key={`${inviteItem.code}-${inviteItem.createdAt}`} className="flex items-start gap-3 rounded-lg border border-zinc-700 bg-[#2B2D31] px-3 py-2">
                                <UserAvatar src={inviteItem.createdByImageUrl || "/in-accord-steampunk-logo.png"} className="h-9 w-9" />

                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-mono text-sm text-zinc-100">{inviteItem.code}</p>
                                  <p className="mt-1 text-xs text-zinc-400">
                                    {inviteItem.source === "regenerated" ? "Regenerated" : "Created"}
                                    {" • "}
                                    {inviteItem.createdAt ? new Date(inviteItem.createdAt).toLocaleString() : "Unknown time"}
                                  </p>
                                  <p className="mt-1 text-xs text-zinc-400">
                                    Created by: {inviteItem.createdByName || inviteItem.createdByEmail || inviteItem.createdByProfileId || "Unknown"}
                                  </p>
                                  <p className="text-xs text-zinc-300">
                                    Uses: {inviteItem.usedCount ?? 0}
                                  </p>
                                </div>

                                <Button
                                  type="button"
                                  onClick={() => void onDeleteInvite(inviteItem.code)}
                                  disabled={invitePanelActionCode === inviteItem.code}
                                  className="h-8 shrink-0 bg-rose-600/80 px-2.5 text-xs text-white hover:bg-rose-600"
                                >
                                  {invitePanelActionCode === inviteItem.code ? "..." : "Delete"}
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ) : activeSection === "integrations" ? (
                      <div className="space-y-4">
                        <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Bots in server</p>
                          <p className="mt-1 text-2xl font-semibold text-zinc-100">{integrationBots.length}</p>
                        </div>

                        {integrationBotsError ? (
                          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                            {integrationBotsError}
                          </p>
                        ) : null}

                        {integrationBotsSuccess ? (
                          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                            {integrationBotsSuccess}
                          </p>
                        ) : null}

                        <div className="max-h-[420px] space-y-2 overflow-y-auto overflow-x-hidden pr-1">
                          {isLoadingIntegrationBots ? (
                            <div className="flex items-center gap-2 rounded-md border border-zinc-700 bg-[#2B2D31] px-3 py-2 text-sm text-zinc-300">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading integrations bots...
                            </div>
                          ) : integrationBots.length === 0 ? (
                            <p className="rounded-md border border-zinc-700 bg-[#2B2D31] px-3 py-2 text-xs text-zinc-400">
                              No bots found in this server.
                            </p>
                          ) : (
                            integrationBots.map((botItem) => (
                              <div key={botItem.id} className="flex items-start gap-3 rounded-lg border border-zinc-700 bg-[#2B2D31] px-3 py-2">
                                <UserAvatar src={botItem.profile.imageUrl || "/in-accord-steampunk-logo.png"} className="h-9 w-9" />

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-zinc-100">
                                    <ProfileNameWithServerTag
                                      name={botItem.profile.name}
                                      profileId={botItem.profileId}
                                      memberId={botItem.id}
                                    />
                                  </p>
                                  <p className="truncate text-xs text-zinc-400">
                                    {botItem.profile.email || botItem.profileId}
                                  </p>
                                  <p className="mt-1 text-xs text-zinc-300">
                                    Status: {botItem.isBanned ? "Banned" : botItem.isBooted ? "Booted" : "Active"}
                                  </p>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                  <Button
                                    type="button"
                                    onClick={() => void onIntegrationBotAction(botItem, botItem.isBooted ? "UNBOOT" : "BOOT")}
                                    disabled={integrationBotActionMemberId === botItem.id || botItem.isBanned}
                                    className="h-8 bg-[#4e5058] px-2.5 text-xs text-white hover:bg-[#5d6069]"
                                  >
                                    {integrationBotActionMemberId === botItem.id ? "..." : botItem.isBooted ? "Unboot" : "Boot"}
                                  </Button>

                                  <Button
                                    type="button"
                                    onClick={() => void onIntegrationBotAction(botItem, botItem.isBanned ? "UNBAN" : "BAN")}
                                    disabled={integrationBotActionMemberId === botItem.id}
                                    className="h-8 bg-amber-600/80 px-2.5 text-xs text-white hover:bg-amber-600"
                                  >
                                    {integrationBotActionMemberId === botItem.id ? "..." : botItem.isBanned ? "Unban" : "Ban"}
                                  </Button>

                                  <Button
                                    type="button"
                                    onClick={() => void onIntegrationBotAction(botItem, "KICK")}
                                    disabled={integrationBotActionMemberId === botItem.id}
                                    className="h-8 bg-rose-600/80 px-2.5 text-xs text-white hover:bg-rose-600"
                                  >
                                    {integrationBotActionMemberId === botItem.id ? "..." : "Kick"}
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ) : activeSection === "onboarding" ? (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Status</p>
                            <p className="mt-1 text-lg font-semibold text-zinc-100">
                              {onboardingConfig.enabled ? "Enabled" : "Disabled"}
                            </p>
                          </div>
                          <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Checklist channels</p>
                            <p className="mt-1 text-2xl font-semibold text-zinc-100">{onboardingConfig.checklistChannelIds.length}</p>
                          </div>
                          <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Prompts</p>
                            <p className="mt-1 text-2xl font-semibold text-zinc-100">{onboardingConfig.prompts.length}</p>
                          </div>
                        </div>

                        <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-4 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-300">Onboarding screen banner</p>
                            <span className="rounded bg-black/25 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-300">
                              {onboardingPreviewLabel}
                            </span>
                          </div>

                          <div className="relative h-28 w-full overflow-hidden rounded-md border border-zinc-700 bg-[#1e1f22]">
                            {onboardingConfig.bannerUrl ? (
                              <Image
                                fill
                                src={onboardingConfig.bannerUrl}
                                alt="Onboarding screen banner preview"
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="absolute inset-0" style={{ background: onboardingSelectedPreset.value }} />
                            )}
                            <div className="absolute inset-0 bg-black/30" />
                            <div className="absolute inset-0 flex items-end p-3 text-xs text-zinc-100">
                              Preview: onboarding background
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {ONBOARDING_BANNER_PRESETS.map((presetItem) => {
                              const isActivePreset = onboardingConfig.bannerPreset === presetItem.key && !onboardingConfig.bannerUrl;
                              return (
                                <button
                                  key={presetItem.key}
                                  type="button"
                                  onClick={() =>
                                    setOnboardingConfig((previous) => ({
                                      ...previous,
                                      bannerPreset: presetItem.key,
                                      bannerUrl: "",
                                    }))
                                  }
                                  disabled={!canManageOnboarding || isLoadingOnboarding || isSavingOnboarding || isUploadingOnboardingBanner}
                                  className={cn(
                                    "rounded-md border px-2.5 py-1.5 text-xs transition",
                                    isActivePreset
                                      ? "border-indigo-400 bg-indigo-500/20 text-indigo-100"
                                      : "border-zinc-700 bg-[#1e1f22] text-zinc-300 hover:bg-[#2a2c31]"
                                  )}
                                >
                                  {presetItem.label}
                                </button>
                              );
                            })}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              onClick={onPickOnboardingBanner}
                              disabled={!canManageOnboarding || isLoadingOnboarding || isSavingOnboarding || isUploadingOnboardingBanner}
                              className="h-8 bg-[#4e5058] px-2.5 text-xs text-white hover:bg-[#5d6069]"
                            >
                              {isUploadingOnboardingBanner ? "Uploading..." : "Upload Custom Banner"}
                            </Button>

                            {onboardingConfig.bannerUrl ? (
                              <Button
                                type="button"
                                onClick={() =>
                                  setOnboardingConfig((previous) => ({
                                    ...previous,
                                    bannerUrl: "",
                                  }))
                                }
                                disabled={!canManageOnboarding || isLoadingOnboarding || isSavingOnboarding || isUploadingOnboardingBanner}
                                className="h-8 bg-transparent px-2.5 text-xs text-zinc-300 hover:bg-white/10"
                              >
                                Use Preset Instead
                              </Button>
                            ) : null}
                          </div>

                          <input
                            ref={onboardingBannerInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => void onOnboardingBannerChange(event.target.files?.[0])}
                          />
                        </div>

                        <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-4 space-y-4">
                          <div className="flex items-center justify-between rounded-md border border-zinc-700 bg-[#1e1f22] px-3 py-2">
                            <div>
                              <p className="text-sm font-medium text-zinc-100">Enable onboarding flow</p>
                              <p className="text-xs text-zinc-400">Require new members to review prompts and curated channels.</p>
                            </div>
                            <button
                              type="button"
                              disabled={!canManageOnboarding || isLoadingOnboarding || isSavingOnboarding}
                              onClick={() =>
                                setOnboardingConfig((previous) => ({
                                  ...previous,
                                  enabled: !previous.enabled,
                                }))
                              }
                              className={cn(
                                "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                                onboardingConfig.enabled
                                  ? "bg-emerald-600/80 text-white hover:bg-emerald-600"
                                  : "bg-zinc-600/60 text-zinc-100 hover:bg-zinc-600"
                              )}
                            >
                              {onboardingConfig.enabled ? "Enabled" : "Disabled"}
                            </button>
                          </div>

                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Welcome message</p>
                            <textarea
                              value={onboardingConfig.welcomeMessage}
                              onChange={(event) =>
                                setOnboardingConfig((previous) => ({
                                  ...previous,
                                  welcomeMessage: event.target.value,
                                }))
                              }
                              rows={3}
                              maxLength={500}
                              disabled={!canManageOnboarding || isLoadingOnboarding || isSavingOnboarding}
                              className="w-full rounded-md border border-zinc-700 bg-[#15161a] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                              placeholder="Welcome to the server!"
                            />
                          </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-300">Checklist channels (new member to-do)</p>
                            <div className="max-h-[220px] space-y-1 overflow-y-auto overflow-x-hidden pr-1">
                              {onboardingTextChannels.length === 0 ? (
                                <p className="text-xs text-zinc-400">No text channels found.</p>
                              ) : (
                                onboardingTextChannels.map((channelItem) => {
                                  const isChecked = onboardingConfig.checklistChannelIds.includes(channelItem.id);
                                  return (
                                    <label key={`checklist-${channelItem.id}`} className="flex cursor-pointer items-center justify-between rounded-md border border-zinc-700 bg-[#1e1f22] px-3 py-2 text-sm text-zinc-200">
                                      <span className="truncate">#{channelItem.name}</span>
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={!canManageOnboarding || isLoadingOnboarding || isSavingOnboarding}
                                        onChange={() => onToggleOnboardingChannel(channelItem.id, "checklist")}
                                      />
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          </div>

                          <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-300">Resource channels (recommended browse)</p>
                            <div className="max-h-[220px] space-y-1 overflow-y-auto overflow-x-hidden pr-1">
                              {onboardingTextChannels.length === 0 ? (
                                <p className="text-xs text-zinc-400">No text channels found.</p>
                              ) : (
                                onboardingTextChannels.map((channelItem) => {
                                  const isChecked = onboardingConfig.resourceChannelIds.includes(channelItem.id);
                                  return (
                                    <label key={`resource-${channelItem.id}`} className="flex cursor-pointer items-center justify-between rounded-md border border-zinc-700 bg-[#1e1f22] px-3 py-2 text-sm text-zinc-200">
                                      <span className="truncate">#{channelItem.name}</span>
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={!canManageOnboarding || isLoadingOnboarding || isSavingOnboarding}
                                        onChange={() => onToggleOnboardingChannel(channelItem.id, "resource")}
                                      />
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-300">Onboarding prompts</p>
                            <Button
                              type="button"
                              onClick={onAddOnboardingPrompt}
                              disabled={!canManageOnboarding || isLoadingOnboarding || isSavingOnboarding}
                              className="h-8 bg-[#4e5058] px-2.5 text-xs text-white hover:bg-[#5d6069]"
                            >
                              Add Prompt
                            </Button>
                          </div>

                          <div className="max-h-[280px] space-y-2 overflow-y-auto overflow-x-hidden pr-1">
                            {onboardingConfig.prompts.length === 0 ? (
                              <p className="text-xs text-zinc-400">No prompts yet. Add one to guide new members through onboarding.</p>
                            ) : (
                              onboardingConfig.prompts.map((promptItem, promptIndex) => (
                                <div key={promptItem.id} className="space-y-2 rounded-md border border-zinc-700 bg-[#1e1f22] p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-semibold text-zinc-300">Prompt {promptIndex + 1}</p>
                                    <Button
                                      type="button"
                                      onClick={() => onRemoveOnboardingPrompt(promptItem.id)}
                                      disabled={!canManageOnboarding || isLoadingOnboarding || isSavingOnboarding}
                                      className="h-7 bg-rose-600/80 px-2 text-[11px] text-white hover:bg-rose-600"
                                    >
                                      Remove
                                    </Button>
                                  </div>

                                  <input
                                    value={promptItem.question}
                                    onChange={(event) => onUpdateOnboardingPrompt(promptItem.id, { question: event.target.value })}
                                    placeholder="What are you here for?"
                                    disabled={!canManageOnboarding || isLoadingOnboarding || isSavingOnboarding}
                                    className="h-9 w-full rounded-md border border-zinc-700 bg-[#15161a] px-3 text-xs text-zinc-100 outline-none focus:border-indigo-500"
                                  />

                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <label className="flex items-center gap-2 text-xs text-zinc-300">
                                      <input
                                        type="checkbox"
                                        checked={promptItem.required}
                                        onChange={(event) => onUpdateOnboardingPrompt(promptItem.id, { required: event.target.checked })}
                                        disabled={!canManageOnboarding || isLoadingOnboarding || isSavingOnboarding}
                                      />
                                      Required
                                    </label>
                                    <label className="flex items-center gap-2 text-xs text-zinc-300">
                                      <input
                                        type="checkbox"
                                        checked={promptItem.multiple}
                                        onChange={(event) => onUpdateOnboardingPrompt(promptItem.id, { multiple: event.target.checked })}
                                        disabled={!canManageOnboarding || isLoadingOnboarding || isSavingOnboarding}
                                      />
                                      Allow multiple options
                                    </label>
                                  </div>

                                  <div className="space-y-1">
                                    {(promptItem.options.length > 0 ? promptItem.options : [""]).map((optionItem, optionIndex) => (
                                      <div key={`${promptItem.id}-option-${optionIndex}`} className="flex items-center gap-2">
                                        <input
                                          value={optionItem}
                                          onChange={(event) => {
                                            const nextOptions = [...promptItem.options];
                                            if (nextOptions.length === 0) {
                                              nextOptions.push("");
                                            }
                                            nextOptions[optionIndex] = event.target.value;
                                            onUpdateOnboardingPrompt(promptItem.id, { options: nextOptions });
                                          }}
                                          placeholder={`Option ${optionIndex + 1}`}
                                          disabled={!canManageOnboarding || isLoadingOnboarding || isSavingOnboarding}
                                          className="h-8 flex-1 rounded-md border border-zinc-700 bg-[#15161a] px-2 text-xs text-zinc-100 outline-none focus:border-indigo-500"
                                        />
                                        <Button
                                          type="button"
                                          onClick={() => {
                                            const nextOptions = promptItem.options.filter((_, idx) => idx !== optionIndex);
                                            onUpdateOnboardingPrompt(promptItem.id, { options: nextOptions });
                                          }}
                                          disabled={!canManageOnboarding || isLoadingOnboarding || isSavingOnboarding}
                                          className="h-8 bg-transparent px-2 text-[11px] text-zinc-300 hover:bg-white/10"
                                        >
                                          Remove
                                        </Button>
                                      </div>
                                    ))}

                                    <Button
                                      type="button"
                                      onClick={() => onUpdateOnboardingPrompt(promptItem.id, { options: [...promptItem.options, ""] })}
                                      disabled={!canManageOnboarding || isLoadingOnboarding || isSavingOnboarding}
                                      className="h-7 bg-[#4e5058] px-2 text-[11px] text-white hover:bg-[#5d6069]"
                                    >
                                      Add Option
                                    </Button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {!canManageOnboarding ? (
                          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                            Only the server owner can change onboarding settings.
                          </p>
                        ) : null}

                        {onboardingError ? (
                          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                            {onboardingError}
                          </p>
                        ) : null}

                        {onboardingSuccess ? (
                          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                            {onboardingSuccess}
                          </p>
                        ) : null}

                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            className="bg-transparent text-zinc-300 hover:bg-white/10"
                            onClick={() => void loadOnboardingConfig()}
                            disabled={isLoadingOnboarding || isSavingOnboarding}
                          >
                            Reset
                          </Button>
                          <Button
                            type="button"
                            className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
                            disabled={!canManageOnboarding || isLoadingOnboarding || isSavingOnboarding}
                            onClick={() => void onSaveOnboarding()}
                          >
                            {isSavingOnboarding ? "Saving..." : "Save Onboarding"}
                          </Button>
                        </div>
                      </div>
                    ) : activeSection === "serverGuide" ? (
                      <div className="space-y-4">
                        <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-4">
                          <p className="text-sm text-zinc-100">
                            Server Guide explains every settings component in this menu and how to use it effectively.
                          </p>
                          <p className="mt-2 text-xs text-zinc-400">
                            Tip: Start with Overview, Roles, Members, and Invites; then configure Moderation and Integrations.
                          </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Total components</p>
                            <p className="mt-1 text-2xl font-semibold text-zinc-100">{SERVER_GUIDE_ENTRIES.length}</p>
                          </div>
                          <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Visible</p>
                            <p className="mt-1 text-2xl font-semibold text-zinc-100">{filteredServerGuideEntries.length}</p>
                          </div>
                          <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Groups</p>
                            <p className="mt-1 text-2xl font-semibold text-zinc-100">{Object.keys(groupedServerGuideEntries).length}</p>
                          </div>
                        </div>

                        <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Search guide</p>
                          <input
                            value={serverGuideQuery}
                            onChange={(event) => setServerGuideQuery(event.target.value)}
                            placeholder="Search by component, group, or how-to details"
                            className="h-10 w-full rounded-md border border-zinc-700 bg-[#15161a] px-3 text-sm text-white outline-none focus:border-indigo-500"
                          />
                        </div>

                        <div
                          ref={serverGuideListRef}
                          onScroll={(event) => setServerGuideScrollTop(event.currentTarget.scrollTop)}
                          className="max-h-[460px] overflow-y-auto overflow-x-hidden pr-1"
                        >
                          {filteredServerGuideEntries.length === 0 ? (
                            <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3 text-xs text-zinc-400">
                              No guide entries match your search.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {serverGuideTopSpacerHeight > 0 ? (
                                <div style={{ height: `${serverGuideTopSpacerHeight}px` }} aria-hidden="true" />
                              ) : null}

                              {visibleServerGuideEntries.map((entry) => (
                                <div key={`${entry.heading}-${entry.key}`} className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
                                  <div className="mb-1 flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-zinc-100">{entry.label}</p>
                                    <span className="rounded bg-black/25 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-300">
                                      {entry.heading}
                                    </span>
                                  </div>
                                  <p className="text-xs text-zinc-400">
                                    {GENERIC_SECTION_DESCRIPTIONS[entry.key] ??
                                      `Configure and review ${SECTION_TITLES[entry.key].toLowerCase()} settings.`}
                                  </p>
                                  <p className="mt-1 text-xs text-zinc-300">
                                    How to use: {SERVER_GUIDE_USAGE[entry.key] ??
                                      `Open ${entry.label}, adjust options, and save your changes.`}
                                  </p>
                                </div>
                              ))}

                              {serverGuideBottomSpacerHeight > 0 ? (
                                <div style={{ height: `${serverGuideBottomSpacerHeight}px` }} aria-hidden="true" />
                              ) : null}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : activeSection === "deleteServer" ? (
                      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
                        <p className="text-sm text-zinc-200">
                          Deleting this server removes channels, groups, and messages associated with it.
                        </p>
                        <Button
                          type="button"
                          variant="destructive"
                          className="mt-4"
                          onClick={() => {
                            if (server) {
                              onOpen("deleteServer", { server });
                            }
                          }}
                        >
                          Continue to Delete Server
                        </Button>
                      </div>
                    ) : activeSection === "soundboard" ? (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Total</p>
                            <p className="mt-1 text-2xl font-semibold text-zinc-100">{soundEfxSummary?.total ?? 0}</p>
                          </div>
                          <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Active</p>
                            <p className="mt-1 text-2xl font-semibold text-emerald-300">{soundEfxSummary?.active ?? 0}</p>
                          </div>
                        </div>

                        <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-4">
                          <div className="grid gap-2 md:grid-cols-[1fr_1fr_160px_auto]">
                            <input
                              value={newSoundEfxName}
                              onChange={(event) => setNewSoundEfxName(event.target.value)}
                              placeholder="sound_name"
                              disabled={!canManageSoundEfx || creatingSoundEfx}
                              className="h-10 rounded-md border border-zinc-700 bg-[#15161a] px-3 text-sm text-white outline-none focus:border-indigo-500"
                            />

                            <input
                              value={newSoundEfxUrl}
                              onChange={(event) => setNewSoundEfxUrl(event.target.value)}
                              placeholder="https://... or /uploads/..."
                              disabled={!canManageSoundEfx || creatingSoundEfx}
                              className="h-10 rounded-md border border-zinc-700 bg-[#15161a] px-3 text-sm text-white outline-none focus:border-indigo-500"
                            />

                            <select
                              value={soundEfxStatusFilter}
                              onChange={(event) =>
                                setSoundEfxStatusFilter(event.target.value as "ALL" | "ACTIVE" | "DISABLED")
                              }
                              className="h-10 rounded-md border border-zinc-700 bg-[#15161a] px-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                            >
                              <option value="ALL">All statuses</option>
                              <option value="ACTIVE">Active</option>
                              <option value="DISABLED">Disabled</option>
                            </select>

                            <Button
                              type="button"
                              onClick={() => void onCreateSoundEfx()}
                              disabled={!canManageSoundEfx || creatingSoundEfx}
                              className="h-10 bg-[#5865f2] text-white hover:bg-[#4752c4]"
                            >
                              {creatingSoundEfx ? "Saving..." : "Save Sound EFX"}
                            </Button>
                          </div>

                          {!canManageSoundEfx ? (
                            <p className="mt-2 text-xs text-amber-300">Only the server owner can manage sound EFX.</p>
                          ) : null}

                          {soundEfxError ? (
                            <p className="mt-2 text-xs text-rose-300">{soundEfxError}</p>
                          ) : null}

                          {soundEfxActionSuccess ? (
                            <p className="mt-2 text-xs text-emerald-300">{soundEfxActionSuccess}</p>
                          ) : null}
                        </div>

                        <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-4">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-300">Default Sound EFX tiles</p>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {defaultSoundTiles.map((tile) => {
                              const isPlaying = playingSoundTileId === tile.id;
                              return (
                                <div key={tile.id} className="rounded-md border border-zinc-700 bg-[#1e1f22] p-3">
                                  <p className="truncate text-sm font-semibold text-zinc-100">{tile.name}</p>
                                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-black/25">
                                    <div
                                      className="h-full bg-indigo-400 transition-all duration-100"
                                      style={{ width: `${isPlaying ? playingSoundProgressPercent : 0}%` }}
                                    />
                                  </div>
                                  <div className="mt-2 flex items-center gap-2">
                                    <Button
                                      type="button"
                                      onClick={() => void onPlaySoundTile(tile.id, tile.audioUrl)}
                                      className="h-8 bg-[#4e5058] px-2 text-xs text-white hover:bg-[#5d6069]"
                                    >
                                      {isPlaying ? <Pause className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                                      {isPlaying ? "Stop" : "Play"}
                                    </Button>
                                    <Button
                                      type="button"
                                      onClick={() => {
                                        setNewSoundEfxName((previous) => previous.trim() || tile.name.toLowerCase().replace(/\s+/g, "_"));
                                        setNewSoundEfxUrl(tile.audioUrl);
                                      }}
                                      disabled={!canManageSoundEfx || creatingSoundEfx}
                                      className="h-8 bg-indigo-600 px-2 text-xs text-white hover:bg-indigo-500"
                                    >
                                      Use Tile
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="max-h-[280px] overflow-y-auto overflow-x-hidden pr-1">
                          {isLoadingSoundEfx ? (
                            <div className="flex items-center gap-2 rounded-md border border-zinc-700 bg-[#2B2D31] px-3 py-2 text-sm text-zinc-300">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading sound EFX...
                            </div>
                          ) : soundEfxItems.length === 0 ? (
                            <p className="rounded-md border border-zinc-700 bg-[#2B2D31] px-3 py-2 text-xs text-zinc-400">
                              No sound effects found for this filter.
                            </p>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {soundEfxItems.map((item) => {
                                const tileId = `server-${item.id}`;
                                const isPlaying = playingSoundTileId === tileId;

                                return (
                                  <div
                                    key={item.id}
                                    className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3"
                                  >
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                      <p className="truncate text-sm font-semibold text-zinc-100">{item.name}</p>
                                      <span className="rounded bg-black/25 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-zinc-300">
                                        {item.isEnabled ? "Active" : "Disabled"}
                                      </span>
                                    </div>

                                    <p className="truncate text-xs text-zinc-400" title={item.audioUrl}>
                                      {item.audioUrl}
                                    </p>
                                    <p className="mt-1 truncate text-[11px] text-zinc-400">
                                      Updated {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "N/A"}
                                    </p>

                                    <div className="mt-2 h-1.5 overflow-hidden rounded bg-black/25">
                                      <div
                                        className="h-full bg-indigo-400 transition-all duration-100"
                                        style={{ width: `${isPlaying ? playingSoundProgressPercent : 0}%` }}
                                      />
                                    </div>

                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                      <Button
                                        type="button"
                                        onClick={() => void onPlaySoundTile(tileId, item.audioUrl)}
                                        className="h-8 bg-[#4e5058] px-2 text-xs text-white hover:bg-[#5d6069]"
                                      >
                                        {isPlaying ? <Pause className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                                        {isPlaying ? "Stop" : "Play"}
                                      </Button>

                                      <Button
                                        type="button"
                                        onClick={() =>
                                          void onSoundEfxAction(item.id, item.isEnabled ? "DISABLE" : "ENABLE")
                                        }
                                        disabled={!canManageSoundEfx || soundEfxActionItemId === item.id}
                                        className="h-8 bg-[#4e5058] px-2 text-xs text-white hover:bg-[#5d6069]"
                                      >
                                        {soundEfxActionItemId === item.id
                                          ? "..."
                                          : item.isEnabled
                                            ? "Disable"
                                            : "Enable"}
                                      </Button>

                                      <Button
                                        type="button"
                                        onClick={() => void onSoundEfxAction(item.id, "DELETE")}
                                        disabled={!canManageSoundEfx || soundEfxActionItemId === item.id}
                                        className="h-8 bg-rose-600/80 px-2 text-xs text-white hover:bg-rose-600"
                                      >
                                        Delete
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : activeEmojiStickerType ? (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Total</p>
                            <p className="mt-1 text-2xl font-semibold text-zinc-100">{emojiStickerSummary?.totalAssets ?? 0}</p>
                          </div>
                          <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Active</p>
                            <p className="mt-1 text-2xl font-semibold text-emerald-300">{emojiStickerSummary?.activeAssets ?? 0}</p>
                          </div>
                          <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                              {activeEmojiStickerType === "EMOJI" ? "Emoji" : "Stickers"}
                            </p>
                            <p className="mt-1 text-2xl font-semibold text-zinc-100">
                              {activeEmojiStickerType === "EMOJI"
                                ? emojiStickerSummary?.emojiAssets ?? 0
                                : emojiStickerSummary?.stickerAssets ?? 0}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-4">
                          <div className="grid gap-2 md:grid-cols-[1fr_1fr_160px_auto]">
                            <input
                              value={activeEmojiStickerType === "EMOJI" ? newEmojiName : newStickerName}
                              onChange={(event) =>
                                activeEmojiStickerType === "EMOJI"
                                  ? setNewEmojiName(event.target.value)
                                  : setNewStickerName(event.target.value)
                              }
                              placeholder={`${activeEmojiStickerType === "EMOJI" ? "emoji" : "sticker"}_name`}
                              disabled={!canManageEmojiStickers || creatingEmojiSticker}
                              className="h-10 rounded-md border border-zinc-700 bg-[#15161a] px-3 text-sm text-white outline-none focus:border-indigo-500"
                            />

                            <input
                              value={activeEmojiStickerType === "EMOJI" ? newEmojiValue : newStickerValue}
                              onChange={(event) =>
                                activeEmojiStickerType === "EMOJI"
                                  ? setNewEmojiValue(event.target.value)
                                  : setNewStickerValue(event.target.value)
                              }
                              placeholder={activeEmojiStickerType === "EMOJI" ? "😀" : "https://... or /uploads/..."}
                              disabled={!canManageEmojiStickers || creatingEmojiSticker}
                              className="h-10 rounded-md border border-zinc-700 bg-[#15161a] px-3 text-sm text-white outline-none focus:border-indigo-500"
                            />

                            <select
                              value={emojiStickerStatusFilter}
                              onChange={(event) =>
                                setEmojiStickerStatusFilter(event.target.value as "ALL" | "ACTIVE" | "DISABLED")
                              }
                              className="h-10 rounded-md border border-zinc-700 bg-[#15161a] px-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                            >
                              <option value="ALL">All statuses</option>
                              <option value="ACTIVE">Active</option>
                              <option value="DISABLED">Disabled</option>
                            </select>

                            <Button
                              type="button"
                              onClick={() => void onCreateEmojiSticker()}
                              disabled={!canManageEmojiStickers || creatingEmojiSticker}
                              className="h-10 bg-[#5865f2] text-white hover:bg-[#4752c4]"
                            >
                              {creatingEmojiSticker ? "Saving..." : `Save ${activeEmojiStickerType === "EMOJI" ? "Emoji" : "Sticker"}`}
                            </Button>
                          </div>

                          {activeEmojiStickerType === "EMOJI" ? (
                            <div className="mt-3 rounded-md border border-zinc-700 bg-[#1e1f22] p-3">
                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                                Default emoji tiles
                              </p>
                              <div className="grid grid-cols-10 gap-1.5">
                                {DEFAULT_EMOJI_TILES.map((emojiItem) => (
                                  <button
                                    key={emojiItem}
                                    type="button"
                                    onClick={() => setNewEmojiValue(emojiItem)}
                                    disabled={!canManageEmojiStickers || creatingEmojiSticker}
                                    className={cn(
                                      "flex h-8 w-8 items-center justify-center rounded border text-base transition",
                                      newEmojiValue === emojiItem
                                        ? "border-indigo-400 bg-indigo-500/20"
                                        : "border-zinc-700 bg-[#15161a] hover:bg-[#2a2c31]"
                                    )}
                                    title={`Use ${emojiItem}`}
                                    aria-label={`Use default emoji ${emojiItem}`}
                                  >
                                    {emojiItem}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {activeEmojiStickerType === "STICKER" ? (
                            <div className="mt-3 rounded-md border border-zinc-700 bg-[#1e1f22] p-3">
                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                                Default sticker tiles
                              </p>
                              <div className="grid grid-cols-4 gap-2">
                                {DEFAULT_STICKER_TILE_ITEMS.map((stickerItem) => {
                                  const isSelected = newStickerValue === stickerItem.imageUrl;
                                  return (
                                    <button
                                      key={stickerItem.name}
                                      type="button"
                                      onClick={() => {
                                        setNewStickerValue(stickerItem.imageUrl);
                                        setNewStickerName((previous) => previous.trim() || stickerItem.name);
                                      }}
                                      disabled={!canManageEmojiStickers || creatingEmojiSticker}
                                      className={cn(
                                        "relative h-16 overflow-hidden rounded-md border text-left transition",
                                        isSelected
                                          ? "border-indigo-400 ring-1 ring-indigo-500"
                                          : "border-zinc-700 hover:border-zinc-500"
                                      )}
                                      title={`Use ${stickerItem.name} sticker`}
                                      aria-label={`Use default sticker ${stickerItem.name}`}
                                    >
                                      <Image
                                        src={stickerItem.imageUrl}
                                        alt={`${stickerItem.name} sticker`}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                      />
                                      <span className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                        {stickerItem.name}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}

                          {!canManageEmojiStickers ? (
                            <p className="mt-2 text-xs text-amber-300">Only the server owner can manage emoji and stickers.</p>
                          ) : null}

                          {emojiStickersError ? (
                            <p className="mt-2 text-xs text-rose-300">{emojiStickersError}</p>
                          ) : null}

                          {emojiStickerActionSuccess ? (
                            <p className="mt-2 text-xs text-emerald-300">{emojiStickerActionSuccess}</p>
                          ) : null}
                        </div>

                        <div className="max-h-[280px] space-y-2 overflow-y-auto overflow-x-hidden pr-1">
                          {isLoadingEmojiStickers ? (
                            <div className="flex items-center gap-2 rounded-md border border-zinc-700 bg-[#2B2D31] px-3 py-2 text-sm text-zinc-300">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading {activeEmojiStickerType === "EMOJI" ? "emoji" : "stickers"}...
                            </div>
                          ) : emojiStickerAssets.length === 0 ? (
                            <p className="rounded-md border border-zinc-700 bg-[#2B2D31] px-3 py-2 text-xs text-zinc-400">
                              No {activeEmojiStickerType === "EMOJI" ? "emoji" : "stickers"} found for this filter.
                            </p>
                          ) : (
                            emojiStickerAssets.map((asset) => (
                              <div
                                key={asset.id}
                                className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-[#2B2D31] px-3 py-2"
                              >
                                <div className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-zinc-700 bg-[#15161a] text-xl">
                                  {asset.assetType === "EMOJI" ? (
                                    <span>{asset.emoji || "😀"}</span>
                                  ) : asset.imageUrl ? (
                                    <Image
                                      src={asset.imageUrl}
                                      alt={asset.name}
                                      width={40}
                                      height={40}
                                      className="h-full w-full object-cover"
                                      unoptimized
                                    />
                                  ) : (
                                    <span className="text-xs text-zinc-400">N/A</span>
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-zinc-100">{asset.name}</p>
                                  <p className="truncate text-xs text-zinc-400">
                                    {asset.isEnabled ? "Active" : "Disabled"} • Updated {asset.updatedAt ? new Date(asset.updatedAt).toLocaleString() : "N/A"}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    onClick={() =>
                                      void onEmojiStickerAction(asset.id, asset.isEnabled ? "DISABLE" : "ENABLE")
                                    }
                                    disabled={!canManageEmojiStickers || emojiStickerActionItemId === asset.id}
                                    className="h-8 bg-[#4e5058] px-2.5 text-xs text-white hover:bg-[#5d6069]"
                                  >
                                    {emojiStickerActionItemId === asset.id
                                      ? "..."
                                      : asset.isEnabled
                                        ? "Disable"
                                        : "Enable"}
                                  </Button>

                                  <Button
                                    type="button"
                                    onClick={() => void onEmojiStickerAction(asset.id, "DELETE")}
                                    disabled={!canManageEmojiStickers || emojiStickerActionItemId === asset.id}
                                    className="h-8 bg-rose-600/80 px-2.5 text-xs text-white hover:bg-rose-600"
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ) : !hasDedicatedSectionPanel ? (
                      <div className="space-y-4">
                        <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-4">
                          <p className="text-sm text-zinc-100">{activeSectionDescription}</p>
                          <p className="mt-1 text-xs text-zinc-400">
                            These controls are wired for this section and can be connected to server APIs as needed.
                          </p>
                        </div>

                        <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-4">
                          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-300">
                            {SECTION_TITLES[activeSection]} Settings
                          </p>

                          <div className="space-y-4">
                            <div className="flex items-center justify-between rounded-md border border-zinc-700 bg-[#1e1f22] px-3 py-2">
                              <div>
                                <p className="text-sm font-medium text-zinc-100">Section enabled</p>
                                <p className="text-xs text-zinc-400">Allow this feature set for your server.</p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setGenericSectionSettings((previous) => ({
                                    ...previous,
                                    [activeSection]: {
                                      ...previous[activeSection],
                                      enabled: !previous[activeSection].enabled,
                                    },
                                  }))
                                }
                                className={cn(
                                  "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                                  activeGenericSectionSettings?.enabled
                                    ? "bg-emerald-600/80 text-white hover:bg-emerald-600"
                                    : "bg-zinc-600/60 text-zinc-100 hover:bg-zinc-600"
                                )}
                              >
                                {activeGenericSectionSettings?.enabled ? "Enabled" : "Disabled"}
                              </button>
                            </div>

                            <div>
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                                Visibility Mode
                              </p>
                              <select
                                value={activeGenericSectionSettings?.visibility ?? "standard"}
                                onChange={(event) =>
                                  setGenericSectionSettings((previous) => ({
                                    ...previous,
                                    [activeSection]: {
                                      ...previous[activeSection],
                                      visibility: event.target.value as GenericSectionSettings["visibility"],
                                    },
                                  }))
                                }
                                className="h-10 w-full rounded-md border border-zinc-700 bg-[#15161a] px-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                              >
                                <option value="standard">Standard</option>
                                <option value="strict">Strict</option>
                                <option value="custom">Custom</option>
                              </select>
                            </div>

                            <div>
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                                Section Notes
                              </p>
                              <textarea
                                value={activeGenericSectionSettings?.notes ?? ""}
                                onChange={(event) =>
                                  setGenericSectionSettings((previous) => ({
                                    ...previous,
                                    [activeSection]: {
                                      ...previous[activeSection],
                                      notes: event.target.value,
                                    },
                                  }))
                                }
                                rows={4}
                                placeholder={`Add notes for ${SECTION_TITLES[activeSection]} settings...`}
                                className="w-full rounded-md border border-zinc-700 bg-[#15161a] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                              />
                            </div>

                            <div className="flex items-center justify-end gap-2">
                              <Button
                                type="button"
                                className="bg-transparent text-zinc-300 hover:bg-white/10"
                                onClick={() =>
                                  setGenericSectionSettings((previous) => ({
                                    ...previous,
                                    [activeSection]: {
                                      enabled: true,
                                      visibility: "standard",
                                      notes: "",
                                    },
                                  }))
                                }
                              >
                                Reset
                              </Button>
                              <Button type="button" className="bg-[#5865f2] text-white hover:bg-[#4752c4]" onClick={onSaveGenericSectionSettings}>
                                Save Section Settings
                              </Button>
                            </div>

                            {genericSectionSaveMessage ? (
                              <p className="text-xs text-emerald-300">{genericSectionSaveMessage}</p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                <>
                <div
                  key={activeSection}
                  className="settings-scrollbar theme-settings-content-body min-h-0 flex-1 overflow-y-scroll overflow-x-hidden space-y-7 px-8 py-6"
                  style={{ scrollbarGutter: "stable" }}
                >
                  <div className="grid gap-6 md:grid-cols-[120px_1fr] md:items-start">
                    <FormField
                      control={form.control}
                      name="imageUrl"
                      render={() => (
                        <FormItem>
                          <FormControl>
                            <div className="flex flex-col items-start gap-3">
                              {imageUrl ? (
                                <div className="group relative h-[96px] w-[96px]">
                                  <Image
                                    fill
                                    src={imageUrl}
                                    alt="Server icon"
                                    className="rounded-full object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={onPickImage}
                                    disabled={isUploadingImage || isLoading}
                                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100 disabled:cursor-not-allowed"
                                    aria-label="Change server icon"
                                  >
                                    <Camera className="h-5 w-5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => form.setValue("imageUrl", "", { shouldValidate: true, shouldDirty: true })}
                                    className="absolute right-0 top-0 rounded-full bg-rose-500 p-1 text-white shadow-sm"
                                    aria-label="Remove server icon"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={onPickImage}
                                  disabled={isUploadingImage || isLoading}
                                  className="group relative flex h-[96px] w-[96px] items-center justify-center rounded-full border-2 border-dashed border-zinc-500 bg-[#232428] transition hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-60"
                                  aria-label="Upload server icon"
                                >
                                  <Camera className="h-9 w-9 text-zinc-300" />
                                  <span className="absolute -bottom-1 -right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-white shadow-sm">
                                    <Plus className="h-4 w-4" />
                                  </span>
                                </button>
                              )}

                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(event) => onImageChange(event.target.files?.[0])}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-3">
                      <p className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-300">
                        Server icon
                      </p>
                      <p className="text-sm text-zinc-300">
                        Upload a square image for best results.
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={isUploadingImage || isLoading}
                        onClick={onPickImage}
                        className="bg-[#4E5058] text-white hover:bg-[#5D6069]"
                      >
                        {isUploadingImage ? "Uploading..." : imageUrl ? "Change icon" : "Upload icon"}
                      </Button>
                    </div>
                  </div>

                  {submitError ? (
                    <p className="text-sm font-medium text-rose-400">Save error: {submitError}</p>
                  ) : null}

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-300">
                          Server name
                        </FormLabel>
                        <FormControl>
                          <Input
                            disabled={isLoading}
                            className="h-11 border border-zinc-700 bg-[#1E1F22] text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:ring-offset-0"
                            placeholder="Enter server name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="bannerUrl"
                    render={() => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-300">
                          Server banner
                        </FormLabel>
                        <FormControl>
                          <div className="space-y-3">
                            <div className="relative h-24 w-full overflow-hidden rounded-md border border-zinc-700 bg-[#1E1F22]">
                              {bannerUrl ? (
                                <Image
                                  fill
                                  src={bannerUrl}
                                  alt="Server banner preview"
                                  className={bannerFit === "contain" ? "object-contain" : "object-cover"}
                                  style={
                                    bannerFit === "scale"
                                      ? { transform: `scale(${bannerScale})`, transformOrigin: "center" }
                                      : undefined
                                  }
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                                  No banner selected
                                </div>
                              )}
                            </div>

                            <div className="grid gap-2 md:grid-cols-2">
                              <div>
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                                  Fit mode
                                </p>
                                <select
                                  value={bannerFit}
                                  onChange={(event) =>
                                    form.setValue(
                                      "bannerFit",
                                      event.target.value as "cover" | "contain" | "scale",
                                      { shouldDirty: true }
                                    )
                                  }
                                  className="h-9 w-full rounded-md border border-zinc-700 bg-[#1E1F22] px-2 text-sm text-zinc-100"
                                  disabled={isLoading || isUploadingBanner}
                                >
                                  <option value="cover">Auto Fill</option>
                                  <option value="contain">Auto Fit</option>
                                  <option value="scale">Manual Scale</option>
                                </select>
                              </div>

                              <div>
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                                  Scale ({bannerScale.toFixed(2)}x)
                                </p>
                                <input
                                  type="range"
                                  min={0.25}
                                  max={2}
                                  step={0.05}
                                  value={bannerScale}
                                  onChange={(event) =>
                                    form.setValue("bannerScale", Number(event.target.value), {
                                      shouldDirty: true,
                                    })
                                  }
                                  className="w-full"
                                  disabled={bannerFit !== "scale" || isLoading || isUploadingBanner}
                                />
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={isUploadingBanner || isLoading}
                                onClick={onPickBanner}
                                className="bg-[#4E5058] text-white hover:bg-[#5D6069]"
                              >
                                {isUploadingBanner ? "Uploading..." : bannerUrl ? "Change banner" : "Upload banner"}
                              </Button>

                              {bannerUrl ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-zinc-300 hover:bg-white/10 hover:text-white"
                                  onClick={() => form.setValue("bannerUrl", "", { shouldDirty: true, shouldValidate: true })}
                                  disabled={isUploadingBanner || isLoading}
                                >
                                  Remove banner
                                </Button>
                              ) : null}
                            </div>

                            <input
                              ref={bannerInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(event) => onBannerChange(event.target.files?.[0])}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex items-center justify-between border-t border-black/20 bg-[#2B2D31] px-8 py-4">
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-zinc-300 hover:bg-white/10 hover:text-white"
                    onClick={handleClose}
                    disabled={isLoading || isUploadingImage || isUploadingBanner}
                  >
                    Cancel
                  </Button>
                  <Button variant="primary" disabled={isLoading || isUploadingImage || isUploadingBanner}>
                    {isLoading ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
                </>
                )}
              </section>

              <aside data-testid="server-settings-right-rail" className="theme-settings-right-rail settings-scrollbar order-2 flex h-full min-h-0 min-w-0 flex-col overflow-y-scroll rounded-r-3xl border-l border-black/20 bg-[#232428] p-4 pt-2 shadow-2xl shadow-black/40" style={{ scrollbarGutter: "stable" }}>
                <p className="truncate px-3 pb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">
                  RIGHT rail settings
                </p>

                <nav data-testid="server-settings-right-rail-nav" className="theme-settings-right-rail-nav settings-scrollbar min-h-0 flex-1 overflow-y-scroll overflow-x-hidden pr-1" aria-label="Server settings RIGHT rail menu">
                  <div className="flex min-w-0 flex-col space-y-4 pb-3">
                    {SETTINGS_SECTIONS.map((section) => (
                      <div key={section.heading ?? "base"} className="flex min-w-0 flex-col space-y-1">
                        {section.heading ? (
                          <p className="truncate px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-500">
                            {section.heading}
                          </p>
                        ) : null}
                        {section.items.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => setActiveSection(item.key)}
                            className={cn(
                              "w-full min-w-0 truncate overflow-hidden rounded-md px-3 py-2 text-left text-sm transition",
                              activeSection === item.key
                                ? "bg-[#404249] font-semibold text-white"
                                : item.key === "deleteServer"
                                  ? "text-rose-300 hover:bg-rose-500/10"
                                  : "text-zinc-300 hover:bg-[#36393f]"
                            )}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </nav>
              </aside>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
