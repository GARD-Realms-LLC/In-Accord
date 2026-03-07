"use client";

import { useSocket } from "@/components/providers/socket-provider";

export const NavigationHomeButton = () => {
  const { connectionQuality } = useSocket();

  const ringColorClass =
    connectionQuality === "disconnected"
      ? "ring-red-600 dark:ring-red-400"
      : connectionQuality === "slow"
        ? "ring-yellow-500 dark:ring-yellow-400"
        : "ring-green-600 dark:ring-green-400";

  return (
    <div
      className="pointer-events-none relative flex w-full select-none items-center justify-center cursor-default"
      aria-label={`In-Accord (${connectionQuality})`}
      role="img"
    >
      <div
        className={`relative mx-3 h-[56px] w-[56px] rounded-full ring-4 ${ringColorClass}`}
      >
        <div className="h-full w-full overflow-hidden rounded-full bg-[#5865F2]">
          <img
            src="/in-accord-steampunk-logo.png"
            alt="In-Accord"
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    </div>
  );
};