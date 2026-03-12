"use client";

import { Link2 } from "lucide-react";

import { useModal } from "@/hooks/use-modal-store";
import { ActionTooltip } from "@/components/action-tooltip";

export const NavigationJoinAction = () => {
  const { onOpen } = useModal();

  return (
    <div className="w-full flex justify-center">
      <ActionTooltip side="right" align="center" label="Join a server">
        <button
          onClick={() => onOpen("joinServer")}
          className="group flex flex-col items-center gap-1 rounded-md border-0 bg-transparent p-0 m-0 leading-none align-middle shadow-none ring-0 outline-none"
          style={{ boxShadow: "none", filter: "none", WebkitAppearance: "none", appearance: "none", border: "0", background: "transparent" }}
          suppressHydrationWarning
        >
          <div
            className="relative mx-3 flex h-10 w-20 items-center justify-center overflow-hidden rounded-[10px] border border-zinc-500/20 transition-all group-hover:rounded-[8px] group-hover:border-primary/50 group-hover:ring-2 group-hover:ring-primary/25"
            style={{ backgroundColor: "#3b82f6", boxShadow: "none", filter: "none" }}
            suppressHydrationWarning
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#2563eb";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#3b82f6";
            }}
          >
            <Link2 className="absolute top-1.5 text-white transition" size={22} suppressHydrationWarning />

            <div className="absolute inset-x-0 bottom-0 flex h-[5%] min-h-3.5 items-center justify-center border-t border-zinc-500/20 bg-zinc-900/40 px-1 backdrop-blur-[1px]">
              <span className="truncate text-[9px] font-semibold uppercase tracking-[0.05em] text-zinc-100">
                Find Server
              </span>
            </div>
          </div>
        </button>
      </ActionTooltip>
    </div>
  );
};
