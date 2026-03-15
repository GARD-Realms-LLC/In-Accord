import { Server as SocketIOServer } from "socket.io";

type RealtimeRoomPayload = {
  serverId?: string | null;
  channelId?: string | null;
  threadId?: string | null;
  conversationId?: string | null;
  profileId?: string | null;
  profileIds?: Array<string | null | undefined>;
};

declare global {
  // eslint-disable-next-line no-var
  var inAccordSocketIo: SocketIOServer | undefined;
}

const normalizeId = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : "";
};

export const buildChannelRoom = (serverId: unknown, channelId: unknown) => {
  const normalizedServerId = normalizeId(serverId);
  const normalizedChannelId = normalizeId(channelId);

  if (!normalizedServerId || !normalizedChannelId) {
    return "";
  }

  return `channel:${normalizedServerId}:${normalizedChannelId}`;
};

export const buildThreadRoom = (serverId: unknown, channelId: unknown, threadId: unknown) => {
  const normalizedServerId = normalizeId(serverId);
  const normalizedChannelId = normalizeId(channelId);
  const normalizedThreadId = normalizeId(threadId);

  if (!normalizedServerId || !normalizedChannelId || !normalizedThreadId) {
    return "";
  }

  return `thread:${normalizedServerId}:${normalizedChannelId}:${normalizedThreadId}`;
};

export const buildConversationRoom = (conversationId: unknown) => {
  const normalizedConversationId = normalizeId(conversationId);

  if (!normalizedConversationId) {
    return "";
  }

  return `conversation:${normalizedConversationId}`;
};

export const buildProfileRoom = (profileId: unknown) => {
  const normalizedProfileId = normalizeId(profileId);

  if (!normalizedProfileId) {
    return "";
  }

  return `profile:${normalizedProfileId}`;
};

export const getRealtimeRooms = (payload: RealtimeRoomPayload) => {
  const profileRooms = Array.isArray(payload.profileIds)
    ? payload.profileIds.map((profileId) => buildProfileRoom(profileId)).filter(Boolean)
    : [];

  const rooms = [
    buildChannelRoom(payload.serverId, payload.channelId),
    buildThreadRoom(payload.serverId, payload.channelId, payload.threadId),
    buildConversationRoom(payload.conversationId),
    buildProfileRoom(payload.profileId),
    ...profileRooms,
  ].filter(Boolean);

  return Array.from(new Set(rooms));
};

export const setRealtimeServer = (io: SocketIOServer) => {
  globalThis.inAccordSocketIo = io;
  return io;
};

export const getRealtimeServer = () => globalThis.inAccordSocketIo ?? null;

export const joinRealtimeRooms = (socket: { join?: (room: string) => void }, payload: RealtimeRoomPayload) => {
  for (const room of getRealtimeRooms(payload)) {
    socket.join?.(room);
  }
};

export const leaveRealtimeRooms = (socket: { leave?: (room: string) => void }, payload: RealtimeRoomPayload) => {
  for (const room of getRealtimeRooms(payload)) {
    socket.leave?.(room);
  }
};

export const emitRealtimeRefresh = (
  payload: RealtimeRoomPayload,
  detail?: Record<string, unknown>
) => {
  return emitRealtimeEvent("inaccord:refresh", payload, detail);
};

export const emitRealtimeEvent = (
  eventName: string,
  payload: RealtimeRoomPayload,
  detail?: Record<string, unknown>
) => {
  const io = getRealtimeServer();
  if (!io) {
    return false;
  }

  const rooms = getRealtimeRooms(payload);
  if (!rooms.length) {
    return false;
  }

  const eventPayload = {
    at: Date.now(),
    ...detail,
  };

  for (const room of rooms) {
    io.to(room).emit(eventName, eventPayload);
  }

  return true;
};