"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type ChatLiveRefreshProps = {
  enabled?: boolean;
};

const POST_CREATED_EVENT = "inaccord:post-created";

export const ChatLiveRefresh = ({ enabled = true }: ChatLiveRefreshProps) => {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const refreshAfterPost = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      router.refresh();
    };

    window.addEventListener(POST_CREATED_EVENT, refreshAfterPost as EventListener);

    return () => {
      window.removeEventListener(POST_CREATED_EVENT, refreshAfterPost as EventListener);
    };
  }, [enabled, router]);

  return null;
};
