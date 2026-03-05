"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  Hash,
  Mic,
  PanelRightClose,
  PanelRightOpen,
  PhoneCall,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  Video,
} from "lucide-react";

import { ServerSearch } from "@/components/server/server-search";
import { MemberRole } from "@/lib/db/types";

type SearchItem = {
  id: string;
  name: string;
};

type OnlineUserItem = {
  id: string;
  name: string;
  role: MemberRole;
};

interface ServerRouteShellProps {
  serverName: string;
  serverId: string;
  textChannels: SearchItem[];
  voiceChannels: SearchItem[];
  videoChannels: SearchItem[];
  onlineUsers: OnlineUserItem[];
  leftSidebar: React.ReactNode;
  rightSidebar: React.ReactNode;
  rightFooter: React.ReactNode;
  children: React.ReactNode;
}

export const ServerRouteShell = ({
  serverName,
  serverId,
  textChannels,
  voiceChannels,
  videoChannels,
  onlineUsers,
  leftSidebar,
  rightSidebar,
  rightFooter,
  children,
}: ServerRouteShellProps) => {
  const [isMembersCollapsed, setIsMembersCollapsed] = useState(false);

  const roleIconMap = {
    [MemberRole.GUEST]: null,
    [MemberRole.MODERATOR]: <ShieldCheck className="h-4 w-4 mr-2 text-indigo-500" />,
    [MemberRole.ADMIN]: <ShieldAlert className="h-4 w-4 mr-2 text-rose-500" />,
  };

  const headerTitleStyle = useMemo(
    () => ({
      left: "calc((100% - 256px) / 2)",
      maxWidth: isMembersCollapsed ? "calc(100% - 304px)" : "calc(100% - 560px)",
    }),
    [isMembersCollapsed]
  );

  return (
    <div className="h-full overflow-hidden">
      <header className="fixed left-[328px] right-0 top-0 z-40 h-12 border-b border-black/20 bg-[#2b2d31] px-4 flex items-center rounded-b-xl overflow-hidden">
        <h1
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 truncate text-center text-sm font-bold uppercase tracking-[0.08em] text-[#f2f3f5]"
          style={headerTitleStyle}
        >
          {serverName}
        </h1>

        <div className="absolute right-[276px] top-1/2 z-20 -translate-y-1/2 flex items-center gap-1 text-[#b5bac1]">
          <button type="button" title="Start Call" className="rounded p-1.5 hover:bg-[#3f4248] hover:text-white transition-colors">
            <PhoneCall className="h-4 w-4" />
          </button>
          <button type="button" title="Start Video" className="rounded p-1.5 hover:bg-[#3f4248] hover:text-white transition-colors">
            <Video className="h-4 w-4" />
          </button>
          <button type="button" title="Invite People" className="rounded p-1.5 hover:bg-[#3f4248] hover:text-white transition-colors">
            <UserPlus className="h-4 w-4" />
          </button>
          <button type="button" title="Notifications" className="rounded p-1.5 hover:bg-[#3f4248] hover:text-white transition-colors">
            <Bell className="h-4 w-4" />
          </button>
        </div>

        <div
          className="absolute top-1/2 z-20 -translate-y-1/2 text-[#b5bac1]"
          style={{ left: "calc(100% - 252px)" }}
        >
          <button
            type="button"
            title={isMembersCollapsed ? "Expand Online Members" : "Collapse Online Members"}
            onClick={() => setIsMembersCollapsed((prev) => !prev)}
            className="rounded p-1.5 hover:bg-[#3f4248] hover:text-white transition-colors"
          >
            {isMembersCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
          </button>
        </div>

        <div
          className="absolute top-1/2 z-20 w-[163px] -translate-y-1/2 -translate-x-1/2 rounded-md border border-black/30 bg-[#1e1f22]/90"
          style={{ left: "calc(100% - 128px)" }}
        >
          <ServerSearch
            serverId={serverId}
            serverName={serverName}
            data={[
              {
                label: "Server",
                type: "server",
                data: [
                  {
                    id: serverId,
                    name: serverName,
                    icon: <Hash className="mr-2 h-4 w-4" />,
                  },
                ],
              },
              {
                label: "Text Channels",
                type: "channel",
                data: textChannels.map((channel) => ({
                  id: channel.id,
                  name: channel.name,
                  icon: <Hash className="mr-2 h-4 w-4" />,
                })),
              },
              {
                label: "Voice Channels",
                type: "channel",
                data: voiceChannels.map((channel) => ({
                  id: channel.id,
                  name: channel.name,
                  icon: <Mic className="mr-2 h-4 w-4" />,
                })),
              },
              {
                label: "Video Channels",
                type: "channel",
                data: videoChannels.map((channel) => ({
                  id: channel.id,
                  name: channel.name,
                  icon: <Video className="mr-2 h-4 w-4" />,
                })),
              },
              {
                label: "Online Users",
                type: "member",
                data: onlineUsers.map((member) => ({
                  id: member.id,
                  name: member.name,
                  icon: roleIconMap[member.role],
                })),
              },
            ]}
          />
        </div>
      </header>

      <aside className="fixed top-0 bottom-[84px] left-[88px] w-60 z-40">{leftSidebar}</aside>

      {!isMembersCollapsed ? (
        <aside className="fixed top-12 bottom-[84px] right-0 w-64 z-30 px-2 py-2">{rightSidebar}</aside>
      ) : null}

      <aside className="fixed bottom-0 right-0 h-[84px] w-64 z-30 px-2 pb-2 flex items-center justify-center">{rightFooter}</aside>

      <main className={`box-border h-full overflow-hidden pl-[240px] pt-14 p-2 ${isMembersCollapsed ? "pr-0" : "pr-[256px]"}`}>
        {children}
      </main>
    </div>
  );
};
