"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Member, Profile } from "@/lib/db/types";

import { ChatItem } from "@/components/chat/chat-item";
import { ChatScrollBox } from "@/components/chat/chat-scroll-box";
import { useSocket } from "@/components/providers/socket-provider";
import {
  LOCAL_CHAT_MUTATION_EVENT,
  matchesChannelMutation,
  type LocalChatMutationDetail,
} from "@/lib/chat-live-events";
import { resolveAbsoluteAppUrl, resolveRuntimeAppOrigin } from "@/lib/client-runtime-url";

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

const REALTIME_REFRESH_EVENT = "inaccord:refresh";
const CHANNEL_MESSAGE_CREATED_EVENT = "inaccord:message-created";

export const LiveChannelMessagesPane = ({
  initialMessages,
  initialReactionsByMessageId,
  initialThreadsBySourceMessageId = {},
  currentMember,
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
  const [messages, setMessages] = useState(() => normalizeMessages(initialMessages));
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
        setMessages(normalizeMessages(Array.isArray(payload.messages) ? payload.messages : []));
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
    setMessages(normalizeMessages(initialMessages));
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

      setMessages((current) => {
        if (current.some((item) => item.id === nextMessage.id)) {
          return current;
        }

        return [...current, {
          ...nextMessage,
          member: normalizeMember(nextMessage.member),
        }];
      });
    };

    const onRefresh = () => {
      void refreshMessages();
    };

    const joinRoom = () => {
      socket.emit?.("inaccord:join", roomPayload);
    };

    const onLocalMutation = (event: Event) => {
      const detail = (event as CustomEvent<LocalChatMutationDetail>).detail;
      if (!matchesChannelMutation(detail, { serverId, channelId, threadId: threadId ?? null })) {
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
    socket.on?.(CHANNEL_MESSAGE_CREATED_EVENT, onMessageCreated);
    socket.on?.(REALTIME_REFRESH_EVENT, onRefresh);
    socket.on?.("connect", joinRoom);

    return () => {
      window.removeEventListener(LOCAL_CHAT_MUTATION_EVENT, onLocalMutation as EventListener);
      socket.emit?.("inaccord:leave", roomPayload);
      socket.off?.(CHANNEL_MESSAGE_CREATED_EVENT, onMessageCreated);
      socket.off?.(REALTIME_REFRESH_EVENT, onRefresh);
      socket.off?.("connect", joinRoom);
    };
  }, [channelId, refreshMessages, roomPayload, serverId, socket, threadId]);

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