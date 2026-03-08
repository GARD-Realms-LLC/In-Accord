"use client";

import { Settings } from "lucide-react";

import { ActionTooltip } from "@/components/action-tooltip";
import { useModal } from "@/hooks/use-modal-store";

interface ChannelGroupSettingsButtonProps {
  groupId: string;
  groupName: string;
  groupIcon?: string | null;
}

export const ChannelGroupSettingsButton = ({
  groupId,
  groupName,
  groupIcon,
}: ChannelGroupSettingsButtonProps) => {
  const { onOpen } = useModal();

  return (
    <ActionTooltip label="Group Settings" align="center">
      <button
        type="button"
        onClick={() =>
          onOpen("editChannelGroup", {
            channelGroup: {
              id: groupId,
              name: groupName,
              icon: groupIcon ?? null,
            },
          })
        }
        className="rounded p-0.5 text-zinc-500 transition hover:bg-black/10 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700/30 dark:hover:text-zinc-200"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
    </ActionTooltip>
  );
};
