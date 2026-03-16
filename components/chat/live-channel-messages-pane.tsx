"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Member, Profile } from "@/lib/db/types";

import { ChatItem } from "@/components/chat/chat-item";
import { ChatScrollBox } from "@/components/chat/chat-scroll-box";
import { useSocket } from "@/components/providers/socket-provider";
import {
  LOCAL_CHAT_MUTATION_EVENT,
  matchesChannelMutation,
  type LocalChatMutationMessage,
  type LocalChatMutationDetail,
} from "@/lib/chat-live-events";
import { resolveAbsoluteAppUrl, resolveRuntimeAppOrigin } from "@/lib/client-runtime-url";
import {
  REALTIME_CHANNEL_MESSAGE_CREATED_EVENT,
  REALTIME_CHANNEL_REFRESH_EVENT,
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

type SerializedThreadSummary = {
  id: string;
  title: string;
  replyCount: number;
  archived?: boolean;
  participantCount?: number;
  unreadCount?: number;
};

type SerializedChannelMessage = {
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

type LiveChannelMessage = ReturnType<typeof normalizeMessages>[number] & {
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

const normalizeMessages = (messages: SerializedChannelMessage[]) =>
  messages.map((message) => ({
    ...message,
    member: normalizeMember(message.member),
  }));

type LiveChannelMessagesResponse = {
  messages?: SerializedChannelMessage[];
  reactionsByMessageId?: Record<string, Array<{ emoji: string; count: number }>>;
  threadsBySourceMessageId?: Record<string, SerializedThreadSummary | null>;
};

type ChannelMessageCreatedEventPayload = {
  message?: SerializedChannelMessage;
};

type LiveChannelMessagesPaneProps = {
  initialMessages: SerializedChannelMessage[];
  initialReactionsByMessageId: Record<string, Array<{ emoji: string; count: number }>>;
  initialThreadsBySourceMessageId?: Record<string, SerializedThreadSummary | null>;
  currentMember: Member;
  currentProfile: SerializedCurrentProfile;
  socketUrl: string;
  socketQuery: Record<string, string>;
  serverId: string;
  channelId: string;
  threadId?: string;
  emptyState: string;
  className: string;
  reactionScope?: "channel" | "direct";
  canPurgeDeletedMessage?: boolean;
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

const mergeFetchedWithOptimistic = (
  currentMessages: LiveChannelMessage[],
  fetchedMessages: SerializedChannelMessage[]
) => {
  const normalizedFetched = normalizeMessages(fetchedMessages) as LiveChannelMessage[];
  const pendingMessages = currentMessages.filter((message) => message.optimistic && message.clientMutationId);

  if (!pendingMessages.length) {
    return normalizedFetched;
  }

  return [...normalizedFetched, ...pendingMessages.filter((message) => !normalizedFetched.some((item) => item.id === message.id))];
};

const reconcileCanonicalMessage = (
  currentMessages: LiveChannelMessage[],
  nextMessage: SerializedChannelMessage | LocalChatMutationMessage,
  explicitClientMutationId?: string
) => {
  const normalizedMessage = {
    ...nextMessage,
    member: normalizeMember(nextMessage.member as SerializedMember),
  } as LiveChannelMessage;
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

export const LiveChannelMessagesPane = ({
  initialMessages,
  initialReactionsByMessageId,
  initialThreadsBySourceMessageId = {},
  currentMember,
  currentProfile,
  socketUrl,
  socketQuery,
  serverId,
  channelId,
  threadId,
  emptyState,
  className,
  reactionScope = "channel",
  canPurgeDeletedMessage = false,
}: LiveChannelMessagesPaneProps) => {
  const { socket } = useSocket();
  const [messages, setMessages] = useState<LiveChannelMessage[]>(() => normalizeMessages(initialMessages));
  const [reactionsByMessageId, setReactionsByMessageId] = useState(initialReactionsByMessageId);
  const [threadsBySourceMessageId, setThreadsBySourceMessageId] = useState(initialThreadsBySourceMessageId);
  const [appOrigin, setAppOrigin] = useState("");
  const fetchInFlightRef = useRef<Promise<void> | null>(null);

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams({
      serverId,
      channelId,
    });

    if (threadId) {
      params.set("threadId", threadId);
    }

    return resolveAbsoluteAppUrl(appOrigin, `${socketUrl}?${params.toString()}`);
  }, [appOrigin, channelId, serverId, socketUrl, threadId]);

  const roomPayload = useMemo(
    () => ({ serverId, channelId, threadId }),
    [channelId, serverId, threadId]
  );

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
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text());
        }

        const payload = (await response.json()) as LiveChannelMessagesResponse;
        setMessages((current) => mergeFetchedWithOptimistic(current, Array.isArray(payload.messages) ? payload.messages : []));
        setReactionsByMessageId(payload.reactionsByMessageId ?? {});
        setThreadsBySourceMessageId(payload.threadsBySourceMessageId ?? {});
      })
      .catch((error) => {
        console.error("[LIVE_CHANNEL_MESSAGES_REFRESH]", error);
      })
      .finally(() => {
        fetchInFlightRef.current = null;
      });

    fetchInFlightRef.current = request;
    return request;
  }, [requestUrl]);

  useEffect(() => {
    setMessages((current) => mergeFetchedWithOptimistic(current, initialMessages));
  }, [initialMessages]);

  useEffect(() => {
    setReactionsByMessageId(initialReactionsByMessageId);
  }, [initialReactionsByMessageId]);

  useEffect(() => {
    setThreadsBySourceMessageId(initialThreadsBySourceMessageId);
  }, [initialThreadsBySourceMessageId]);

  useEffect(() => {
    const onMessageCreated = (payload: ChannelMessageCreatedEventPayload | undefined) => {
      const nextMessage = payload?.message;
      if (!nextMessage?.id) {
        void refreshMessages();
        return;
      }

      setMessages((current) => reconcileCanonicalMessage(current, nextMessage));
    };

    const onRefresh = () => {
      void refreshMessages();
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
      if (!matchesChannelMutation(detail, { serverId, channelId, threadId: threadId ?? null })) {
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
    socket.on?.(REALTIME_CHANNEL_MESSAGE_CREATED_EVENT, onMessageCreated);
    socket.on?.(REALTIME_CHANNEL_REFRESH_EVENT, onRefresh);
    socket.on?.("connect", onConnect);

    return () => {
      window.removeEventListener(LOCAL_CHAT_MUTATION_EVENT, onLocalMutation as EventListener);
      socket.emit?.("inaccord:leave", roomPayload);
      socket.off?.(REALTIME_CHANNEL_MESSAGE_CREATED_EVENT, onMessageCreated);
      socket.off?.(REALTIME_CHANNEL_REFRESH_EVENT, onRefresh);
      socket.off?.("connect", onConnect);
    };
  }, [channelId, currentMember, currentProfile, refreshMessages, roomPayload, serverId, socket, threadId]);

  const lastMessageId = messages[messages.length - 1]?.id ?? "none";
  const scrollKey = `${threadId ?? channelId}:${messages.length}:${lastMessageId}`;

  return (
    <ChatScrollBox className={className} scrollKey={scrollKey}>
      {messages.length === 0 ? (
        <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400">{emptyState}</div>
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
            socketUrl={socketUrl}
            socketQuery={socketQuery}
            reactionScope={reactionScope}
            initialReactions={reactionsByMessageId[item.id] ?? []}
            serverId={serverId}
            channelId={channelId}
            thread={threadsBySourceMessageId[item.id] ?? null}
            canPurgeDeletedMessage={canPurgeDeletedMessage}
          />
        ))
      )}
    </ChatScrollBox>
  );
};