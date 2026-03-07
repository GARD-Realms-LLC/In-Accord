"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/components/providers/socket-provider";

export const UsersPageAutoRefresh = () => {
  const router = useRouter();
  const { connectionQuality } = useSocket();

  const refreshIntervalMs = useMemo(() => {
    if (connectionQuality === "connected") {
      return 12000;
    }

    if (connectionQuality === "slow") {
      return 18000;
    }

    return 25000;
  }, [connectionQuality]);

  const lastRefreshAtRef = useRef<number>(0);

  const tryRefresh = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }

    const now = Date.now();
    if (now - lastRefreshAtRef.current < 3000) {
      return;
    }

    lastRefreshAtRef.current = now;
    router.refresh();
  }, [router]);

  useEffect(() => {
    let timeoutId: number | null = null;
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) {
        return;
      }

      timeoutId = window.setTimeout(() => {
        tryRefresh();
        scheduleNext();
      }, refreshIntervalMs);
    };

    scheduleNext();

    const onFocus = () => tryRefresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        tryRefresh();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshIntervalMs, tryRefresh]);

  return null;
};
