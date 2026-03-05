import { ChannelType, MemberRole } from "@/lib/db/types";
import { Hash, Mic, ShieldAlert, ShieldCheck, Video } from "lucide-react";
import { asc, eq, sql } from "drizzle-orm";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { currentProfile } from "@/lib/current-profile";
import { channel, db, server } from "@/lib/db";
import { getServerBannerConfig } from "@/lib/server-banner-store";

import { ServerHeader } from "./server-header";
import { ServerSection } from "./server-section";
import { ServerChannel } from "./server-channel";
import { ServerMember } from "./server-member";

interface ServerSidebarProps {
  serverId: string;
}

const iconMap = {
  [ChannelType.TEXT]: <Hash className="mr-2 h-4 w-4" />,
  [ChannelType.AUDIO]: <Mic className="mr-2 h-4 w-4" />,
  [ChannelType.VIDEO]: <Video className="mr-2 h-4 w-4" />,
};

const roleIconMap = {
  [MemberRole.GUEST]: null,
  [MemberRole.MODERATOR]: (
    <ShieldCheck className="h-4 w-4 mr-2 text-indigo-500" />
  ),
  [MemberRole.ADMIN]: <ShieldAlert className="h-4 w-4 mr-2 text-rose-500" />,
};

export const ServerSidebar = async ({ serverId }: ServerSidebarProps) => {
  const profile = await currentProfile();

  const currentServerResult = await db
    .select()
    .from(server)
    .where(eq(server.id, serverId))
    .limit(1);

  const currentServer = currentServerResult[0];
  const bannerConfig = currentServer ? await getServerBannerConfig(currentServer.id) : null;

  const channels = await db
    .select()
    .from(channel)
    .where(eq(channel.serverId, serverId))
    .orderBy(asc(channel.createdAt));

  const membersResult = await db.execute(sql`
    select
      m."id",
      m."role",
      m."profileId",
      m."serverId",
      m."createdAt",
      m."updatedAt",
      u."userId" as "userId",
      u."name" as "name",
      u."email" as "email",
      up."presenceStatus" as "presenceStatus",
      coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
      u."account.created" as "accountCreated",
      u."lastLogin" as "lastLogin"
    from "Member" m
    left join "Users" u on u."userId" = m."profileId"
    left join "UserProfile" up on up."userId" = m."profileId"
    where m."serverId" = ${serverId}
    order by m."role" asc
  `);

  const members = (
    membersResult as unknown as {
      rows: Array<{
        id: string;
        role: MemberRole;
        profileId: string;
        serverId: string;
        createdAt: Date | string;
        updatedAt: Date | string;
        userId: string | null;
        name: string | null;
        email: string | null;
        presenceStatus: string | null;
        imageUrl: string | null;
        accountCreated: Date | string | null;
        lastLogin: Date | string | null;
      }>;
    }
  ).rows.map((row) => ({
    id: row.id,
    role: row.role,
    profileId: row.profileId,
    presenceStatus: row.presenceStatus ?? "ONLINE",
    serverId: row.serverId,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    profile: {
      id: row.userId ?? row.profileId,
      userId: row.userId ?? row.profileId,
      name: row.name ?? row.email ?? "User",
      email: row.email ?? "",
      imageUrl: row.imageUrl ?? "/in-accord-steampunk-logo.png",
      createdAt: row.accountCreated ? new Date(row.accountCreated) : new Date(0),
      updatedAt: row.lastLogin ? new Date(row.lastLogin) : new Date(0),
    },
  }));

  const textChannels = channels.filter(
    (channel) => channel.type === ChannelType.TEXT
  );
  const audioChannels = channels.filter(
    (channel) => channel.type === ChannelType.AUDIO
  );
  const videoChannels = channels.filter(
    (channel) => channel.type === ChannelType.VIDEO
  );
  const membersWithoutCurrent = members.filter(
    (member) => (profile?.id ? member.profileId !== profile.id : true)
  );

  if (!currentServer) {
    return null;
  }

  const role = members.find(
    (member) => member.profileId === profile?.id
  )?.role;
  const normalizedGlobalRole = (profile?.role ?? "").trim().toUpperCase();
  const isInAccordAdministrator =
    normalizedGlobalRole === "ADMINISTRATOR" ||
    normalizedGlobalRole === "IN-ACCORD ADMINISTRATOR" ||
    normalizedGlobalRole === "IN_ACCORD_ADMINISTRATOR" ||
    normalizedGlobalRole === "ADMIN";
  const canSeeInvisibleMembers = isInAccordAdministrator || role === MemberRole.ADMIN;
  const visibleMembersWithoutCurrent = membersWithoutCurrent.filter((member) => {
    return canSeeInvisibleMembers || String(member.presenceStatus ?? "ONLINE").toUpperCase() !== "INVISIBLE";
  });
  const isServerOwner = !!profile?.id && currentServer.profileId === profile.id;
  const serverWithBanner = {
    ...currentServer,
    bannerUrl: bannerConfig?.url ?? null,
    bannerFit: bannerConfig?.fit ?? "cover",
    bannerScale: bannerConfig?.scale ?? 1,
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-black/20 text-primary dark:bg-[#2B2D31] bg-[#F2F3F5]">
      <ServerHeader server={serverWithBanner} role={role} isServerOwner={isServerOwner} />
      <ScrollArea className="flex-1 px-3">
        <Separator className="bg-zinc-200 dark:bg-zinc-700 rounded-md my-2" />
        {!!textChannels?.length && (
          <div className="mb-2">
            <ServerSection
              sectionType="channels"
              channelType={ChannelType.TEXT}
              role={role}
              label="Channels"
            />
            <div className="space-y-[2px]">
              {textChannels.map((channel) => (
                <ServerChannel
                  key={channel.id}
                  channel={channel}
                  role={role}
                  server={currentServer}
                />
              ))}
            </div>
          </div>
        )}
        {!!audioChannels?.length && (
          <div className="mb-2">
            <ServerSection
              sectionType="channels"
              channelType={ChannelType.AUDIO}
              role={role}
              label="Voice Channels"
            />
            <div className="space-y-[2px]">
              {audioChannels.map((channel) => (
                <ServerChannel
                  key={channel.id}
                  channel={channel}
                  role={role}
                  server={currentServer}
                />
              ))}
            </div>
          </div>
        )}
        {!!videoChannels?.length && (
          <div className="mb-2">
            <ServerSection
              sectionType="channels"
              channelType={ChannelType.VIDEO}
              role={role}
              label="Video Channels"
            />
            <div className="space-y-[2px]">
              {videoChannels.map((channel) => (
                <ServerChannel
                  key={channel.id}
                  channel={channel}
                  role={role}
                  server={currentServer}
                />
              ))}
            </div>
          </div>
        )}
        {!!visibleMembersWithoutCurrent?.length && (
          <div className="mb-2">
            <ServerSection
              sectionType="members"
              role={role}
              label="Members"
              server={currentServer}
            />
            <div className="space-y-[2px]">
              {visibleMembersWithoutCurrent.map((member) => (
                <ServerMember key={member.id} member={member} server={currentServer} />
              ))}
            </div>
          </div>
        )}
      </ScrollArea>

    </div>
  );
};
