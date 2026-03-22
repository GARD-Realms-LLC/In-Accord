"use client";

import { Download, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type DesktopUpdaterStatus = "unsupported" | "idle" | "checking" | "downloading" | "ready" | "error";

type DesktopUpdaterState = {
  supported: boolean;
  status: DesktopUpdaterStatus;
  currentVersion: string | null;
  nextVersion: string | null;
  lastCheckedAt: string | null;
  error: string | null;
};

type ElectronDesktopUpdaterApi = {
  getDesktopUpdaterState?: () => Promise<DesktopUpdaterState>;
  checkForUpdatesNow?: () => Promise<DesktopUpdaterState>;
  relaunchToApplyUpdate?: () => Promise<boolean>;
  onDesktopUpdaterState?: (listener: (state: DesktopUpdaterState) => void) => (() => void) | void;
};

const resolveElectronApi = () =>
  (window as Window & { electronAPI?: ElectronDesktopUpdaterApi }).electronAPI;

type DesktopUpdateButtonProps = {
  className?: string;
  expanded?: boolean;
};

let desktopReadyPopupShownForVersion: string | null = null;

export const DesktopUpdateButton = ({ className, expanded = false }: DesktopUpdateButtonProps) => {
  const [updaterState, setUpdaterState] = useState<DesktopUpdaterState | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);
  const [isReadyPopupOpen, setIsReadyPopupOpen] = useState(false);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (expanded) {
      return;
    }

    const nextVersionKey = String(updaterState?.nextVersion ?? updaterState?.currentVersion ?? "").trim();
    if (updaterState?.status !== "ready" || !nextVersionKey) {
      return;
    }

    if (desktopReadyPopupShownForVersion === nextVersionKey) {
      return;
    }

    desktopReadyPopupShownForVersion = nextVersionKey;
    setIsReadyPopupOpen(true);
  }, [expanded, updaterState?.currentVersion, updaterState?.nextVersion, updaterState?.status]);

  useEffect(() => {
    const electronApi = resolveElectronApi();
    if (typeof electronApi?.getDesktopUpdaterState !== "function") {
      return;
    }

    let isSubscribed = true;

    void electronApi.getDesktopUpdaterState()
      .then((nextState) => {
        if (isSubscribed) {
          setUpdaterState(nextState);
        }
      })
      .catch(() => {
        if (isSubscribed) {
          setUpdaterState({
            supported: true,
            status: "error",
            currentVersion: null,
            nextVersion: null,
            lastCheckedAt: null,
            error: "Could not read desktop updater status.",
          });
        }
      });

    const unsubscribe = electronApi.onDesktopUpdaterState?.((nextState) => {
      if (isSubscribed) {
        setUpdaterState(nextState);
      }
    });

    return () => {
      isSubscribed = false;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  const presentation = useMemo(() => {
    const currentVersion = updaterState?.currentVersion ? `Current: ${updaterState.currentVersion}` : "Current version unavailable.";
    const nextVersion = updaterState?.nextVersion ? `Next: ${updaterState.nextVersion}` : "No newer package detected yet.";

    switch (updaterState?.status) {
      case "checking":
        return {
          title: "Checking for updates",
          description: `${currentVersion} Looking for a newer desktop package now.`,
          className: "border-border/70 bg-background/70 text-zinc-200",
          icon: <RefreshCw suppressHydrationWarning className="h-3.5 w-3.5 animate-spin" />,
          disabled: true,
        };
      case "downloading":
        return {
          title: "Downloading update",
          description: `${nextVersion} The package is downloading now and will switch to restart when ready.`,
          className: "border-border/70 bg-background/70 text-zinc-200",
          icon: <Download suppressHydrationWarning className="h-3.5 w-3.5 animate-pulse" />,
          disabled: true,
        };
      case "ready":
        return {
          title: "Restart to update",
          description: `${nextVersion} Click to restart the desktop app and apply the downloaded update.`,
          className: "border-emerald-400/60 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30",
          icon: <Download suppressHydrationWarning className="h-3.5 w-3.5" />,
          disabled: false,
        };
      case "error":
        return {
          title: "Updater error",
          description: updaterState.error || "The desktop updater hit an error. Click to try again.",
          className: "border-rose-400/40 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30",
          icon: <TriangleAlert suppressHydrationWarning className="h-3.5 w-3.5" />,
          disabled: false,
        };
      case "idle":
      default:
        return {
          title: updaterState?.lastCheckedAt ? "Up to date" : "Check for updates",
          description: updaterState?.lastCheckedAt
            ? `${currentVersion} No pending desktop update is ready right now. Click to check again.`
            : `${currentVersion} Click to check the desktop update feed now.`,
          className: "border-border/70 bg-background/70 text-zinc-200 hover:bg-background/95",
          icon: <Download suppressHydrationWarning className="h-3.5 w-3.5" />,
          disabled: false,
        };
    }
  }, [updaterState]);

  if (!updaterState?.supported) {
    return null;
  }

  const onClick = async () => {
    const electronApi = resolveElectronApi();
    if (!electronApi || isActionPending) {
      return;
    }

    if (updaterState.status === "ready") {
      if (typeof electronApi.relaunchToApplyUpdate !== "function") {
        return;
      }

      setIsActionPending(true);
      try {
        await electronApi.relaunchToApplyUpdate();
      } finally {
        if (isMountedRef.current) {
          setIsActionPending(false);
        }
      }
      return;
    }

    if (presentation.disabled || typeof electronApi.checkForUpdatesNow !== "function") {
      return;
    }

    setIsActionPending(true);
    try {
      const nextState = await electronApi.checkForUpdatesNow();
      if (isMountedRef.current) {
        setUpdaterState(nextState);
      }
    } catch {
      if (isMountedRef.current) {
        setUpdaterState((currentState) => ({
          supported: currentState?.supported ?? true,
          status: "error",
          currentVersion: currentState?.currentVersion ?? null,
          nextVersion: currentState?.nextVersion ?? null,
          lastCheckedAt: currentState?.lastCheckedAt ?? null,
          error: "Desktop update check failed.",
        }));
      }
    } finally {
      if (isMountedRef.current) {
        setIsActionPending(false);
      }
    }
  };

  const buttonLabel =
    updaterState?.status === "ready"
      ? "OK update"
      : updaterState?.status === "checking"
        ? "Checking"
        : updaterState?.status === "downloading"
          ? "Downloading"
          : updaterState?.status === "error"
            ? "Retry update"
            : "Check updates";

  return (
    <>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              title={presentation.title}
              onClick={() => {
                void onClick();
              }}
              disabled={presentation.disabled || isActionPending}
              className={cn(
                expanded
                  ? "inline-flex h-8 items-center justify-center gap-2 rounded-md border px-3 text-xs font-medium transition disabled:cursor-default disabled:opacity-80"
                  : "inline-flex h-8 w-8 items-center justify-center rounded-md border transition disabled:cursor-default disabled:opacity-80",
                presentation.className,
                className
              )}
            >
              {presentation.icon}
              {expanded ? <span>{buttonLabel}</span> : null}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-64 text-xs">
            {presentation.description}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {!expanded && isReadyPopupOpen && updaterState?.status === "ready" ? (
        <div className="fixed bottom-5 right-5 z-[80] w-[min(24rem,calc(100vw-1.5rem))] rounded-xl border border-emerald-400/45 bg-[#102417]/95 p-4 text-emerald-50 shadow-2xl shadow-black/45 backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Desktop update ready</p>
              <p className="mt-1 text-xs text-emerald-100/90">
                {updaterState.nextVersion
                  ? `Version ${updaterState.nextVersion} is downloaded and ready to install.`
                  : "A downloaded desktop update is ready to install."}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsReadyPopupOpen(false)}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-emerald-300/30 bg-emerald-500/10 text-emerald-100 transition hover:bg-emerald-500/20"
              aria-label="Dismiss update popup"
              title="Dismiss update popup"
            >
              ×
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void onClick();
              }}
              className="inline-flex h-8 items-center justify-center rounded-md border border-emerald-300/40 bg-emerald-500/20 px-3 text-xs font-semibold text-emerald-50 transition hover:bg-emerald-500/30"
            >
              OK update
            </button>

            <button
              type="button"
              onClick={() => setIsReadyPopupOpen(false)}
              className="inline-flex h-8 items-center justify-center rounded-md border border-white/10 bg-white/5 px-3 text-xs font-semibold text-emerald-50/90 transition hover:bg-white/10"
            >
              Later
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
};
