"use client";

import axios from "axios";
import { ImagePlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  serverId?: string | null;
}

type GifOption = {
  url: string;
  label: string;
};

export const GifPicker = ({ onSelect, serverId }: GifPickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverGifs, setServerGifs] = useState<GifOption[]>([]);
  const [defaultGifs, setDefaultGifs] = useState<GifOption[]>([]);
  const [selectedValue, setSelectedValue] = useState("");
  const [urlValue, setUrlValue] = useState("");

  const normalizedServerId = useMemo(() => String(serverId ?? "").trim(), [serverId]);

  useEffect(() => {
    if (!isOpen || !normalizedServerId) {
      return;
    }

    let cancelled = false;

    const loadGifs = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        const response = await axios.get<{
          serverGifs?: Array<{ url?: string; label?: string }>;
          defaultGifs?: Array<{ url?: string; label?: string }>;
        }>(`/api/servers/${encodeURIComponent(normalizedServerId)}/gifs`);

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

        setServerGifs(normalizeList(response.data.serverGifs));
        setDefaultGifs(normalizeList(response.data.defaultGifs));
      } catch {
        if (!cancelled) {
          setServerGifs([]);
          setDefaultGifs([]);
          setLoadError("Could not load GIF lists.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadGifs();

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

  const onSendGif = () => {
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
          title="Send GIF"
          aria-label="Send GIF"
        >
          <ImagePlus className="h-4 w-4" />
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
              Send GIF
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              Select from server GIFs/default GIFs or paste a GIF URL.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              GIF list
            </label>

            {!normalizedServerId ? (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">No server context.</p>
            ) : isLoading ? (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Loading GIFs...</p>
            ) : (
              <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                {serverGifs.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                      Server GIFs
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {serverGifs.map((item) => {
                        const isSelected = selectedValue === item.url;
                        return (
                          <button
                            key={`server-${item.url}`}
                            type="button"
                            onClick={() => onSelectChange(item.url)}
                            className={`h-16 rounded-md border text-left transition ${
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
                            <span className="block truncate px-2 pt-10 text-[10px] font-semibold text-white">
                              {item.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {defaultGifs.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                      Default GIFs
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {defaultGifs.map((item) => {
                        const isSelected = selectedValue === item.url;
                        return (
                          <button
                            key={`default-${item.url}`}
                            type="button"
                            onClick={() => onSelectChange(item.url)}
                            className={`h-16 rounded-md border text-left transition ${
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
                            <span className="block truncate px-2 pt-10 text-[10px] font-semibold text-white">
                              {item.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {serverGifs.length === 0 && defaultGifs.length === 0 ? (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">No GIFs available.</p>
                ) : null}
              </div>
            )}
            {loadError ? <p className="text-[11px] text-rose-500">{loadError}</p> : null}
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              GIF URL
            </label>
            <input
              value={urlValue}
              onChange={(event) => setUrlValue(event.target.value)}
              placeholder="https://...gif"
              className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onSendGif}
              disabled={!urlValue.trim()}
              className="h-8 rounded-md bg-indigo-600 px-3 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Send GIF
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
