"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type MeetingPopbackListenerProps = {
  serverId: string;
  channelId: string;
  channelPath?: string;
  enabled?: boolean;
};

export const MeetingPopbackListener = ({
  serverId,
  channelId,
  channelPath,
  enabled = true,
}: MeetingPopbackListenerProps) => {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const popbackStorageKey = "inaccord:meeting-popback";
    const baseChannelPath =
      typeof channelPath === "string" && channelPath.trim().length > 0
        ? channelPath.trim()
        : `/servers/${serverId}/channels/${channelId}`;
    const targetUrl = `${baseChannelPath}?live=true`;

    const syncBackToMeeting = () => {
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (currentUrl === targetUrl) {
        return;
      }

      router.replace(targetUrl);
    };

    const onPopbackMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const data = event.data as
        | {
            type?: string;
            serverId?: string;
            channelId?: string;
          }
        | undefined;

      if (data?.type !== "inaccord:meeting-popback") {
        return;
      }

      if (data.serverId !== serverId || data.channelId !== channelId) {
        return;
      }

      syncBackToMeeting();
    };

    window.addEventListener("message", onPopbackMessage);

    return () => {
      window.removeEventListener("message", onPopbackMessage);
    };
  }, [channelId, channelPath, enabled, router, serverId]);

  return null;
};
