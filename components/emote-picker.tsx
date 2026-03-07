"use client";

import axios from "axios";
import { Smile } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface EmotePickerProps {
  onSelect: (emoteUrl: string) => void;
  serverId?: string | null;
}

type EmoteOption = {
  url: string;
  label: string;
};

export const EmotePicker = ({ onSelect, serverId }: EmotePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverEmotes, setServerEmotes] = useState<EmoteOption[]>([]);
  const [defaultEmotes, setDefaultEmotes] = useState<EmoteOption[]>([]);
  const [selectedValue, setSelectedValue] = useState("");
  const [urlValue, setUrlValue] = useState("");

  const normalizedServerId = useMemo(() => String(serverId ?? "").trim(), [serverId]);

  useEffect(() => {
    if (!isOpen || !normalizedServerId) {
      return;
    }

    let cancelled = false;

    const loadEmotes = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        const response = await axios.get<{
          serverEmotes?: Array<{ url?: string; label?: string }>;
          defaultEmotes?: Array<{ url?: string; label?: string }>;
        }>(`/api/servers/${encodeURIComponent(normalizedServerId)}/emotes`);

        if (cancelled) {
          return;
        }

        const normalizeList = (list: Array<{ url?: string; label?: string }> | undefined) =>
          (list ?? [])
            .map((item) => ({
              url: String(item.url ?? "").trim(),
              label: String(item.label ?? item.url ?? "").trim(),
            }))
            .filter((item) => item.url.length > 0);

        setServerEmotes(normalizeList(response.data.serverEmotes));
        setDefaultEmotes(normalizeList(response.data.defaultEmotes));
      } catch {
        if (!cancelled) {
          setServerEmotes([]);
          setDefaultEmotes([]);
          setLoadError("Could not load emote lists.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadEmotes();

    return () => {
      cancelled = true;
    };
  }, [isOpen, normalizedServerId]);

  const onSelectChange = (value: string) => {
    setSelectedValue(value);
    if (!value) {
      return;
    }

    setUrlValue(value);
  };

  const onSendEmote = () => {
    const normalized = String(urlValue ?? "").trim();
    if (!normalized) {
      return;
    }

    onSelect(normalized);
    setIsOpen(false);
    setSelectedValue("");
    setUrlValue("");
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded p-1 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600 dark:hover:text-white"
          title="Send emote"
          aria-label="Send emote"
        >
          <Smile className="h-4 w-4" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="end"
        className="w-80 border-zinc-300 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              Send Emote
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              Select from server emotes/default emotes or paste an emote URL.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              Emote list
            </label>
            {!normalizedServerId ? (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">No server context.</p>
            ) : isLoading ? (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Loading emotes...</p>
            ) : (
              <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                {serverEmotes.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                      Server Emotes
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {serverEmotes.map((item) => {
                        const isSelected = selectedValue === item.url;
                        return (
                          <button
                            key={`server-${item.url}`}
                            type="button"
                            onClick={() => onSelectChange(item.url)}
                            className={`h-14 rounded-md border text-left transition ${
                              isSelected
                                ? "border-indigo-500 ring-1 ring-indigo-500"
                                : "border-zinc-300 dark:border-zinc-700"
                            }`}
                            title={item.label}
                            style={{
                              backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0.05)), url(${item.url})`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                            }}
                          >
                            <span className="block truncate px-2 pt-8 text-[10px] font-semibold text-white">
                              {item.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {defaultEmotes.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                      Default Emotes
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {defaultEmotes.map((item) => {
                        const isSelected = selectedValue === item.url;
                        return (
                          <button
                            key={`default-${item.url}`}
                            type="button"
                            onClick={() => onSelectChange(item.url)}
                            className={`h-14 rounded-md border text-left transition ${
                              isSelected
                                ? "border-indigo-500 ring-1 ring-indigo-500"
                                : "border-zinc-300 dark:border-zinc-700"
                            }`}
                            title={item.label}
                            style={{
                              backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0.05)), url(${item.url})`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                            }}
                          >
                            <span className="block truncate px-2 pt-8 text-[10px] font-semibold text-white">
                              {item.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {serverEmotes.length === 0 && defaultEmotes.length === 0 ? (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">No emotes available.</p>
                ) : null}
              </div>
            )}
            {loadError ? <p className="text-[11px] text-rose-500">{loadError}</p> : null}
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              Emote URL
            </label>
            <input
              value={urlValue}
              onChange={(event) => setUrlValue(event.target.value)}
              placeholder="https://...png"
              className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onSendEmote}
              disabled={!urlValue.trim()}
              className="h-8 rounded-md bg-indigo-600 px-3 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Send Emote
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
