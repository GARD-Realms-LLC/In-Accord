"use client";

import { Minus, X } from "lucide-react";
import type { CSSProperties } from "react";

type ElectronWindowApi = {
  minimizeCurrentWindow?: () => Promise<unknown>;
  closeCurrentWindow?: () => Promise<unknown>;
};

export const MeetingPopoutWindowControls = () => {
  const onMinimize = () => {
    const electronApi = (window as Window & { electronAPI?: ElectronWindowApi }).electronAPI;
    if (typeof electronApi?.minimizeCurrentWindow === "function") {
      void electronApi.minimizeCurrentWindow();
      return;
    }

    window.blur();
  };

  const onClose = () => {
    const electronApi = (window as Window & { electronAPI?: ElectronWindowApi }).electronAPI;
    if (typeof electronApi?.closeCurrentWindow === "function") {
      void electronApi.closeCurrentWindow();
      return;
    }

    window.close();
  };

  return (
    <div
      className="absolute inset-x-0 top-0 z-50 flex h-10 items-center justify-end px-2"
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
    >
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
        <button
          type="button"
          onClick={onMinimize}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-black/35 text-zinc-200 transition hover:bg-black/55"
          title="Minimize"
          aria-label="Minimize window"
        >
          <Minus suppressHydrationWarning className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-400/40 bg-rose-500/20 text-rose-100 transition hover:bg-rose-500/35"
          title="Close"
          aria-label="Close window"
        >
          <X suppressHydrationWarning className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
