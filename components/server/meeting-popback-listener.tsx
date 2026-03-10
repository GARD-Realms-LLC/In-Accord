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
      router.replace(targetUrl);
      router.refresh();
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

    const onPopbackStorage = (event: StorageEvent) => {
      if (event.key !== popbackStorageKey || !event.newValue) {
        return;
      }

      try {
        const payload = JSON.parse(event.newValue) as
          | {
              serverId?: string;
              channelId?: string;
            }
          | undefined;

        if (payload?.serverId !== serverId || payload?.channelId !== channelId) {
          return;
        }

        syncBackToMeeting();
      } catch {
        // ignore invalid payloads
      }
    };

    const electronApi = (window as any).electronAPI;
    const disposePopoutClosed =
      typeof electronApi?.onMeetingPopoutClosed === "function"
        ? electronApi.onMeetingPopoutClosed((payload: { serverId?: string | null; channelId?: string | null }) => {
            if (payload?.serverId !== serverId || payload?.channelId !== channelId) {
              return;
            }

            syncBackToMeeting();
          })
        : null;

    window.addEventListener("message", onPopbackMessage);
    window.addEventListener("storage", onPopbackStorage);

    return () => {
      window.removeEventListener("message", onPopbackMessage);
      window.removeEventListener("storage", onPopbackStorage);
      if (typeof disposePopoutClosed === "function") {
        disposePopoutClosed();
      }
    };
  }, [channelId, channelPath, enabled, router, serverId]);

  return null;
};
