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
      className="pointer-events-none relative flex w-full select-none flex-col items-center justify-center cursor-default"
      aria-label={`In-Accord (${connectionQuality})`}
      role="img"
    >
      <div
        className={`relative mx-3 w-28 overflow-hidden rounded-[10px] bg-[#1b2230] ring-2 -translate-y-px shadow-[0_1px_0_rgba(255,255,255,0.22)_inset,0_2px_0_rgba(0,0,0,0.45),0_6px_14px_rgba(0,0,0,0.5),0_14px_24px_rgba(0,0,0,0.32)] ${ringColorClass}`}
      >
        <div className="w-full overflow-hidden rounded-[10px] bg-[#1b2230]">
          <img
            src="/in-accord-steampunk-logo.png"
            alt="In-Accord"
            className="block h-auto w-full object-contain"
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-linear-to-b from-white/20 to-transparent" />
        </div>
      </div>
    </div>
  );
};