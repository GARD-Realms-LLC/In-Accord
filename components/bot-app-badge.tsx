"use client";

import { cn } from "@/lib/utils";

interface BotAppBadgeProps {
  className?: string;
}

export const BotAppBadge = ({ className }: BotAppBadgeProps) => {
  return (
    <span
      className={cn(
        "inline-flex h-4 items-center rounded-sm border border-cyan-200/60 bg-gradient-to-br from-cyan-300 via-sky-500 to-indigo-600 px-1 text-[9px] font-black uppercase leading-none tracking-[0.08em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_2px_0_rgba(9,48,90,0.9),0_0_10px_rgba(34,211,238,0.65),0_0_20px_rgba(59,130,246,0.4)]",
        className
      )}
      aria-label="Bot app"
      title="Bot App"
    >
      APP
    </span>
  );
};
