"use client";

import { ArrowUpCircle, Bug, Loader2 } from "lucide-react";

import { useModal } from "@/hooks/use-modal-store";

type NavigationBetaBugRowProps = {
  showBugReportsIcon?: boolean;
  openBugCount?: number;
  showUpdaterIcon?: boolean;
  updaterBusy?: boolean;
  updaterTitle?: string;
  onOpenUpdater?: () => void;
  profileId?: string;
  profileName?: string;
  profileRole?: string;
  profileEmail?: string;
  profileImageUrl?: string;
  className?: string;
};

export const NavigationBetaBugRow = ({
  showBugReportsIcon = false,
  openBugCount = 0,
  showUpdaterIcon = false,
  updaterBusy = false,
  updaterTitle = "Open updater",
  onOpenUpdater,
  profileId,
  profileName,
  profileRole,
  profileEmail,
  profileImageUrl,
  className,
}: NavigationBetaBugRowProps) => {
  const { onOpen } = useModal();

  return (
    <div className={`flex items-center justify-center gap-1 ${className ?? "mt-2"}`}>
      <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-red-600 dark:text-red-400">
        In-BETA!
      </span>
      {showBugReportsIcon ? (
        <button
          type="button"
          onClick={() =>
            onOpen("settings", {
              profileId,
              profileName,
              profileRole,
              profileEmail,
              profileImageUrl,
              query: {
                settingsSection: "bugReporting",
              },
            })
          }
          className="relative inline-flex h-4 w-4 items-center justify-center rounded-sm border border-yellow-700/60 bg-yellow-400 text-yellow-950 transition hover:bg-yellow-300 dark:border-yellow-300/70 dark:bg-yellow-300 dark:text-yellow-950 dark:hover:bg-yellow-200"
          title="Open Bug Reports"
          aria-label="Open Bug Reports"
        >
          <Bug className="h-2.5 w-2.5" suppressHydrationWarning />
          {openBugCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-h-[12px] min-w-[12px] items-center justify-center rounded-full bg-rose-600 px-1 text-[8px] font-bold leading-none text-white">
              {openBugCount > 99 ? "99+" : openBugCount}
            </span>
          ) : null}
        </button>
      ) : null}
      {showUpdaterIcon ? (
        <button
          type="button"
          onClick={() => onOpenUpdater?.()}
          className="relative inline-flex h-4 w-4 items-center justify-center rounded-sm border border-emerald-500/70 bg-emerald-400 text-emerald-950 transition hover:bg-emerald-300 dark:border-emerald-300/80 dark:bg-emerald-300 dark:text-emerald-950 dark:hover:bg-emerald-200"
          title={updaterTitle}
          aria-label={updaterTitle}
        >
          {updaterBusy ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin" suppressHydrationWarning />
          ) : (
            <ArrowUpCircle className="h-2.5 w-2.5" suppressHydrationWarning />
          )}
        </button>
      ) : null}
    </div>
  );
};
