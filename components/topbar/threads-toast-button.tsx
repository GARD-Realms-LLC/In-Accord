"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { buildThreadPath } from "@/lib/route-slugs";

type ThreadToastItem = {
  id: string;
  title: string;
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
  archived: boolean;
  unreadCount: number;
  lastActivityAt: string;
};

interface ThreadsToastButtonProps {
  initialThreads?: ThreadToastItem[];
  className?: string;
}

const THREADS_TOAST_ID = "topbar-threads-toast";
const THREADS_CACHE_TTL_MS = 60_000;

let cachedThreadsState: {
  threads: ThreadToastItem[];
  expiresAt: number;
} | null = null;

const ThreadsToastContent = ({
  threads,
  onSelect,
}: {
  threads: ThreadToastItem[];
  onSelect: (thread: ThreadToastItem) => void;
}) => {
  const [query, setQuery] = useState("");

  const filteredThreads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return threads;
    }

    return threads.filter((thread) => {
      const haystack = `${thread.title} ${thread.channelName} ${thread.serverName}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, threads]);

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        serverId: string;
        serverName: string;
        channelId: string;
        channelName: string;
        threads: ThreadToastItem[];
      }
    >();

    for (const thread of filteredThreads) {
      const key = `${thread.serverId}:${thread.channelId}`;
      const existing = map.get(key);
      if (existing) {
        existing.threads.push(thread);
      } else {
        map.set(key, {
          key,
          serverId: thread.serverId,
          serverName: thread.serverName,
          channelId: thread.channelId,
          channelName: thread.channelName,
          threads: [thread],
        });
      }
    }

    return Array.from(map.values());
  }, [filteredThreads]);

  return (
    <div className="pointer-events-auto w-90 max-w-[90vw] rounded-md border border-zinc-300/70 bg-white p-3 text-zinc-900 shadow-md dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
        Threads
      </p>

      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search threads"
        className="mt-2 h-8 w-full rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      />

      <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
        {grouped.length === 0 ? (
          <p className="rounded-md border border-zinc-300/70 bg-zinc-100/70 px-2.5 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400">
            No matching threads.
          </p>
        ) : (
          grouped.map((group) => (
            <div key={group.key} className="rounded-md border border-zinc-300/70 bg-zinc-100/70 p-2 dark:border-zinc-700 dark:bg-zinc-800/40">
              <p className="mb-1 truncate text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                {group.serverName} • #{group.channelName}
              </p>

              <div className="space-y-1">
                {group.threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => onSelect(thread)}
                    className="w-full rounded-md border border-zinc-300/70 bg-white/90 px-2.5 py-2 text-left transition hover:bg-zinc-200/80 dark:border-zinc-700 dark:bg-zinc-900/60 dark:hover:bg-zinc-800"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold">{thread.title}</p>
                      <div className="flex items-center gap-1.5">
                        {thread.unreadCount > 0 ? (
                          <span className="rounded-full border border-amber-400/50 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100">
                            {thread.unreadCount}
                          </span>
                        ) : null}
                        {thread.archived ? (
                          <span className="rounded-full border border-zinc-500/40 bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 dark:text-zinc-300">
                            Archived
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                      Last activity: {thread.lastActivityAt}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const ThreadsToastButton = ({ initialThreads = [], className }: ThreadsToastButtonProps) => {
  const router = useRouter();
  const cachedThreads =
    cachedThreadsState && cachedThreadsState.expiresAt > Date.now()
      ? cachedThreadsState.threads
      : null;

  const [threads, setThreads] = useState<ThreadToastItem[]>(cachedThreads ?? initialThreads);
  const [hasLoaded, setHasLoaded] = useState((cachedThreads?.length ?? initialThreads.length) > 0);
  const [isLoading, setIsLoading] = useState(false);
  const unreadTotal = threads.reduce((total, thread) => total + Number(thread.unreadCount ?? 0), 0);
  const unreadBadge = unreadTotal > 99 ? "99+" : String(unreadTotal);

  const fetchThreads = async ({ silent }: { silent: boolean }) => {
    if (cachedThreadsState && cachedThreadsState.expiresAt > Date.now()) {
      setThreads(cachedThreadsState.threads);
      setHasLoaded(true);
      return cachedThreadsState.threads;
    }

    const loadingToastId = silent ? null : toast.loading("Loading threads...");

    const response = await fetch("/api/threads/topbar", {
      method: "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (loadingToastId) {
        toast.dismiss(loadingToastId);
      }

      throw new Error(`Failed to load threads (${response.status})`);
    }

    const payload = (await response.json()) as { threads?: ThreadToastItem[] };
    const nextThreads = payload.threads ?? [];

    cachedThreadsState = {
      threads: nextThreads,
      expiresAt: Date.now() + THREADS_CACHE_TTL_MS,
    };

    setThreads(nextThreads);
    setHasLoaded(true);

    if (loadingToastId) {
      toast.dismiss(loadingToastId);
    }

    return nextThreads;
  };

  useEffect(() => {
    if (cachedThreadsState && cachedThreadsState.expiresAt > Date.now()) {
      return;
    }

    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const prefetch = () => {
      if (cancelled) {
        return;
      }

      void fetchThreads({ silent: true }).catch(() => {
        // ignore idle prefetch failures
      });
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = (window as Window & {
        requestIdleCallback: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      }).requestIdleCallback(
        () => {
          prefetch();
        },
        { timeout: 2500 }
      );
    } else {
      timeoutId = setTimeout(prefetch, 1200);
    }

    return () => {
      cancelled = true;

      if (typeof window !== "undefined" && "cancelIdleCallback" in window && idleId !== null) {
        (window as Window & { cancelIdleCallback: (handle: number) => void }).cancelIdleCallback(idleId);
      }

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const openThreadsToast = (nextThreads: ThreadToastItem[]) => {
    if (!nextThreads.length) {
      toast.message("No threads yet", {
        description: "Start a thread from any channel message.",
      });
      return;
    }

    toast.custom(
      () => (
        <ThreadsToastContent
          threads={nextThreads}
          onSelect={(thread) => {
            toast.dismiss(THREADS_TOAST_ID);
            router.push(
              buildThreadPath({
                server: { id: thread.serverId, name: thread.serverName },
                channel: { id: thread.channelId, name: thread.channelName },
                threadId: thread.id,
              })
            );
          }}
        />
      ),
      {
        id: THREADS_TOAST_ID,
        duration: 20000,
      }
    );
  };

  const onOpenThreadsToast = () => {
    if (isLoading) {
      return;
    }

    if (hasLoaded) {
      openThreadsToast(threads);
      return;
    }

    setIsLoading(true);
    void fetchThreads({ silent: false })
      .then((nextThreads) => {
        openThreadsToast(nextThreads);
      })
      .catch((error) => {
        console.error("[THREADS_TOAST_LOAD]", error);
        toast.error("Unable to load threads right now.");
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  return (
    <button
      type="button"
      title="Threads"
      onClick={onOpenThreadsToast}
      className={className ?? "inline-flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-[#3f4248] hover:text-white"}
    >
      <span className="relative inline-flex items-center justify-center">
        <MessagesSquare className="h-4 w-4" suppressHydrationWarning />
        {unreadTotal > 0 ? (
          <span className="absolute -right-2.5 -top-2 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-none text-white">
            {unreadBadge}
          </span>
        ) : null}
      </span>
    </button>
  );
};
