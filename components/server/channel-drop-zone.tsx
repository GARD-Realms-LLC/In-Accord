"use client";

import { useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

interface ChannelDropZoneProps {
  serverId: string;
  targetGroupId: string | null;
  children: React.ReactNode;
  className?: string;
}

export const ChannelDropZone = ({
  serverId,
  targetGroupId,
  children,
  className,
}: ChannelDropZoneProps) => {
  const router = useRouter();
  const [isMoving, setIsMoving] = useState(false);

  const getDraggedChannelId = (event: React.DragEvent<HTMLDivElement>) => {
    return (
      event.dataTransfer.getData("inaccord/channel-id") ||
      event.dataTransfer.getData("text/plain") ||
      ""
    ).trim();
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    const hasKnownType =
      event.dataTransfer.types.includes("inaccord/channel-id") ||
      event.dataTransfer.types.includes("text/plain");

    if (!hasKnownType) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    const channelId = getDraggedChannelId(event);
    if (!channelId || isMoving) {
      return;
    }

    try {
      setIsMoving(true);
      await axios.patch(`/api/channels/${channelId}/group`, {
        serverId,
        channelGroupId: targetGroupId,
      });
      router.refresh();
    } catch (error) {
      console.error("[CHANNEL_DROP_ZONE_MOVE]", error);
      window.alert("Failed to move channel.");
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn("rounded-md", className)}
    >
      {children}
    </div>
  );
};
