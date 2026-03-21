"use client";

import { useEffect, useRef, useState } from "react";

type BuildStalenessProviderProps = {
  currentVersion: string;
  currentDisplayVersion: string;
  currentBuildNumber: string;
};

type BuildVersionResponse = {
  version?: unknown;
  displayVersion?: unknown;
  buildNumber?: unknown;
};

const VERSION_CHECK_INTERVAL_MS = 2 * 60 * 1000;
const STALE_BUILD_ERROR_PATTERN =
  /ChunkLoadError|Loading chunk [^]+ failed|Loading CSS chunk [^]+ failed|Failed to fetch dynamically imported module|Failed to load module script/i;

export const BuildStalenessProvider = ({
  currentVersion,
  currentDisplayVersion,
  currentBuildNumber,
}: BuildStalenessProviderProps) => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [reloadReason, setReloadReason] = useState<string | null>(null);
  const isCheckingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const markReloadRequired = (reason: string) => {
      if (!cancelled) {
        setReloadReason(reason);
      }
    };

    const checkForNewBuild = async () => {
      if (isCheckingRef.current) {
        return;
      }

      isCheckingRef.current = true;

      try {
        const response = await fetch(`/api/build-version?ts=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as BuildVersionResponse;
        const nextVersion = String(payload.version ?? "").trim();
        const nextBuildNumber = String(payload.buildNumber ?? "").trim();

        if (
          (nextVersion && nextVersion !== currentVersion) ||
          (nextBuildNumber && nextBuildNumber !== currentBuildNumber)
        ) {
          setUpdateAvailable(true);
        }
      } catch {
        // Ignore passive version-check failures; the page itself may still be healthy.
      } finally {
        isCheckingRef.current = false;
      }
    };

    const handleWindowError = (event: ErrorEvent) => {
      const message = String(event.message ?? event.error?.message ?? "").trim();
      if (STALE_BUILD_ERROR_PATTERN.test(message)) {
        markReloadRequired("This page is out of date and needs a reload.");
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        typeof reason === "string"
          ? reason
          : String(reason?.message ?? reason ?? "").trim();

      if (STALE_BUILD_ERROR_PATTERN.test(message)) {
        markReloadRequired("A newer site build is available. Reload this page.");
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkForNewBuild();
      }
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    void checkForNewBuild();
    const intervalId = window.setInterval(() => {
      void checkForNewBuild();
    }, VERSION_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [currentBuildNumber, currentVersion]);

  if (!reloadReason && !updateAvailable) {
    return null;
  }

  const helperText =
    reloadReason ??
    `A newer build is ready: Version ${currentDisplayVersion} • Build #${currentBuildNumber}. Reload to keep this page in sync.`;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-1000 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-2xl items-center gap-3 rounded-2xl border border-amber-400/35 bg-neutral-950/96 px-4 py-3 text-sm text-amber-50 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur">
        <div className="min-w-0">
          <div className="font-semibold tracking-[0.14em] text-amber-300 uppercase">
            {reloadReason ? "Reload Required" : "Build Update Ready"}
          </div>
          <div className="mt-1 text-[13px] leading-5 text-amber-50/90">
            {helperText}
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 rounded-xl border border-amber-300/40 bg-amber-300/16 px-3 py-2 text-xs font-semibold tracking-[0.12em] text-amber-100 uppercase transition hover:bg-amber-300/24"
        >
          Reload
        </button>
      </div>
    </div>
  );
};
