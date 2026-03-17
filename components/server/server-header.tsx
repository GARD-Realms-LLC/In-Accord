"use client";

import {
  CalendarPlus,
  ChevronDown,
  EyeOff,
  Flag,
  FolderPlus,
  Hash,
  LogOut,
  Mic,
  PlusCircle,
  Settings,
  Star,
  Trash,
  UserPlus,
  Users,
  Video,
} from "lucide-react";
import axios from "axios";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { ServerWithMembersWithProfiles } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useModal } from "@/hooks/use-modal-store";
import { resolveBannerUrl } from "@/lib/asset-url";
import { buildChannelPath } from "@/lib/route-slugs";
import { ChannelType, MemberRole } from "@/lib/db/types";

type ChannelGroupMenuItem = {
  id: string;
  name: string;
  icon?: string | null;
  channels: Array<{
    id: string;
    name: string;
    type: ChannelType;
  }>;
};

interface ServerHeaderProps {
  server: ServerWithMembersWithProfiles & {
    bannerUrl?: string | null;
    bannerFit?: "cover" | "contain" | "scale" | null;
    bannerScale?: number | null;
  };
  viewerProfileId?: string | null;
  viewerMemberId?: string | null;
  role?: MemberRole;
  isServerOwner?: boolean;
  channelGroups?: ChannelGroupMenuItem[];
  hasHiddenChannels?: boolean;
}

export const ServerHeader = ({
  server,
  viewerProfileId = null,
  viewerMemberId = null,
  role,
  isServerOwner = false,
  channelGroups = [],
  hasHiddenChannels = false,
}: ServerHeaderProps) => {
  const { onOpen } = useModal();
  const router = useRouter();
  const [isUpdatingChannelsVisibility, setIsUpdatingChannelsVisibility] = useState(false);
  const normalizedBannerUrl =
    resolveBannerUrl(server.bannerUrl) ?? "";
  const bannerFit =
    server.bannerFit === "contain" || server.bannerFit === "scale"
      ? server.bannerFit
      : "cover";
  const bannerScale =
    typeof server.bannerScale === "number" && !Number.isNaN(server.bannerScale)
      ? Math.min(2, Math.max(0.25, server.bannerScale))
      : 1;

  const isAdmin = isServerOwner || role === MemberRole.ADMIN;
  const isModerator = isAdmin || role === MemberRole.MODERATOR;

  const getChannelIcon = (type: ChannelType) => {
    if (type === ChannelType.AUDIO) {
      return <Mic className="h-3.5 w-3.5" />;
    }

    if (type === ChannelType.VIDEO) {
      return <Video className="h-3.5 w-3.5" />;
    }

    return <Hash className="h-3.5 w-3.5" />;
  };

  const onUnhideAllChannels = async () => {
    if (isUpdatingChannelsVisibility) {
      return;
    }

    try {
      setIsUpdatingChannelsVisibility(true);

      await axios.patch(`/api/servers/${server.id}/channel-visibility`, {
        action: "unhideAll",
      });

      router.refresh();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (typeof error.response?.data === "string" ? error.response.data : error.message)
        : "Failed to update channel visibility.";
      window.alert(message || "Failed to update channel visibility.");
    } finally {
      setIsUpdatingChannelsVisibility(false);
    }
  };

  const onSelectChannelGroup = (group: ChannelGroupMenuItem) => {
    if (isModerator) {
      onOpen("editChannelGroup", {
        channelGroup: {
          id: group.id,
          name: group.name,
          icon: group.icon ?? null,
        },
      });
      return;
    }

    const target = document.querySelector(`[data-channel-group-id='${group.id}']`);
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const onSelectChannel = (channel: ChannelGroupMenuItem["channels"][number]) => {
    router.push(
      buildChannelPath({
        server: { id: server.id, name: server.name },
        channel: { id: channel.id, name: channel.name },
      })
    );
  };

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
    <div className="relative h-40 border-b-2 border-neutral-200 dark:border-neutral-800 overflow-hidden">
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

      <div className="absolute left-0 right-0 top-0 z-10 flex h-11 items-center gap-1 bg-transparent px-1.5 text-white">
        <div className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center">
          <Star className="h-4 w-4 text-zinc-100" />
        </div>

        <div className="min-w-0 flex-1">
        <DropdownMenu>
          <DropdownMenuTrigger className="focus:outline-none" asChild>
            <button
              className="z-10 flex h-8 w-full items-center justify-between gap-1 rounded-md bg-black/20 px-2 py-1 text-sm font-semibold transition hover:bg-black/35"
            >
              <span className="min-w-0 flex-1 truncate text-left">{server.name}</span>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-72 text-xs font-medium text-black 
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
            <DropdownMenuItem
              disabled={!hasHiddenChannels || isUpdatingChannelsVisibility}
              onClick={() => void onUnhideAllChannels()}
              className="px-3 py-2 text-sm cursor-pointer"
            >
              Un Hide All Channels
              <EyeOff className="ml-auto h-4 w-4" />
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="px-3 py-2 text-sm">
                Channel Groups
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-[70vh] w-72 space-y-0.5 overflow-y-auto">
                <DropdownMenuLabel className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                  {channelGroups.length > 0 ? `${channelGroups.length} Groups` : "No Groups"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {channelGroups.length > 0 ? (
                  channelGroups.map((group) => (
                    <DropdownMenuSub key={group.id}>
                      <DropdownMenuSubTrigger className="px-3 py-2 text-sm">
                        <span className="min-w-0 truncate pr-2">
                          {group.icon ? `${group.icon} ` : ""}
                          {group.name}
                        </span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="max-h-[70vh] w-72 space-y-0.5 overflow-y-auto">
                        <DropdownMenuLabel className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                          {group.icon ? `${group.icon} ` : ""}
                          {group.name}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onSelectChannelGroup(group)}
                          className="px-3 py-2 text-sm cursor-pointer"
                        >
                          {isModerator ? "Edit Group" : "Jump to Group"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {group.channels.length > 0 ? (
                          group.channels.map((channel) => (
                            <DropdownMenuItem
                              key={channel.id}
                              onClick={() => onSelectChannel(channel)}
                              className="px-3 py-2 text-sm cursor-pointer"
                            >
                              <span className="mr-2 shrink-0 text-zinc-500 dark:text-zinc-400">
                                {getChannelIcon(channel.type)}
                              </span>
                              <span className="min-w-0 truncate">{channel.name}</span>
                            </DropdownMenuItem>
                          ))
                        ) : (
                          <DropdownMenuItem disabled className="px-3 py-2 text-sm">
                            No channels in this group
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  ))
                ) : (
                  <DropdownMenuItem disabled className="px-3 py-2 text-sm">
                    No channel groups yet
                  </DropdownMenuItem>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {isModerator && (
              <>
              <DropdownMenuItem
                onClick={() => onOpen("createChannel", { server })}
                className="px-3 py-2 text-sm cursor-pointer"
              >
                Create Channel
                <PlusCircle className="h-4 w-4 ml-auto" />
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onOpen("createChannel", { server, channelType: ChannelType.AUDIO })}
                className="px-3 py-2 text-sm cursor-pointer"
              >
                Add Voice Channel
                <Mic className="h-4 w-4 ml-auto" />
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onOpen("createChannelGroup", { server })}
                className="px-3 py-2 text-sm cursor-pointer"
              >
                Add Group
                <FolderPlus className="h-4 w-4 ml-auto" />
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onOpen("createEvent", { server })}
                className="px-3 py-2 text-sm cursor-pointer"
              >
                Create Event
                <CalendarPlus className="h-4 w-4 ml-auto" />
              </DropdownMenuItem>
              </>
            )}
            {isAdmin && (
              <DropdownMenuItem
                onClick={() => onOpen("members", { server, viewerProfileId, viewerMemberId })}
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
        </div>

        {isModerator && (
          <button
            type="button"
            onClick={() => onOpen("invite", { server })}
            className="relative z-10 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-black/20 text-zinc-100 transition hover:bg-black/35"
            title="Invite People"
            aria-label="Invite People"
          >
            <UserPlus className="h-4 w-4" />
          </button>
        )}
        {!isModerator && <div className="h-5 w-5 shrink-0" />}
      </div>
    </div>
  );
};
