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
        className="group flex items-center shadow-none ring-0 outline-none border-0 bg-transparent"
        style={{ boxShadow: "none", filter: "none", WebkitAppearance: "none", appearance: "none" }}
      >
        <div
          className="flex mx-3 h-[48px] w-[48px] rounded-[24px] 
        group-hover:rounded-[16px] transition-all overflow-hidden shadow-none ring-0 border-0 
        items-center justify-center bg-background dark:bg-neutral-700 
        group-hover:bg-emerald-500"
          style={{ boxShadow: "none", filter: "none" }}
        >
          <Plus
            className="group-hover:text-white transition text-emerald-500"
            size={25}
          />
        </div>
      </button>
      </ActionTooltip>
    </div>
  );
};
