"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Member, Profile } from "@/lib/db/types";

import { ChatItem } from "@/components/chat/chat-item";
import { ChatScrollBox } from "@/components/chat/chat-scroll-box";
import { useSocket } from "@/components/providers/socket-provider";
import {
  LOCAL_CHAT_MUTATION_EVENT,
  matchesConversationMutation,
  type LocalChatMutationMessage,
  type LocalChatMutationDetail,
} from "@/lib/chat-live-events";
import { resolveAbsoluteAppUrl, resolveRuntimeAppOrigin } from "@/lib/client-runtime-url";
import {
  REALTIME_DIRECT_MESSAGE_CREATED_EVENT,
  REALTIME_DIRECT_MESSAGE_DELETED_EVENT,
  REALTIME_DIRECT_MESSAGE_UPDATED_EVENT,
} from "@/lib/realtime-events";

type ChatRenderableProfile = Profile & {
  role?: string | null;
};

type ChatRenderableMember = Member & {
  profile: ChatRenderableProfile;
};

type SerializedProfile = Omit<ChatRenderableProfile, "createdAt" | "updatedAt"> & {
  createdAt: Date | string;
  updatedAt: Date | string;
};

type SerializedMember = Omit<ChatRenderableMember, "profile"> & {
  profile: SerializedProfile;
};

type SerializedDirectMessage = {
  id: string;
  content: string;
  member: SerializedMember;
  fileUrl: string | null;
  deleted: boolean;
  timestamp: string;
  isUpdated: boolean;
  clientMutationId?: string;
};

type SerializedCurrentProfile = Omit<ChatRenderableProfile, "createdAt" | "updatedAt"> & {
  createdAt: Date | string;
  updatedAt: Date | string;
};

type LiveDirectMessage = ReturnType<typeof normalizeMessages>[number] & {
  clientMutationId?: string;
  optimistic?: boolean;
};

const normalizeDate = (value: Date | string | null | undefined) => {
  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value ?? 0);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
};

const normalizeMember = (member: SerializedMember): ChatRenderableMember => ({
  ...member,
  profile: {
    ...member.profile,
    createdAt: normalizeDate(member.profile.createdAt),
    updatedAt: normalizeDate(member.profile.updatedAt),
  },
});

const normalizeMessages = (messages: SerializedDirectMessage[]) =>
  messages.map((message) => ({
    ...message,
    member: normalizeMember(message.member),
  }));

type LiveDirectMessagesResponse = {
  messages?: SerializedDirectMessage[];
  reactionsByMessageId?: Record<string, Array<{ emoji: string; count: number }>>;
};

type DirectMessageCreatedEventPayload = {
  message?: SerializedDirectMessage;
};

type DirectMessageUpdatedEventPayload = {
  message?: Pick<SerializedDirectMessage, "id" | "content" | "fileUrl" | "deleted" | "isUpdated">;
};

type DirectMessageDeletedEventPayload = {
  messageId?: string;
  hardDelete?: boolean;
  message?: Pick<SerializedDirectMessage, "id" | "content" | "fileUrl" | "deleted" | "isUpdated">;
};

type LiveDirectMessagesPaneProps = {
  initialMessages: SerializedDirectMessage[];
  initialReactionsByMessageId: Record<string, Array<{ emoji: string; count: number }>>;
  currentMember: Member;
  currentProfile: SerializedCurrentProfile;
  conversationId: string;
  serverId: string;
  className: string;
  otherMemberName: string;
};

const formatOptimisticTimestamp = () =>
  new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });

const normalizeCurrentProfile = (profile: SerializedCurrentProfile): ChatRenderableProfile => ({
  ...profile,
  createdAt: normalizeDate(profile.createdAt),
  updatedAt: normalizeDate(profile.updatedAt),
});

const BACKGROUND_REFRESH_HEADERS = {
  "X-InAccord-Background-Refresh": "1",
  "X-InAccord-Silent-Loading": "1",
};

const mergeFetchedWithOptimistic = (
  currentMessages: LiveDirectMessage[],
  fetchedMessages: SerializedDirectMessage[]
) => {
  const normalizedFetched = normalizeMessages(fetchedMessages) as LiveDirectMessage[];
  const pendingMessages = currentMessages.filter((message) => message.optimistic && message.clientMutationId);

  if (!pendingMessages.length) {
    return normalizedFetched;
  }

  return [...normalizedFetched, ...pendingMessages.filter((message) => !normalizedFetched.some((item) => item.id === message.id))];
};

const reconcileCanonicalMessage = (
  currentMessages: LiveDirectMessage[],
  nextMessage: SerializedDirectMessage | LocalChatMutationMessage,
  explicitClientMutationId?: string
) => {
  const normalizedMessage = {
    ...nextMessage,
    member: normalizeMember(nextMessage.member as SerializedMember),
  } as LiveDirectMessage;
  const clientMutationId = String(explicitClientMutationId ?? nextMessage.clientMutationId ?? "").trim();
  const existingIndex = currentMessages.findIndex(
    (item) => item.id === normalizedMessage.id || (clientMutationId && item.clientMutationId === clientMutationId)
  );

  if (existingIndex < 0) {
    return [...currentMessages, { ...normalizedMessage, clientMutationId: clientMutationId || normalizedMessage.clientMutationId }];
  }

  return currentMessages.map((item, index) =>
    index === existingIndex
      ? {
          ...normalizedMessage,
          clientMutationId: clientMutationId || normalizedMessage.clientMutationId,
        }
      : item
  );
};

const applyRealtimeDirectMessagePatch = (
  currentMessages: LiveDirectMessage[],
  nextMessage: Pick<SerializedDirectMessage, "id" | "content" | "fileUrl" | "deleted" | "isUpdated">
) => currentMessages.map((item) => (item.id === nextMessage.id ? { ...item, ...nextMessage, optimistic: false } : item));

const applyRealtimeDirectMessageDelete = ({
  currentMessages,
  payload,
}: {
  currentMessages: LiveDirectMessage[];
  payload: DirectMessageDeletedEventPayload;
}) => {
  const targetId = String(payload.message?.id ?? payload.messageId ?? "").trim();
  if (!targetId) {
    return currentMessages;
  }

  if (payload.hardDelete) {
    return currentMessages.filter((item) => item.id !== targetId);
  }

  if (!payload.message) {
    return currentMessages;
  }

  return applyRealtimeDirectMessagePatch(currentMessages, payload.message);
};

export const LiveDirectMessagesPane = ({
  initialMessages,
  initialReactionsByMessageId,
  currentMember,
  currentProfile,
  conversationId,
  serverId,
  className,
  otherMemberName,
}: LiveDirectMessagesPaneProps) => {
  const { socket } = useSocket();
  const [messages, setMessages] = useState<LiveDirectMessage[]>(() => normalizeMessages(initialMessages));
  const [reactionsByMessageId, setReactionsByMessageId] = useState(initialReactionsByMessageId);
  const [appOrigin, setAppOrigin] = useState("");
  const fetchInFlightRef = useRef<Promise<void> | null>(null);

  const requestUrl = useMemo(
    () =>
      resolveAbsoluteAppUrl(
        appOrigin,
        `/api/socket/direct-messages?conversationId=${encodeURIComponent(conversationId)}`
      ),
    [appOrigin, conversationId]
  );

  const roomPayload = useMemo(() => ({ conversationId }), [conversationId]);

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

  const refreshMessages = useCallback(async () => {
    if (fetchInFlightRef.current) {
      return fetchInFlightRef.current;
    }

    const request = fetch(requestUrl, {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      headers: BACKGROUND_REFRESH_HEADERS,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text());
        }

        const payload = (await response.json()) as LiveDirectMessagesResponse;
        setMessages((current) => mergeFetchedWithOptimistic(current, Array.isArray(payload.messages) ? payload.messages : []));
        setReactionsByMessageId(payload.reactionsByMessageId ?? {});
      })
      .catch((error) => {
        console.error("[LIVE_DIRECT_MESSAGES_REFRESH]", error);
      })
      .finally(() => {
        fetchInFlightRef.current = null;
      });

    fetchInFlightRef.current = request;
    return request;
  }, [requestUrl]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const refreshIfVisible = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      void refreshMessages();
    };

    refreshIfVisible();

    const intervalId = window.setInterval(refreshIfVisible, 15000);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [refreshMessages]);

  useEffect(() => {
    setMessages((current) => mergeFetchedWithOptimistic(current, initialMessages));
  }, [initialMessages]);

  useEffect(() => {
    setReactionsByMessageId(initialReactionsByMessageId);
  }, [initialReactionsByMessageId]);

  useEffect(() => {
    const onMessageCreated = (payload: DirectMessageCreatedEventPayload | undefined) => {
      const nextMessage = payload?.message;
      if (!nextMessage?.id) {
        void refreshMessages();
        return;
      }

      setMessages((current) => reconcileCanonicalMessage(current, nextMessage));
    };

    const onMessageUpdated = (payload: DirectMessageUpdatedEventPayload | undefined) => {
      if (!payload?.message?.id) {
        return;
      }

      setMessages((current) => applyRealtimeDirectMessagePatch(current, payload.message!));
    };

    const onMessageDeleted = (payload: DirectMessageDeletedEventPayload | undefined) => {
      if (!payload) {
        return;
      }

      const targetId = String(payload.message?.id ?? payload.messageId ?? "").trim();
      if (!targetId) {
        return;
      }

      setMessages((current) => applyRealtimeDirectMessageDelete({ currentMessages: current, payload }));
    };

    const joinRoom = () => {
      socket.emit?.("inaccord:join", roomPayload);
    };

    const onConnect = () => {
      joinRoom();
      void refreshMessages();
    };

    const onLocalMutation = (event: Event) => {
      const detail = (event as CustomEvent<LocalChatMutationDetail>).detail;
      if (!matchesConversationMutation(detail, conversationId)) {
        return;
      }

      if (detail.state === "optimistic" && detail.clientMutationId && detail.optimisticMessage) {
        const clientMutationId = detail.clientMutationId;
        const optimisticMessage = detail.optimisticMessage;

        setMessages((current) => {
          if (current.some((item) => item.clientMutationId === clientMutationId || item.id === `optimistic:${clientMutationId}`)) {
            return current;
          }

          return [
            ...current,
            {
              id: `optimistic:${clientMutationId}`,
              clientMutationId,
              optimistic: true,
              content: optimisticMessage.content,
              fileUrl: optimisticMessage.fileUrl,
              deleted: false,
              timestamp: formatOptimisticTimestamp(),
              isUpdated: false,
              member: {
                ...currentMember,
                createdAt: normalizeDate((currentMember as Member & { createdAt: Date | string }).createdAt),
                updatedAt: normalizeDate((currentMember as Member & { updatedAt: Date | string }).updatedAt),
                profile: normalizeCurrentProfile(currentProfile),
              },
            },
          ];
        });
        return;
      }

      if (detail.state === "confirmed" && detail.confirmedMessage) {
        const confirmedMessage = detail.confirmedMessage;
        setMessages((current) => reconcileCanonicalMessage(current, confirmedMessage, detail.clientMutationId || undefined));
        return;
      }

      if (detail.state === "failed" && detail.clientMutationId) {
        setMessages((current) => current.filter((item) => item.clientMutationId !== detail.clientMutationId));
        return;
      }

      void refreshMessages();
    };

    window.addEventListener(LOCAL_CHAT_MUTATION_EVENT, onLocalMutation as EventListener);

    if (!socket) {
      return () => {
        window.removeEventListener(LOCAL_CHAT_MUTATION_EVENT, onLocalMutation as EventListener);
      };
    }

    joinRoom();
    void refreshMessages();
    socket.on?.(REALTIME_DIRECT_MESSAGE_CREATED_EVENT, onMessageCreated);
    socket.on?.(REALTIME_DIRECT_MESSAGE_UPDATED_EVENT, onMessageUpdated);
    socket.on?.(REALTIME_DIRECT_MESSAGE_DELETED_EVENT, onMessageDeleted);
    socket.on?.("connect", onConnect);

    return () => {
      window.removeEventListener(LOCAL_CHAT_MUTATION_EVENT, onLocalMutation as EventListener);
      socket.emit?.("inaccord:leave", roomPayload);
      socket.off?.(REALTIME_DIRECT_MESSAGE_CREATED_EVENT, onMessageCreated);
      socket.off?.(REALTIME_DIRECT_MESSAGE_UPDATED_EVENT, onMessageUpdated);
      socket.off?.(REALTIME_DIRECT_MESSAGE_DELETED_EVENT, onMessageDeleted);
      socket.off?.("connect", onConnect);
    };
  }, [conversationId, currentMember, currentProfile, refreshMessages, roomPayload, socket]);

  const lastMessageId = messages[messages.length - 1]?.id ?? "none";
  const scrollKey = `${conversationId}:${messages.length}:${lastMessageId}`;

  return (
    <ChatScrollBox className={className} scrollKey={scrollKey}>
      {messages.length === 0 ? (
        <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400">
          No private messages yet. Say hello to {otherMemberName}.
        </div>
      ) : (
        messages.map((item) => (
          <ChatItem
            key={item.id}
            id={item.id}
            content={item.content}
            member={item.member}
            timestamp={item.timestamp}
            fileUrl={item.fileUrl}
            deleted={item.deleted}
            currentMember={currentMember}
            isUpdated={item.isUpdated}
            socketUrl="/api/socket/direct-messages"
            socketQuery={{ conversationId }}
            dmServerId={serverId}
            reactionScope="direct"
            initialReactions={reactionsByMessageId[item.id] ?? []}
          />
        ))
      )}
    </ChatScrollBox>
  );
};
