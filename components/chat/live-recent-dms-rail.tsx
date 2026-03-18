"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DirectMessageListItem } from "@/components/chat/direct-message-list-item";
import { useSocket } from "@/components/providers/socket-provider";
import {
  LOCAL_CHAT_MUTATION_EVENT,
  type LocalChatMutationDetail,
} from "@/lib/chat-live-events";
import { resolveAbsoluteAppUrl, resolveRuntimeAppOrigin } from "@/lib/client-runtime-url";
import { REALTIME_DM_RAIL_SYNC_EVENT } from "@/lib/realtime-events";

type RecentDmRailItem = {
  conversationId: string;
  serverId: string;
  memberId: string;
  profileId: string;
  displayName: string;
  imageUrl: string | null;
  avatarDecorationUrl: string | null;
  profileCreatedAt: string | null;
  timestampLabel: string;
  lastMessageAt: string | null;
  unreadCount: number;
};

type RecentDmRailResponse = {
  items?: RecentDmRailItem[];
};

type RecentDmRailSyncPayload = {
  conversationId?: string;
  item?: RecentDmRailItem | null;
};

const getRecentDmSortTime = (item: RecentDmRailItem) => {
  const parsed = Date.parse(item.lastMessageAt ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
};

const sortRecentDmItems = (items: RecentDmRailItem[]) =>
  [...items].sort((left, right) => getRecentDmSortTime(right) - getRecentDmSortTime(left));

type LiveRecentDmsRailProps = {
  initialItems: RecentDmRailItem[];
  profileId: string;
  selectedConversationId?: string | null;
  selectedServerId?: string | null;
};

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
        setItems(sortRecentDmItems(Array.isArray(payload.items) ? payload.items : []));
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
    setItems(sortRecentDmItems(initialItems));
  }, [initialItems]);

  useEffect(() => {
    const onSync = (payload: RecentDmRailSyncPayload | undefined) => {
      const conversationId = String(payload?.conversationId ?? payload?.item?.conversationId ?? "").trim();
      if (!conversationId) {
        return;
      }

      const item = payload?.item ?? null;

      setItems((current) => {
        if (!item || (selectedServerId && item.serverId !== selectedServerId)) {
          return current.filter((entry) => entry.conversationId !== conversationId);
        }

        const next = current.filter((entry) => entry.conversationId !== item.conversationId);
        next.push(item);
        return sortRecentDmItems(next);
      });
    };

    const joinRoom = () => {
      socket.emit?.("inaccord:join", roomPayload);
    };

    const onConnect = () => {
      joinRoom();
      void refreshRail();
    };

    const onLocalMutation = (event: Event) => {
      const detail = (event as CustomEvent<LocalChatMutationDetail>).detail;
      if (detail?.scope !== "conversation") {
        return;
      }

      if (detail.state === "optimistic" || detail.state === "failed") {
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
    void refreshRail();
    socket.on?.(REALTIME_DM_RAIL_SYNC_EVENT, onSync);
    socket.on?.("connect", onConnect);

    return () => {
      window.removeEventListener(LOCAL_CHAT_MUTATION_EVENT, onLocalMutation as EventListener);
      socket.emit?.("inaccord:leave", roomPayload);
      socket.off?.(REALTIME_DM_RAIL_SYNC_EVENT, onSync);
      socket.off?.("connect", onConnect);
    };
  }, [refreshRail, roomPayload, selectedServerId, socket]);

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
          avatarDecorationUrl={dm.avatarDecorationUrl}
          profileCreatedAt={dm.profileCreatedAt}
          timestampLabel={dm.timestampLabel}
          unreadCount={dm.unreadCount}
          isActive={selectedConversationId === dm.conversationId}
        />
      ))}
    </div>
  );
};