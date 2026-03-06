"use client";

import { Sticker } from "lucide-react";

interface StickerPickerProps {
  onSelect: (stickerUrl: string) => void;
}

export const StickerPicker = ({ onSelect }: StickerPickerProps) => {
  const handlePickSticker = () => {
    const stickerUrl = window.prompt("Paste sticker image URL");
    const normalized = String(stickerUrl ?? "").trim();

    if (!normalized) {
      return;
    }

    onSelect(normalized);
  };

  return (
    <button
      type="button"
      onClick={handlePickSticker}
      className="rounded p-1 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600 dark:hover:text-white"
      title="Send sticker"
      aria-label="Send sticker"
    >
      <Sticker className="h-4 w-4" />
    </button>
  );
};
