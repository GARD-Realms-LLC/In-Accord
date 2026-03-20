import {
  emitRealtimeEvent,
  getRealtimeRooms,
  getRealtimeServer,
} from "@/lib/realtime-server";

type RealtimeRoomPayload = {
  serverId?: string | null;
  channelId?: string | null;
  threadId?: string | null;
  conversationId?: string | null;
  profileId?: string | null;
  profileIds?: Array<string | null | undefined>;
  meeting?: boolean | null;
};

type DistributedRealtimeEvent = {
  sourceInstanceId: string;
  eventName: string;
  rooms: string[];
  detail?: Record<string, unknown>;
};

declare global {
  // eslint-disable-next-line no-var
  var inAccordRealtimeInstanceId: string | undefined;
}

const getInstanceId = () => {
  if (!globalThis.inAccordRealtimeInstanceId) {
    globalThis.inAccordRealtimeInstanceId = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  }

  return globalThis.inAccordRealtimeInstanceId;
};

const buildEventPayload = (detail?: Record<string, unknown>) => ({
  at: Date.now(),
  ...(detail ?? {}),
});

const emitDistributedEventLocally = (notification: DistributedRealtimeEvent) => {
  const io = getRealtimeServer();
  if (!io || !Array.isArray(notification.rooms) || notification.rooms.length === 0) {
    return false;
  }

  const eventPayload = buildEventPayload(notification.detail);
  for (const room of notification.rooms) {
    io.to(room).emit(notification.eventName, eventPayload);
  }

  return true;
};

export const ensureRealtimeEventBridgeStarted = async () => {
  return;
};

export const publishRealtimeEvent = async (
  eventName: string,
  payload: RealtimeRoomPayload,
  detail?: Record<string, unknown>,
) => {
  const rooms = getRealtimeRooms(payload);
  if (!rooms.length) {
    return false;
  }

  void ensureRealtimeEventBridgeStarted();
  emitRealtimeEvent(eventName, payload, detail);

  emitDistributedEventLocally({
    sourceInstanceId: getInstanceId(),
    eventName,
    rooms,
    detail: buildEventPayload(detail),
  });

  return true;
};

export const publishRealtimeRefresh = async (
  payload: RealtimeRoomPayload,
  detail?: Record<string, unknown>,
) => publishRealtimeEvent("inaccord:refresh", payload, detail);
