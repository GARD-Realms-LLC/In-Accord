"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Member, Profile } from "@/lib/db/types";

import { ChatItem } from "@/components/chat/chat-item";
import { ChatScrollBox } from "@/components/chat/chat-scroll-box";
import { useSocket } from "@/components/providers/socket-provider";
import {
  LOCAL_CHAT_MUTATION_EVENT,
  matchesConversationMutation,
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

type SerializedDirectMessage = {
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

type LiveDirectMessagesPaneProps = {
  initialMessages: SerializedDirectMessage[];
  initialReactionsByMessageId: Record<string, Array<{ emoji: string; count: number }>>;
  currentMember: Member;
  conversationId: string;
  serverId: string;
  className: string;
  otherMemberName: string;
};

const REALTIME_REFRESH_EVENT = "inaccord:refresh";
const DIRECT_MESSAGE_CREATED_EVENT = "inaccord:direct-message-created";

export const LiveDirectMessagesPane = ({
  initialMessages,
  initialReactionsByMessageId,
  currentMember,
  conversationId,
  serverId,
  className,
  otherMemberName,
}: LiveDirectMessagesPaneProps) => {
  const { socket } = useSocket();
  const [messages, setMessages] = useState(() => normalizeMessages(initialMessages));
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

    const request = fetch(requestUrl, { method: "GET", cache: "no-store", credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text());
        }

        const payload = (await response.json()) as LiveDirectMessagesResponse;
        setMessages(normalizeMessages(Array.isArray(payload.messages) ? payload.messages : []));
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
    setMessages(normalizeMessages(initialMessages));
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
      if (!matchesConversationMutation(detail, conversationId)) {
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
    socket.on?.(DIRECT_MESSAGE_CREATED_EVENT, onMessageCreated);
    socket.on?.(REALTIME_REFRESH_EVENT, onRefresh);
    socket.on?.("connect", joinRoom);

    return () => {
      window.removeEventListener(LOCAL_CHAT_MUTATION_EVENT, onLocalMutation as EventListener);
      socket.emit?.("inaccord:leave", roomPayload);
      socket.off?.(DIRECT_MESSAGE_CREATED_EVENT, onMessageCreated);
      socket.off?.(REALTIME_REFRESH_EVENT, onRefresh);
      socket.off?.("connect", joinRoom);
    };
  }, [conversationId, refreshMessages, roomPayload, socket]);

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