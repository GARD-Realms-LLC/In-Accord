"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";

import { useModal } from "@/hooks/use-modal-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type EventItem = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  frequency?: string;
  bannerUrl?: string | null;
  channelKind?: string | null;
  channelId?: string | null;
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const ServerEventsModal = () => {
  const { isOpen, onClose, type, data } = useModal();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isModalOpen = isOpen && type === "serverEvents";
  const serverId = String(data.server?.id ?? "").trim();
  const serverName = String(data.server?.name ?? "").trim();

  useEffect(() => {
    if (!isModalOpen || !serverId) {
      return;
    }

    let cancelled = false;

    const loadEvents = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await axios.get<{ events?: EventItem[] }>(
          `/api/servers/${encodeURIComponent(serverId)}/scheduled-events`,
          { headers: { "Cache-Control": "no-store" } }
        );

        if (cancelled) {
          return;
        }

        const items = Array.isArray(response.data.events) ? response.data.events : [];
        setEvents(items);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        if (axios.isAxiosError(loadError)) {
          const message =
            (typeof loadError.response?.data === "string" ? loadError.response.data : "") ||
            (loadError.response?.data as { error?: string } | undefined)?.error ||
            loadError.message ||
            "Failed to load events.";
          setError(message);
        } else {
          setError("Failed to load events.");
        }
        setEvents([]);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadEvents();

    return () => {
      cancelled = true;
    };
  }, [isModalOpen, serverId]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const sorted = [...events].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

    const upcomingItems: EventItem[] = [];
    const pastItems: EventItem[] = [];

    for (const item of sorted) {
      if (new Date(item.startsAt).getTime() >= now) {
        upcomingItems.push(item);
      } else {
        pastItems.push(item);
      }
    }

    return { upcoming: upcomingItems, past: pastItems.reverse() };
  }, [events]);

  return (
    <Dialog open={isModalOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[86vh] overflow-hidden border-0 bg-[#313338] p-0 text-white shadow-2xl sm:max-w-[640px] [&>button]:hidden">
        <DialogHeader className="border-b border-black/20 px-6 pb-4 pt-5 text-left">
          <DialogTitle className="text-xl font-semibold text-white">Events</DialogTitle>
          <DialogDescription className="text-sm text-zinc-300">
            {serverName ? `${serverName} • ${events.length} total` : `${events.length} total events`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5">
          {isLoading ? <p className="text-sm text-zinc-300">Loading events...</p> : null}
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}

          {!isLoading && !error ? (
            <>
              <section>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">
                  New / Upcoming ({upcoming.length})
                </p>
                <div className="space-y-2">
                  {upcoming.length === 0 ? (
                    <p className="rounded-md border border-zinc-700 bg-[#1e1f22] px-3 py-2 text-sm text-zinc-400">
                      No upcoming events.
                    </p>
                  ) : (
                    upcoming.map((event) => (
                      <div key={event.id} className="rounded-md border border-zinc-700 bg-[#1e1f22] p-3">
                        <p className="text-sm font-semibold text-zinc-100">{event.title}</p>
                        <p className="text-xs text-zinc-400">{formatDateTime(event.startsAt)}</p>
                        {event.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-zinc-300">{event.description}</p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">
                  Old / Past ({past.length})
                </p>
                <div className="space-y-2">
                  {past.length === 0 ? (
                    <p className="rounded-md border border-zinc-700 bg-[#1e1f22] px-3 py-2 text-sm text-zinc-400">
                      No past events.
                    </p>
                  ) : (
                    past.map((event) => (
                      <div key={event.id} className="rounded-md border border-zinc-700 bg-[#1e1f22] p-3">
                        <p className="text-sm font-semibold text-zinc-100">{event.title}</p>
                        <p className="text-xs text-zinc-400">{formatDateTime(event.startsAt)}</p>
                        {event.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-zinc-300">{event.description}</p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};
