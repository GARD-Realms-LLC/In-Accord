"use client";

import { ImagePlus } from "lucide-react";

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
}

export const GifPicker = ({ onSelect }: GifPickerProps) => {
  const handlePickGif = () => {
    const gifUrl = window.prompt("Paste GIF URL");
    const normalized = String(gifUrl ?? "").trim();

    if (!normalized) {
      return;
    }

    onSelect(normalized);
  };

  return (
    <button
      type="button"
      onClick={handlePickGif}
      className="rounded p-1 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600 dark:hover:text-white"
      title="Send GIF"
      aria-label="Send GIF"
    >
      <ImagePlus className="h-4 w-4" />
    </button>
  );
};
