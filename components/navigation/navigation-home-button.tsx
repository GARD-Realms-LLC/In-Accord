"use client";

import Link from "next/link";

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
    <Link
      href="/users"
      className="group relative flex w-full items-center justify-center"
      title="In-Accord Home"
      aria-label={`In-Accord Home (${connectionQuality})`}
    >
      <div className="absolute left-0 bg-primary rounded-r-full transition-all w-[4px] h-[8px] group-hover:h-[20px]" />
      <div
        className={`relative mx-3 h-[56px] w-[56px] rounded-full transition-all ring-4 ${ringColorClass} group-hover:scale-[1.03]`}
      >
        <div className="h-full w-full overflow-hidden rounded-full bg-[#5865F2]">
          <img
            src="/in-accord-steampunk-logo.png"
            alt="In-Accord"
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    </Link>
  );
};