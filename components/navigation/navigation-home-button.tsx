"use client";

import { Bug } from "lucide-react";

import { useSocket } from "@/components/providers/socket-provider";
import { useModal } from "@/hooks/use-modal-store";

type NavigationHomeButtonProps = {
  showBugReportsIcon?: boolean;
  openBugCount?: number;
  profileId?: string;
  profileName?: string;
  profileRole?: string;
  profileEmail?: string;
  profileImageUrl?: string;
};

export const NavigationHomeButton = ({
  showBugReportsIcon = false,
  openBugCount = 0,
  profileId,
  profileName,
  profileRole,
  profileEmail,
  profileImageUrl,
}: NavigationHomeButtonProps) => {
  const { connectionQuality } = useSocket();
  const { onOpen } = useModal();

  const ringColorClass =
    connectionQuality === "disconnected"
      ? "ring-red-600 dark:ring-red-400"
      : connectionQuality === "slow"
        ? "ring-yellow-500 dark:ring-yellow-400"
        : "ring-green-600 dark:ring-green-400";

  return (
    <div
      className="pointer-events-none relative flex w-full select-none flex-col items-center justify-center cursor-default"
      aria-label={`In-Accord (${connectionQuality})`}
      role="img"
    >
      <div className="mb-1 flex items-center gap-1">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-red-600 dark:text-red-400">
          BETA!
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
            className="pointer-events-auto relative inline-flex h-4 w-4 items-center justify-center rounded-sm border border-yellow-700/60 bg-yellow-400 text-yellow-950 transition hover:bg-yellow-300 dark:border-yellow-300/70 dark:bg-yellow-300 dark:text-yellow-950 dark:hover:bg-yellow-200"
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
      </div>

      <div
        className={`relative mx-3 h-[56px] w-[56px] rounded-full ring-4 ${ringColorClass}`}
      >
        <div className="h-full w-full overflow-hidden rounded-full bg-[#5865F2]">
          <img
            src="/in-accord-steampunk-logo.png"
            alt="In-Accord"
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    </div>
  );
};