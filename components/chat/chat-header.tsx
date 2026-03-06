import { Hash } from "lucide-react";

import { BotAppBadge } from "@/components/bot-app-badge";
import { NewUserCloverBadge } from "@/components/new-user-clover-badge";
import { MobileToggle } from "@/components/mobile-toggle";
import { UserAvatar } from "@/components/user-avatar";
import { SocketIndicator } from "@/components/socket-indicator";

import { ChatVideoButton } from "./chat-video-button";

interface ChatHeaderProps {
  serverId: string;
  name: string;
  topic?: string | null;
  type: "channel" | "conversation";
  imageUrl?: string;
  isBot?: boolean;
  profileCreatedAt?: Date | string | null;
}

export const ChatHeader = ({
  serverId,
  name,
  topic,
  type,
  imageUrl,
  isBot,
  profileCreatedAt,
}: ChatHeaderProps) => {
  const normalizedTopic = typeof topic === "string" ? topic.trim() : "";

  return (
    <div className="pl-0 pr-3 border-neutral-200 dark:border-neutral-800 border-b-2">
      <div className="text-md font-semibold flex items-center h-12">
        {type === "conversation" && <MobileToggle serverId={serverId} />}
        {type === "channel" && (
          <Hash className="w-5 h-5 text-zinc-500 dark:text-zinc-400 mr-2" />
        )}
        {type === "conversation" && (
          <UserAvatar src={imageUrl} className="h-8 w-8 md:h-8 md:w-8 mr-2" />
        )}
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate font-semibold text-md text-black dark:text-white">{name}</p>
          {type === "conversation" ? <NewUserCloverBadge createdAt={profileCreatedAt} className="text-sm" /> : null}
          {type === "conversation" && isBot ? <BotAppBadge className="h-4 px-1 text-[9px]" /> : null}
        </div>
        <div className="ml-auto flex items-center">
          {type === "conversation" && <ChatVideoButton />}
          <SocketIndicator />
        </div>
      </div>
      {type === "channel" && normalizedTopic ? (
        <p className="pb-2 pl-7 text-xs text-zinc-500 dark:text-zinc-400">{normalizedTopic}</p>
      ) : null}
    </div>
  );
};
