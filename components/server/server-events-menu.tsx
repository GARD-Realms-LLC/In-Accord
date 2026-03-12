"use client";

import { useState } from "react";
import { BookOpen, CalendarDays, Gem, Link2, ScrollText, Users, Video } from "lucide-react";
import { type Channel } from "@/lib/db/types";

import { useModal } from "@/hooks/use-modal-store";
import type { ServerWithMembersWithProfiles } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  server: ServerWithMembersWithProfiles;
  eventsCount: number;
  invitesCount?: number;
  boostersCount?: number;
  stageJoinedCount?: number;
  stageChannel?: Channel | null;
  rulesChannel?: Channel | null;
};

export const ServerEventsMenu = ({
  server,
  eventsCount,
  invitesCount = 0,
  boostersCount = 0,
  stageJoinedCount = 0,
  stageChannel = null,
  rulesChannel = null,
}: Props) => {
  const { onOpen, isOpen, type, data } = useModal();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isActive = isOpen && type === "serverEvents" && String(data.server?.id ?? "") === server.id;
  const isGuideActive = isOpen && type === "aergerGuide" && String(data.server?.id ?? "") === server.id;
  const isInvitesActive = isOpen && type === "invite" && String(data.server?.id ?? "") === server.id;
  const isMembersActive = isOpen && type === "members" && String(data.server?.id ?? "") === server.id;
  const isBoostersActive = isOpen && type === "boosters" && String(data.server?.id ?? "") === server.id;
  const isStageActive = isOpen && type === "serverStage" && String(data.server?.id ?? "") === server.id;
  const isRulesActive = isOpen && type === "serverRules" && String(data.server?.id ?? "") === server.id;
  const membersCount = Array.isArray(server.members) ? server.members.length : 0;
  const normalizedServerName = String(server.name ?? "").trim();
  const guideLabel = normalizedServerName ? `${normalizedServerName} Guide` : "Guide";
  const eventsLabel = normalizedServerName ? `${normalizedServerName} Events` : "Events";
  const invitesLabel = normalizedServerName ? `${normalizedServerName} Invites` : "Invites";
  const membersLabel = normalizedServerName ? `${normalizedServerName} Members` : "Members";
  const boostersLabel = normalizedServerName ? `${normalizedServerName} Boosters` : "Boosters";
  const rulesLabel = normalizedServerName ? `${normalizedServerName} Rules` : "Rules";
  const stageLabel = normalizedServerName ? `${normalizedServerName} Stage` : "Stage";

  return (
    <div className="mt-3">
      <div className="space-y-0.5 rounded-xl border border-black/20 bg-black/10 p-1.5 dark:border-white/10 dark:bg-black/20">
      <div className="mb-1 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setIsCollapsed((previous) => !previous)}
          className="inline-flex h-4.5 w-4.5 items-center justify-center rounded border border-zinc-600/70 text-[10px] font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white"
          aria-label={isCollapsed ? "Expand server quick links" : "Collapse server quick links"}
        >
          -
        </button>
      </div>
      <button
        type="button"
        onClick={() => onOpen("serverRules", { server, channel: rulesChannel ?? undefined })}
        className={cn(
          "group flex w-full items-center gap-x-2 rounded px-2 py-1.5 text-left transition hover:bg-[#3a3c43]",
          isRulesActive && "bg-[#404249]"
        )}
        aria-label={`Open ${rulesLabel} popup`}
      >
        <ScrollText className="h-3 w-3 shrink-0 text-[#949ba4]" />
        <span
          className={cn(
            "line-clamp-1 min-w-0 flex-1 text-left text-[12px] font-medium text-[#949ba4] transition group-hover:text-[#dbdee1]",
            isRulesActive && "text-[#f2f3f5]"
          )}
        >
          {rulesLabel}
        </span>
      </button>

      {!isCollapsed ? (
        <>
      <button
        type="button"
        onClick={() => onOpen("aergerGuide", { server })}
        className={cn(
          "group flex w-full items-center gap-x-2 rounded px-2 py-1.5 text-left transition hover:bg-[#3a3c43]",
          isGuideActive && "bg-[#404249]"
        )}
        aria-label={`Open ${guideLabel}`}
      >
        <BookOpen className="h-3 w-3 shrink-0 text-[#949ba4]" />
        <span
          className={cn(
            "line-clamp-1 min-w-0 flex-1 text-left text-[12px] font-medium text-[#949ba4] transition group-hover:text-[#dbdee1]",
            isGuideActive && "text-[#f2f3f5]"
          )}
        >
          {guideLabel}
        </span>
      </button>

      <button
        type="button"
        onClick={() => onOpen("serverEvents", { server })}
        className={cn(
          "group flex w-full items-center gap-x-2 rounded px-2 py-1.5 text-left transition hover:bg-[#3a3c43]",
          isActive && "bg-[#404249]"
        )}
        aria-label={`Open ${eventsLabel}`}
      >
        <CalendarDays className="h-3 w-3 shrink-0 text-[#949ba4]" />
        <span
          className={cn(
            "line-clamp-1 min-w-0 flex-1 text-left text-[12px] font-medium text-[#949ba4] transition group-hover:text-[#dbdee1]",
            isActive && "text-[#f2f3f5]"
          )}
        >
          {eventsLabel}
        </span>
        <span className="ml-auto rounded-full border border-indigo-500/45 bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-indigo-100">
          {eventsCount}
        </span>
      </button>

      <button
        type="button"
        onClick={() => onOpen("members", { server })}
        className={cn(
          "group flex w-full items-center gap-x-2 rounded px-2 py-1.5 text-left transition hover:bg-[#3a3c43]",
          isMembersActive && "bg-[#404249]"
        )}
        aria-label={`Open ${membersLabel}`}
      >
        <Users className="h-3 w-3 shrink-0 text-[#949ba4]" />
        <span
          className={cn(
            "line-clamp-1 min-w-0 flex-1 text-left text-[12px] font-medium text-[#949ba4] transition group-hover:text-[#dbdee1]",
            isMembersActive && "text-[#f2f3f5]"
          )}
        >
          {membersLabel}
        </span>
        <span className="ml-auto rounded-full border border-indigo-500/45 bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-indigo-100">
          {membersCount}
        </span>
      </button>

      <button
        type="button"
        onClick={() => onOpen("boosters", { server, boosterCount: boostersCount })}
        className={cn(
          "group flex w-full items-center gap-x-2 rounded px-2 py-1.5 text-left transition hover:bg-[#3a3c43]",
          isBoostersActive && "bg-[#404249]"
        )}
        aria-label={`Open ${boostersLabel}`}
      >
        <Gem className="h-3 w-3 shrink-0 text-[#949ba4]" />
        <span
          className={cn(
            "line-clamp-1 min-w-0 flex-1 text-left text-[12px] font-medium text-[#949ba4] transition group-hover:text-[#dbdee1]",
            isBoostersActive && "text-[#f2f3f5]"
          )}
        >
          {boostersLabel}
        </span>
        <span className="ml-auto rounded-full border border-indigo-500/45 bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-indigo-100">
          {boostersCount}
        </span>
      </button>

      <button
        type="button"
        onClick={() => onOpen("invite", { server })}
        className={cn(
          "group flex w-full items-center gap-x-2 rounded px-2 py-1.5 text-left transition hover:bg-[#3a3c43]",
          isInvitesActive && "bg-[#404249]"
        )}
        aria-label={`Open ${invitesLabel}`}
      >
        <Link2 className="h-3 w-3 shrink-0 text-[#949ba4]" />
        <span
          className={cn(
            "line-clamp-1 min-w-0 flex-1 text-left text-[12px] font-medium text-[#949ba4] transition group-hover:text-[#dbdee1]",
            isInvitesActive && "text-[#f2f3f5]"
          )}
        >
          {invitesLabel}
        </span>
        <span className="ml-auto rounded-full border border-indigo-500/45 bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-indigo-100">
          {invitesCount}
        </span>
      </button>

      <button
        type="button"
        onClick={() => onOpen("serverStage", { server, channel: stageChannel ?? undefined })}
        className={cn(
          "group flex w-full items-center gap-x-2 rounded px-2 py-1.5 text-left transition hover:bg-[#3a3c43]",
          isStageActive && "bg-[#404249]"
        )}
        aria-label={`Open ${stageLabel} popup`}
      >
        <Video className="h-3 w-3 shrink-0 text-[#949ba4]" />
        <span
          className={cn(
            "line-clamp-1 min-w-0 flex-1 text-left text-[12px] font-medium text-[#949ba4] transition group-hover:text-[#dbdee1]",
            isStageActive && "text-[#f2f3f5]"
          )}
        >
          {stageLabel}
        </span>
        <span className="ml-auto rounded-full border border-indigo-500/45 bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-indigo-100">
          {stageJoinedCount}
        </span>
      </button>
        </>
      ) : null}

      </div>
    </div>
  );
};
