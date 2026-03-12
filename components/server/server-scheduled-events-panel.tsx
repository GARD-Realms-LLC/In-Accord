"use client";

import { CalendarDays, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ScheduledEventItem = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
};

type Props = {
  serverId: string;
  canManage: boolean;
};

const formatStart = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const ServerScheduledEventsPanel = ({ serverId, canManage }: Props) => {
  const [events, setEvents] = useState<ScheduledEventItem[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const loadEvents = async () => {
    try {
      const response = await fetch(`/api/servers/${encodeURIComponent(serverId)}/scheduled-events`, {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { events?: ScheduledEventItem[] };
      setEvents(Array.isArray(payload.events) ? payload.events : []);
    } catch {
      // keep existing list on network errors
    }
  };

  useEffect(() => {
    void loadEvents();

    const timer = window.setInterval(() => {
      void loadEvents();
    }, 15000);

    const onEventCreated = (event: Event) => {
      const customEvent = event as CustomEvent<{ serverId?: string }>;
      const createdServerId = String(customEvent.detail?.serverId ?? "").trim();

      if (!createdServerId || createdServerId !== serverId) {
        return;
      }

      setStatus("Event created.");
      void loadEvents();
    };

    window.addEventListener("inaccord:event-created", onEventCreated as EventListener);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("inaccord:event-created", onEventCreated as EventListener);
    };
  }, [serverId]);

  const upcoming = useMemo(
    () => [...events].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [events]
  );

  const onDelete = async (eventId: string) => {
    if (!canManage) {
      return;
    }

    try {
      const response = await fetch(
        `/api/servers/${encodeURIComponent(serverId)}/scheduled-events/${encodeURIComponent(eventId)}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const errorMessage = await response.text();
        throw new Error(errorMessage || "Failed to delete event.");
      }

      setStatus("Event removed.");
      await loadEvents();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to delete event.");
    }
  };

  return (
    <div className="mt-3 rounded-md border border-white/10 bg-[#2b2d31] p-2">
      <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
        <CalendarDays className="h-3.5 w-3.5" />
        Events
      </div>

      <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
        {upcoming.length === 0 ? (
          <p className="rounded bg-[#232428] px-2 py-2 text-xs text-[#949ba4]">No events yet.</p>
        ) : (
          upcoming.map((eventItem) => (
            <div key={eventItem.id} className="rounded border border-white/10 bg-[#232428] px-2 py-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[#dbdee1]">{eventItem.title}</p>
                  <p className="text-[11px] text-[#949ba4]">{formatStart(eventItem.startsAt)}</p>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => void onDelete(eventItem.id)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-[#949ba4] transition hover:bg-[#3a3d44] hover:text-rose-300"
                    title="Delete event"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              {eventItem.description ? (
                <p className="mt-1 line-clamp-2 text-[11px] text-[#b5bac1]">{eventItem.description}</p>
              ) : null}
            </div>
          ))
        )}
      </div>

      {status ? <p className="mt-2 text-[11px] text-[#b5bac1]">{status}</p> : null}
      {canManage ? (
        <p className="mt-2 text-[11px] text-[#949ba4]">Use the server menu → Create Event to add new events.</p>
      ) : null}
    </div>
  );
};
