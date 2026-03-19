"use client";

import axios from "axios";
import { type Channel, ChannelType, MemberRole, type Server } from "@/lib/db/types";
import { Bell, Hash, Mic, Settings, Video } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { ActionTooltip } from "@/components/action-tooltip";
import { ModalType, useModal } from "@/hooks/use-modal-store";
import { buildChannelPath, matchesRouteParam } from "@/lib/route-slugs";

interface ServerChannelProps {
  channel: Channel;
  server: Server;
  role?: MemberRole;
  draggable?: boolean;
  connectedCount?: number;
  hasUnreadMarker?: boolean;
}

const iconMap = {
  [ChannelType.TEXT]: Hash,
  [ChannelType.ANNOUNCEMENT]: Bell,
  [ChannelType.AUDIO]: Mic,
  [ChannelType.VIDEO]: Video,
};

export const ServerChannel = ({
  channel,
  server,
  role,
  draggable = false,
  connectedCount = 0,
  hasUnreadMarker = false,
}: ServerChannelProps) => {
  const { onOpen } = useModal();
  const params = useParams();
  const router = useRouter();

  const Icon = iconMap[channel.type];
  const isDraggingRef = useRef(false);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [isHidingChannel, setIsHidingChannel] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const customIcon = String((channel as { icon?: string | null }).icon ?? "").trim();
  const canReorder = draggable && role !== MemberRole.GUEST;
  const showConnectedCount = (channel.type === ChannelType.AUDIO || channel.type === ChannelType.VIDEO) && connectedCount > 0;
  const isActiveChannel = matchesRouteParam(String(params?.channelId ?? ""), {
    id: channel.id,
    name: channel.name,
  });

  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isDraggingRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    router.push(
      buildChannelPath({
        server: { id: server.id, name: server.name },
        channel: { id: channel.id, name: channel.name },
      })
    );
  };

  const onAction = (e: React.MouseEvent, action: ModalType) => {
    e.stopPropagation();
    onOpen(action, { channel, server });
  };

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (contextMenuRef.current && target instanceof Node && contextMenuRef.current.contains(target)) {
        return;
      }

      setContextMenu(null);
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    const onScroll = () => {
      setContextMenu(null);
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onEscape);
    };
  }, [contextMenu]);

  const onContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const onHideChannel = async () => {
    if (isHidingChannel) {
      return;
    }

    try {
      setIsHidingChannel(true);
      setContextMenu(null);

      await axios.patch(`/api/servers/${server.id}/channel-visibility`, {
        action: "hide",
        channelId: channel.id,
      });

      router.refresh();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (typeof error.response?.data === "string" ? error.response.data : error.message)
        : "Failed to hide channel.";
      window.alert(message || "Failed to hide channel.");
    } finally {
      setIsHidingChannel(false);
    }
  };

  const onDragStart = (event: React.DragEvent<HTMLButtonElement>) => {
    if (!canReorder) {
      return;
    }

    isDraggingRef.current = true;
    event.dataTransfer.setData("inaccord/channel-id", channel.id);
    event.dataTransfer.setData("text/plain", channel.id);
    event.dataTransfer.effectAllowed = "move";
  };

  const onDragEnd = () => {
    window.setTimeout(() => {
      isDraggingRef.current = false;
    }, 0);
    setIsDragOver(false);
  };

  const onDragOver = (event: React.DragEvent<HTMLButtonElement>) => {
    if (!canReorder) {
      return;
    }

    const hasKnownType =
      event.dataTransfer.types.includes("inaccord/channel-id") ||
      event.dataTransfer.types.includes("text/plain");

    if (!hasKnownType) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (!isDragOver) {
      setIsDragOver(true);
    }
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = async (event: React.DragEvent<HTMLButtonElement>) => {
    if (!canReorder) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);

    if (isReordering) {
      return;
    }

    const draggedChannelId = (
      event.dataTransfer.getData("inaccord/channel-id") ||
      event.dataTransfer.getData("text/plain") ||
      ""
    ).trim();

    if (!draggedChannelId || draggedChannelId === channel.id) {
      return;
    }

    try {
      setIsReordering(true);
      await axios.patch("/api/channels/reorder", {
        serverId: server.id,
        draggedChannelId,
        targetChannelId: channel.id,
      });
      router.refresh();
    } catch (error) {
      console.error("[CHANNEL_REORDER_DROP]", error);
      window.alert("Failed to reorder channel.");
    } finally {
      setIsReordering(false);
    }
  };

  return (
    <div
      className={cn(
        "transition-all duration-150",
        isDragOver && canReorder ? "mb-10" : "mb-0"
      )}
    >
      <button
        onClick={onClick}
        onContextMenu={onContextMenu}
        draggable={canReorder}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "group mb-0.5 flex w-full items-center gap-x-2 rounded px-2 py-1.5 text-left transition hover:bg-[#3a3c43]",
          canReorder && "cursor-grab active:cursor-grabbing",
          isDragOver && "bg-[#5865f2]/20 ring-1 ring-[#5865f2]/70",
          isActiveChannel && "bg-[#404249]"
        )}
      >
      {customIcon ? (
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-sm leading-none text-zinc-500 dark:text-zinc-300">
          {customIcon}
        </span>
      ) : (
        <Icon className="h-4 w-4 shrink-0 text-[#949ba4]" />
      )}
      <p
        className={cn(
          "line-clamp-1 min-w-0 flex-1 text-left text-[15px] font-medium text-[#949ba4] transition group-hover:text-[#dbdee1]",
          isActiveChannel &&
            "text-[#f2f3f5]"
        )}
      >
        {channel.name}
      </p>
      {channel.type === ChannelType.ANNOUNCEMENT && hasUnreadMarker && !isActiveChannel ? (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#5865f2] shadow-[0_0_0_2px_rgba(17,18,20,0.9)]"
          aria-label="Unread announcements"
          title="Unread announcements"
        />
      ) : null}
      {showConnectedCount ? (
        <span className="rounded-full border border-emerald-500/45 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-emerald-200">
          {connectedCount}
        </span>
      ) : null}
        <div className="ml-auto flex items-center gap-x-2">
          {role !== MemberRole.GUEST && (
            <ActionTooltip label="Channel Settings" align="center">
              <Settings
                onClick={(e) => onAction(e, "editChannel")}
                className="h-4 w-4 text-[#949ba4] transition hover:text-[#dbdee1]"
              />
            </ActionTooltip>
          )}
        </div>
      </button>

      {contextMenu ? (
        <div
          ref={contextMenuRef}
          className="fixed z-130 min-w-40 rounded-md border border-zinc-700 bg-[#1f2125] p-1 shadow-2xl shadow-black/70"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            onClick={() => void onHideChannel()}
            disabled={isHidingChannel}
            className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-zinc-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Hide Channel
          </button>
        </div>
      ) : null}

      {isDragOver && canReorder ? <div className="mt-1 h-9 w-full" /> : null}
    </div>
  );
};
