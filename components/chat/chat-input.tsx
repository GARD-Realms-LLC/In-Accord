"use client";

import * as z from "zod";
import axios from "axios";
import qs from "query-string";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Reply, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { useModal } from "@/hooks/use-modal-store";
import { EmojiPicker } from "@/components/emoji-picker";
import { GifPicker } from "@/components/gif-picker";
import { EmotePicker } from "@/components/emote-picker";
import { StickerPicker } from "@/components/sticker-picker";
import { SoundEfxPicker } from "@/components/sound-efx-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  type MentionOption,
  readMentionsEnabled,
  writeMentionsEnabled,
} from "@/lib/mentions";
import {
  emitLocalChatConfirmedMessageForRoute,
  emitLocalChatFailedMessageForRoute,
  emitLocalChatOptimisticMessageForRoute,
  type LocalChatMutationMessage,
} from "@/lib/chat-live-events";
import { buildQuotedContent, type QuotedMessageMeta } from "@/lib/message-quotes";

interface ChatInputProps {
  apiUrl: string;
  query: Record<string, any>;
  name: string;
  type: "conversation" | "channel";
  conversationId?: string;
  disabled?: boolean;
  mentionUsers?: Array<{ id: string; label: string }>;
  mentionRoles?: Array<{ id: string; label: string }>;
  canBulkDeleteMessages?: boolean;
}

const formSchema = z.object({
  content: z.string().min(1),
});

type RuntimeEmojiPreferences = {
  showComposerEmojiButton: boolean;
  compactReactionButtons: boolean;
  defaultComposerEmoji: string;
  favoriteEmojis: string[];
};

type SlashCommandOption = {
  name: string;
  description: string;
  sourceType: "BOT" | "APP" | "SYSTEM";
  sourceName: string;
};

const defaultRuntimeEmojiPreferences: RuntimeEmojiPreferences = {
  showComposerEmojiButton: true,
  compactReactionButtons: false,
  defaultComposerEmoji: "😊",
  favoriteEmojis: ["😀", "😂", "😍", "🔥", "👏", "🎉", "👍", "👀"],
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

const normalizeHttpOrigin = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }

    return parsed.origin.replace(/\/$/, "");
  } catch {
    return "";
  }
};

const resolveAbsoluteAppUrl = (origin: string, relativeOrAbsoluteUrl: string) => {
  const normalizedUrl = String(relativeOrAbsoluteUrl ?? "").trim();
  if (!normalizedUrl) {
    return normalizedUrl;
  }

  if (/^https?:\/\//i.test(normalizedUrl)) {
    return normalizedUrl;
  }

  if (!origin) {
    return normalizedUrl;
  }

  try {
    return new URL(normalizedUrl, origin).toString();
  } catch {
    return normalizedUrl;
  }
};

export const ChatInput = ({
  apiUrl,
  query,
  name,
  type,
  conversationId,
  disabled = false,
  mentionUsers = [],
  mentionRoles = [],
  canBulkDeleteMessages = false,
}: ChatInputProps) => {
  const { onOpen } = useModal();
  const [sendError, setSendError] = useState<string | null>(null);
  const [mentionsEnabled, setMentionsEnabled] = useState(true);
  const [activeMentionStart, setActiveMentionStart] = useState<number | null>(null);
  const [activeMentionEnd, setActiveMentionEnd] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [slashCommands, setSlashCommands] = useState<SlashCommandOption[]>([]);
  const [isLoadingSlashCommands, setIsLoadingSlashCommands] = useState(false);
  const [lastSlashCommandsLoadedAt, setLastSlashCommandsLoadedAt] = useState(0);
  const [activeSlashStart, setActiveSlashStart] = useState<number | null>(null);
  const [activeSlashEnd, setActiveSlashEnd] = useState<number | null>(null);
  const [slashQuery, setSlashQuery] = useState("");
  const [activeSlashIndex, setActiveSlashIndex] = useState(0);
  const [runtimeEmojiPreferences, setRuntimeEmojiPreferences] = useState<RuntimeEmojiPreferences>({
    ...defaultRuntimeEmojiPreferences,
  });
  const [activeQuote, setActiveQuote] = useState<QuotedMessageMeta | null>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [appOrigin, setAppOrigin] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const resolvedApiUrl = useMemo(() => resolveAbsoluteAppUrl(appOrigin, apiUrl), [apiUrl, appOrigin]);

  useEffect(() => {
    let cancelled = false;

    const resolveAppOrigin = async () => {
      const nextOrigin =
        (typeof window !== "undefined" ? normalizeHttpOrigin(window.location.href) : "") ||
        normalizeHttpOrigin(process.env.NEXT_PUBLIC_SITE_URL);

      if (!cancelled) {
        setAppOrigin(nextOrigin);
      }
    };

    void resolveAppOrigin();

    return () => {
      cancelled = true;
    };
  }, []);

  const mentionOptions = useMemo<MentionOption[]>(() => {
    const userOptions = mentionUsers
      .map((item) => ({
        id: String(item.id ?? "").trim(),
        label: String(item.label ?? "").trim(),
        type: "user" as const,
      }))
      .filter((item) => item.id && item.label);

    const roleOptions = mentionRoles
      .map((item) => ({
        id: String(item.id ?? "").trim(),
        label: String(item.label ?? "").trim(),
        type: "role" as const,
      }))
      .filter((item) => item.id && item.label);

    return [...userOptions, ...roleOptions];
  }, [mentionRoles, mentionUsers]);

  const filteredMentionOptions = useMemo(() => {
    if (!mentionsEnabled || activeMentionStart === null || activeMentionEnd === null) {
      return [] as MentionOption[];
    }

    const normalizedQuery = mentionQuery.trim().toLowerCase();
    const visible = mentionOptions.filter((item) => {
      if (!normalizedQuery) {
        return true;
      }

      return item.label.toLowerCase().includes(normalizedQuery);
    });

    return visible.slice(0, 8);
  }, [activeMentionEnd, activeMentionStart, mentionOptions, mentionQuery, mentionsEnabled]);

  const isMentionMenuOpen = filteredMentionOptions.length > 0;

  const filteredSlashCommands = useMemo(() => {
    if (type !== "channel" || activeSlashStart === null || activeSlashEnd === null) {
      return [] as SlashCommandOption[];
    }

    const normalizedQuery = slashQuery.trim().toLowerCase();
    const visible = slashCommands.filter((item) => {
      if (!normalizedQuery) {
        return true;
      }

      return item.name.toLowerCase().includes(normalizedQuery);
    });

    return visible.slice(0, 100);
  }, [activeSlashEnd, activeSlashStart, slashCommands, slashQuery, type]);

  const isSlashMenuOpen = filteredSlashCommands.length > 0;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      content: "",
    },
  });

  const isLoading = form.formState.isSubmitting || disabled;
  const stickerServerId = useMemo(() => {
    const raw = query?.serverId;
    if (typeof raw === "string") {
      return raw;
    }

    if (Array.isArray(raw)) {
      const first = raw.find((value) => typeof value === "string");
      return typeof first === "string" ? first : null;
    }

    return null;
  }, [query]);

  useEffect(() => {
    if (type !== "channel" || !stickerServerId) {
      setSlashCommands([]);
      setLastSlashCommandsLoadedAt(0);
      return;
    }

    let cancelled = false;

    const loadSlashCommands = async () => {
      try {
        if (!cancelled) {
          setIsLoadingSlashCommands(true);
        }

        const response = await fetch(resolveAbsoluteAppUrl(appOrigin, `/api/servers/${encodeURIComponent(stickerServerId)}/slash-commands`), {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        if (!response.ok) {
          if (!cancelled) {
            setSlashCommands([]);
          }
          return;
        }

        const payload = (await response.json()) as { commands?: unknown };
        const commands = Array.isArray(payload.commands)
          ? payload.commands
              .map((item) => {
                if (!item || typeof item !== "object") {
                  return null;
                }

                const source = item as Partial<SlashCommandOption>;
                const name = String(source.name ?? "").trim();
                const description = String(source.description ?? "").trim();
                const sourceName = String(source.sourceName ?? "Integration").trim() || "Integration";
                const sourceType =
                  source.sourceType === "BOT" || source.sourceType === "APP" || source.sourceType === "SYSTEM"
                    ? source.sourceType
                    : "SYSTEM";

                if (!name) {
                  return null;
                }

                return { name, description, sourceType, sourceName } satisfies SlashCommandOption;
              })
              .filter((item): item is SlashCommandOption => Boolean(item))
          : [];

        if (!cancelled) {
          setSlashCommands(commands);
          setLastSlashCommandsLoadedAt(Date.now());
        }
      } catch {
        if (!cancelled) {
          setSlashCommands([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSlashCommands(false);
        }
      }
    };

    void loadSlashCommands();

    return () => {
      cancelled = true;
    };
  }, [stickerServerId, type]);

  useEffect(() => {
    let cancelled = false;

    const syncMentionsPreference = async () => {
      try {
        const response = await fetch(resolveAbsoluteAppUrl(appOrigin, "/api/profile/preferences"), {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        if (!response.ok) {
          if (!cancelled) {
            setMentionsEnabled(readMentionsEnabled());
          }
          return;
        }

        const payload = (await response.json()) as { mentionsEnabled?: unknown };
        const next = payload.mentionsEnabled !== false;
        writeMentionsEnabled(next);

        if (!cancelled) {
          setMentionsEnabled(next);
        }
      } catch {
        if (!cancelled) {
          setMentionsEnabled(readMentionsEnabled());
        }
      }
    };

    void syncMentionsPreference();

    const onMentionsPreferenceChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ mentionsEnabled?: boolean }>;
      const next = customEvent.detail?.mentionsEnabled;

      if (typeof next === "boolean") {
        writeMentionsEnabled(next);
        setMentionsEnabled(next);
        return;
      }

      void syncMentionsPreference();
    };

    window.addEventListener("inaccord:mentions-setting-updated", onMentionsPreferenceChanged);

    return () => {
      cancelled = true;
      window.removeEventListener("inaccord:mentions-setting-updated", onMentionsPreferenceChanged);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncEmojiPreferences = async () => {
      try {
        const response = await fetch(resolveAbsoluteAppUrl(appOrigin, "/api/profile/preferences"), {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        if (!response.ok) {
          if (!cancelled) {
            setRuntimeEmojiPreferences({ ...defaultRuntimeEmojiPreferences });
          }
          return;
        }

        const payload = (await response.json()) as { emoji?: unknown };
        const next = normalizeRuntimeEmojiPreferences(payload.emoji);

        if (!cancelled) {
          setRuntimeEmojiPreferences(next);
        }
      } catch {
        if (!cancelled) {
          setRuntimeEmojiPreferences({ ...defaultRuntimeEmojiPreferences });
        }
      }
    };

    void syncEmojiPreferences();

    const onEmojiPreferencesChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ emoji?: unknown }>;

      if (customEvent.detail?.emoji) {
        setRuntimeEmojiPreferences(normalizeRuntimeEmojiPreferences(customEvent.detail.emoji));
        return;
      }

      void syncEmojiPreferences();
    };

    window.addEventListener("inaccord:emoji-preferences-updated", onEmojiPreferencesChanged);

    return () => {
      cancelled = true;
      window.removeEventListener("inaccord:emoji-preferences-updated", onEmojiPreferencesChanged);
    };
  }, []);

  const onInsertEmoji = (value: string) => {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
      return;
    }

    const current = String(form.getValues("content") ?? "");
    const nextValue = current.length ? `${current} ${normalized}` : normalized;

    form.setValue("content", nextValue, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });

    onTypingHeartbeat(nextValue);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  useEffect(() => {
    const onQuoteMessage = (event: Event) => {
      const customEvent = event as CustomEvent<QuotedMessageMeta>;
      const messageId = String(customEvent.detail?.messageId ?? "").trim();

      if (!messageId) {
        return;
      }

      setActiveQuote({
        messageId,
        authorName: String(customEvent.detail?.authorName ?? "Deleted User").trim() || "Deleted User",
        authorProfileId: String(customEvent.detail?.authorProfileId ?? "").trim() || undefined,
        snippet: String(customEvent.detail?.snippet ?? "").trim(),
      });

      inputRef.current?.focus();
    };

    window.addEventListener("inaccord:quote-message", onQuoteMessage as EventListener);

    return () => {
      window.removeEventListener("inaccord:quote-message", onQuoteMessage as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!isMentionMenuOpen) {
      setActiveMentionIndex(0);
      return;
    }

    setActiveMentionIndex((prev) => Math.min(prev, filteredMentionOptions.length - 1));
  }, [filteredMentionOptions.length, isMentionMenuOpen]);

  useEffect(() => {
    if (!isSlashMenuOpen) {
      setActiveSlashIndex(0);
      return;
    }

    setActiveSlashIndex((prev) => Math.min(prev, filteredSlashCommands.length - 1));
  }, [filteredSlashCommands.length, isSlashMenuOpen]);

  const clearMentionState = () => {
    setActiveMentionStart(null);
    setActiveMentionEnd(null);
    setMentionQuery("");
    setActiveMentionIndex(0);
  };

  const clearSlashState = () => {
    setActiveSlashStart(null);
    setActiveSlashEnd(null);
    setSlashQuery("");
    setActiveSlashIndex(0);
  };

  const detectMentionState = (value: string, caret: number | null | undefined) => {
    if (!mentionsEnabled || !mentionOptions.length || typeof caret !== "number") {
      clearMentionState();
      return;
    }

    const textBeforeCaret = value.slice(0, caret);
    const atIndex = textBeforeCaret.lastIndexOf("@");

    if (atIndex < 0) {
      clearMentionState();
      return;
    }

    const charBeforeAt = atIndex > 0 ? textBeforeCaret[atIndex - 1] : " ";
    if (atIndex > 0 && !/\s/.test(charBeforeAt)) {
      clearMentionState();
      return;
    }

    const draft = textBeforeCaret.slice(atIndex + 1);

    if (draft.includes(" ") || draft.includes("\n") || draft.includes("\t") || draft.includes("[")) {
      clearMentionState();
      return;
    }

    setActiveMentionStart(atIndex);
    setActiveMentionEnd(caret);
    setMentionQuery(draft);
  };

  const detectSlashState = (value: string, caret: number | null | undefined) => {
    if (type !== "channel" || typeof caret !== "number") {
      clearSlashState();
      return;
    }

    const textBeforeCaret = value.slice(0, caret);
    const slashIndex = textBeforeCaret.lastIndexOf("/");

    if (slashIndex < 0) {
      clearSlashState();
      return;
    }

    const beforeSlash = textBeforeCaret.slice(0, slashIndex);
    if (beforeSlash.trim().length > 0) {
      clearSlashState();
      return;
    }

    const draft = textBeforeCaret.slice(slashIndex + 1);
    if (/\s/.test(draft)) {
      clearSlashState();
      return;
    }

    setActiveSlashStart(slashIndex);
    setActiveSlashEnd(caret);
    setSlashQuery(draft);

    if (stickerServerId && Date.now() - lastSlashCommandsLoadedAt > 5000 && !isLoadingSlashCommands) {
      setIsLoadingSlashCommands(true);
      void fetch(resolveAbsoluteAppUrl(appOrigin, `/api/servers/${encodeURIComponent(stickerServerId)}/slash-commands`), {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      })
        .then(async (response) => {
          if (!response.ok) {
            return;
          }

          const payload = (await response.json()) as { commands?: unknown };
          const commands = Array.isArray(payload.commands)
            ? payload.commands
                .map((item) => {
                  if (!item || typeof item !== "object") {
                    return null;
                  }

                  const source = item as Partial<SlashCommandOption>;
                  const name = String(source.name ?? "").trim();
                  const description = String(source.description ?? "").trim();
                  const sourceName = String(source.sourceName ?? "Integration").trim() || "Integration";
                  const sourceType =
                    source.sourceType === "BOT" || source.sourceType === "APP" || source.sourceType === "SYSTEM"
                      ? source.sourceType
                      : "SYSTEM";

                  if (!name) {
                    return null;
                  }

                  return { name, description, sourceType, sourceName } satisfies SlashCommandOption;
                })
                .filter((item): item is SlashCommandOption => Boolean(item))
            : [];

          setSlashCommands(commands);
          setLastSlashCommandsLoadedAt(Date.now());
        })
        .catch(() => {
          // keep existing slash command cache if refresh fails
        })
        .finally(() => {
          setIsLoadingSlashCommands(false);
        });
    }
  };

  const insertSlashCommand = (option: SlashCommandOption) => {
    const currentContent = String(form.getValues("content") ?? "");
    const slashStart = activeSlashStart;
    const slashEnd = activeSlashEnd;

    if (slashStart === null || slashEnd === null) {
      return;
    }

    const before = currentContent.slice(0, slashStart);
    const after = currentContent.slice(slashEnd);
    const token = `/${option.name} `;
    const nextValue = `${before}${token}${after}`;
    const nextCaretPosition = before.length + token.length;

    form.setValue("content", nextValue, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });

    clearSlashState();

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCaretPosition, nextCaretPosition);
    });
  };

  const insertMention = (option: MentionOption) => {
    const currentContent = String(form.getValues("content") ?? "");
    const mentionStart = activeMentionStart;
    const mentionEnd = activeMentionEnd;

    if (mentionStart === null || mentionEnd === null) {
      return;
    }

    const before = currentContent.slice(0, mentionStart);
    const after = currentContent.slice(mentionEnd);
    const token = `@${option.label} `;
    const nextValue = `${before}${token}${after}`;
    const nextCaretPosition = before.length + token.length;

    form.setValue("content", nextValue, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });

    clearMentionState();

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCaretPosition, nextCaretPosition);
    });
  };

  const encodeMentionLabelsForSubmit = (rawContent: string) => {
    if (!rawContent.trim() || !mentionOptions.length) {
      return rawContent;
    }

    const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const sortedMentionOptions = [...mentionOptions].sort((a, b) => b.label.length - a.label.length);
    let nextContent = rawContent;

    for (const option of sortedMentionOptions) {
      const label = String(option.label ?? "").trim();
      if (!label) {
        continue;
      }

      const escapedLabel = escapeRegExp(label);
      const mentionRegex = new RegExp(`(^|\\s)@${escapedLabel}(?=\\s|$|[.,!?;:])`, "g");
      const mentionToken = `@[${label}](${option.type}:${option.id})`;

      nextContent = nextContent.replace(mentionRegex, (_match, leadingWhitespace: string) => {
        return `${leadingWhitespace}${mentionToken}`;
      });
    }

    return nextContent;
  };

  const stopConversationTyping = () => {
    if (type !== "conversation" || !conversationId) {
      return;
    }

    void axios.post(
      resolveAbsoluteAppUrl(appOrigin, "/api/direct-messages/typing"),
      {
        conversationId,
        isTyping: false,
      },
      {
        withCredentials: true,
      }
    );
  };

  const resetComposerState = () => {
    form.reset();
    clearMentionState();
    clearSlashState();
    setActiveQuote(null);
  };

  const sendMessage = async ({
    content,
    fileUrl = null,
    optimistic = true,
  }: {
    content: string;
    fileUrl?: string | null;
    optimistic?: boolean;
  }) => {
    const url = qs.stringifyUrl({
      url: resolvedApiUrl,
      query,
    });
    const clientMutationId = crypto.randomUUID();
    const normalizedFileUrl = typeof fileUrl === "string" && fileUrl.trim().length > 0 ? fileUrl.trim() : null;

    if (optimistic) {
      emitLocalChatOptimisticMessageForRoute(apiUrl, query, {
        clientMutationId,
        content,
        fileUrl: normalizedFileUrl,
      });
    }

    try {
      const response = await axios.post<LocalChatMutationMessage>(
        url,
        {
          content,
          fileUrl: normalizedFileUrl,
          clientMutationId,
        },
        {
          withCredentials: true,
        }
      );

      stopConversationTyping();
      resetComposerState();

      if (response.data?.id) {
        emitLocalChatConfirmedMessageForRoute(apiUrl, query, {
          clientMutationId,
          message: response.data,
        });
      }

      return response.data;
    } catch (error) {
      if (optimistic) {
        emitLocalChatFailedMessageForRoute(apiUrl, query, clientMutationId);
      }

      throw error;
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setSendError(null);

      const encodedContent = encodeMentionLabelsForSubmit(values.content);
      const isSlashCommandSubmission = type === "channel" && !activeQuote && encodedContent.trim().startsWith("/");

      await sendMessage({
        content: buildQuotedContent(encodedContent, activeQuote),
        optimistic: !isSlashCommandSubmission,
      });
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status;
        const dataMessage =
          typeof error.response?.data === "string"
            ? error.response.data
            : error.response?.data?.message;
        const normalizedMessage = String(dataMessage ?? "").trim();
        const isHtmlFallback = normalizedMessage.startsWith("<!DOCTYPE html") || normalizedMessage.startsWith("<html");
        const statusSuffix = statusCode ? ` (status ${statusCode})` : "";

        setSendError(
          isHtmlFallback
            ? `Failed to send message. Received an unexpected HTML response${statusSuffix}. Please refresh and try again.`
            : normalizedMessage || `Failed to send message${statusSuffix}.`
        );
      } else {
        setSendError("Failed to send message.");
      }

      console.error("[CHAT_INPUT_SEND]", error);
    }
  };

  const onTypingHeartbeat = (nextValue: string) => {
    if (type !== "conversation" || !conversationId) {
      return;
    }

    const isTyping = nextValue.trim().length > 0;
    void axios.post(
      resolveAbsoluteAppUrl(appOrigin, "/api/direct-messages/typing"),
      {
        conversationId,
        isTyping,
      },
      {
        withCredentials: true,
      }
    );
  };

  const onGifSelect = async (gifUrl: string) => {
    try {
      setSendError(null);

      await sendMessage({
        content: buildQuotedContent("[gif]", activeQuote),
        fileUrl: gifUrl,
      });
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const dataMessage =
          typeof error.response?.data === "string"
            ? error.response.data
            : error.response?.data?.message;

        setSendError(dataMessage || "Failed to send GIF.");
      } else {
        setSendError("Failed to send GIF.");
      }

      console.error("[CHAT_INPUT_SEND_GIF]", error);
    }
  };

  const onStickerSelect = async (stickerUrl: string) => {
    try {
      setSendError(null);

      await sendMessage({
        content: buildQuotedContent("[sticker]", activeQuote),
        fileUrl: stickerUrl,
      });
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const dataMessage =
          typeof error.response?.data === "string"
            ? error.response.data
            : error.response?.data?.message;

        setSendError(dataMessage || "Failed to send sticker.");
      } else {
        setSendError("Failed to send sticker.");
      }

      console.error("[CHAT_INPUT_SEND_STICKER]", error);
    }
  };

  const onEmoteSelect = async (emoteUrl: string) => {
    try {
      setSendError(null);

      await sendMessage({
        content: buildQuotedContent("[emote]", activeQuote),
        fileUrl: emoteUrl,
      });
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const dataMessage =
          typeof error.response?.data === "string"
            ? error.response.data
            : error.response?.data?.message;

        setSendError(dataMessage || "Failed to send emote.");
      } else {
        setSendError("Failed to send emote.");
      }

      console.error("[CHAT_INPUT_SEND_EMOTE]", error);
    }
  };

  const onSoundEfxSelect = async (soundEfxUrl: string) => {
    try {
      setSendError(null);

      await sendMessage({
        content: buildQuotedContent("[sound_efx]", activeQuote),
        fileUrl: soundEfxUrl,
      });
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const dataMessage =
          typeof error.response?.data === "string"
            ? error.response.data
            : error.response?.data?.message;

        setSendError(dataMessage || "Failed to send Sound EFX.");
      } else {
        setSendError("Failed to send Sound EFX.");
      }

      console.error("[CHAT_INPUT_SEND_SOUND_EFX]", error);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className="relative w-full p-4 pb-6">
                  {activeQuote ? (
                    <div className="mb-2 ml-14 mr-14 flex items-start justify-between rounded-md border border-indigo-500/35 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100">
                      <div className="min-w-0">
                        <p className="inline-flex items-center gap-1 font-semibold text-indigo-200">
                          <Reply className="h-3.5 w-3.5" suppressHydrationWarning /> Replying to {activeQuote.authorName}
                        </p>
                        <p className="mt-1 truncate text-indigo-100/90">{activeQuote.snippet || "Quoted message"}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveQuote(null)}
                        className="ml-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-indigo-200 transition hover:bg-indigo-500/25"
                        aria-label="Cancel quote"
                        title="Cancel quote"
                      >
                        <X className="h-3.5 w-3.5" suppressHydrationWarning />
                      </button>
                    </div>
                  ) : null}
                  <Popover open={isAddMenuOpen} onOpenChange={setIsAddMenuOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        disabled={isLoading}
                        className="absolute left-8 top-7 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-500 p-1 transition hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-400 dark:hover:bg-zinc-300"
                        aria-label="Open add menu"
                        title="Add"
                      >
                        <Plus className="text-white dark:text-[#313338]" suppressHydrationWarning />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="top"
                      align="start"
                      className="w-44 border-zinc-300 bg-white p-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddMenuOpen(false);
                          onOpen("messageFile", { apiUrl, query });
                        }}
                        className="flex w-full items-center rounded-md px-2 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      >
                        Upload File
                      </button>
                    </PopoverContent>
                  </Popover>
                  {canBulkDeleteMessages ? (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() =>
                        onOpen("bulkDeleteMessages", {
                          apiUrl: "/api/socket/messages/bulk-delete",
                          query,
                        })
                      }
                      className="absolute right-8 top-7 inline-flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition hover:bg-zinc-200 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-zinc-700/70 dark:hover:text-rose-300"
                      aria-label="Bulk delete posts"
                      title="Bulk delete newest posts"
                    >
                      <Trash2 className="h-4 w-4" suppressHydrationWarning />
                    </button>
                  ) : null}
                  <textarea
                    disabled={isLoading}
                    className={`min-h-11 max-h-44 w-full resize-none overflow-y-auto rounded-lg border-0 bg-[#ebedef] py-3 text-sm text-[#2e3338] shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-[#383a40] dark:text-[#dbdee1] ${canBulkDeleteMessages ? "px-14 pr-20" : "px-14"}`}
                    placeholder={`Message ${
                      type === "conversation" ? name : "#" + name
                    }`}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    rows={1}
                    {...field}
                    ref={(element) => {
                      field.ref(element);
                      inputRef.current = element;
                    }}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      field.onChange(nextValue);
                      onTypingHeartbeat(nextValue);
                      detectMentionState(nextValue, event.target.selectionStart);
                      detectSlashState(nextValue, event.target.selectionStart);

                      const area = event.target;
                      area.style.height = "auto";
                      area.style.height = `${Math.min(area.scrollHeight, 176)}px`;
                    }}
                    onKeyDown={(event) => {
                      if (isMentionMenuOpen) {
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          setActiveMentionIndex((prev) => (prev + 1) % filteredMentionOptions.length);
                          return;
                        }

                        if (event.key === "ArrowUp") {
                          event.preventDefault();
                          setActiveMentionIndex((prev) =>
                            prev <= 0 ? filteredMentionOptions.length - 1 : prev - 1
                          );
                          return;
                        }

                        if (event.key === "Enter" || event.key === "Tab") {
                          event.preventDefault();
                          const selected = filteredMentionOptions[activeMentionIndex] ?? filteredMentionOptions[0];
                          if (selected) {
                            insertMention(selected);
                          }
                          return;
                        }

                        if (event.key === "Escape") {
                          event.preventDefault();
                          clearMentionState();
                          return;
                        }
                      }

                      if (isSlashMenuOpen) {
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          setActiveSlashIndex((prev) => (prev + 1) % filteredSlashCommands.length);
                          return;
                        }

                        if (event.key === "ArrowUp") {
                          event.preventDefault();
                          setActiveSlashIndex((prev) =>
                            prev <= 0 ? filteredSlashCommands.length - 1 : prev - 1
                          );
                          return;
                        }

                        if (event.key === "Enter" || event.key === "Tab") {
                          event.preventDefault();
                          const selected = filteredSlashCommands[activeSlashIndex] ?? filteredSlashCommands[0];
                          if (selected) {
                            insertSlashCommand(selected);
                          }
                          return;
                        }

                        if (event.key === "Escape") {
                          event.preventDefault();
                          clearSlashState();
                          return;
                        }
                      }

                      if (event.key === "Escape" && activeQuote) {
                        event.preventDefault();
                        setActiveQuote(null);
                        return;
                      }

                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void form.handleSubmit(onSubmit)();
                      }
                    }}
                  />
                  {isMentionMenuOpen ? (
                    <div className="absolute bottom-16 left-14 right-16 z-20 max-h-56 overflow-auto rounded-lg border border-black/30 bg-[#1e1f22] p-1 shadow-2xl shadow-black/45">
                      {filteredMentionOptions.map((option, index) => {
                        const isActive = index === activeMentionIndex;
                        return (
                          <button
                            key={`${option.type}:${option.id}`}
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              insertMention(option);
                            }}
                            className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs transition ${
                              isActive
                                ? "bg-[#5865f2]/35 text-white"
                                : "text-[#dbdee1] hover:bg-[#2f3136]"
                            }`}
                          >
                            <span className="truncate">@{option.label}</span>
                            <span className="ml-2 shrink-0 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-[#949ba4]">
                              {option.type}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {isSlashMenuOpen ? (
                    <div className="absolute bottom-16 left-14 right-16 z-20 max-h-56 overflow-auto rounded-lg border border-black/30 bg-[#1e1f22] p-1 shadow-2xl shadow-black/45">
                      {filteredSlashCommands.map((option, index) => {
                        const isActive = index === activeSlashIndex;
                        return (
                          <button
                            key={`slash:${option.name}`}
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              insertSlashCommand(option);
                            }}
                            className={`flex w-full items-start justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs transition ${
                              isActive
                                ? "bg-[#5865f2]/35 text-white"
                                : "text-[#dbdee1] hover:bg-[#2f3136]"
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">/{option.name}</span>
                              <span className="mt-0.5 block truncate text-[10px] text-[#a8adb5]">{option.description || "Integration command"}</span>
                            </span>
                            <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-[#949ba4]">
                              {option.sourceType.toLowerCase()}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className={`absolute top-6.5 flex items-center gap-2 ${canBulkDeleteMessages ? "right-16" : "right-8"}`}>
                    {runtimeEmojiPreferences.showComposerEmojiButton ? (
                      <EmojiPicker
                        onChange={onInsertEmoji}
                        defaultEmoji={runtimeEmojiPreferences.defaultComposerEmoji}
                        favorites={runtimeEmojiPreferences.favoriteEmojis}
                      />
                    ) : null}
                    <EmotePicker onSelect={onEmoteSelect} serverId={stickerServerId} />
                    <StickerPicker onSelect={onStickerSelect} serverId={stickerServerId} />
                    <SoundEfxPicker onSelect={onSoundEfxSelect} serverId={stickerServerId} />
                    <GifPicker onSelect={onGifSelect} serverId={stickerServerId} />
                  </div>
                  {sendError ? (
                    <p className="mt-2 px-2 text-xs font-medium text-rose-500">Send error: {sendError}</p>
                  ) : null}
                </div>
              </FormControl>
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
};
