"use client";

import * as z from "zod";
import axios from "axios";
import qs from "query-string";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Member, MemberRole, type Profile } from "@/lib/db/types";
import { Ban, Crown, Edit, FileIcon, Flag, MessageCircle, Reply, SmilePlus, Trash, UserPlus, Wrench } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { UserAvatar } from "@/components/user-avatar";
import { BotAppBadge } from "@/components/bot-app-badge";
import { NewUserCloverBadge } from "@/components/new-user-clover-badge";
import { ProfileNameWithServerTag } from "@/components/profile-name-with-server-tag";
import { ProfileIconRow } from "@/components/profile-icon-row";
import { ActionTooltip } from "@/components/action-tooltip";
import { ModeratorLineIcon } from "@/components/moderator-line-icon";
import { BotCommandsDialog } from "@/components/bot-commands-dialog";
import { cn } from "@/lib/utils";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BannerImage } from "@/components/ui/banner-image";
import { useModal } from "@/hooks/use-modal-store";
import { getInAccordStaffLabel, isInAccordAdministrator, isInAccordDeveloper, isInAccordModerator } from "@/lib/in-accord-admin";
import { isBotUser } from "@/lib/is-bot-user";
import { extractQuotedContent, getQuoteSnippetFromBody } from "@/lib/message-quotes";
import { parseMentionSegments } from "@/lib/mentions";
import { extractUrlsFromText, splitTextWithUrls } from "@/lib/link-previews";
import { resolveProfileIcons, type ProfileIcon } from "@/lib/profile-icons";
import { emitLocalChatMutationForRoute } from "@/lib/chat-live-events";
import { resolveBannerUrl } from "@/lib/asset-url";

interface ChatItemProps {
  id: string;
  content: string;
  member: Member & {
    profile: Profile;
  };
  timestamp: string;
  fileUrl: string | null;
  deleted: boolean;
  currentMember: Member;
  isUpdated: boolean;
  socketUrl: string;
  socketQuery: Record<string, string>;
  dmServerId?: string;
  reactionScope?: "channel" | "direct";
  initialReactions?: Array<{
    emoji: string;
    count: number;
  }>;
  serverId?: string;
  channelId?: string;
  thread?: {
    id: string;
    title: string;
    replyCount: number;
    archived?: boolean;
    participantCount?: number;
    unreadCount?: number;
  } | null;
  canPurgeDeletedMessage?: boolean;
}

const formSchema = z.object({
  content: z.string().min(1),
});

type EmoteReaction = {
  id: string;
  kind: "reaction";
  emoji: string;
  count: number;
  reactedByCurrentMember: boolean;
};

type EmotePickerSlot = {
  id: string;
  kind: "picker";
};

type PostEmoteItem = EmoteReaction | EmotePickerSlot;

const basicEmotes = ["😀", "😂", "😍", "🔥", "👏", "🎉", "👍", "👀", "💯", "🤝", "😎", "🙏"];

const createInitialPostEmoteItems = (): PostEmoteItem[] => [
  {
    id: crypto.randomUUID(),
    kind: "picker",
  },
];

const createPostEmoteItemsFromReactions = (
  reactions?: Array<{ emoji: string; count: number }>
): PostEmoteItem[] => {
  const reactionItems: PostEmoteItem[] = (reactions ?? [])
    .filter((item) => typeof item.emoji === "string" && item.emoji.trim().length > 0)
    .map((item) => ({
      id: crypto.randomUUID(),
      kind: "reaction" as const,
      emoji: item.emoji,
      count: Math.max(0, Number(item.count ?? 0)),
      reactedByCurrentMember: false,
    }));

  return [...reactionItems, { id: crypto.randomUUID(), kind: "picker" as const }];
};

const reactionSummary = (items: PostEmoteItem[]) =>
  items
    .filter((item): item is EmoteReaction => item.kind === "reaction")
    .map((item) => `${item.emoji}:${item.count}`)
    .join("|");

type RuntimeNotificationPreferences = {
  mentionsEnabled: boolean;
  enableDesktopNotifications: boolean;
  notifyOnDirectMessages: boolean;
  notifyOnReplies: boolean;
};

type RuntimeTextImagesPreferences = {
  showEmbeds: boolean;
  showLinkPreviews: boolean;
  showInlineMedia: boolean;
  autoplayGifs: boolean;
  autoplayStickers: boolean;
  convertEmoticons: boolean;
};

type RuntimeAccessibilityPreferences = {
  preferReducedMotion: boolean;
  highContrastMode: boolean;
  largerChatFont: boolean;
  enableScreenReaderAnnouncements: boolean;
  messageSpacing: "compact" | "comfortable";
};

type RuntimeEmojiPreferences = {
  showComposerEmojiButton: boolean;
  compactReactionButtons: boolean;
  defaultComposerEmoji: string;
  favoriteEmojis: string[];
};

const defaultRuntimeNotificationPreferences: RuntimeNotificationPreferences = {
  mentionsEnabled: true,
  enableDesktopNotifications: true,
  notifyOnDirectMessages: true,
  notifyOnReplies: true,
};

const defaultRuntimeTextImagesPreferences: RuntimeTextImagesPreferences = {
  showEmbeds: true,
  showLinkPreviews: true,
  showInlineMedia: true,
  autoplayGifs: true,
  autoplayStickers: true,
  convertEmoticons: true,
};

const defaultRuntimeAccessibilityPreferences: RuntimeAccessibilityPreferences = {
  preferReducedMotion: false,
  highContrastMode: false,
  largerChatFont: false,
  enableScreenReaderAnnouncements: true,
  messageSpacing: "comfortable",
};

const defaultRuntimeEmojiPreferences: RuntimeEmojiPreferences = {
  showComposerEmojiButton: true,
  compactReactionButtons: false,
  defaultComposerEmoji: "😊",
  favoriteEmojis: ["😀", "😂", "😍", "🔥", "👏", "🎉", "👍", "👀"],
};

const normalizeRuntimeTextImagesPreferences = (value: unknown): RuntimeTextImagesPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultRuntimeTextImagesPreferences };
  }

  const source = value as Partial<Record<keyof RuntimeTextImagesPreferences, unknown>>;

  return {
    showEmbeds:
      typeof source.showEmbeds === "boolean"
        ? source.showEmbeds
        : defaultRuntimeTextImagesPreferences.showEmbeds,
    showLinkPreviews:
      typeof source.showLinkPreviews === "boolean"
        ? source.showLinkPreviews
        : defaultRuntimeTextImagesPreferences.showLinkPreviews,
    showInlineMedia:
      typeof source.showInlineMedia === "boolean"
        ? source.showInlineMedia
        : defaultRuntimeTextImagesPreferences.showInlineMedia,
    autoplayGifs:
      typeof source.autoplayGifs === "boolean"
        ? source.autoplayGifs
        : defaultRuntimeTextImagesPreferences.autoplayGifs,
    autoplayStickers:
      typeof source.autoplayStickers === "boolean"
        ? source.autoplayStickers
        : defaultRuntimeTextImagesPreferences.autoplayStickers,
    convertEmoticons:
      typeof source.convertEmoticons === "boolean"
        ? source.convertEmoticons
        : defaultRuntimeTextImagesPreferences.convertEmoticons,
  };
};

const normalizeRuntimeNotificationPreferences = (value: unknown): RuntimeNotificationPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultRuntimeNotificationPreferences };
  }

  const source = value as {
    mentionsEnabled?: unknown;
    notifications?: {
      enableDesktopNotifications?: unknown;
      notifyOnDirectMessages?: unknown;
      notifyOnReplies?: unknown;
    };
  };

  const notifications = source.notifications ?? {};

  return {
    mentionsEnabled:
      typeof source.mentionsEnabled === "boolean"
        ? source.mentionsEnabled
        : defaultRuntimeNotificationPreferences.mentionsEnabled,
    enableDesktopNotifications:
      typeof notifications.enableDesktopNotifications === "boolean"
        ? notifications.enableDesktopNotifications
        : defaultRuntimeNotificationPreferences.enableDesktopNotifications,
    notifyOnDirectMessages:
      typeof notifications.notifyOnDirectMessages === "boolean"
        ? notifications.notifyOnDirectMessages
        : defaultRuntimeNotificationPreferences.notifyOnDirectMessages,
    notifyOnReplies:
      typeof notifications.notifyOnReplies === "boolean"
        ? notifications.notifyOnReplies
        : defaultRuntimeNotificationPreferences.notifyOnReplies,
  };
};

const normalizeRuntimeAccessibilityPreferences = (value: unknown): RuntimeAccessibilityPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultRuntimeAccessibilityPreferences };
  }

  const source = value as Partial<Record<keyof RuntimeAccessibilityPreferences, unknown>>;
  const messageSpacing =
    source.messageSpacing === "compact" || source.messageSpacing === "comfortable"
      ? source.messageSpacing
      : defaultRuntimeAccessibilityPreferences.messageSpacing;

  return {
    preferReducedMotion:
      typeof source.preferReducedMotion === "boolean"
        ? source.preferReducedMotion
        : defaultRuntimeAccessibilityPreferences.preferReducedMotion,
    highContrastMode:
      typeof source.highContrastMode === "boolean"
        ? source.highContrastMode
        : defaultRuntimeAccessibilityPreferences.highContrastMode,
    largerChatFont:
      typeof source.largerChatFont === "boolean"
        ? source.largerChatFont
        : defaultRuntimeAccessibilityPreferences.largerChatFont,
    enableScreenReaderAnnouncements:
      typeof source.enableScreenReaderAnnouncements === "boolean"
        ? source.enableScreenReaderAnnouncements
        : defaultRuntimeAccessibilityPreferences.enableScreenReaderAnnouncements,
    messageSpacing,
  };
};

const normalizeRuntimeEmojiPreferences = (value: unknown): RuntimeEmojiPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultRuntimeEmojiPreferences };
  }

  const source = value as Partial<Record<keyof RuntimeEmojiPreferences, unknown>>;
  const defaultComposerEmoji =
    typeof source.defaultComposerEmoji === "string" && source.defaultComposerEmoji.trim().length > 0
      ? source.defaultComposerEmoji.trim().slice(0, 16)
      : defaultRuntimeEmojiPreferences.defaultComposerEmoji;

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
    : [...defaultRuntimeEmojiPreferences.favoriteEmojis];

  return {
    showComposerEmojiButton:
      typeof source.showComposerEmojiButton === "boolean"
        ? source.showComposerEmojiButton
        : defaultRuntimeEmojiPreferences.showComposerEmojiButton,
    compactReactionButtons:
      typeof source.compactReactionButtons === "boolean"
        ? source.compactReactionButtons
        : defaultRuntimeEmojiPreferences.compactReactionButtons,
    defaultComposerEmoji,
    favoriteEmojis,
  };
};

const RUNTIME_NOTIFICATION_PREF_CACHE_TTL_MS = 60_000;
let runtimeNotificationPreferencesCache: RuntimeNotificationPreferences | null = null;
let runtimeNotificationPreferencesCacheExpiresAt = 0;
let runtimeNotificationPreferencesInFlight: Promise<RuntimeNotificationPreferences> | null = null;
let runtimeTextImagesPreferencesCache: RuntimeTextImagesPreferences | null = null;
let runtimeTextImagesPreferencesCacheExpiresAt = 0;
let runtimeTextImagesPreferencesInFlight: Promise<RuntimeTextImagesPreferences> | null = null;
let runtimeAccessibilityPreferencesCache: RuntimeAccessibilityPreferences | null = null;
let runtimeAccessibilityPreferencesCacheExpiresAt = 0;
let runtimeAccessibilityPreferencesInFlight: Promise<RuntimeAccessibilityPreferences> | null = null;
let runtimeEmojiPreferencesCache: RuntimeEmojiPreferences | null = null;
let runtimeEmojiPreferencesCacheExpiresAt = 0;
let runtimeEmojiPreferencesInFlight: Promise<RuntimeEmojiPreferences> | null = null;

const emoticonToEmojiMap: Record<string, string> = {
  ":)": "😊",
  ":-)": "😊",
  ":(": "☹️",
  ":-(": "☹️",
  ";)": "😉",
  ";-)": "😉",
  ":D": "😄",
  ":-D": "😄",
  ":P": "😛",
  ":-P": "😛",
  ":p": "😛",
  ":-p": "😛",
  "<3": "❤️",
};

const convertEmoticonsToEmoji = (value: string) => {
  let next = String(value ?? "");

  for (const [emoticon, emoji] of Object.entries(emoticonToEmojiMap)) {
    const escaped = emoticon.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "g"), `$1${emoji}`);
  }

  return next;
};

const fetchRuntimeNotificationPreferences = async (force = false) => {
  if (
    !force &&
    runtimeNotificationPreferencesCache &&
    runtimeNotificationPreferencesCacheExpiresAt > Date.now()
  ) {
    return runtimeNotificationPreferencesCache;
  }

  if (runtimeNotificationPreferencesInFlight) {
    return runtimeNotificationPreferencesInFlight;
  }

  runtimeNotificationPreferencesInFlight = axios
    .get<{
      mentionsEnabled?: unknown;
      notifications?: unknown;
    }>("/api/profile/preferences")
    .then((response) => normalizeRuntimeNotificationPreferences(response.data))
    .catch(() => ({ ...defaultRuntimeNotificationPreferences }))
    .then((next) => {
      runtimeNotificationPreferencesCache = next;
      runtimeNotificationPreferencesCacheExpiresAt = Date.now() + RUNTIME_NOTIFICATION_PREF_CACHE_TTL_MS;
      return next;
    })
    .finally(() => {
      runtimeNotificationPreferencesInFlight = null;
    });

  return runtimeNotificationPreferencesInFlight;
};

const fetchRuntimeTextImagesPreferences = async (force = false) => {
  if (
    !force &&
    runtimeTextImagesPreferencesCache &&
    runtimeTextImagesPreferencesCacheExpiresAt > Date.now()
  ) {
    return runtimeTextImagesPreferencesCache;
  }

  if (runtimeTextImagesPreferencesInFlight) {
    return runtimeTextImagesPreferencesInFlight;
  }

  runtimeTextImagesPreferencesInFlight = axios
    .get<{
      textImages?: unknown;
    }>("/api/profile/preferences")
    .then((response) => normalizeRuntimeTextImagesPreferences(response.data?.textImages))
    .catch(() => ({ ...defaultRuntimeTextImagesPreferences }))
    .then((next) => {
      runtimeTextImagesPreferencesCache = next;
      runtimeTextImagesPreferencesCacheExpiresAt = Date.now() + RUNTIME_NOTIFICATION_PREF_CACHE_TTL_MS;
      return next;
    })
    .finally(() => {
      runtimeTextImagesPreferencesInFlight = null;
    });

  return runtimeTextImagesPreferencesInFlight;
};

const fetchRuntimeAccessibilityPreferences = async (force = false) => {
  if (
    !force &&
    runtimeAccessibilityPreferencesCache &&
    runtimeAccessibilityPreferencesCacheExpiresAt > Date.now()
  ) {
    return runtimeAccessibilityPreferencesCache;
  }

  if (runtimeAccessibilityPreferencesInFlight) {
    return runtimeAccessibilityPreferencesInFlight;
  }

  runtimeAccessibilityPreferencesInFlight = axios
    .get<{
      accessibility?: unknown;
    }>("/api/profile/preferences")
    .then((response) => normalizeRuntimeAccessibilityPreferences(response.data?.accessibility))
    .catch(() => ({ ...defaultRuntimeAccessibilityPreferences }))
    .then((next) => {
      runtimeAccessibilityPreferencesCache = next;
      runtimeAccessibilityPreferencesCacheExpiresAt = Date.now() + RUNTIME_NOTIFICATION_PREF_CACHE_TTL_MS;
      return next;
    })
    .finally(() => {
      runtimeAccessibilityPreferencesInFlight = null;
    });

  return runtimeAccessibilityPreferencesInFlight;
};

const fetchRuntimeEmojiPreferences = async (force = false) => {
  if (
    !force &&
    runtimeEmojiPreferencesCache &&
    runtimeEmojiPreferencesCacheExpiresAt > Date.now()
  ) {
    return runtimeEmojiPreferencesCache;
  }

  if (runtimeEmojiPreferencesInFlight) {
    return runtimeEmojiPreferencesInFlight;
  }

  runtimeEmojiPreferencesInFlight = axios
    .get<{
      emoji?: unknown;
    }>("/api/profile/preferences")
    .then((response) => normalizeRuntimeEmojiPreferences(response.data?.emoji))
    .catch(() => ({ ...defaultRuntimeEmojiPreferences }))
    .then((next) => {
      runtimeEmojiPreferencesCache = next;
      runtimeEmojiPreferencesCacheExpiresAt = Date.now() + RUNTIME_NOTIFICATION_PREF_CACHE_TTL_MS;
      return next;
    })
    .finally(() => {
      runtimeEmojiPreferencesInFlight = null;
    });

  return runtimeEmojiPreferencesInFlight;
};

const notifiedMentionMessageIds = new Set<string>();
const notifiedReplyMessageIds = new Set<string>();
const notifiedDirectMessageIds = new Set<string>();
const previewCache = new Map<string, LinkPreview | null>();
const NOTIFICATION_SEEN_CACHE_LIMIT = 5_000;
const PREVIEW_CACHE_LIMIT = 1_000;
const PROFILE_CARD_CACHE_LIMIT = 1_000;

const addToBoundedSet = (target: Set<string>, value: string, limit = NOTIFICATION_SEEN_CACHE_LIMIT) => {
  target.add(value);

  while (target.size > limit) {
    const oldest = target.values().next().value;
    if (typeof oldest !== "string") {
      break;
    }

    target.delete(oldest);
  }
};

const setBoundedMapEntry = <TValue,>(target: Map<string, TValue>, key: string, value: TValue, limit: number) => {
  target.set(key, value);

  while (target.size > limit) {
    const oldest = target.keys().next().value;
    if (typeof oldest !== "string") {
      break;
    }

    target.delete(oldest);
  }
};
const PROFILE_CARD_CACHE_TTL_MS = 120_000;

type ProfileCardData = {
  id: string;
  realName: string | null;
  profileName: string | null;
  profileIcons?: ProfileIcon[];
  nameplateLabel?: string | null;
  nameplateColor?: string | null;
  nameplateImageUrl?: string | null;
  effectiveNameplateLabel?: string | null;
  effectiveNameplateColor?: string | null;
  effectiveNameplateImageUrl?: string | null;
  pronouns?: string | null;
  comment?: string | null;
  effectiveProfileName?: string | null;
  avatarDecorationUrl?: string | null;
  effectiveAvatarDecorationUrl?: string | null;
  bannerUrl: string | null;
  effectiveBannerUrl?: string | null;
  serverProfile?: {
    serverId: string;
    serverName: string;
    profileName: string | null;
    avatarDecorationUrl?: string | null;
    bannerUrl: string | null;
  } | null;
  selectedServerTag?: {
    serverId: string;
    serverName: string;
    tagCode: string;
    iconKey: string;
    iconEmoji: string;
  } | null;
  presenceStatus: string | null;
  role: string | null;
  email: string;
  imageUrl: string;
  createdAt: string | null;
  lastLogonAt: string | null;
};

const profileCardCache = new Map<
  string,
  {
    data: ProfileCardData | null;
    expiresAt: number;
  }
>();
const profileCardInFlight = new Map<string, Promise<ProfileCardData | null>>();

const getProfileCardCacheKey = (profileId: string, memberId: string) => `${profileId}:${memberId}`;

const getCachedProfileCard = (profileId: string, memberId: string) => {
  const cacheKey = getProfileCardCacheKey(profileId, memberId);
  const cached = profileCardCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    profileCardCache.delete(cacheKey);
    return null;
  }

  return cached.data;
};

const fetchProfileCardData = async ({
  profileId,
  memberId,
}: {
  profileId: string;
  memberId: string;
}) => {
  const cacheKey = getProfileCardCacheKey(profileId, memberId);
  const cached = getCachedProfileCard(profileId, memberId);

  if (cached) {
    return cached;
  }

  const inFlight = profileCardInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = axios
    .get<ProfileCardData>(`/api/profile/${encodeURIComponent(profileId)}/card`, {
      params: { memberId },
    })
    .then((response) => response.data)
    .catch(() => null)
    .then((data) => {
      setBoundedMapEntry(
        profileCardCache,
        cacheKey,
        {
          data,
          expiresAt: Date.now() + PROFILE_CARD_CACHE_TTL_MS,
        },
        PROFILE_CARD_CACHE_LIMIT
      );
      return data;
    })
    .finally(() => {
      profileCardInFlight.delete(cacheKey);
    });

  profileCardInFlight.set(cacheKey, request);
  return request;
};

type LinkPreview = {
  url: string;
  siteName: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  canonicalUrl: string;
};

type VoiceJoinNotification = {
  displayText: string;
  joinPath: string;
};

const VOICE_JOIN_MARKER_REGEX = /\s*\[\[JOIN_CHANNEL:([^:\]]+):([^\]]+)\]\]\s*$/i;
const VOICE_JOIN_URL_REGEX = /\s+Join:\s+(https?:\/\/\S+)\s*$/i;

const parseVoiceJoinNotification = (rawText: string): VoiceJoinNotification | null => {
  const text = String(rawText ?? "");

  const markerMatch = text.match(VOICE_JOIN_MARKER_REGEX);
  if (markerMatch) {
    const serverId = String(markerMatch[1] ?? "").trim();
    const channelId = String(markerMatch[2] ?? "").trim();
    if (!serverId || !channelId) {
      return null;
    }

    return {
      displayText: text.replace(VOICE_JOIN_MARKER_REGEX, "").trim(),
      joinPath: `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}`,
    };
  }

  const urlMatch = text.match(VOICE_JOIN_URL_REGEX);
  const rawUrl = String(urlMatch?.[1] ?? "").trim();
  if (!rawUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(rawUrl);
    const routeMatch = parsedUrl.pathname.match(/^\/servers\/([^/]+)\/channels\/([^/?#]+)/i);
    if (!routeMatch) {
      return null;
    }

    const serverId = String(routeMatch[1] ?? "").trim();
    const channelId = String(routeMatch[2] ?? "").trim();
    if (!serverId || !channelId) {
      return null;
    }

    return {
      displayText: text.replace(VOICE_JOIN_URL_REGEX, "").trim(),
      joinPath: `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}`,
    };
  } catch {
    return null;
  }
};

const renderTextWithLinks = (text: string, keyPrefix: string) => {
  const chunks = splitTextWithUrls(text);
  return chunks.map((chunk, chunkIndex) => {
    if (chunk.kind === "text") {
      return <span key={`${keyPrefix}-text-${chunkIndex}`}>{chunk.value}</span>;
    }

    return (
      <a
        key={`${keyPrefix}-url-${chunkIndex}`}
        href={chunk.value}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-indigo-400/80 underline-offset-2 transition hover:text-indigo-500 dark:hover:text-indigo-300"
      >
        {chunk.value}
      </a>
    );
  });
};

export const ChatItem = ({
  id,
  content,
  member,
  timestamp,
  fileUrl,
  deleted,
  currentMember,
  isUpdated,
  socketUrl,
  socketQuery,
  dmServerId,
  reactionScope = "channel",
  initialReactions,
  serverId,
  channelId,
  thread,
  canPurgeDeletedMessage = false,
}: ChatItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isProfilePopoverOpen, setIsProfilePopoverOpen] = useState(false);
  const [profileCard, setProfileCard] = useState<ProfileCardData | null>(null);
  const [botCommands, setBotCommands] = useState<string[]>([]);
  const [botCommandsName, setBotCommandsName] = useState("Bot");
  const [isLoadingBotCommands, setIsLoadingBotCommands] = useState(false);
  const [isBotCommandsDialogOpen, setIsBotCommandsDialogOpen] = useState(false);
  const [displayName, setDisplayName] = useState(member.profile.name);
  const [displayImageUrl, setDisplayImageUrl] = useState(member.profile.imageUrl);
  const [linkPreviews, setLinkPreviews] = useState<Record<string, LinkPreview | null>>({});
  const [postEmoteItems, setPostEmoteItems] = useState<PostEmoteItem[]>(() =>
    createPostEmoteItemsFromReactions(initialReactions)
  );
  const [activePickerId, setActivePickerId] = useState<string | null>(null);
  const [isThreadActionPending, setIsThreadActionPending] = useState(false);
  const [runtimeNotificationPreferences, setRuntimeNotificationPreferences] =
    useState<RuntimeNotificationPreferences>({
      ...defaultRuntimeNotificationPreferences,
    });
  const [runtimeTextImagesPreferences, setRuntimeTextImagesPreferences] =
    useState<RuntimeTextImagesPreferences>({
      ...defaultRuntimeTextImagesPreferences,
    });
  const [runtimeAccessibilityPreferences, setRuntimeAccessibilityPreferences] =
    useState<RuntimeAccessibilityPreferences>({
      ...defaultRuntimeAccessibilityPreferences,
    });
  const [runtimeEmojiPreferences, setRuntimeEmojiPreferences] =
    useState<RuntimeEmojiPreferences>({
      ...defaultRuntimeEmojiPreferences,
    });
  const { onOpen } = useModal();
  const params = useParams();
  const router = useRouter();

  const applyServerReactions = (reactions?: Array<{ emoji: string; count: number }>) => {
    setPostEmoteItems((prev) => {
      const next = createPostEmoteItemsFromReactions(reactions);

      if (reactionSummary(prev) === reactionSummary(next)) {
        const hadPicker = prev.some((item) => item.kind === "picker");
        if (hadPicker) {
          return prev;
        }
      }

      return next;
    });
  };

  const onReactionClick = (reactionId: string) => {
    if (deleted) {
      return;
    }

    const clicked = postEmoteItems.find((item) => item.id === reactionId && item.kind === "reaction");
    if (!clicked || clicked.kind !== "reaction") {
      return;
    }

    setPostEmoteItems((prev) => {
      const clicked = prev.find((item) => item.id === reactionId && item.kind === "reaction");
      if (!clicked || clicked.kind !== "reaction") {
        return prev;
      }

      return prev.map((item) =>
        item.id === reactionId && item.kind === "reaction"
          ? {
              ...item,
              count: item.count + 1,
              reactedByCurrentMember: true,
            }
          : item
      );
    });

    void axios
      .post(`/api/messages/${id}/reactions`, {
        emoji: clicked.emoji,
        scope: reactionScope,
      })
      .then((response) => {
        const reactions = (response.data as { reactions?: Array<{ emoji: string; count: number }> }).reactions ?? [];
        applyServerReactions(reactions);
      })
      .catch(() => {
        // keep optimistic state if request fails
      });
  };

  const onPickEmote = (pickerId: string, emoji: string) => {
    if (deleted) {
      return;
    }

    setPostEmoteItems((prev) => {
      const pickerIndex = prev.findIndex((item) => item.id === pickerId && item.kind === "picker");
      if (pickerIndex === -1) {
        return prev;
      }

      const next = [...prev];

      const newReaction: EmoteReaction = {
        id: crypto.randomUUID(),
        kind: "reaction",
        emoji,
        count: 1,
        reactedByCurrentMember: true,
      };

      const newPicker: EmotePickerSlot = {
        id: crypto.randomUUID(),
        kind: "picker",
      };

      next.splice(pickerIndex, 1, newReaction, newPicker);
      return next;
    });

    setActivePickerId(null);

    void axios
      .post(`/api/messages/${id}/reactions`, {
        emoji,
        scope: reactionScope,
      })
      .then((response) => {
        const reactions = (response.data as { reactions?: Array<{ emoji: string; count: number }> }).reactions ?? [];
        applyServerReactions(reactions);
      })
      .catch(() => {
        // keep optimistic state if request fails
      });
  };

  const onMemberClick = () => {
    const cached = getCachedProfileCard(member.profile.id, member.id);
    if (cached) {
      setProfileCard(cached);
    }

    setIsProfilePopoverOpen((prev) => !prev);
  };

  const prefetchProfileCard = () => {
    void fetchProfileCardData({
      profileId: member.profile.id,
      memberId: member.id,
    }).then((data) => {
      if (data && !isProfilePopoverOpen) {
        setProfileCard((current) => current ?? data);
      }
    });
  };

  const onStartDirectMessage = () => {
    const serverIdFromRoute =
      typeof params?.serverId === "string"
        ? params.serverId
        : Array.isArray(params?.serverId)
          ? (params?.serverId[0] ?? "")
          : "";

    const effectiveServerId = dmServerId ?? serverIdFromRoute;

    if (!effectiveServerId) {
      window.alert("Unable to open PM from this view.");
      return;
    }

    setIsProfilePopoverOpen(false);
    router.push(`/users?serverId=${encodeURIComponent(effectiveServerId)}&memberId=${encodeURIComponent(member.id)}`);
  };

  const onAddFriend = async () => {
    setIsProfilePopoverOpen(false);

    try {
      await axios.post("/api/friends/requests", {
        profileId: member.profile.id,
      });
      router.refresh();
      window.alert("Friend request sent.");
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error ?? "Failed to send friend request."
        : "Failed to send friend request.";
      window.alert(message);
    }
  };

  const onBlockUser = async () => {
    setIsProfilePopoverOpen(false);

    try {
      await axios.post("/api/friends/blocked", {
        profileId: member.profile.id,
      });
      router.refresh();
      window.alert("User blocked.");
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error ?? "Failed to block user."
        : "Failed to block user.";
      window.alert(message);
    }
  };

  const onReportUser = async () => {
    setIsProfilePopoverOpen(false);

    try {
      await axios.post("/api/reports", {
        targetType: "USER",
        targetId: member.profile.id,
        reason: "Reported from chat profile card",
      });
      window.alert("User report submitted.");
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error ?? "Failed to submit report."
        : "Failed to submit report.";
      window.alert(message);
    }
  };

  const loadBotCommands = async () => {
    if (botCommands.length > 0) {
      return;
    }

    try {
      setIsLoadingBotCommands(true);

      const response = await axios.get<{ botName?: string; commands?: string[] }>(
        `/api/profile/${encodeURIComponent(member.profile.id)}/bot-commands`,
        {
          params: {
            memberId: member.id,
          },
        }
      );

      const commands = Array.isArray(response.data?.commands)
        ? response.data.commands
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
        : [];

      setBotCommands(commands);

      const nextName = String(response.data?.botName ?? "").trim();
      if (nextName) {
        setBotCommandsName(nextName);
      }
    } catch {
      // ignore when this profile is not a configured bot
    } finally {
      setIsLoadingBotCommands(false);
    }
  };

  const onOpenBotCommandsDialog = () => {
    setIsBotCommandsDialogOpen(true);
    void loadBotCommands();
  };

  const onReportMessage = async () => {
    if (deleted) {
      return;
    }

    const sourceLabel = reactionScope === "direct" ? "private message" : "channel message";

    try {
      await axios.post("/api/reports", {
        targetType: "MESSAGE",
        targetId: id,
        reason: `Reported ${sourceLabel}`,
        details: `Reported from ${sourceLabel} action bar`,
      });
      window.alert("Message report submitted.");
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error ?? "Failed to submit report."
        : "Failed to submit report.";
      window.alert(message);
    }
  };

  const onQuoteMessage = () => {
    if (deleted) {
      return;
    }

    const { body } = extractQuotedContent(content);

    window.dispatchEvent(
      new CustomEvent("inaccord:quote-message", {
        detail: {
          messageId: id,
          authorName: displayName,
          authorProfileId: member.profile.id,
          snippet: getQuoteSnippetFromBody(body),
        },
      })
    );
  };

  const onOpenThread = async () => {
    if (deleted || !serverId || !channelId) {
      return;
    }

    if (isThreadActionPending) {
      return;
    }

    const existingThreadId = String(thread?.id ?? "").trim();
    const routeServerSegment =
      typeof params?.serverId === "string"
        ? params.serverId
        : Array.isArray(params?.serverId)
          ? (params?.serverId[0] ?? "")
          : serverId;
    const routeChannelSegment =
      typeof params?.channelId === "string"
        ? params.channelId
        : Array.isArray(params?.channelId)
          ? (params?.channelId[0] ?? "")
          : channelId;

    if (existingThreadId) {
      router.push(`/servers/${routeServerSegment}/channels/${routeChannelSegment}/threads/${existingThreadId}`);
      return;
    }

    try {
      setIsThreadActionPending(true);

      const sourceTitle = getQuoteSnippetFromBody(extractQuotedContent(content).body || content);
      const response = await axios.post(`/api/channels/${channelId}/threads`, {
        serverId,
        sourceMessageId: id,
        title: sourceTitle,
      });

      const createdThreadId = String((response.data as { threadId?: string }).threadId ?? "").trim();
      if (!createdThreadId) {
        throw new Error("Thread creation response did not include threadId");
      }

      router.push(`/servers/${routeServerSegment}/channels/${routeChannelSegment}/threads/${createdThreadId}`);
    } catch (error) {
      console.error("[CHAT_ITEM_OPEN_THREAD]", error);
      window.alert("Unable to open thread right now.");
    } finally {
      setIsThreadActionPending(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: any) => {
      if (event.key === "Escape" || event.keyCode === 27) {
        setIsEditing(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncEmojiPreferences = async (force = false) => {
      const next = await fetchRuntimeEmojiPreferences(force);

      if (cancelled) {
        return;
      }

      setRuntimeEmojiPreferences(next);
    };

    void syncEmojiPreferences();

    const onEmojiPreferencesChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ emoji?: unknown }>;

      if (customEvent.detail?.emoji) {
        const next = normalizeRuntimeEmojiPreferences(customEvent.detail.emoji);
        setRuntimeEmojiPreferences(next);
        runtimeEmojiPreferencesCache = next;
        runtimeEmojiPreferencesCacheExpiresAt = Date.now() + RUNTIME_NOTIFICATION_PREF_CACHE_TTL_MS;
        return;
      }

      void syncEmojiPreferences(true);
    };

    window.addEventListener("inaccord:emoji-preferences-updated", onEmojiPreferencesChanged);

    return () => {
      cancelled = true;
      window.removeEventListener("inaccord:emoji-preferences-updated", onEmojiPreferencesChanged);
    };
  }, []);

  const quickReactionEmojis = useMemo(() => {
    const normalizedFavorites = runtimeEmojiPreferences.favoriteEmojis
      .map((item) => String(item ?? "").trim())
      .filter((item) => item.length > 0)
      .slice(0, 12);

    if (!normalizedFavorites.length) {
      return basicEmotes;
    }

    return normalizedFavorites;
  }, [runtimeEmojiPreferences.favoriteEmojis]);

  useEffect(() => {
    let cancelled = false;

    const syncAccessibilityPreferences = async (force = false) => {
      const next = await fetchRuntimeAccessibilityPreferences(force);

      if (cancelled) {
        return;
      }

      setRuntimeAccessibilityPreferences(next);
    };

    void syncAccessibilityPreferences();

    const onAccessibilityPreferencesChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ accessibility?: unknown }>;

      if (customEvent.detail?.accessibility) {
        const next = normalizeRuntimeAccessibilityPreferences(customEvent.detail.accessibility);

        setRuntimeAccessibilityPreferences(next);
        runtimeAccessibilityPreferencesCache = next;
        runtimeAccessibilityPreferencesCacheExpiresAt = Date.now() + RUNTIME_NOTIFICATION_PREF_CACHE_TTL_MS;
        return;
      }

      void syncAccessibilityPreferences(true);
    };

    window.addEventListener(
      "inaccord:accessibility-preferences-updated",
      onAccessibilityPreferencesChanged
    );

    return () => {
      cancelled = true;
      window.removeEventListener(
        "inaccord:accessibility-preferences-updated",
        onAccessibilityPreferencesChanged
      );
    };
  }, []);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      content: content,
    },
  });

  const isLoading = form.formState.isSubmitting;

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const url = qs.stringifyUrl({
        url: `${socketUrl}/${id}`,
        query: socketQuery,
      });

      await axios.patch(url, values);

      form.reset();
      setIsEditing(false);
      emitLocalChatMutationForRoute(socketUrl, socketQuery);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    form.reset({
      content: content,
    });
  }, [content]);

  useEffect(() => {
    if (!isProfilePopoverOpen) {
      return;
    }

    let cancelled = false;

    const loadProfileCard = async () => {
      const cached = getCachedProfileCard(member.profile.id, member.id);

      if (cached) {
        if (!cancelled) {
          setProfileCard(cached);
        }
        return;
      }

      const data = await fetchProfileCardData({
        profileId: member.profile.id,
        memberId: member.id,
      });

      if (!cancelled) {
        setProfileCard(data);
      }
    };

    void loadProfileCard();

    return () => {
      cancelled = true;
    };
  }, [isProfilePopoverOpen, member.id, member.profile.id]);

  useEffect(() => {
    setDisplayName(member.profile.name);
    setDisplayImageUrl(member.profile.imageUrl);
  }, [member.profile.imageUrl, member.profile.name]);

  useEffect(() => {
    setPostEmoteItems(createPostEmoteItemsFromReactions(initialReactions));

    setActivePickerId(null);
  }, [id, initialReactions]);

  useEffect(() => {
    const onProfileUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{
        profileId?: string | null;
        profileName?: string;
        imageUrl?: string | null;
      }>;

      const eventProfileId = customEvent.detail?.profileId?.trim();
      const belongsToRenderedMember = eventProfileId
        ? eventProfileId === member.profile.id
        : member.profile.id === currentMember.profileId;

      if (!belongsToRenderedMember) {
        return;
      }

      if (typeof customEvent.detail?.profileName === "string") {
        const normalizedProfileName = customEvent.detail.profileName.trim();
        if (normalizedProfileName) {
          setDisplayName(normalizedProfileName);
        }
      }

      if (typeof customEvent.detail?.imageUrl === "string") {
        const normalizedImageUrl = customEvent.detail.imageUrl.trim();
        if (normalizedImageUrl) {
          setDisplayImageUrl(normalizedImageUrl);
        }
      } else if (customEvent.detail?.imageUrl === null) {
        setDisplayImageUrl("/in-accord-steampunk-logo.png");
      }
    };

    window.addEventListener("inaccord:profile-updated", onProfileUpdated);

    return () => {
      window.removeEventListener("inaccord:profile-updated", onProfileUpdated);
    };
  }, [currentMember.profileId, member.profile.id]);

  const fileType = fileUrl?.split(".").pop();
  const isGif = !!fileUrl && /\.gif(\?|$)/i.test(fileUrl);
  const isEmote = !!fileUrl && content.trim().toLowerCase() === "[emote]";
  const isSticker =
    !!fileUrl &&
    (content.trim().toLowerCase() === "[sticker]" || /\/stickers\//i.test(fileUrl));
  const isSoundEfx =
    !!fileUrl &&
    (content.trim().toLowerCase() === "[sound_efx]" ||
      /^data:audio\//i.test(fileUrl) ||
      /\.(mp3|wav|ogg|m4a|aac|flac)(\?|$)/i.test(fileUrl));

  const isAdmin = currentMember.role === MemberRole.ADMIN;
  const isModerator = currentMember.role === MemberRole.MODERATOR;
  const isOwner = currentMember.id === member.id;
  const canDeleteMessage = !deleted && (isAdmin || isModerator || isOwner);
  const canEditMessage = !deleted && isOwner && !fileUrl;
  const isPDF = fileType === "pdf" && fileUrl;
  const isImage = !isPDF && !isSoundEfx && fileUrl;
  const showBotBadge = isBotUser({
    name: displayName,
    email: member.profile.email,
  });
  const canShowBotCommands = showBotBadge || member.profile.id.startsWith("botcfg_");
  const globalRoleFromProfile = (member.profile as Profile & { role?: string | null }).role ?? null;
  const effectiveGlobalRole = profileCard?.role ?? globalRoleFromProfile;
  const isGlobalDeveloper = isInAccordDeveloper(effectiveGlobalRole);
  const isGlobalAdministrator = isInAccordAdministrator(effectiveGlobalRole);
  const isGlobalModerator = isInAccordModerator(effectiveGlobalRole);
  const globalRoleLabel = getInAccordStaffLabel(effectiveGlobalRole);
  const highestRoleIcon = isGlobalDeveloper
    ? <Wrench suppressHydrationWarning className="h-4 w-4 text-cyan-400" aria-label={globalRoleLabel ?? "Developer"} />
    : isGlobalAdministrator
      ? <Crown suppressHydrationWarning className="h-4 w-4 text-rose-500" aria-label={globalRoleLabel ?? "Administrator"} />
      : isGlobalModerator
        ? <ModeratorLineIcon suppressHydrationWarning className="h-4 w-4 text-indigo-500" aria-label={globalRoleLabel ?? "Moderator"} />
        : isInAccordAdministrator(member.role)
          ? <Crown suppressHydrationWarning className="h-4 w-4 text-rose-500" aria-label="Administrator" />
          : isInAccordModerator(member.role)
            ? <ModeratorLineIcon suppressHydrationWarning className="h-4 w-4 text-indigo-500" aria-label="Moderator" />
            : null;
  const highestRoleLabel = isGlobalDeveloper
    ? "Developer"
    : isGlobalAdministrator
      ? "Administrator"
      : isGlobalModerator
        ? "Moderator"
        : isInAccordAdministrator(member.role)
          ? "Administrator"
          : isInAccordModerator(member.role)
            ? "Moderator"
            : null;
    const roleAndMetaIcons = (
      <>
        <NewUserCloverBadge createdAt={member.profile.createdAt} className="text-xs" />
        {showBotBadge ? <BotAppBadge className="ml-1.5 h-4 px-1 text-[9px]" /> : null}
        {highestRoleIcon && highestRoleLabel ? (
          <ActionTooltip label={highestRoleLabel} align="center">
            {highestRoleIcon}
          </ActionTooltip>
        ) : null}
      </>
    );
  const displayMemberRole = isInAccordAdministrator(member.role)
    ? "Administrator"
    : isInAccordModerator(member.role)
      ? "Moderator"
      : String(member.role ?? "User");
  const effectiveBannerUrl = resolveBannerUrl(
    profileCard?.effectiveBannerUrl ?? profileCard?.bannerUrl ?? null
  );
  const effectiveAvatarDecorationUrl =
    profileCard?.effectiveAvatarDecorationUrl ?? profileCard?.avatarDecorationUrl ?? null;
  const effectiveProfileIcons =
    profileCard?.profileIcons && profileCard.profileIcons.length > 0
      ? profileCard.profileIcons
      : resolveProfileIcons({
          userId: member.profile.id,
          role: effectiveGlobalRole,
          email: member.profile.email,
          createdAt: member.profile.createdAt,
        });
  const effectiveNameplateLabel =
    profileCard?.effectiveNameplateLabel ?? profileCard?.nameplateLabel ?? null;
  const effectiveNameplateColor =
    profileCard?.effectiveNameplateColor ?? profileCard?.nameplateColor ?? null;
  const effectiveNameplateImageUrl =
    profileCard?.effectiveNameplateImageUrl ?? profileCard?.nameplateImageUrl ?? null;
  const memberCreatedDate = profileCard?.createdAt
    ? new Date(profileCard.createdAt)
    : member.profile.createdAt
      ? new Date(member.profile.createdAt)
      : null;
  const memberCreatedDisplay =
    memberCreatedDate && !Number.isNaN(memberCreatedDate.getTime())
      ? memberCreatedDate.toLocaleString()
      : "Unknown";
  const { quote: quotedMessage, body: rawMessageBody } = extractQuotedContent(content);
  const voiceJoinNotification = parseVoiceJoinNotification(rawMessageBody);
  const messageBody = voiceJoinNotification?.displayText ?? rawMessageBody;
  const normalizedMessageBody = runtimeTextImagesPreferences.convertEmoticons
    ? convertEmoticonsToEmoji(messageBody)
    : messageBody;
  const contentSegments = parseMentionSegments(normalizedMessageBody);
  const hasMention = contentSegments.some((segment) => segment.kind === "mention");
  const isMentioningCurrentUser = contentSegments.some(
    (segment) =>
      segment.kind === "mention" &&
      segment.entityType === "user" &&
      segment.entityId === currentMember.profileId
  );
  const isReplyToCurrentUser =
    typeof quotedMessage?.authorProfileId === "string" &&
    quotedMessage.authorProfileId.trim().length > 0 &&
    quotedMessage.authorProfileId === currentMember.profileId;
  const plainContentForNotification = contentSegments
    .map((segment) => (segment.kind === "mention" ? `@${segment.label}` : segment.value))
    .join("")
    .trim();
  const messageUrls = useMemo(() => extractUrlsFromText(normalizedMessageBody, 3), [normalizedMessageBody]);
  const renderedPreviews = messageUrls
    .map((url) => linkPreviews[url])
    .filter((item): item is LinkPreview => Boolean(item));
  const threadIdFromSocketQuery =
    typeof socketQuery?.threadId === "string" ? socketQuery.threadId.trim() : "";
  const canUseThreads =
    reactionScope === "channel" &&
    !!serverId &&
    !!channelId &&
    !threadIdFromSocketQuery &&
    !deleted;
  const threadActionLabel = canUseThreads
    ? thread?.id
      ? "Open Thread"
      : "Start Thread"
    : "Threads only in channels";
  const actionIconClassName =
    "w-4 h-4 transition";
  const actionIconEnabledClassName =
    "cursor-pointer text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300";
  const actionIconDisabledClassName =
    "cursor-not-allowed text-zinc-400/70 dark:text-zinc-500/70";

  useEffect(() => {
    let cancelled = false;

    const syncNotificationPreferences = async (force = false) => {
      const next = await fetchRuntimeNotificationPreferences(force);

      if (cancelled) {
        return;
      }

      setRuntimeNotificationPreferences(next);
    };

    void syncNotificationPreferences();

    const onMentionsPreferenceChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ mentionsEnabled?: boolean }>;
      const nextMentionsEnabled = customEvent.detail?.mentionsEnabled;

      if (typeof nextMentionsEnabled === "boolean") {
        setRuntimeNotificationPreferences((current) => {
          const next = {
            ...current,
            mentionsEnabled: nextMentionsEnabled,
          };

          runtimeNotificationPreferencesCache = next;
          runtimeNotificationPreferencesCacheExpiresAt = Date.now() + RUNTIME_NOTIFICATION_PREF_CACHE_TTL_MS;
          return next;
        });
        return;
      }

      void syncNotificationPreferences(true);
    };

    const onNotificationPreferencesChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ notifications?: unknown }>;
      const normalized = normalizeRuntimeNotificationPreferences({
        mentionsEnabled: runtimeNotificationPreferences.mentionsEnabled,
        notifications: customEvent.detail?.notifications,
      });

      setRuntimeNotificationPreferences((current) => {
        const next = {
          ...current,
          enableDesktopNotifications: normalized.enableDesktopNotifications,
          notifyOnDirectMessages: normalized.notifyOnDirectMessages,
          notifyOnReplies: normalized.notifyOnReplies,
        };

        runtimeNotificationPreferencesCache = next;
        runtimeNotificationPreferencesCacheExpiresAt = Date.now() + RUNTIME_NOTIFICATION_PREF_CACHE_TTL_MS;
        return next;
      });
    };

    window.addEventListener("inaccord:mentions-setting-updated", onMentionsPreferenceChanged);
    window.addEventListener(
      "inaccord:notification-preferences-updated",
      onNotificationPreferencesChanged
    );

    return () => {
      cancelled = true;
      window.removeEventListener("inaccord:mentions-setting-updated", onMentionsPreferenceChanged);
      window.removeEventListener(
        "inaccord:notification-preferences-updated",
        onNotificationPreferencesChanged
      );
    };
  }, [runtimeNotificationPreferences.mentionsEnabled]);

  useEffect(() => {
    let cancelled = false;

    const syncTextImagesPreferences = async (force = false) => {
      const next = await fetchRuntimeTextImagesPreferences(force);

      if (cancelled) {
        return;
      }

      setRuntimeTextImagesPreferences(next);
    };

    void syncTextImagesPreferences();

    const onTextImagesPreferencesChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ textImages?: unknown }>;

      if (customEvent.detail?.textImages) {
        const next = normalizeRuntimeTextImagesPreferences(customEvent.detail.textImages);

        setRuntimeTextImagesPreferences(next);
        runtimeTextImagesPreferencesCache = next;
        runtimeTextImagesPreferencesCacheExpiresAt = Date.now() + RUNTIME_NOTIFICATION_PREF_CACHE_TTL_MS;
        return;
      }

      void syncTextImagesPreferences(true);
    };

    window.addEventListener(
      "inaccord:text-images-preferences-updated",
      onTextImagesPreferencesChanged
    );

    return () => {
      cancelled = true;
      window.removeEventListener(
        "inaccord:text-images-preferences-updated",
        onTextImagesPreferencesChanged
      );
    };
  }, []);

  useEffect(() => {
    if (deleted) {
      return;
    }

    if (member.id === currentMember.id) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    if (!runtimeNotificationPreferences.enableDesktopNotifications) {
      return;
    }

    const isDirectMessage = reactionScope === "direct";
    const shouldNotifyMention = isMentioningCurrentUser && runtimeNotificationPreferences.mentionsEnabled;
    const shouldNotifyReply = isReplyToCurrentUser && runtimeNotificationPreferences.notifyOnReplies;
    const shouldNotifyDirectMessage =
      isDirectMessage && runtimeNotificationPreferences.notifyOnDirectMessages;

    let notificationType: "mention" | "reply" | "direct" | null = null;

    if (shouldNotifyMention) {
      notificationType = "mention";
    } else if (shouldNotifyReply) {
      notificationType = "reply";
    } else if (shouldNotifyDirectMessage) {
      notificationType = "direct";
    }

    if (!notificationType) {
      return;
    }

    const seenIds =
      notificationType === "mention"
        ? notifiedMentionMessageIds
        : notificationType === "reply"
          ? notifiedReplyMessageIds
          : notifiedDirectMessageIds;

    if (seenIds.has(id)) {
      return;
    }

    addToBoundedSet(seenIds, id);

    const title =
      notificationType === "mention"
        ? `New mention from ${displayName}`
        : notificationType === "reply"
          ? `New reply from ${displayName}`
          : `New direct message from ${displayName}`;
    const fallbackBody =
      notificationType === "mention"
        ? "You were mentioned in chat."
        : notificationType === "reply"
          ? "Someone replied to your message."
          : "You received a direct message.";
    const body = plainContentForNotification || fallbackBody;
    const shouldUseBrowserNotification = document.visibilityState !== "visible";

    if (shouldUseBrowserNotification && "Notification" in window) {
      const notify = () => {
        try {
          new Notification(title, {
            body,
            tag: `${notificationType}-${id}`,
          });
        } catch {
          // ignore notification failures
        }
      };

      if (Notification.permission === "granted") {
        notify();
      } else if (Notification.permission === "default") {
        void Notification.requestPermission().then((permission) => {
          if (permission === "granted") {
            notify();
          }
        });
      }
    }
  }, [
    currentMember.id,
    deleted,
    displayName,
    id,
    isMentioningCurrentUser,
    isReplyToCurrentUser,
    member.id,
    plainContentForNotification,
    reactionScope,
    runtimeNotificationPreferences.enableDesktopNotifications,
    runtimeNotificationPreferences.mentionsEnabled,
    runtimeNotificationPreferences.notifyOnDirectMessages,
    runtimeNotificationPreferences.notifyOnReplies,
  ]);

  useEffect(() => {
    if (!runtimeTextImagesPreferences.showEmbeds || !runtimeTextImagesPreferences.showLinkPreviews) {
      setLinkPreviews({});
      return;
    }

    if (!messageUrls.length) {
      setLinkPreviews({});
      return;
    }

    let cancelled = false;

    const loadPreviews = async () => {
      const nextEntries: Array<[string, LinkPreview | null]> = [];

      for (const url of messageUrls) {
        if (previewCache.has(url)) {
          nextEntries.push([url, previewCache.get(url) ?? null]);
          continue;
        }

        try {
          const response = await axios.get<{ preview?: LinkPreview | null }>("/api/link-preview", {
            params: { url },
          });

          const preview = response.data.preview ?? null;
          setBoundedMapEntry(previewCache, url, preview, PREVIEW_CACHE_LIMIT);
          nextEntries.push([url, preview]);
        } catch {
          setBoundedMapEntry(previewCache, url, null, PREVIEW_CACHE_LIMIT);
          nextEntries.push([url, null]);
        }
      }

      if (cancelled) {
        return;
      }

      setLinkPreviews(Object.fromEntries(nextEntries));
    };

    void loadPreviews();

    return () => {
      cancelled = true;
    };
  }, [
    messageUrls,
    runtimeTextImagesPreferences.showEmbeds,
    runtimeTextImagesPreferences.showLinkPreviews,
  ]);

  if (deleted) {
    const deletedByName = String(displayName ?? "").trim() || "Deleted User";
    const canHardDeleteDeletedMessage = canPurgeDeletedMessage && reactionScope === "channel";
    const deletedTimestampLabel = String(timestamp ?? "").trim();

    return (
      <div className="relative flex w-full items-center px-4 py-3">
        <div className="rounded-md border border-zinc-300/70 bg-zinc-100/70 px-3 py-2 text-xs italic text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-400">
          A message has been deleted by: "{deletedByName}".
          {deletedTimestampLabel ? (
            <span className="not-italic text-zinc-500 dark:text-zinc-400"> ({deletedTimestampLabel})</span>
          ) : null}
        </div>
        {canHardDeleteDeletedMessage ? (
          <div className="absolute right-5 top-1/2 -translate-y-1/2 rounded-sm border bg-white/95 p-1 shadow-sm dark:bg-zinc-800/95">
            <ActionTooltip label="Delete permanently" align="center">
              <Trash
                onClick={() => {
                  onOpen("deleteMessage", {
                    apiUrl: `${socketUrl}/${id}`,
                    query: socketQuery,
                  });
                }}
                className={cn(actionIconClassName, actionIconEnabledClassName)}
              />
            </ActionTooltip>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "chat-message-item relative group flex w-full items-center px-4 transition",
        runtimeAccessibilityPreferences.messageSpacing === "compact" ? "py-2" : "py-4",
        runtimeAccessibilityPreferences.highContrastMode
          ? "outline-1 outline-white/25 dark:outline-white/40"
          : null,
        isMentioningCurrentUser
          ? "border-l-4 border-amber-400/80 bg-amber-500/10 hover:bg-amber-500/15 dark:bg-amber-500/10 dark:hover:bg-amber-500/15"
          : hasMention
            ? "border-l-4 border-zinc-500/70 bg-zinc-500/5 hover:bg-zinc-500/10 dark:bg-zinc-500/5 dark:hover:bg-zinc-500/10"
            : "hover:bg-[#2e3035]"
      )}
    >
      <div className="group flex w-full min-w-0 items-start gap-x-2">
        <Popover open={isProfilePopoverOpen} onOpenChange={setIsProfilePopoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={onMemberClick}
              onMouseEnter={prefetchProfileCard}
              className="cursor-pointer hover:drop-shadow-md transition"
              aria-label={`Open profile for ${displayName}`}
              title={`View ${displayName}'s profile`}
            >
              <UserAvatar src={displayImageUrl} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            className="w-[320px] overflow-hidden rounded-xl border border-black/30 bg-[#111214] p-0 text-[#dbdee1] shadow-2xl shadow-black/50"
          >
            <div className="relative h-24 bg-linear-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
              {effectiveBannerUrl ? (
                <BannerImage
                  src={effectiveBannerUrl}
                  alt="User banner"
                  className="object-cover"
                />
              ) : null}
            </div>

            <div className="relative p-3 pt-9">
              <div className="absolute -top-10 left-3 rounded-full border-4 border-[#111214]">
                <UserAvatar
                  src={displayImageUrl}
                  decorationSrc={effectiveAvatarDecorationUrl}
                  className="h-20 w-20"
                />
              </div>

              <div className="min-w-0">
                <ProfileIconRow icons={effectiveProfileIcons} className="mb-1" />
                <div className="flex w-full min-w-0 items-start gap-1.5">
                  <ProfileNameWithServerTag
                    name={displayName || "Deleted User"}
                    profileId={member.profile.id}
                    memberId={member.id}
                    pronouns={profileCard?.pronouns?.trim() || null}
                    containerClassName="w-full min-w-0"
                    nameClassName="text-base font-bold text-white"
                    showNameplate
                    nameplateClassName="mb-0 w-full max-w-full"
                    plateMetaIcons={roleAndMetaIcons}
                  />
                </div>
              </div>
              <div className="mt-2 min-h-36 w-full max-w-55 resize-y overflow-auto rounded-md border border-white/10 bg-[#1a1b1e] px-2.5 py-2">
                <p
                  className="whitespace-pre-wrap wrap-break-word align-top text-[11px] text-[#dbdee1]"
                  style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                >
                  {profileCard?.comment?.trim() || "No comment set"}
                </p>
              </div>

              <div className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] p-3 text-xs">
                <div className="space-y-1 text-[#dbdee1]">
                  <p>
                    Name: {profileCard?.effectiveProfileName || profileCard?.realName || profileCard?.profileName || displayName || member.profile.email?.split("@")[0] || member.profile.id || "Deleted User"}
                  </p>
                  <p>Pronouns: {profileCard?.pronouns || "Not set"}</p>
                  <p>Comment: {profileCard?.comment || "Not set"}</p>
                  <p>Email: {profileCard?.email || member.profile.email || "N/A"}</p>
                  <p>Role: {displayMemberRole}</p>
                  <p>Created: {memberCreatedDisplay}</p>
                </div>
              </div>

              {profileCard?.selectedServerTag ? (
                <div className="mt-2 rounded-lg border border-white/10 bg-[#1a1b1e] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Server Tag</p>
                  <div className="mt-2">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#5865f2]/35 bg-[#5865f2]/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#d7dcff]"
                      title={`Server tag from ${profileCard.selectedServerTag.serverName}`}
                    >
                      <span>{profileCard.selectedServerTag.iconEmoji}</span>
                      <span>{profileCard.selectedServerTag.tagCode}</span>
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
                {canShowBotCommands ? (
                  <ActionTooltip label="Commands" align="center">
                    <button
                      type="button"
                      onClick={onOpenBotCommandsDialog}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-indigo-500/35 bg-indigo-500/15 px-2 text-[11px] font-semibold tracking-[0.05em] text-indigo-200 transition hover:bg-indigo-500/25"
                      aria-label="Show bot commands"
                      title="Commands"
                    >
                      {isLoadingBotCommands ? "..." : "COMMANDS"}
                    </button>
                  </ActionTooltip>
                ) : null}

                <ActionTooltip label="Add Friend" align="center">
                  <button
                    type="button"
                    onClick={onAddFriend}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-[#1e1f22] text-[#dbdee1] transition hover:bg-[#2a2b30]"
                    aria-label="Add friend"
                    title="Add Friend"
                  >
                    <UserPlus suppressHydrationWarning className="h-4 w-4" />
                  </button>
                </ActionTooltip>

                <ActionTooltip label="Block" align="center">
                  <button
                    type="button"
                    onClick={onBlockUser}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-500/35 bg-rose-500/15 text-rose-200 transition hover:bg-rose-500/25"
                    aria-label="Block user"
                    title="Block"
                  >
                    <Ban suppressHydrationWarning className="h-4 w-4" />
                  </button>
                </ActionTooltip>

                <ActionTooltip label="Private Message" align="center">
                  <button
                    type="button"
                    onClick={onStartDirectMessage}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-[#1e1f22] text-[#dbdee1] transition hover:bg-[#2a2b30]"
                    aria-label="Open private message"
                    title="Private Message"
                  >
                    <MessageCircle suppressHydrationWarning className="h-4 w-4" />
                  </button>
                </ActionTooltip>

                <ActionTooltip label="Report User" align="center">
                  <button
                    type="button"
                    onClick={onReportUser}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-500/35 bg-amber-500/15 text-amber-200 transition hover:bg-amber-500/25"
                    aria-label="Report user"
                    title="Report User"
                  >
                    <Flag suppressHydrationWarning className="h-4 w-4" />
                  </button>
                </ActionTooltip>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <BotCommandsDialog
          open={isBotCommandsDialogOpen}
          onOpenChange={setIsBotCommandsDialogOpen}
          botName={botCommandsName || displayName || "Bot"}
          commands={botCommands}
        />
        <div className="flex w-full min-w-0 flex-col">
          <div className="flex items-center gap-x-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onMemberClick}
                onMouseEnter={prefetchProfileCard}
                className="font-semibold text-sm hover:underline cursor-pointer"
              >
                <ProfileNameWithServerTag
                  name={displayName}
                  profileId={member.profile.id}
                  memberId={member.id}
                  nameClassName={cn(
                    "font-semibold",
                    runtimeAccessibilityPreferences.largerChatFont ? "text-base" : "text-sm"
                  )}
                  plateMetaIcons={roleAndMetaIcons}
                />
              </button>
            </div>
            <span className="text-xs text-[#949ba4]">
              {timestamp}
            </span>
          </div>
          {isImage && runtimeTextImagesPreferences.showInlineMedia && (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "relative mt-2 overflow-hidden flex items-center",
                isEmote
                  ? "h-16 w-16 rounded-md"
                  : isSticker
                  ? "h-40 w-40 rounded-lg"
                  : "aspect-square rounded-md border bg-secondary h-48 w-48"
              )}
            >
              {isGif && runtimeTextImagesPreferences.autoplayGifs ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fileUrl}
                  alt={content}
                  className="h-full w-full object-cover"
                />
              ) : isGif ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-zinc-900/70 px-2 text-center text-[11px] text-zinc-100">
                  <span>GIF autoplay is off</span>
                  <span className="text-[10px] text-zinc-300">Open to view</span>
                </div>
              ) : isSticker && !runtimeTextImagesPreferences.autoplayStickers ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-zinc-900/70 px-2 text-center text-[11px] text-zinc-100">
                  <span>Sticker autoplay is off</span>
                  <span className="text-[10px] text-zinc-300">Open to view</span>
                </div>
              ) : (
                <Image
                  src={fileUrl}
                  alt={content}
                  fill
                  className={isSticker ? "object-contain" : "object-cover"}
                />
              )}
            </a>
          )}
          {isImage && !runtimeTextImagesPreferences.showInlineMedia ? (
            <div className="relative mt-2 flex items-center p-2 rounded-md border border-zinc-300/70 bg-zinc-100/80 dark:border-zinc-700 dark:bg-zinc-900/80">
              <FileIcon suppressHydrationWarning className="h-10 w-10 fill-indigo-200 stroke-indigo-400" />
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-sm text-indigo-500 dark:text-indigo-400 hover:underline"
              >
                Media attachment
              </a>
            </div>
          ) : null}
          {isPDF && runtimeTextImagesPreferences.showInlineMedia && (
            <div className="relative flex items-center p-2 mt-2 rounded-md bg-background/10">
              <FileIcon suppressHydrationWarning className="h-10 w-10 fill-indigo-200 stroke-indigo-400" />
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-sm text-indigo-500 dark:text-indigo-400 hover:underline"
              >
                PDF File
              </a>
            </div>
          )}
          {isPDF && !runtimeTextImagesPreferences.showInlineMedia && (
            <div className="relative flex items-center p-2 mt-2 rounded-md border border-zinc-300/70 bg-zinc-100/80 dark:border-zinc-700 dark:bg-zinc-900/80">
              <FileIcon suppressHydrationWarning className="h-10 w-10 fill-indigo-200 stroke-indigo-400" />
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-sm text-indigo-500 dark:text-indigo-400 hover:underline"
              >
                PDF File
              </a>
            </div>
          )}
          {isSoundEfx && fileUrl && runtimeTextImagesPreferences.showInlineMedia ? (
            <div className="mt-2 w-full max-w-md rounded-md border border-zinc-300/70 bg-zinc-100/80 p-2 dark:border-zinc-700 dark:bg-zinc-900/80">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                Sound EFX
              </p>
              <audio controls preload="none" className="w-full" src={fileUrl}>
                Your browser does not support the audio element.
              </audio>
            </div>
          ) : null}
          {isSoundEfx && fileUrl && !runtimeTextImagesPreferences.showInlineMedia ? (
            <div className="relative mt-2 flex items-center p-2 rounded-md border border-zinc-300/70 bg-zinc-100/80 dark:border-zinc-700 dark:bg-zinc-900/80">
              <FileIcon suppressHydrationWarning className="h-10 w-10 fill-indigo-200 stroke-indigo-400" />
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-sm text-indigo-500 dark:text-indigo-400 hover:underline"
              >
                Audio attachment
              </a>
            </div>
          ) : null}
          {!fileUrl && !isEditing && (
            <div
              aria-live={runtimeAccessibilityPreferences.enableScreenReaderAnnouncements ? "polite" : "off"}
              aria-atomic="false"
            >
              {quotedMessage ? (
                <div className="mb-1 rounded-md border-l-2 border-indigo-400/70 bg-indigo-500/10 px-2 py-1 text-xs text-indigo-100/95">
                  <p className="font-semibold text-indigo-200">Replying to {quotedMessage.authorName}</p>
                  <p className="mt-0.5 truncate">{quotedMessage.snippet || "Quoted message"}</p>
                </div>
              ) : null}

              <p
                className={cn(
                  "chat-wrap-text max-w-full text-[#2e3338] dark:text-[#dbdee1]",
                  runtimeAccessibilityPreferences.largerChatFont ? "text-base leading-7" : "text-sm",
                  runtimeAccessibilityPreferences.highContrastMode
                    ? "text-zinc-900 dark:text-zinc-100"
                    : null,
                  deleted &&
                    "italic text-zinc-500 dark:text-zinc-400 text-xs mt-1"
                )}
              >
                {contentSegments.map((segment, index) => {
                  if (segment.kind === "text") {
                    return (
                      <span key={`text-${index}`}>
                        {renderTextWithLinks(segment.value, `content-${id}-${index}`)}
                      </span>
                    );
                  }

                  return (
                    <span
                      key={`mention-${segment.entityType}-${segment.entityId}-${index}`}
                      className={cn(
                        "mx-0.5 inline-flex rounded px-1.5 py-0.5 font-semibold",
                        segment.entityType === "role"
                          ? "bg-amber-500/20 text-amber-700 dark:text-amber-200"
                          : "bg-indigo-500/20 text-indigo-700 dark:text-indigo-200"
                      )}
                      title={`Mentioned ${segment.entityType}: ${segment.label}`}
                    >
                      @{segment.label}
                    </span>
                  );
                })}
                {isUpdated && !deleted && (
                  <span className="text-[10px] mx-2 text-zinc-500 dark:text-zinc-400">
                    (edited)
                  </span>
                )}
              </p>

              {voiceJoinNotification && !deleted ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => router.push(voiceJoinNotification.joinPath)}
                    className="inline-flex h-8 items-center justify-center rounded-md bg-emerald-500 px-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-emerald-400"
                  >
                    Join
                  </button>
                </div>
              ) : null}

              {runtimeTextImagesPreferences.showEmbeds && runtimeTextImagesPreferences.showLinkPreviews && renderedPreviews.length ? (
                <div className="mt-2 space-y-2">
                  {renderedPreviews.map((preview) => (
                    <a
                      key={`${id}-${preview.canonicalUrl}`}
                      href={preview.canonicalUrl || preview.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block overflow-hidden rounded-lg border border-zinc-300/70 bg-zinc-100/80 transition hover:bg-zinc-200/80 dark:border-zinc-700 dark:bg-zinc-900/80 dark:hover:bg-zinc-800/80"
                    >
                      <div className="flex">
                        {preview.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={preview.imageUrl}
                            alt={preview.title}
                            className="h-24 w-24 shrink-0 object-cover"
                          />
                        ) : null}

                        <div className="min-w-0 p-3">
                          <p className="truncate text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            {preview.siteName}
                          </p>
                          <p className="line-clamp-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                            {preview.title}
                          </p>
                          {preview.description ? (
                            <p className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-300">
                              {preview.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          )}
          {!deleted ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {postEmoteItems.map((item) =>
                item.kind === "reaction" ? (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onReactionClick(item.id)}
                    className={cn(
                      "inline-flex items-center rounded-full border text-xs transition",
                      runtimeEmojiPreferences.compactReactionButtons
                        ? "gap-1 px-2 py-0.5"
                        : "gap-1.5 px-2.5 py-1",
                      item.reactedByCurrentMember
                        ? "border-emerald-400/80 bg-emerald-500/15 text-emerald-100"
                        : "border-zinc-600/80 bg-zinc-700/40 text-zinc-200 hover:bg-zinc-700/60"
                    )}
                  >
                    <span>{item.emoji}</span>
                    <span>{item.count}</span>
                  </button>
                ) : (
                  <div key={item.id} className="relative">
                    <button
                      type="button"
                      onClick={() => setActivePickerId((prev) => (prev === item.id ? null : item.id))}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-500/80 bg-zinc-700/25 px-2.5 py-1 text-xs text-zinc-200 transition hover:bg-zinc-700/50"
                      title="Pick emoji"
                    >
                      <SmilePlus suppressHydrationWarning className="h-3.5 w-3.5" />
                      <span>Add</span>
                    </button>

                    {activePickerId === item.id ? (
                      <div className="absolute bottom-full z-20 mb-2 w-[320px] max-w-[80vw] grid grid-cols-6 gap-2 rounded-xl border border-zinc-500 bg-[#1e1f22] p-3 shadow-2xl shadow-black/50">
                        {quickReactionEmojis.map((emoji) => (
                          <button
                            key={`${item.id}-${emoji}`}
                            type="button"
                            onClick={() => onPickEmote(item.id, emoji)}
                            className="rounded-md px-2 py-2 text-xl leading-none transition hover:bg-zinc-700"
                            title={`Add ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              )}
            </div>
          ) : null}
          {!fileUrl && isEditing && (
            <Form {...form}>
              <form
                className="flex items-center w-full gap-x-2 pt-2"
                onSubmit={form.handleSubmit(onSubmit)}
              >
                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <div className="relative w-full">
                          <Input
                            disabled={isLoading}
                            className="p-2 bg-zinc-200/90 dark:bg-zinc-700/75 border-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-zinc-600 dark:text-zinc-200"
                            placeholder="Edited message"
                            {...field}
                          />
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button disabled={isLoading} size="sm" variant="primary">
                  Save
                </Button>
              </form>
              <span className="text-[10px] mt-1 text-zinc-400">
                Press escape to cancel, enter to save
              </span>
            </Form>
          )}
        </div>
      </div>
      {!deleted && (
        <div className="absolute -top-3 right-5 flex items-center gap-x-2 rounded-md border border-black/25 bg-[#1e1f22] p-1 opacity-0 shadow-lg transition group-hover:opacity-100">
          <ActionTooltip label={threadActionLabel} align="center">
            <MessageCircle
              suppressHydrationWarning
              onClick={() => {
                if (canUseThreads) {
                  void onOpenThread();
                }
              }}
              className={cn(
                actionIconClassName,
                canUseThreads && !isThreadActionPending
                  ? actionIconEnabledClassName
                  : actionIconDisabledClassName
              )}
            />
          </ActionTooltip>

          <ActionTooltip label="Reply" align="center">
            <Reply
              suppressHydrationWarning
              onClick={onQuoteMessage}
              className={cn(actionIconClassName, actionIconEnabledClassName)}
            />
          </ActionTooltip>

          <ActionTooltip label={canEditMessage ? "Edit" : "Edit unavailable"} align="center">
            <Edit
              suppressHydrationWarning
              onClick={() => {
                if (canEditMessage) {
                  setIsEditing(true);
                }
              }}
              className={cn(
                actionIconClassName,
                canEditMessage ? actionIconEnabledClassName : actionIconDisabledClassName
              )}
            />
          </ActionTooltip>

          <ActionTooltip label={canDeleteMessage ? "Delete" : "Delete unavailable"} align="center">
            <Trash
              suppressHydrationWarning
              onClick={() => {
                if (canDeleteMessage) {
                  onOpen("deleteMessage", {
                    apiUrl: `${socketUrl}/${id}`,
                    query: socketQuery,
                  });
                }
              }}
              className={cn(
                actionIconClassName,
                canDeleteMessage ? actionIconEnabledClassName : actionIconDisabledClassName
              )}
            />
          </ActionTooltip>

          <ActionTooltip label="Report" align="center">
            <Flag
              suppressHydrationWarning
              onClick={() => {
                void onReportMessage();
              }}
              className={cn(actionIconClassName, actionIconEnabledClassName)}
            />
          </ActionTooltip>
        </div>
      )}
    </div>
  );
};
