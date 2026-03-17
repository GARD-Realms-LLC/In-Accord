"use client";

import { type Member, MemberRole, type Profile, type Server } from "@/lib/db/types";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import { BotAppBadge } from "@/components/bot-app-badge";
import { NewUserCloverBadge } from "@/components/new-user-clover-badge";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";
import { isBotUser } from "@/lib/is-bot-user";

interface ServerMemberProps {
  member: Member & { profile: Profile };
  server: Server;
}

const roleIconMap = {
  [MemberRole.GUEST]: null,
  [MemberRole.MODERATOR]: <ShieldCheck className="h-4 w-4 ml-2 text-indigo-500" />,
  [MemberRole.ADMIN]: <ShieldAlert className="h-4 w-4 ml-2 text-rose-500" />
}

export const ServerMember = ({
  member,
  server
}: ServerMemberProps) => {
  const params = useParams();
  const router = useRouter();

  const icon = roleIconMap[member.role];
  const showBotBadge = isBotUser({
    name: member.profile.name,
    email: member.profile.email,
  });

  const onClick = () => {
    router.push(`/servers/${params?.serverId}/conversations/${member.id}`);
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "group px-2 py-2 rounded-md flex items-center gap-x-2 w-full hover:bg-zinc-700/10 dark:hover:bg-zinc-700/50 transition mb-1",
        params?.memberId === member.id && "bg-zinc-700/20 dark:bg-zinc-700"
      )}
    >
      <UserAvatar 
        src={member.profile.imageUrl}
        decorationSrc={(member.profile as Profile & { avatarDecorationUrl?: string | null }).avatarDecorationUrl ?? null}
        className="h-8 w-8 md:h-8 md:w-8"
      />
      <div className="flex min-w-0 items-center gap-1.5">
        <p
          className={cn(
            "truncate font-semibold text-sm text-zinc-500 group-hover:text-zinc-600 dark:text-zinc-400 dark:group-hover:text-zinc-300 transition",
            params?.memberId === member.id && "text-primary dark:text-zinc-200 dark:group-hover:text-white"
          )}
        >
          {member.profile.name}
        </p>
        <NewUserCloverBadge createdAt={member.profile.createdAt} className="text-xs" />
        {showBotBadge ? <BotAppBadge className="h-4 px-1 text-[9px]" /> : null}
      </div>
      {icon}
    </button>
  )
}