"use client";

import { useMemo, useState } from "react";
import { CircleHelp, ExternalLink, LifeBuoy, X } from "lucide-react";

type SupportHelpControlsProps = {
  supportUrl?: string;
  panelTop?: number;
};

export const SupportHelpControls = ({
  supportUrl,
  panelTop = 56,
}: SupportHelpControlsProps) => {
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const resolvedSupportUrl = useMemo(
    () => supportUrl || process.env.NEXT_PUBLIC_IN_ACCORD_SUPPORT_SERVER_URL || "/invite/in-accord-support",
    [supportUrl]
  );

  const openSupport = () => {
    if (!resolvedSupportUrl) {
      return;
    }

    if (resolvedSupportUrl.startsWith("/")) {
      window.location.href = resolvedSupportUrl;
      return;
    }

    window.open(resolvedSupportUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <div className="absolute inset-y-0 left-3 z-30 flex items-center gap-1">
        <button
          type="button"
          onClick={openSupport}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-border/70 bg-background/70 px-2 text-xs font-semibold text-zinc-200 transition hover:bg-background/95"
          title="Open In-Accord support server"
          aria-label="Open In-Accord support server"
        >
          <LifeBuoy className="h-3.5 w-3.5" />
          Support
        </button>

        <button
          type="button"
          onClick={() => setIsHelpOpen(true)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-background/70 text-zinc-200 transition hover:bg-background/95"
          title="Open help panel"
          aria-label="Open help panel"
        >
          <CircleHelp className="h-4 w-4" />
        </button>
      </div>

      {isHelpOpen ? (
        <aside
          className="fixed right-0 z-50 w-80 border-l border-border bg-card/95 p-3 backdrop-blur-md"
          style={{ top: `${panelTop}px`, bottom: "0px" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-100">Help</h2>
            <button
              type="button"
              onClick={() => setIsHelpOpen(false)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-black/20 hover:text-white"
              aria-label="Close help panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3 text-xs text-zinc-300">
            <div className="rounded-md border border-border/60 bg-background/60 px-2 py-2">
              <p className="font-medium text-zinc-200">Need support?</p>
              <p className="mt-1 text-zinc-400">Open the In-Accord support server for help, bug reports, and announcements.</p>
              <button
                type="button"
                onClick={openSupport}
                className="mt-2 inline-flex items-center gap-1 rounded-md border border-border/70 bg-background/70 px-2 py-1.5 text-[11px] font-semibold text-zinc-200 transition hover:bg-background/95"
              >
                Open Support Server
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>

            <div className="rounded-md border border-border/60 bg-background/60 px-2 py-2 text-zinc-400">
              Tip: If this should open a different destination, set
              <span className="mx-1 font-mono text-zinc-300">NEXT_PUBLIC_IN_ACCORD_SUPPORT_SERVER_URL</span>
              in your environment config.
            </div>
          </div>
        </aside>
      ) : null}
    </>
  );
};
