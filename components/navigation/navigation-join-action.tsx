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
          onClick={() => onOpen("invite")}
          className="group flex items-center justify-center rounded-full p-0 m-0 leading-none align-middle border-0 bg-transparent shadow-none ring-0 outline-none"
          style={{ boxShadow: "none", filter: "none", WebkitAppearance: "none", appearance: "none", border: "0", background: "transparent" }}
        >
          <div
            className="flex h-[48px] w-[48px] rounded-full
            transition-all overflow-hidden items-center justify-center shadow-none ring-0 border-0"
            style={{ backgroundColor: "#3b82f6", boxShadow: "none", filter: "none" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#2563eb";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#3b82f6";
            }}
          >
            <Link2 className="transition text-white" size={22} />
          </div>
        </button>
      </ActionTooltip>
    </div>
  );
};
