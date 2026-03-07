"use client";

import {
  ChevronDown,
  Flag,
  LogOut,
  PlusCircle,
  Settings,
  Star,
  Trash,
  UserPlus,
  Users,
} from "lucide-react";
import axios from "axios";

import { ServerWithMembersWithProfiles } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useModal } from "@/hooks/use-modal-store";
import { MemberRole } from "@/lib/db/types";
interface ServerHeaderProps {
  server: ServerWithMembersWithProfiles & {
    bannerUrl?: string | null;
    bannerFit?: "cover" | "contain" | "scale" | null;
    bannerScale?: number | null;
  };
  role?: MemberRole;
  isServerOwner?: boolean;
}

export const ServerHeader = ({ server, role, isServerOwner = false }: ServerHeaderProps) => {
  const { onOpen } = useModal();
  const normalizedBannerUrl =
    typeof server.bannerUrl === "string" && server.bannerUrl.trim()
      ? server.bannerUrl.trim()
      : "";
  const bannerFit =
    server.bannerFit === "contain" || server.bannerFit === "scale"
      ? server.bannerFit
      : "cover";
  const bannerScale =
    typeof server.bannerScale === "number" && !Number.isNaN(server.bannerScale)
      ? Math.min(2, Math.max(1, server.bannerScale))
      : 1;

  const isAdmin = isServerOwner || role === MemberRole.ADMIN;
  const isModerator = isAdmin || role === MemberRole.MODERATOR;

  const onReportServer = async () => {
    try {
      await axios.post("/api/reports", {
        targetType: "SERVER",
        targetId: server.id,
        reason: "Reported from server header menu",
      });
      window.alert("Server report submitted.");
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error ?? "Failed to submit report."
        : "Failed to submit report.";
      window.alert(message);
    }
  };

  return (
    <div className="relative h-20.5 border-b-2 border-neutral-200 dark:border-neutral-800 overflow-hidden">
      {normalizedBannerUrl ? (
        <>
          <img
            src={normalizedBannerUrl}
            alt={`${server.name} banner`}
            className={`absolute inset-0 h-full w-full ${
              bannerFit === "contain" ? "object-contain" : "object-cover"
            }`}
            style={
              bannerFit === "scale"
                ? { transform: `scale(${bannerScale})`, transformOrigin: "center" }
                : undefined
            }
          />
          <div className="absolute inset-0 bg-black/15" />
        </>
      ) : (
        <div className="absolute inset-0 bg-[#1f2023]" />
      )}

      <div className="absolute left-0 right-0 top-0 z-10 flex h-11 items-center justify-between bg-transparent px-2 text-white">

        <div className="relative z-10 flex w-8 items-center justify-center">
          <Star className="h-4 w-4 text-zinc-100" />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="focus:outline-none" asChild>
            <button
              className="absolute left-1/2 top-1/2 z-10 flex w-[84%] max-w-55 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-2 rounded-md bg-black/20 px-3 py-1 text-sm font-semibold hover:bg-black/35 transition"
            >
              <span className="truncate">{server.name}</span>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56 text-xs font-medium text-black 
          dark:text-neutral-400 space-y-0.5"
          >
            {isModerator && (
              <DropdownMenuItem
                onClick={() => onOpen("invite", { server })}
                className="text-indigo-600 dark:text-indigo-400 
                px-3 py-2 text-sm cursor-pointer"
              >
                Invite People
                <UserPlus className="h-4 w-4 ml-auto" />
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => onOpen("editServer", { server })}
              className="px-3 py-2 text-sm cursor-pointer"
            >
              Server Settings
              <Settings className="h-4 w-4 ml-auto" />
            </DropdownMenuItem>
            {isModerator && (
              <>
              <DropdownMenuItem
                onClick={() => onOpen("createChannel", { server })}
                className="px-3 py-2 text-sm cursor-pointer"
              >
                Create Channel
                <PlusCircle className="h-4 w-4 ml-auto" />
              </DropdownMenuItem>
              </>
            )}
            {isAdmin && (
              <DropdownMenuItem
                onClick={() => onOpen("members", { server })}
                className="px-3 py-2 text-sm cursor-pointer"
              >
                Manage members
                <Users className="h-4 w-4 ml-auto" />
              </DropdownMenuItem>
            )}
            {isModerator && <DropdownMenuSeparator />}
            {isAdmin && (
              <DropdownMenuItem
                onClick={() => onOpen("deleteServer", { server })}
                className="text-rose-500 px-3 py-2 text-sm cursor-pointer"
              >
                Delete Server
                <Trash className="h-4 w-4 ml-auto" />
              </DropdownMenuItem>
            )}
            {!isAdmin && (
              <DropdownMenuItem
                onClick={() => void onReportServer()}
                className="text-amber-500 px-3 py-2 text-sm cursor-pointer"
              >
                Report Server
                <Flag className="h-4 w-4 ml-auto" />
              </DropdownMenuItem>
            )}
            {!isAdmin && (
              <DropdownMenuItem
                onClick={() => onOpen("leaveServer", { server })}
                className="text-rose-500 px-3 py-2 text-sm cursor-pointer"
              >
                Leave Server
                <LogOut className="h-4 w-4 ml-auto" />
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {isModerator && (
          <button
            type="button"
            onClick={() => onOpen("invite", { server })}
            className="relative z-10 rounded-md bg-black/20 p-1.5 text-zinc-100 hover:bg-black/35 transition"
            title="Invite People"
            aria-label="Invite People"
          >
            <UserPlus className="h-4 w-4" />
          </button>
        )}
        {!isModerator && <div className="w-8" />}
      </div>
    </div>
  );
};
