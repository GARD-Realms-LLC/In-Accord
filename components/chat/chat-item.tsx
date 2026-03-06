"use client";

import * as z from "zod";
import axios from "axios";
import qs from "query-string";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Member, MemberRole, type Profile } from "@/lib/db/types";
import { Crown, Edit, FileIcon, MessageCircle, ShieldAlert, ShieldCheck, SmilePlus, Trash, UserPlus } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { UserAvatar } from "@/components/user-avatar";
import { BotAppBadge } from "@/components/bot-app-badge";
import { NewUserCloverBadge } from "@/components/new-user-clover-badge";
import { ActionTooltip } from "@/components/action-tooltip";
import { cn } from "@/lib/utils";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useModal } from "@/hooks/use-modal-store";
import { isInAccordAdministrator } from "@/lib/in-accord-admin";
import { isBotUser } from "@/lib/is-bot-user";
import { parseMentionSegments } from "@/lib/mentions";

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
    bannerUrl: string | null;
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

  const onAddFriend = () => {
    window.alert("Friend requests are coming soon.");
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
      }
    };

    window.addEventListener("inaccord:profile-updated", onProfileUpdated);

    return () => {
      window.removeEventListener("inaccord:profile-updated", onProfileUpdated);
    };
  }, [currentMember.profileId, member.profile.id]);

  const fileType = fileUrl?.split(".").pop();
  const isGif = !!fileUrl && /\.gif(\?|$)/i.test(fileUrl);
  const isSticker =
    !!fileUrl &&
    (content.trim().toLowerCase() === "[sticker]" || /\/stickers\//i.test(fileUrl));

  const isAdmin = currentMember.role === MemberRole.ADMIN;
  const isModerator = currentMember.role === MemberRole.MODERATOR;
  const isOwner = currentMember.id === member.id;
  const canDeleteMessage = !deleted && (isAdmin || isModerator || isOwner);
  const canEditMessage = !deleted && isOwner && !fileUrl;
  const isPDF = fileType === "pdf" && fileUrl;
  const isImage = !isPDF && fileUrl;
  const showBotBadge = isBotUser({
    name: displayName,
    email: member.profile.email,
  });
  const globalRoleFromProfile = (member.profile as Profile & { role?: string | null }).role ?? null;
  const isInAccordAdmin = isInAccordAdministrator(profileCard?.role ?? globalRoleFromProfile);
  const highestRoleIcon = isInAccordAdmin
    ? <Crown className="h-3.5 w-3.5 text-rose-500" aria-label="In-Accord Administrator" />
    : member.role === MemberRole.ADMIN
      ? <ShieldAlert className="h-4 w-4 text-rose-500" />
      : member.role === MemberRole.MODERATOR
        ? <ShieldCheck className="h-4 w-4 text-indigo-500" />
        : null;
  const highestRoleLabel = isInAccordAdmin
    ? "In-Accord Administrator"
    : member.role === MemberRole.ADMIN
      ? "ADMIN"
      : member.role === MemberRole.MODERATOR
        ? "MODERATOR"
        : null;
  const effectiveBannerUrl = profileCard?.bannerUrl ?? null;
  const memberCreatedDate = profileCard?.createdAt
    ? new Date(profileCard.createdAt)
    : member.profile.createdAt
      ? new Date(member.profile.createdAt)
      : null;
  const memberCreatedDisplay =
    memberCreatedDate && !Number.isNaN(memberCreatedDate.getTime())
      ? memberCreatedDate.toLocaleString()
      : "Unknown";
  const contentSegments = parseMentionSegments(content);
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

    const notifiedKey = `inaccord:mention-notified:${id}`;
    if (window.sessionStorage.getItem(notifiedKey) === "1") {
      return;
    }

    window.sessionStorage.setItem(notifiedKey, "1");

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
            <div className="relative h-24 bg-gradient-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
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

            <div className="relative p-3 pt-7">
              <div className="absolute -top-5 left-3 rounded-full border-4 border-[#111214]">
                <UserAvatar src={displayImageUrl} className="h-10 w-10" />
              </div>

              <div className="flex min-w-0 items-center gap-1.5">
                <p className="truncate text-base font-bold text-white">{displayName || "Unknown User"}</p>
                {highestRoleIcon && highestRoleLabel ? (
                  <ActionTooltip label={highestRoleLabel} align="center">
                    {highestRoleIcon}
                  </ActionTooltip>
                ) : null}
                <NewUserCloverBadge createdAt={member.profile.createdAt} className="text-sm" />
                {showBotBadge ? <BotAppBadge className="h-4 px-1 text-[9px]" /> : null}
              </div>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-[#949ba4]">In-Accord Profile</p>

              <div className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] p-3 text-xs">
                <div className="space-y-1 text-[#dbdee1]">
                  <p>Users ID: {member.profile.id || "N/A"}</p>
                  <p>Name: {profileCard?.realName || displayName || "Unknown User"}</p>
                  <p>Email: {profileCard?.email || member.profile.email || "N/A"}</p>
                  <p>Role: {member.role}</p>
                  <p>Created: {memberCreatedDisplay}</p>
                </div>
              </div>

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
                {displayName}
              </button>
              {highestRoleIcon && highestRoleLabel ? (
                <ActionTooltip label={highestRoleLabel} align="center">
                  {highestRoleIcon}
                </ActionTooltip>
              ) : null}
              <NewUserCloverBadge createdAt={member.profile.createdAt} className="text-xs" />
              {showBotBadge ? <BotAppBadge className="ml-1.5 h-4 px-1 text-[9px]" /> : null}
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
                isSticker
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
          {!fileUrl && !isEditing && (
            <p
              className={cn(
                "text-sm text-zinc-600 dark:text-zinc-300",
                deleted &&
                  "italic text-zinc-500 dark:text-zinc-400 text-xs mt-1"
              )}
            >
              {contentSegments.map((segment, index) => {
                if (segment.kind === "text") {
                  return <span key={`text-${index}`}>{segment.value}</span>;
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
                      <div className="absolute z-20 mt-2 w-[320px] max-w-[80vw] grid grid-cols-6 gap-2 rounded-xl border border-zinc-500 bg-[#1e1f22] p-3 shadow-2xl shadow-black/50">
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
      {canDeleteMessage && (
        <div className="hidden group-hover:flex items-center gap-x-2 absolute p-1 -top-2 right-5 bg-white dark:bg-zinc-800 border rounded-sm">
          {canEditMessage && (
            <ActionTooltip label="Edit" align="center">
              <Edit
                onClick={() => setIsEditing(true)}
                className="cursor-pointer ml-auto w-4 h-4 text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
              />
            </ActionTooltip>
          )}
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
        </div>
      )}
    </div>
  );
};
