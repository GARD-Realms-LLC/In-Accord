"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type ChatLiveRefreshProps = {
  enabled?: boolean;
  intervalMs?: number;
};

export const ChatLiveRefresh = ({ enabled = true, intervalMs = 1500 }: ChatLiveRefreshProps) => {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const refreshIfVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      router.refresh();
    };

    const onFocus = () => refreshIfVisible();
    const onVisibilityChange = () => refreshIfVisible();

    const timer = window.setInterval(refreshIfVisible, Math.max(800, intervalMs));

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, intervalMs, router]);

  return null;
};
