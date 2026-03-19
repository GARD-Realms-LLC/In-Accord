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
};

export const DesktopUpdateButton = ({ className }: DesktopUpdateButtonProps) => {
  const [updaterState, setUpdaterState] = useState<DesktopUpdaterState | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

  return (
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
              "inline-flex h-8 w-8 items-center justify-center rounded-md border transition disabled:cursor-default disabled:opacity-80",
              presentation.className,
              className
            )}
          >
            {presentation.icon}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 text-xs">
          {presentation.description}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
