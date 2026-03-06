"use client";

import * as z from "zod";
import axios from "axios";
import qs from "query-string";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useModal } from "@/hooks/use-modal-store";
import { EmojiPicker } from "@/components/emoji-picker";
import { GifPicker } from "@/components/gif-picker";
import { StickerPicker } from "@/components/sticker-picker";
import {
  buildMentionToken,
  MENTION_SETTINGS_KEY,
  type MentionOption,
  readMentionsEnabled,
} from "@/lib/mentions";

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

  useEffect(() => {
    const syncMentionsPreference = () => {
      setMentionsEnabled(readMentionsEnabled());
    };

    syncMentionsPreference();

    const onStorageChange = (event: StorageEvent) => {
      if (event.key && event.key !== MENTION_SETTINGS_KEY) {
        return;
      }

      syncMentionsPreference();
    };

    const onMentionsPreferenceChanged = () => {
      syncMentionsPreference();
    };

    window.addEventListener("storage", onStorageChange);
    window.addEventListener("inaccord:mentions-setting-updated", onMentionsPreferenceChanged);

    return () => {
      window.removeEventListener("storage", onStorageChange);
      window.removeEventListener("inaccord:mentions-setting-updated", onMentionsPreferenceChanged);
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

      await axios.post(url, values);

      if (type === "conversation" && conversationId) {
        void axios.post("/api/direct-messages/typing", {
          conversationId,
          isTyping: false,
        });
      }

      form.reset();
      clearMentionState();
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
        content: "[gif]",
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
        content: "[sticker]",
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
                  <button
                    type="button"
                    onClick={() => onOpen("messageFile", { apiUrl, query })}
                    disabled={isLoading}
                    className="absolute top-7 left-8 h-[24px] w-[24px] bg-zinc-500 dark:bg-zinc-400 hover:bg-zinc-600 dark:hover:bg-zinc-300 transition rounded-full p-1 flex items-center justify-center"
                  >
                    <Plus className="text-white dark:text-[#313338]" />
                  </button>
                  <Input
                    disabled={isLoading}
                    className="px-14 py-6 bg-zinc-200/90 dark:bg-zinc-700/75 border-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-zinc-600 dark:text-zinc-200"
                    placeholder={`Message ${
                      type === "conversation" ? name : "#" + name
                    }`}
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
                    onClick={(event) => {
                      detectMentionState(String(field.value ?? ""), event.currentTarget.selectionStart);
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
                    <StickerPicker onSelect={onStickerSelect} />
                    <GifPicker onSelect={onGifSelect} />
                    <EmojiPicker
                      onChange={(emoji: string) =>
                        field.onChange(`${field.value} ${emoji}`)
                      }
                    />
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
