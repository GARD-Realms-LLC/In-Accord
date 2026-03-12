"use client";

import { Plus } from "lucide-react";

import { useModal } from "@/hooks/use-modal-store";
import { ActionTooltip } from "@/components/action-tooltip";

export const NavigationAction = () => {
  const { onOpen } = useModal();

  return (
    <div className="w-full flex justify-center">
      <ActionTooltip side="right" align="center" label="Add a server">
      <button
        onClick={() => onOpen("createServer")}
        className="group flex flex-col items-center gap-1 rounded-md border-0 bg-transparent shadow-none ring-0 outline-none"
        style={{ boxShadow: "none", filter: "none", WebkitAppearance: "none", appearance: "none" }}
        suppressHydrationWarning
      >
        <div
          className="relative mx-3 flex h-10 w-20 items-center justify-center overflow-hidden rounded-[10px] border border-zinc-500/20 bg-background transition-all group-hover:rounded-[8px] group-hover:border-primary/50 group-hover:bg-emerald-500 group-hover:ring-2 group-hover:ring-primary/25 dark:bg-neutral-700"
          style={{ boxShadow: "none", filter: "none" }}
          suppressHydrationWarning
        >
          <Plus
            className="absolute top-1.5 text-emerald-500 transition group-hover:text-white"
            size={23}
            suppressHydrationWarning
          />

          <div className="absolute inset-x-0 bottom-0 flex h-[5%] min-h-3.5 items-center justify-center border-t border-zinc-500/20 bg-zinc-900/40 px-1 backdrop-blur-[1px]">
            <span className="truncate text-[9px] font-semibold uppercase tracking-[0.05em] text-zinc-100">
              New Server
            </span>
          </div>
        </div>
      </button>
      </ActionTooltip>
    </div>
  );
};
