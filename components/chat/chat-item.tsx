"use client";

import * as z from "zod";
import axios from "axios";
import qs from "query-string";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Member, MemberRole, type Profile } from "@/lib/db/types";
import { Edit, FileIcon, ShieldAlert, ShieldCheck, SmilePlus, Trash } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

import { UserAvatar } from "@/components/user-avatar";
import { BotAppBadge } from "@/components/bot-app-badge";
import { NewUserCloverBadge } from "@/components/new-user-clover-badge";
import { ActionTooltip } from "@/components/action-tooltip";
import { cn } from "@/lib/utils";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useModal } from "@/hooks/use-modal-store";
import { isBotUser } from "@/lib/is-bot-user";

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

const roleIconMap = {
  GUEST: null,
  MODERATOR: <ShieldCheck className="h-4 w-4 ml-2 text-indigo-500" />,
  ADMIN: <ShieldAlert className="h-4 w-4 ml-2 text-rose-500" />,
};

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
  const [isEditing, setIsEditing] = useState(false);
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
    if (member.id === currentMember.id) {
      return;
    }

    const serverIdFromRoute =
      typeof params?.serverId === "string"
        ? params.serverId
        : Array.isArray(params?.serverId)
          ? (params?.serverId[0] ?? "")
          : "";

    const effectiveServerId = dmServerId ?? serverIdFromRoute;
    if (!effectiveServerId) {
      return;
    }

    router.push(`/users?serverId=${encodeURIComponent(effectiveServerId)}&memberId=${encodeURIComponent(member.id)}`);
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

  return (
    <div className="relative group flex items-center hover:bg-black/5 p-4 transition w-full">
      <div className="group flex gap-x-2 items-start w-full">
        <div
          onClick={onMemberClick}
          className="cursor-pointer hover:drop-shadow-md transition"
        >
          <UserAvatar src={displayImageUrl} />
        </div>
        <div className="flex flex-col w-full">
          <div className="flex items-center gap-x-2">
            <div className="flex items-center">
              <p
                onClick={onMemberClick}
                className="font-semibold text-sm hover:underline cursor-pointer"
              >
                {displayName}
              </p>
              <NewUserCloverBadge createdAt={member.profile.createdAt} className="text-xs" />
              {showBotBadge ? <BotAppBadge className="ml-1.5 h-4 px-1 text-[9px]" /> : null}
              <ActionTooltip label={member.role} align="center">
                {roleIconMap[member.role]}
              </ActionTooltip>
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
              {content}
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
