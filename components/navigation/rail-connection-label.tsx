"use client";

import { useSocket } from "@/components/providers/socket-provider";

export const RailConnectionLabel = () => {
  const { connectionQuality } = useSocket();

  const qualityColorClass =
    connectionQuality === "disconnected"
      ? "text-red-600 dark:text-red-400"
      : connectionQuality === "slow"
        ? "text-yellow-600 dark:text-yellow-400"
        : "text-green-600 dark:text-green-400";

  return (
    <div
      className={`text-center text-[10px] font-semibold uppercase tracking-[0.08em] ${qualityColorClass}`}
      title={
        connectionQuality === "disconnected"
          ? "Realtime disconnected"
          : connectionQuality === "slow"
            ? "Realtime connected (slow network)"
            : "Realtime connected"
      }
      aria-label={`Realtime status: ${connectionQuality}`}
    >
      In-Accord
    </div>
  );
};