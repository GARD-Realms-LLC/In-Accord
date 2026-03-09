import Link from "next/link";
import { Hash } from "lucide-react";

import { BotAppBadge } from "@/components/bot-app-badge";
import { NewUserCloverBadge } from "@/components/new-user-clover-badge";
import { MobileToggle } from "@/components/mobile-toggle";
import { ProfileNameWithServerTag } from "@/components/profile-name-with-server-tag";
import { UserAvatar } from "@/components/user-avatar";

import { ChatVideoButton } from "./chat-video-button";

interface ChatHeaderProps {
  serverId: string;
  channelId?: string;
  channelIcon?: string | null;
  name: string;
  topic?: string | null;
  type: "channel" | "conversation";
  imageUrl?: string;
  profileId?: string;
  memberId?: string;
  isBot?: boolean;
  profileCreatedAt?: Date | string | null;
}

export const ChatHeader = ({
  serverId,
  channelId,
  channelIcon,
  name,
  topic,
  type,
  imageUrl,
  profileId,
  memberId,
  isBot,
  profileCreatedAt,
}: ChatHeaderProps) => {
  const normalizedTopic = typeof topic === "string" ? topic.trim() : "";
  const normalizedChannelIcon = typeof channelIcon === "string" ? channelIcon.trim() : "";

  return (
    <div className="pl-0 pr-3 border-neutral-200 dark:border-neutral-800 border-b-2">
      <div className="text-md font-semibold flex items-center h-12">
        {type === "conversation" && <MobileToggle serverId={serverId} />}
        {type === "channel" && (
          normalizedChannelIcon ? (
            <span className="mr-2 inline-flex h-5 w-5 items-center justify-center text-base leading-none text-zinc-500 dark:text-zinc-300">
              {normalizedChannelIcon}
            </span>
          ) : (
            <Hash className="w-5 h-5 text-zinc-500 dark:text-zinc-400 mr-2" />
          )
        )}
        {type === "conversation" && (
          <UserAvatar src={imageUrl} className="h-8 w-8 md:h-8 md:w-8 mr-2" />
        )}
        <div className="flex min-w-0 items-center gap-1.5">
          {type === "conversation" ? (
            <ProfileNameWithServerTag
              name={name}
              profileId={profileId}
              memberId={memberId}
              nameClassName="font-semibold text-md text-black dark:text-white"
              showNameplate
            />
          ) : (
            <p className="truncate font-semibold text-md text-black dark:text-white">{name}</p>
          )}
          {type === "conversation" ? <NewUserCloverBadge createdAt={profileCreatedAt} className="text-sm" /> : null}
          {type === "conversation" && isBot ? <BotAppBadge className="h-4 px-1 text-[9px]" /> : null}
        </div>
        <div className="ml-auto flex items-center">
          {type === "channel" && channelId ? (
            <>
              <Link
                href={`/servers/${serverId}/channels/${channelId}/threads`}
                className="mr-2 inline-flex items-center rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Threads
              </Link>
            </>
          ) : null}
          {type === "conversation" && <ChatVideoButton />}
        </div>
      </div>
      {type === "channel" && normalizedTopic ? (
        <p className="pb-2 pl-7 text-xs text-zinc-500 dark:text-zinc-400">{normalizedTopic}</p>
      ) : null}
    </div>
  );
};
