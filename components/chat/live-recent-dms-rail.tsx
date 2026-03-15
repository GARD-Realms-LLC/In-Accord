"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DirectMessageListItem } from "@/components/chat/direct-message-list-item";
import { useSocket } from "@/components/providers/socket-provider";
import {
  LOCAL_CHAT_MUTATION_EVENT,
  type LocalChatMutationDetail,
} from "@/lib/chat-live-events";
import { resolveAbsoluteAppUrl, resolveRuntimeAppOrigin } from "@/lib/client-runtime-url";

type RecentDmRailItem = {
  conversationId: string;
  serverId: string;
  memberId: string;
  profileId: string;
  displayName: string;
  imageUrl: string | null;
  profileCreatedAt: string | null;
  timestampLabel: string;
  unreadCount: number;
};

type RecentDmRailResponse = {
  items?: RecentDmRailItem[];
};

type LiveRecentDmsRailProps = {
  initialItems: RecentDmRailItem[];
  profileId: string;
  selectedConversationId?: string | null;
  selectedServerId?: string | null;
};

const REALTIME_REFRESH_EVENT = "inaccord:refresh";

export const LiveRecentDmsRail = ({
  initialItems,
  profileId,
  selectedConversationId,
  selectedServerId,
}: LiveRecentDmsRailProps) => {
  const { socket } = useSocket();
  const [items, setItems] = useState(initialItems);
  const [appOrigin, setAppOrigin] = useState("");
  const fetchInFlightRef = useRef<Promise<void> | null>(null);

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams();

    if (selectedServerId) {
      params.set("selectedServerId", selectedServerId);
    }

    const query = params.toString();
    return resolveAbsoluteAppUrl(
      appOrigin,
      query ? `/api/direct-messages/recent?${query}` : "/api/direct-messages/recent"
    );
  }, [appOrigin, selectedServerId]);

  const roomPayload = useMemo(() => ({ profileId }), [profileId]);

  useEffect(() => {
    let cancelled = false;

    const syncAppOrigin = async () => {
      const nextOrigin = await resolveRuntimeAppOrigin();
      if (!cancelled) {
        setAppOrigin(nextOrigin);
      }
    };

    void syncAppOrigin();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshRail = useCallback(async () => {
    if (fetchInFlightRef.current) {
      return fetchInFlightRef.current;
    }

    const request = fetch(requestUrl, { method: "GET", cache: "no-store", credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text());
        }

        const payload = (await response.json()) as RecentDmRailResponse;
        setItems(Array.isArray(payload.items) ? payload.items : []);
      })
      .catch((error) => {
        console.error("[LIVE_RECENT_DMS_REFRESH]", error);
      })
      .finally(() => {
        fetchInFlightRef.current = null;
      });

    fetchInFlightRef.current = request;
    return request;
  }, [requestUrl]);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    const onRefresh = () => {
      void refreshRail();
    };

    const joinRoom = () => {
      socket.emit?.("inaccord:join", roomPayload);
    };

    const onLocalMutation = (event: Event) => {
      const detail = (event as CustomEvent<LocalChatMutationDetail>).detail;
      if (detail?.scope !== "conversation") {
        return;
      }

      void refreshRail();
    };

    window.addEventListener(LOCAL_CHAT_MUTATION_EVENT, onLocalMutation as EventListener);

    if (!socket) {
      return () => {
        window.removeEventListener(LOCAL_CHAT_MUTATION_EVENT, onLocalMutation as EventListener);
      };
    }

    joinRoom();
    socket.on?.(REALTIME_REFRESH_EVENT, onRefresh);
    socket.on?.("connect", joinRoom);

    return () => {
      window.removeEventListener(LOCAL_CHAT_MUTATION_EVENT, onLocalMutation as EventListener);
      socket.emit?.("inaccord:leave", roomPayload);
      socket.off?.(REALTIME_REFRESH_EVENT, onRefresh);
      socket.off?.("connect", joinRoom);
    };
  }, [refreshRail, roomPayload, socket]);

  if (items.length === 0) {
    return <p>No recent PMs yet.</p>;
  }

  return (
    <div className="space-y-1.5">
      {items.slice(0, 8).map((dm) => (
        <DirectMessageListItem
          key={dm.conversationId}
          conversationId={dm.conversationId}
          serverId={dm.serverId}
          memberId={dm.memberId}
          profileId={dm.profileId}
          displayName={dm.displayName}
          imageUrl={dm.imageUrl}
          profileCreatedAt={dm.profileCreatedAt}
          timestampLabel={dm.timestampLabel}
          unreadCount={dm.unreadCount}
          isActive={selectedConversationId === dm.conversationId}
        />
      ))}
    </div>
  );
};