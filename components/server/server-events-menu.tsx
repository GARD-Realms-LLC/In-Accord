"use client";

import { CalendarDays } from "lucide-react";

import { useModal } from "@/hooks/use-modal-store";
import { type Server } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type Props = {
  server: Server;
  eventsCount: number;
};

export const ServerEventsMenu = ({ server, eventsCount }: Props) => {
  const { onOpen, isOpen, type, data } = useModal();
  const isActive = isOpen && type === "serverEvents" && String(data.server?.id ?? "") === server.id;

  return (
    <button
      type="button"
      onClick={() => onOpen("serverEvents", { server })}
      className={cn(
        "group mb-0.5 mt-1 flex w-full items-center gap-x-2 rounded px-2 py-1.5 text-left transition hover:bg-[#3a3c43]",
        isActive && "bg-[#404249]"
      )}
      aria-label="Open server events"
    >
      <CalendarDays className="h-4 w-4 shrink-0 text-[#949ba4]" />
      <span className="rounded-full border border-indigo-500/45 bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-indigo-100">
        {eventsCount}
      </span>
      <span
        className={cn(
          "line-clamp-1 min-w-0 flex-1 text-left text-[15px] font-medium text-[#949ba4] transition group-hover:text-[#dbdee1]",
          isActive && "text-[#f2f3f5]"
        )}
      >
        Events
      </span>
    </button>
  );
};
