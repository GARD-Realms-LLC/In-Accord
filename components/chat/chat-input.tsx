"use client";

import * as z from "zod";
import axios from "axios";
import qs from "query-string";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Reply, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useModal } from "@/hooks/use-modal-store";
import { GifPicker } from "@/components/gif-picker";
import { EmotePicker } from "@/components/emote-picker";
import { StickerPicker } from "@/components/sticker-picker";
import { SoundEfxPicker } from "@/components/sound-efx-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  buildMentionToken,
  type MentionOption,
  readMentionsEnabled,
  writeMentionsEnabled,
} from "@/lib/mentions";
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
}

const formSchema = z.object({
  content: z.string().min(1),
});

export const ChatInput = ({
  apiUrl,
  query,
  name,
  type,
  conversationId,
  disabled = false,
  mentionUsers = [],
  mentionRoles = [],
}: ChatInputProps) => {
  const { onOpen } = useModal();
  const router = useRouter();
  const [sendError, setSendError] = useState<string | null>(null);
  const [mentionsEnabled, setMentionsEnabled] = useState(true);
  const [activeMentionStart, setActiveMentionStart] = useState<number | null>(null);
  const [activeMentionEnd, setActiveMentionEnd] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [activeQuote, setActiveQuote] = useState<QuotedMessageMeta | null>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
    let cancelled = false;

    const syncMentionsPreference = async () => {
      try {
        const response = await fetch("/api/profile/preferences", {
          method: "GET",
          cache: "no-store",
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
    const onQuoteMessage = (event: Event) => {
      const customEvent = event as CustomEvent<QuotedMessageMeta>;
      const messageId = String(customEvent.detail?.messageId ?? "").trim();

      if (!messageId) {
        return;
      }

      setActiveQuote({
        messageId,
        authorName: String(customEvent.detail?.authorName ?? "Unknown User").trim() || "Unknown User",
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

  const clearMentionState = () => {
    setActiveMentionStart(null);
    setActiveMentionEnd(null);
    setMentionQuery("");
    setActiveMentionIndex(0);
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

  const insertMention = (option: MentionOption) => {
    const currentContent = String(form.getValues("content") ?? "");
    const mentionStart = activeMentionStart;
    const mentionEnd = activeMentionEnd;

    if (mentionStart === null || mentionEnd === null) {
      return;
    }

    const before = currentContent.slice(0, mentionStart);
    const after = currentContent.slice(mentionEnd);
    const token = `${buildMentionToken(option)} `;
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

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setSendError(null);

      const url = qs.stringifyUrl({
        url: apiUrl,
        query,
      });

      await axios.post(url, {
        ...values,
        content: buildQuotedContent(values.content, activeQuote),
      });

      if (type === "conversation" && conversationId) {
        void axios.post("/api/direct-messages/typing", {
          conversationId,
          isTyping: false,
        });
      }

      form.reset();
      clearMentionState();
      setActiveQuote(null);
      router.refresh();
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const dataMessage =
          typeof error.response?.data === "string"
            ? error.response.data
            : error.response?.data?.message;

        setSendError(dataMessage || "Failed to send message.");
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
    void axios.post("/api/direct-messages/typing", {
      conversationId,
      isTyping,
    });
  };

  const onGifSelect = async (gifUrl: string) => {
    try {
      setSendError(null);

      const url = qs.stringifyUrl({
        url: apiUrl,
        query,
      });

      await axios.post(url, {
        content: buildQuotedContent("[gif]", activeQuote),
        fileUrl: gifUrl,
      });

      if (type === "conversation" && conversationId) {
        void axios.post("/api/direct-messages/typing", {
          conversationId,
          isTyping: false,
        });
      }

      form.reset();
      clearMentionState();
      setActiveQuote(null);
      router.refresh();
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

      const url = qs.stringifyUrl({
        url: apiUrl,
        query,
      });

      await axios.post(url, {
        content: buildQuotedContent("[sticker]", activeQuote),
        fileUrl: stickerUrl,
      });

      if (type === "conversation" && conversationId) {
        void axios.post("/api/direct-messages/typing", {
          conversationId,
          isTyping: false,
        });
      }

      form.reset();
      clearMentionState();
      setActiveQuote(null);
      router.refresh();
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

      const url = qs.stringifyUrl({
        url: apiUrl,
        query,
      });

      await axios.post(url, {
        content: buildQuotedContent("[emote]", activeQuote),
        fileUrl: emoteUrl,
      });

      if (type === "conversation" && conversationId) {
        void axios.post("/api/direct-messages/typing", {
          conversationId,
          isTyping: false,
        });
      }

      form.reset();
      clearMentionState();
      setActiveQuote(null);
      router.refresh();
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

      const url = qs.stringifyUrl({
        url: apiUrl,
        query,
      });

      await axios.post(url, {
        content: buildQuotedContent("[sound_efx]", activeQuote),
        fileUrl: soundEfxUrl,
      });

      if (type === "conversation" && conversationId) {
        void axios.post("/api/direct-messages/typing", {
          conversationId,
          isTyping: false,
        });
      }

      form.reset();
      clearMentionState();
      setActiveQuote(null);
      router.refresh();
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
                          <Reply className="h-3.5 w-3.5" /> Replying to {activeQuote.authorName}
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
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                  <Popover open={isAddMenuOpen} onOpenChange={setIsAddMenuOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        disabled={isLoading}
                        className="absolute left-8 top-7 flex h-[24px] w-[24px] items-center justify-center rounded-full bg-zinc-500 p-1 transition hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-400 dark:hover:bg-zinc-300"
                        aria-label="Open add menu"
                        title="Add"
                      >
                        <Plus className="text-white dark:text-[#313338]" />
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
                  <Input
                    disabled={isLoading}
                    className="px-14 py-6 bg-zinc-200/90 dark:bg-zinc-700/75 border-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-zinc-600 dark:text-zinc-200"
                    placeholder={`Message ${
                      type === "conversation" ? name : "#" + name
                    }`}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
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
                    }}
                    onKeyDown={(event) => {
                      if (!isMentionMenuOpen) {
                        return;
                      }

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
                      }
                    }}
                  />
                  {isMentionMenuOpen ? (
                    <div className="absolute bottom-[64px] left-14 right-16 z-20 max-h-56 overflow-auto rounded-lg border border-black/30 bg-[#1e1f22] p-1 shadow-2xl shadow-black/45">
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
                  <div className="absolute top-[26px] right-8 flex items-center gap-2">
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
