"use client";

import { type Channel, ChannelType, MemberRole, type Server } from "@/lib/db/types";
import { Hash, Lock, Mic, Settings, Video } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useRef } from "react";

import { cn } from "@/lib/utils";
import { ActionTooltip } from "@/components/action-tooltip";
import { ModalType, useModal } from "@/hooks/use-modal-store";

interface ServerChannelProps {
  channel: Channel;
  server: Server;
  role?: MemberRole;
  draggable?: boolean;
}

const iconMap = {
  [ChannelType.TEXT]: Hash,
  [ChannelType.AUDIO]: Mic,
  [ChannelType.VIDEO]: Video,
};

export const ServerChannel = ({
  channel,
  server,
  role,
  draggable = false,
}: ServerChannelProps) => {
  const { onOpen } = useModal();
  const params = useParams();
  const router = useRouter();

  const Icon = iconMap[channel.type];
  const isDraggingRef = useRef(false);
  const normalizedName = (channel.name ?? "").trim().toLowerCase();
  const isProtectedChannel = normalizedName === "general" || normalizedName === "rules";

  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isDraggingRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    router.push(`/servers/${server.id}/channels/${channel.id}`);
  };

  const onAction = (e: React.MouseEvent, action: ModalType) => {
    e.stopPropagation();
    onOpen(action, { channel, server });
  };

  const onDragStart = (event: React.DragEvent<HTMLButtonElement>) => {
    if (!draggable) {
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
  };

  return (
    <button
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group px-2 py-2 rounded-md flex items-center gap-x-0 w-full text-left hover:bg-zinc-700/10 dark:hover:bg-zinc-700/50 transition mb-1",
        draggable && "cursor-grab active:cursor-grabbing",
        params?.channelId === channel.id && "bg-zinc-700/20 dark:bg-zinc-700"
      )}
    >
      <Icon className="h-5 w-5 shrink-0 text-zinc-500 dark:text-zinc-400" />
      <p
        className={cn(
          "-ml-1 line-clamp-1 min-w-0 flex-1 text-left text-sm font-semibold text-zinc-500 transition group-hover:text-zinc-600 dark:text-zinc-400 dark:group-hover:text-zinc-300",
          params?.channelId === channel.id &&
            "text-primary dark:text-zinc-200 dark:group-hover:text-white"
        )}
      >
        {channel.name}
      </p>
      <div className="ml-auto flex items-center gap-x-2">
        {role !== MemberRole.GUEST && (
          <ActionTooltip label="Channel Settings" align="center">
            <Settings
              onClick={(e) => onAction(e, "editChannel")}
              className="w-4 h-4 text-zinc-500 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-300 transition"
            />
          </ActionTooltip>
        )}
        {isProtectedChannel ? (
          <Lock className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
        ) : null}
      </div>
    </button>
  );
};
