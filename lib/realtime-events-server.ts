import type { PoolClient } from "pg";

import { pool } from "@/lib/db";
import { emitRealtimeEvent, getRealtimeRooms, getRealtimeServer } from "@/lib/realtime-server";

const REALTIME_EVENTS_CHANNEL = "inaccord_realtime_events";

type RealtimeRoomPayload = {
  serverId?: string | null;
  channelId?: string | null;
  threadId?: string | null;
  conversationId?: string | null;
  profileId?: string | null;
  profileIds?: Array<string | null | undefined>;
};

type DistributedRealtimeEvent = {
  sourceInstanceId: string;
  eventName: string;
  rooms: string[];
  detail?: Record<string, unknown>;
};

declare global {
  // eslint-disable-next-line no-var
  var inAccordRealtimeBridgePromise: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var inAccordRealtimeBridgeClient: PoolClient | undefined;
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

const parseDistributedEvent = (value: string): DistributedRealtimeEvent | null => {
  try {
    const parsed = JSON.parse(value) as DistributedRealtimeEvent;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const eventName = String(parsed.eventName ?? "").trim();
    const sourceInstanceId = String(parsed.sourceInstanceId ?? "").trim();
    const rooms = Array.isArray(parsed.rooms)
      ? parsed.rooms.map((room) => String(room ?? "").trim()).filter(Boolean)
      : [];

    if (!eventName || !sourceInstanceId || rooms.length === 0) {
      return null;
    }

    return {
      sourceInstanceId,
      eventName,
      rooms,
      detail: parsed.detail && typeof parsed.detail === "object" ? parsed.detail : {},
    };
  } catch {
    return null;
  }
};

export const ensureRealtimeEventBridgeStarted = async () => {
  if (globalThis.inAccordRealtimeBridgePromise) {
    return globalThis.inAccordRealtimeBridgePromise;
  }

  globalThis.inAccordRealtimeBridgePromise = (async () => {
    const existingClient = globalThis.inAccordRealtimeBridgeClient;
    if (existingClient) {
      return;
    }

    const client = await pool.connect();
    globalThis.inAccordRealtimeBridgeClient = client;

    client.on("notification", (message) => {
      if (message.channel !== REALTIME_EVENTS_CHANNEL || !message.payload) {
        return;
      }

      const notification = parseDistributedEvent(message.payload);
      if (!notification) {
        return;
      }

      if (notification.sourceInstanceId === getInstanceId()) {
        return;
      }

      emitDistributedEventLocally(notification);
    });

    client.on("error", (error) => {
      console.error("[REALTIME_EVENT_BRIDGE_ERROR]", error);
      globalThis.inAccordRealtimeBridgePromise = undefined;
      globalThis.inAccordRealtimeBridgeClient = undefined;
    });

    client.on("end", () => {
      globalThis.inAccordRealtimeBridgePromise = undefined;
      globalThis.inAccordRealtimeBridgeClient = undefined;
    });

    await client.query(`LISTEN ${REALTIME_EVENTS_CHANNEL}`);
  })().catch((error) => {
    globalThis.inAccordRealtimeBridgePromise = undefined;
    globalThis.inAccordRealtimeBridgeClient = undefined;
    throw error;
  });

  return globalThis.inAccordRealtimeBridgePromise;
};

export const publishRealtimeEvent = async (
  eventName: string,
  payload: RealtimeRoomPayload,
  detail?: Record<string, unknown>
) => {
  const rooms = getRealtimeRooms(payload);
  if (!rooms.length) {
    return false;
  }

  void ensureRealtimeEventBridgeStarted().catch((error) => {
    console.error("[REALTIME_EVENT_BRIDGE_START]", error);
  });

  emitRealtimeEvent(eventName, payload, detail);

  try {
    const distributedEvent: DistributedRealtimeEvent = {
      sourceInstanceId: getInstanceId(),
      eventName,
      rooms,
      detail: buildEventPayload(detail),
    };

    await pool.query("select pg_notify($1, $2)", [REALTIME_EVENTS_CHANNEL, JSON.stringify(distributedEvent)]);
  } catch (error) {
    console.error("[REALTIME_EVENT_PUBLISH]", error);
  }

  return true;
};

export const publishRealtimeRefresh = async (
  payload: RealtimeRoomPayload,
  detail?: Record<string, unknown>
) => publishRealtimeEvent("inaccord:refresh", payload, detail);
