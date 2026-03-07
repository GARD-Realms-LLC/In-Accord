"use client";

import axios from "axios";
import { Sticker } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface StickerPickerProps {
  onSelect: (stickerUrl: string) => void;
  serverId?: string | null;
}

type ServerStickerAsset = {
  id: string;
  name: string;
  imageUrl: string | null;
  isEnabled: boolean;
};

export const StickerPicker = ({ onSelect, serverId }: StickerPickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverStickers, setServerStickers] = useState<ServerStickerAsset[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState("");
  const [urlValue, setUrlValue] = useState("");

  const normalizedServerId = useMemo(() => String(serverId ?? "").trim(), [serverId]);

  useEffect(() => {
    if (!isOpen || !normalizedServerId) {
      return;
    }

    let cancelled = false;

    const loadServerStickers = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        const response = await axios.get<{
          assets?: Array<{
            id?: string;
            name?: string;
            imageUrl?: string | null;
            isEnabled?: boolean;
          }>;
        }>(`/api/servers/${encodeURIComponent(normalizedServerId)}/emoji-stickers`, {
          params: {
            assetType: "STICKER",
            status: "ACTIVE",
          },
        });

        if (cancelled) {
          return;
        }

        const nextStickers = (response.data.assets ?? [])
          .map((item) => ({
            id: String(item.id ?? "").trim(),
            name: String(item.name ?? "").trim(),
            imageUrl: typeof item.imageUrl === "string" ? item.imageUrl.trim() : null,
            isEnabled: item.isEnabled !== false,
          }))
          .filter((item) => item.id && item.name && item.imageUrl && item.isEnabled);

        setServerStickers(nextStickers);
      } catch {
        if (!cancelled) {
          setServerStickers([]);
          setLoadError("Could not load server stickers.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadServerStickers();

    return () => {
      cancelled = true;
    };
  }, [isOpen, normalizedServerId]);

  const onServerStickerChange = (value: string) => {
    setSelectedStickerId(value);
    const selected = serverStickers.find((item) => item.id === value);
    if (selected?.imageUrl) {
      setUrlValue(selected.imageUrl);
    }
  };

  const onSendSticker = () => {
    const normalized = String(urlValue ?? "").trim();

    if (!normalized) {
      return;
    }

    onSelect(normalized);
    setIsOpen(false);
    setSelectedStickerId("");
    setUrlValue("");
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded p-1 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600 dark:hover:text-white"
          title="Send sticker"
          aria-label="Send sticker"
        >
          <Sticker className="h-4 w-4" />
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
              Send Sticker
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              Pick a server sticker or paste a sticker image URL.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              Server stickers
            </label>
            {!normalizedServerId ? (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">No server context.</p>
            ) : isLoading ? (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Loading stickers...</p>
            ) : serverStickers.length === 0 ? (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">No active server stickers.</p>
            ) : (
              <div className="grid max-h-44 grid-cols-3 gap-1.5 overflow-y-auto pr-1">
                {serverStickers.map((sticker) => {
                  const isSelected = selectedStickerId === sticker.id;
                  return (
                    <button
                      key={sticker.id}
                      type="button"
                      onClick={() => onServerStickerChange(sticker.id)}
                      className={`h-16 rounded-md border text-left transition ${
                        isSelected
                          ? "border-indigo-500 ring-1 ring-indigo-500"
                          : "border-zinc-300 dark:border-zinc-700"
                      }`}
                      title={sticker.name}
                      style={{
                        backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0.05)), url(${sticker.imageUrl ?? ""})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    >
                      <span className="block truncate px-2 pt-10 text-[10px] font-semibold text-white">{sticker.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {loadError ? (
              <p className="text-[11px] text-rose-500">{loadError}</p>
            ) : null}
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              Sticker URL
            </label>
            <input
              value={urlValue}
              onChange={(event) => setUrlValue(event.target.value)}
              placeholder="https://... or /uploads/..."
              className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onSendSticker}
              disabled={!urlValue.trim()}
              className="h-8 rounded-md bg-indigo-600 px-3 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Send Sticker
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
