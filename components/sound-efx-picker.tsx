"use client";

import axios from "axios";
import { Pause, Play, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type SoundEfxPickerProps = {
  onSelect: (audioUrl: string) => void;
  serverId?: string | null;
};

type SoundEfxItem = {
  id: string;
  name: string;
  audioUrl: string;
};

const createToneWavDataUrl = (frequency: number, durationMs = 360) => {
  const sampleRate = 8000;
  const totalSamples = Math.max(1, Math.floor((sampleRate * durationMs) / 1000));
  const dataSize = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  for (let sampleIndex = 0; sampleIndex < totalSamples; sampleIndex += 1) {
    const time = sampleIndex / sampleRate;
    const envelope = Math.exp((-3 * sampleIndex) / totalSamples);
    const sampleValue = Math.sin(2 * Math.PI * frequency * time) * envelope;
    view.setInt16(44 + sampleIndex * 2, Math.max(-1, Math.min(1, sampleValue)) * 32767, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 1) {
    binary += String.fromCharCode(bytes[byteIndex]);
  }

  return `data:audio/wav;base64,${btoa(binary)}`;
};

const DEFAULT_SOUND_EFX: SoundEfxItem[] = [
  { id: "default-ping", name: "ping", audioUrl: createToneWavDataUrl(540) },
  { id: "default-pop", name: "pop", audioUrl: createToneWavDataUrl(760) },
  { id: "default-spark", name: "spark", audioUrl: createToneWavDataUrl(960) },
  { id: "default-clink", name: "clink", audioUrl: createToneWavDataUrl(1180) },
  { id: "default-bloop", name: "bloop", audioUrl: createToneWavDataUrl(430) },
  { id: "default-zap", name: "zap", audioUrl: createToneWavDataUrl(1320) },
];

export const SoundEfxPicker = ({ onSelect, serverId }: SoundEfxPickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverSoundEfx, setServerSoundEfx] = useState<SoundEfxItem[]>([]);
  const [selectedAudioUrl, setSelectedAudioUrl] = useState("");
  const [playingTileId, setPlayingTileId] = useState<string | null>(null);

  const normalizedServerId = useMemo(() => String(serverId ?? "").trim(), [serverId]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!isOpen || !normalizedServerId) {
      return;
    }

    let cancelled = false;

    const loadServerSoundEfx = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        const response = await axios.get<{
          soundEfx?: Array<{ id?: string; name?: string; audioUrl?: string }>;
        }>(`/api/servers/${encodeURIComponent(normalizedServerId)}/sound-efx`, {
          params: { status: "ACTIVE" },
        });

        if (cancelled) {
          return;
        }

        const nextItems = (response.data.soundEfx ?? [])
          .map((item) => ({
            id: String(item.id ?? "").trim(),
            name: String(item.name ?? "").trim(),
            audioUrl: String(item.audioUrl ?? "").trim(),
          }))
          .filter((item) => item.id && item.name && item.audioUrl)
          .slice(0, 60);

        setServerSoundEfx(nextItems);
      } catch {
        if (!cancelled) {
          setServerSoundEfx([]);
          setLoadError("Could not load server Sound EFX.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadServerSoundEfx();

    return () => {
      cancelled = true;
    };
  }, [isOpen, normalizedServerId]);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    setPlayingTileId(null);
  }, [isOpen]);

  const playTile = async (tileId: string, audioUrl: string) => {
    const normalized = String(audioUrl ?? "").trim();
    if (!normalized) {
      return;
    }

    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;

    if (playingTileId === tileId && !audio.paused) {
      audio.pause();
      audio.currentTime = 0;
      setPlayingTileId(null);
      return;
    }

    try {
      audio.pause();
      audio.src = normalized;
      audio.currentTime = 0;
      audio.onended = () => setPlayingTileId((current) => (current === tileId ? null : current));
      await audio.play();
      setPlayingTileId(tileId);
      setLoadError(null);
    } catch {
      setPlayingTileId(null);
      setLoadError("Unable to preview this Sound EFX.");
    }
  };

  const onChooseTile = (audioUrl: string) => {
    setSelectedAudioUrl(audioUrl);
  };

  const onSendSoundEfx = () => {
    const normalized = String(selectedAudioUrl ?? "").trim();
    if (!normalized) {
      return;
    }

    onSelect(normalized);
    setIsOpen(false);
    setSelectedAudioUrl("");
    setPlayingTileId(null);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded p-1 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600 dark:hover:text-white"
          title="Send Sound EFX"
          aria-label="Send Sound EFX"
        >
          <Volume2 className="h-4 w-4" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="end"
        className="w-96 border-zinc-300 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              Send Sound EFX
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              Pick a Sound EFX tile and send it to chat.
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              Default Sound EFX
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {DEFAULT_SOUND_EFX.map((item) => {
                const isSelected = selectedAudioUrl === item.audioUrl;
                const isPlaying = playingTileId === item.id;
                return (
                  <div key={item.id} className={`rounded-md border p-2 ${isSelected ? "border-indigo-500" : "border-zinc-300 dark:border-zinc-700"}`}>
                    <p className="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200">{item.name}</p>
                    <div className="mt-1 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void playTile(item.id, item.audioUrl)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600"
                        title={isPlaying ? "Stop" : "Play"}
                      >
                        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => onChooseTile(item.audioUrl)}
                        className="h-7 rounded bg-indigo-600 px-2 text-[11px] font-semibold text-white hover:bg-indigo-500"
                      >
                        Select
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              Server Sound EFX
            </p>
            {!normalizedServerId ? (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">No server context.</p>
            ) : isLoading ? (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Loading Sound EFX...</p>
            ) : serverSoundEfx.length === 0 ? (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">No active server Sound EFX.</p>
            ) : (
              <div className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
                {serverSoundEfx.map((item) => {
                  const isSelected = selectedAudioUrl === item.audioUrl;
                  const isPlaying = playingTileId === item.id;
                  return (
                    <div key={item.id} className={`rounded-md border p-2 ${isSelected ? "border-indigo-500" : "border-zinc-300 dark:border-zinc-700"}`}>
                      <p className="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200">{item.name}</p>
                      <div className="mt-1 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void playTile(item.id, item.audioUrl)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600"
                          title={isPlaying ? "Stop" : "Play"}
                        >
                          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => onChooseTile(item.audioUrl)}
                          className="h-7 rounded bg-indigo-600 px-2 text-[11px] font-semibold text-white hover:bg-indigo-500"
                        >
                          Select
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {loadError ? <p className="text-[11px] text-rose-500">{loadError}</p> : null}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onSendSoundEfx}
              disabled={!selectedAudioUrl.trim()}
              className="h-8 rounded-md bg-indigo-600 px-3 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Send Sound EFX
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
