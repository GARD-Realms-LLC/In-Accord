"use client";

import Link from "next/link";
import { Megaphone } from "lucide-react";

export const NavigationInAboardButton = () => {
  return (
    <Link
      href="/in-aboard"
      className="group flex w-full items-center justify-center"
      title="In-Aboard"
      aria-label="Open In-Aboard"
    >
      <div className="relative mx-3 flex h-10 w-20 items-center justify-center overflow-hidden rounded-[10px] border border-zinc-500/20 bg-[#5865f2] transition-all group-hover:rounded-[8px] group-hover:border-primary/50 group-hover:ring-2 group-hover:ring-primary/25">
        <Megaphone className="absolute top-1.5 h-5 w-5 text-white" aria-hidden="true" suppressHydrationWarning />
        <div className="absolute inset-x-0 bottom-0 flex h-[5%] min-h-3.5 items-center justify-center border-t border-zinc-500/20 bg-zinc-900/40 px-1 backdrop-blur-[1px]">
          <span className="truncate text-[9px] font-semibold uppercase tracking-[0.05em] text-zinc-100">
            In-Aboard
          </span>
        </div>
      </div>
    </Link>
  );
};
