"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ThreadToolbarProps {
  serverId: string;
  channelId: string;
  threadId: string;
  archived: boolean;
  participantCount: number;
  autoArchiveMinutes: number;
  unreadCount?: number;
}

const AUTO_ARCHIVE_LABELS: Record<number, string> = {
  60: "1h",
  1440: "24h",
  4320: "3d",
  10080: "7d",
};

export const ThreadToolbar = ({
  serverId,
  channelId,
  threadId,
  archived,
  participantCount,
  autoArchiveMinutes,
  unreadCount = 0,
}: ThreadToolbarProps) => {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const onToggleArchive = async () => {
    if (isPending) {
      return;
    }

    try {
      setIsPending(true);
      await axios.patch(`/api/channels/${channelId}/threads/${threadId}`, {
        serverId,
        archived: !archived,
      });

      router.refresh();
    } catch (error) {
      console.error("[THREAD_TOOLBAR_TOGGLE_ARCHIVE]", error);
      window.alert("Unable to update thread archive state right now.");
    } finally {
      setIsPending(false);
    }
  };

  const onCycleAutoArchive = async () => {
    if (isPending) {
      return;
    }

    const sequence = [60, 1440, 4320, 10080];
    const currentIndex = Math.max(0, sequence.indexOf(autoArchiveMinutes));
    const next = sequence[(currentIndex + 1) % sequence.length];

    try {
      setIsPending(true);
      await axios.patch(`/api/channels/${channelId}/threads/${threadId}`, {
        serverId,
        autoArchiveMinutes: next,
      });

      router.refresh();
    } catch (error) {
      console.error("[THREAD_TOOLBAR_AUTO_ARCHIVE]", error);
      window.alert("Unable to update auto-archive right now.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="mx-3 mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100/90">
      <span className="rounded-full bg-indigo-500/25 px-2 py-1 font-semibold">
        Participants: {participantCount}
      </span>

      <button
        type="button"
        onClick={() => {
          void onCycleAutoArchive();
        }}
        disabled={isPending}
        className="rounded-full border border-indigo-400/40 bg-indigo-500/15 px-2 py-1 font-semibold transition hover:bg-indigo-500/25 disabled:opacity-70"
        title="Cycle auto archive timer"
      >
        Auto-archive: {AUTO_ARCHIVE_LABELS[autoArchiveMinutes] ?? `${autoArchiveMinutes}m`}
      </button>

      <button
        type="button"
        onClick={() => {
          void onToggleArchive();
        }}
        disabled={isPending}
        className="inline-flex items-center gap-1 rounded-full border border-indigo-400/40 bg-indigo-500/15 px-2 py-1 font-semibold transition hover:bg-indigo-500/25 disabled:opacity-70"
        title={archived ? "Unarchive thread" : "Archive thread"}
      >
        {archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
        {archived ? "Unarchive" : "Archive"}
      </button>

      {unreadCount > 0 ? (
        <span className="rounded-full border border-amber-400/50 bg-amber-500/20 px-2 py-1 font-semibold text-amber-100">
          {unreadCount} unread
        </span>
      ) : null}
    </div>
  );
};
