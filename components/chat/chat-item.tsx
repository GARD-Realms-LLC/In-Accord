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
import { cn } from "@/lib/utils";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useModal } from "@/hooks/use-modal-store";
import { getInAccordStaffLabel, isInAccordAdministrator, isInAccordDeveloper, isInAccordModerator } from "@/lib/in-accord-admin";
import { isBotUser } from "@/lib/is-bot-user";
import { extractQuotedContent, getQuoteSnippetFromBody } from "@/lib/message-quotes";
import { parseMentionSegments } from "@/lib/mentions";
import { extractUrlsFromText, splitTextWithUrls } from "@/lib/link-previews";
import { resolveProfileIcons, type ProfileIcon } from "@/lib/profile-icons";

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
    .filter((item) => typeof item.emoji === "string" && basicEmotes.includes(item.emoji))
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

const notifiedMentionMessageIds = new Set<string>();
const previewCache = new Map<string, LinkPreview | null>();

type LinkPreview = {
  url: string;
  siteName: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  canonicalUrl: string;
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
}: ChatItemProps) => {
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

  const [isEditing, setIsEditing] = useState(false);
  const [isProfilePopoverOpen, setIsProfilePopoverOpen] = useState(false);
  const [profileCard, setProfileCard] = useState<ProfileCardData | null>(null);
  const [displayName, setDisplayName] = useState(member.profile.name);
  const [displayImageUrl, setDisplayImageUrl] = useState(member.profile.imageUrl);
  const [linkPreviews, setLinkPreviews] = useState<Record<string, LinkPreview | null>>({});
  const [postEmoteItems, setPostEmoteItems] = useState<PostEmoteItem[]>(() =>
    createPostEmoteItemsFromReactions(initialReactions)
  );
  const [activePickerId, setActivePickerId] = useState<string | null>(null);
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
    setIsProfilePopoverOpen((prev) => !prev);
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
      window.alert("Unable to open DM from this view.");
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
          snippet: getQuoteSnippetFromBody(body),
        },
      })
    );
  };

  useEffect(() => {
    const handleKeyDown = (event: any) => {
      if (event.key === "Escape" || event.keyCode === 27) {
        setIsEditing(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keyDown", handleKeyDown);
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
      try {
        const response = await axios.get<ProfileCardData>(
          `/api/profile/${encodeURIComponent(member.profile.id)}/card`,
          { params: { memberId: member.id } }
        );

        if (!cancelled) {
          setProfileCard(response.data);
        }
      } catch {
        if (!cancelled) {
          setProfileCard(null);
        }
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
    let cancelled = false;

    const syncReactions = async () => {
      try {
        const response = await axios.get<{ reactions?: Array<{ emoji: string; count: number }> }>(
          `/api/messages/${id}/reactions`,
          {
            params: { scope: reactionScope },
          }
        );

        if (!cancelled) {
          applyServerReactions(response.data.reactions ?? []);
        }
      } catch {
        // ignore polling failures
      }
    };

    void syncReactions();
    const timer = window.setInterval(syncReactions, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [id, reactionScope]);

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
  const globalRoleFromProfile = (member.profile as Profile & { role?: string | null }).role ?? null;
  const effectiveGlobalRole = profileCard?.role ?? globalRoleFromProfile;
  const isGlobalDeveloper = isInAccordDeveloper(effectiveGlobalRole);
  const isGlobalAdministrator = isInAccordAdministrator(effectiveGlobalRole);
  const isGlobalModerator = isInAccordModerator(effectiveGlobalRole);
  const globalRoleLabel = getInAccordStaffLabel(effectiveGlobalRole);
  const highestRoleIcon = isGlobalDeveloper
    ? <Wrench className="h-4 w-4 text-cyan-400" aria-label={globalRoleLabel ?? "Developer"} />
    : isGlobalAdministrator
      ? <Crown className="h-4 w-4 text-rose-500" aria-label={globalRoleLabel ?? "Administrator"} />
      : isGlobalModerator
        ? <ModeratorLineIcon className="h-4 w-4 text-indigo-500" aria-label={globalRoleLabel ?? "Moderator"} />
        : isInAccordAdministrator(member.role)
          ? <Crown className="h-4 w-4 text-rose-500" aria-label="Administrator" />
          : isInAccordModerator(member.role)
            ? <ModeratorLineIcon className="h-4 w-4 text-indigo-500" aria-label="Moderator" />
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
  const effectiveBannerUrl = profileCard?.effectiveBannerUrl ?? profileCard?.bannerUrl ?? null;
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
  const { quote: quotedMessage, body: messageBody } = extractQuotedContent(content);
  const contentSegments = parseMentionSegments(messageBody);
  const hasMention = contentSegments.some((segment) => segment.kind === "mention");
  const isMentioningCurrentUser = contentSegments.some(
    (segment) =>
      segment.kind === "mention" &&
      segment.entityType === "user" &&
      segment.entityId === currentMember.profileId
  );
  const plainContentForNotification = contentSegments
    .map((segment) => (segment.kind === "mention" ? `@${segment.label}` : segment.value))
    .join("")
    .trim();
  const messageUrls = useMemo(() => extractUrlsFromText(messageBody, 3), [messageBody]);
  const renderedPreviews = messageUrls
    .map((url) => linkPreviews[url])
    .filter((item): item is LinkPreview => Boolean(item));

  useEffect(() => {
    if (!isMentioningCurrentUser || deleted) {
      return;
    }

    if (member.id === currentMember.id) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    if (notifiedMentionMessageIds.has(id)) {
      return;
    }

    notifiedMentionMessageIds.add(id);

    const title = `New mention from ${displayName}`;
    const body = plainContentForNotification || "You were mentioned in chat.";
    const shouldUseBrowserNotification = document.visibilityState !== "visible";

    if (shouldUseBrowserNotification && "Notification" in window) {
      const notify = () => {
        try {
          new Notification(title, {
            body,
            tag: `mention-${id}`,
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
    member.id,
    plainContentForNotification,
  ]);

  useEffect(() => {
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
          previewCache.set(url, preview);
          nextEntries.push([url, preview]);
        } catch {
          previewCache.set(url, null);
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
  }, [messageUrls]);

  return (
    <div
      className={cn(
        "relative group flex items-center p-4 transition w-full",
        isMentioningCurrentUser
          ? "bg-zinc-400 hover:bg-zinc-400 dark:bg-zinc-700 dark:hover:bg-zinc-700 border-l-4 border-amber-500/80"
          : hasMention
            ? "bg-zinc-300 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-800 border-l-4 border-zinc-500/70"
            : "hover:bg-black/5"
      )}
    >
      <div className="group flex gap-x-2 items-start w-full">
        <Popover open={isProfilePopoverOpen} onOpenChange={setIsProfilePopoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={onMemberClick}
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
                <Image
                  src={effectiveBannerUrl}
                  alt="User banner"
                  fill
                  className="object-cover"
                  unoptimized
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
                <div className="flex w-full min-w-0 items-center gap-1.5">
                  <ProfileNameWithServerTag
                    name={displayName || "Unknown User"}
                    profileId={member.profile.id}
                    memberId={member.id}
                    pronouns={profileCard?.pronouns?.trim() || null}
                    containerClassName="w-full min-w-0"
                    nameClassName="text-base font-bold text-white"
                    showNameplate
                    nameplateClassName="mb-0 h-20 w-full max-w-full"
                    plateMetaIcons={roleAndMetaIcons}
                    stretchTagUnderPlate
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
                    Name: {profileCard?.effectiveProfileName || profileCard?.realName || profileCard?.profileName || displayName || member.profile.email?.split("@")[0] || member.profile.id || "Unknown User"}
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
                <ActionTooltip label="Add Friend" align="center">
                  <button
                    type="button"
                    onClick={onAddFriend}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-[#1e1f22] text-[#dbdee1] transition hover:bg-[#2a2b30]"
                    aria-label="Add friend"
                    title="Add Friend"
                  >
                    <UserPlus className="h-4 w-4" />
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
                    <Ban className="h-4 w-4" />
                  </button>
                </ActionTooltip>

                <ActionTooltip label="Direct Message" align="center">
                  <button
                    type="button"
                    onClick={onStartDirectMessage}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-[#1e1f22] text-[#dbdee1] transition hover:bg-[#2a2b30]"
                    aria-label="Open direct message"
                    title="Direct Message"
                  >
                    <MessageCircle className="h-4 w-4" />
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
                    <Flag className="h-4 w-4" />
                  </button>
                </ActionTooltip>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex flex-col w-full">
          <div className="flex items-center gap-x-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onMemberClick}
                className="font-semibold text-sm hover:underline cursor-pointer"
              >
                <ProfileNameWithServerTag
                  name={displayName}
                  profileId={member.profile.id}
                  memberId={member.id}
                  nameClassName="font-semibold text-sm"
                  showNameplate
                  plateMetaIcons={roleAndMetaIcons}
                  stretchTagUnderPlate
                />
              </button>
            </div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {timestamp}
            </span>
          </div>
          {isImage && (
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
              {isGif ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fileUrl}
                  alt={content}
                  className="h-full w-full object-cover"
                />
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
          {isPDF && (
            <div className="relative flex items-center p-2 mt-2 rounded-md bg-background/10">
              <FileIcon className="h-10 w-10 fill-indigo-200 stroke-indigo-400" />
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
          {isSoundEfx && fileUrl ? (
            <div className="mt-2 w-full max-w-md rounded-md border border-zinc-300/70 bg-zinc-100/80 p-2 dark:border-zinc-700 dark:bg-zinc-900/80">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                Sound EFX
              </p>
              <audio controls preload="none" className="w-full" src={fileUrl}>
                Your browser does not support the audio element.
              </audio>
            </div>
          ) : null}
          {!fileUrl && !isEditing && (
            <div>
              {quotedMessage ? (
                <div className="mb-1 rounded-md border-l-2 border-indigo-400/70 bg-indigo-500/10 px-2 py-1 text-xs text-indigo-100/95">
                  <p className="font-semibold text-indigo-200">Replying to {quotedMessage.authorName}</p>
                  <p className="mt-0.5 truncate">{quotedMessage.snippet || "Quoted message"}</p>
                </div>
              ) : null}

              <p
                className={cn(
                  "chat-wrap-text text-sm text-zinc-600 dark:text-zinc-300",
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

              {renderedPreviews.length ? (
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
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition",
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
                      <SmilePlus className="h-3.5 w-3.5" />
                      <span>Add</span>
                    </button>

                    {activePickerId === item.id ? (
                      <div className="absolute bottom-full z-20 mb-2 w-[320px] max-w-[80vw] grid grid-cols-6 gap-2 rounded-xl border border-zinc-500 bg-[#1e1f22] p-3 shadow-2xl shadow-black/50">
                        {basicEmotes.map((emoji) => (
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
        <div className="hidden group-hover:flex items-center gap-x-2 absolute p-1 -top-2 right-5 bg-white dark:bg-zinc-800 border rounded-sm">
          <ActionTooltip label="Reply" align="center">
            <Reply
              onClick={onQuoteMessage}
              className="cursor-pointer ml-auto w-4 h-4 text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
            />
          </ActionTooltip>
          {canEditMessage && (
            <ActionTooltip label="Edit" align="center">
              <Edit
                onClick={() => setIsEditing(true)}
                className="cursor-pointer ml-auto w-4 h-4 text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
              />
            </ActionTooltip>
          )}
          {canDeleteMessage && (
            <ActionTooltip label="Delete" align="center">
              <Trash
                onClick={() =>
                  onOpen("deleteMessage", {
                    apiUrl: `${socketUrl}/${id}`,
                    query: socketQuery,
                  })
                }
                className="cursor-pointer ml-auto w-4 h-4 text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
              />
            </ActionTooltip>
          )}
        </div>
      )}
    </div>
  );
};
