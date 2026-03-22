import { executeD1Query } from "@/lib/d1-runtime";
import { emitRealtimeEvent, getRealtimeRooms, getRealtimeServer } from "@/lib/realtime-server";

const REALTIME_EVENTS_TABLE = "InAccordRealtimeEvent";
const REALTIME_EVENT_POLL_INTERVAL_MS = 1000;
const REALTIME_EVENT_RETENTION_MS = 5 * 60 * 1000;
const REALTIME_EVENT_BATCH_SIZE = 100;

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
  var inAccordRealtimeBridgePromise: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var inAccordRealtimeInstanceId: string | undefined;
  // eslint-disable-next-line no-var
  var inAccordRealtimePollTimer: ReturnType<typeof setTimeout> | undefined;
  // eslint-disable-next-line no-var
  var inAccordRealtimeLastSeenCreatedAt: string | undefined;
  // eslint-disable-next-line no-var
  var inAccordRealtimeLastSeenId: string | undefined;
  // eslint-disable-next-line no-var
  var inAccordRealtimeNextCleanupAt: number | undefined;
}

const getInstanceId = () => {
  if (!globalThis.inAccordRealtimeInstanceId) {
    const randomPart =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    globalThis.inAccordRealtimeInstanceId = randomPart;
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

const parseDistributedEvent = (value: unknown): DistributedRealtimeEvent | null => {
  try {
    const parsed =
      typeof value === "string"
        ? (JSON.parse(value) as DistributedRealtimeEvent)
        : (value as DistributedRealtimeEvent);
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

type DistributedRealtimeEventRow = {
  id: string;
  sourceInstanceId: string;
  eventName: string;
  rooms: string[] | string;
  detail?: Record<string, unknown> | string | null;
  createdAt: string;
};

const ensureRealtimeEventTable = async () => {
  await executeD1Query(
    `
      create table if not exists "${REALTIME_EVENTS_TABLE}" (
        "id" text primary key not null,
        "sourceInstanceId" text not null,
        "eventName" text not null,
        "rooms" text not null,
        "detail" text,
        "createdAt" text not null
      )
    `,
    [],
    "run",
  );

  await executeD1Query(
    `create index if not exists "${REALTIME_EVENTS_TABLE}_createdAt_idx" on "${REALTIME_EVENTS_TABLE}" ("createdAt", "id")`,
    [],
    "run",
  );
};

const scheduleNextPoll = (delayMs = REALTIME_EVENT_POLL_INTERVAL_MS) => {
  if (globalThis.inAccordRealtimePollTimer) {
    clearTimeout(globalThis.inAccordRealtimePollTimer);
  }

  globalThis.inAccordRealtimePollTimer = setTimeout(() => {
    void pollRealtimeEvents();
  }, delayMs);
};

const getRealtimeCursor = () => ({
  createdAt: globalThis.inAccordRealtimeLastSeenCreatedAt ?? new Date().toISOString(),
  id: globalThis.inAccordRealtimeLastSeenId ?? "",
});

const setRealtimeCursor = (createdAt: string, id: string) => {
  globalThis.inAccordRealtimeLastSeenCreatedAt = createdAt;
  globalThis.inAccordRealtimeLastSeenId = id;
};

const cleanupRealtimeEventsIfNeeded = async () => {
  const now = Date.now();
  if ((globalThis.inAccordRealtimeNextCleanupAt ?? 0) > now) {
    return;
  }

  globalThis.inAccordRealtimeNextCleanupAt = now + REALTIME_EVENT_RETENTION_MS;
  const cutoff = new Date(now - REALTIME_EVENT_RETENTION_MS).toISOString();

  await executeD1Query(
    `delete from "${REALTIME_EVENTS_TABLE}" where "createdAt" < ?`,
    [cutoff],
    "run",
  );
};

const pollRealtimeEvents = async () => {
  try {
    await ensureRealtimeEventTable();

    const cursor = getRealtimeCursor();
    const result = await executeD1Query(
      `
        select
          "id" as "id",
          "sourceInstanceId" as "sourceInstanceId",
          "eventName" as "eventName",
          "rooms" as "rooms",
          "detail" as "detail",
          "createdAt" as "createdAt"
        from "${REALTIME_EVENTS_TABLE}"
        where "createdAt" > ?
           or ("createdAt" = ? and "id" > ?)
        order by "createdAt" asc, "id" asc
        limit ${REALTIME_EVENT_BATCH_SIZE}
      `,
      [cursor.createdAt, cursor.createdAt, cursor.id],
      "all",
    );

    const rows = ((result as { rows?: DistributedRealtimeEventRow[] }).rows ?? []).filter(Boolean);

    for (const row of rows) {
      const notification = parseDistributedEvent({
        sourceInstanceId: row.sourceInstanceId,
        eventName: row.eventName,
        rooms: Array.isArray(row.rooms)
          ? row.rooms
          : JSON.parse(String(row.rooms ?? "[]")),
        detail:
          row.detail && typeof row.detail === "string"
            ? JSON.parse(row.detail)
            : row.detail ?? {},
      });

      setRealtimeCursor(String(row.createdAt ?? ""), String(row.id ?? ""));

      if (!notification || notification.sourceInstanceId === getInstanceId()) {
        continue;
      }

      emitDistributedEventLocally(notification);
    }

    await cleanupRealtimeEventsIfNeeded();
    scheduleNextPoll(rows.length >= REALTIME_EVENT_BATCH_SIZE ? 0 : REALTIME_EVENT_POLL_INTERVAL_MS);
  } catch (error) {
    console.error("[REALTIME_EVENT_BRIDGE_ERROR]", error);
    scheduleNextPoll(REALTIME_EVENT_POLL_INTERVAL_MS);
  }
};

export const ensureRealtimeEventBridgeStarted = async () => {
  if (globalThis.inAccordRealtimeBridgePromise) {
    return globalThis.inAccordRealtimeBridgePromise;
  }

  globalThis.inAccordRealtimeBridgePromise = (async () => {
    await ensureRealtimeEventTable();
    if (!globalThis.inAccordRealtimeLastSeenCreatedAt) {
      setRealtimeCursor(new Date().toISOString(), "");
    }
    scheduleNextPoll(0);
  })().catch((error) => {
    globalThis.inAccordRealtimeBridgePromise = undefined;
    if (globalThis.inAccordRealtimePollTimer) {
      clearTimeout(globalThis.inAccordRealtimePollTimer);
      globalThis.inAccordRealtimePollTimer = undefined;
    }
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
    const createdAt = new Date().toISOString();
    const distributedEvent: DistributedRealtimeEvent = {
      sourceInstanceId: getInstanceId(),
      eventName,
      rooms,
      detail: buildEventPayload(detail),
    };

    await ensureRealtimeEventTable();
    await executeD1Query(
      `
        insert into "${REALTIME_EVENTS_TABLE}" (
          "id",
          "sourceInstanceId",
          "eventName",
          "rooms",
          "detail",
          "createdAt"
        ) values (?, ?, ?, ?, ?, ?)
      `,
      [
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${createdAt}-${Math.random().toString(36).slice(2)}`,
        distributedEvent.sourceInstanceId,
        distributedEvent.eventName,
        JSON.stringify(distributedEvent.rooms),
        JSON.stringify(distributedEvent.detail ?? {}),
        createdAt,
      ],
      "run",
    );
  } catch (error) {
    console.error("[REALTIME_EVENT_PUBLISH]", error);
  }

  return true;
};

export const publishRealtimeRefresh = async (
  payload: RealtimeRoomPayload,
  detail?: Record<string, unknown>
) => publishRealtimeEvent("inaccord:refresh", payload, detail);
