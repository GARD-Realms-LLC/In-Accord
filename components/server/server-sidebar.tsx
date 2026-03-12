import { ChannelType, MemberRole } from "@/lib/db/types";
import { Hash, Mic, Video } from "lucide-react";
import { asc, eq, sql } from "drizzle-orm";

import { ScrollArea } from "@/components/ui/scroll-area";
import { currentProfile } from "@/lib/current-profile";
import { channel, db, server } from "@/lib/db";
import { visibleChannelIdsForRole } from "@/lib/channel-permissions";
import { getServerBannerConfig } from "@/lib/server-banner-store";
import { listActiveVoiceCountsForServer } from "@/lib/voice-states";

import { ServerHeader } from "./server-header";
import { ServerSection } from "./server-section";
import { ServerChannel } from "./server-channel";
import { ChannelDropZone } from "./channel-drop-zone";
import { ServerEventsMenu } from "./server-events-menu";

interface ServerSidebarProps {
  serverId: string;
}

type ChannelRow = {
  id: string;
  name: string;
  type: ChannelType;
  profileId: string;
  serverId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const iconMap = {
  [ChannelType.TEXT]: <Hash className="mr-2 h-4 w-4" />,
  [ChannelType.AUDIO]: <Mic className="mr-2 h-4 w-4" />,
  [ChannelType.VIDEO]: <Video className="mr-2 h-4 w-4" />,
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

  const channels = (await db
    .select({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      profileId: channel.profileId,
      serverId: channel.serverId,
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt,
    })
    .from(channel)
    .where(eq(channel.serverId, serverId))
    .orderBy(asc(channel.createdAt))) as ChannelRow[];

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

  if (!currentServer) {
    return null;
  }

  const role = members.find(
    (member) => member.profileId === profile?.id
  )?.role;
  const isServerOwner = !!profile?.id && currentServer.profileId === profile.id;

  const visibleChannelIds = role
    ? await visibleChannelIdsForRole({
        serverId,
        role,
        isServerOwner,
        channelIds: channels.map((item) => item.id),
      })
    : new Set(channels.map((item) => item.id));

  const visibleChannels = channels.filter((item) => visibleChannelIds.has(item.id));

  const stageChannel =
    visibleChannels.find((item) => String(item.name ?? "").trim().toLowerCase() === "stage") ?? null;
  const rulesChannel =
    visibleChannels.find((item) => String(item.name ?? "").trim().toLowerCase() === "rules") ?? null;
  const visibleChannelsWithoutSpecial = visibleChannels.filter((item) => {
    const normalizedName = String(item.name ?? "").trim().toLowerCase();
    return normalizedName !== "stage" && normalizedName !== "rules";
  });

  const ungroupedChannels = visibleChannelsWithoutSpecial;
  const serverWithMembers = {
    ...currentServer,
    members,
  };

  const connectedVoiceCountsByChannelId = await listActiveVoiceCountsForServer({ serverId });
  const stageJoinedCount = stageChannel?.id
    ? connectedVoiceCountsByChannelId.get(stageChannel.id) ?? 0
    : 0;

  const serverWithBanner = {
    ...serverWithMembers,
    bannerUrl: bannerConfig?.url ?? null,
    bannerFit: bannerConfig?.fit ?? "cover",
    bannerScale: bannerConfig?.scale ?? 1,
  };

  const eventsCount = 0;
  const invitesCount = 0;

  return (
    <div className="theme-channels-rail flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-primary">
      <div className="px-3 pt-2 pb-2">
        <ServerHeader server={serverWithBanner} role={role} isServerOwner={isServerOwner} />
        <ServerEventsMenu
          server={serverWithMembers}
          eventsCount={eventsCount}
          invitesCount={invitesCount}
          boostersCount={0}
          stageJoinedCount={stageJoinedCount}
          stageChannel={stageChannel}
          rulesChannel={rulesChannel}
        />
      </div>
      <ScrollArea className="settings-scrollbar min-h-0 flex-1 px-3 pt-3">
        {!!ungroupedChannels?.length && (
          <ChannelDropZone serverId={serverId} targetGroupId={null} className="mb-2">
            <ServerSection
              sectionType="channels"
              channelType={undefined}
              role={role}
              label="Channels"
              server={serverWithMembers}
            />
            <div className="space-y-0.5">
              {ungroupedChannels.map((channel) => (
                <ServerChannel
                  key={channel.id}
                  channel={channel}
                  role={role}
                  server={serverWithMembers}
                  draggable
                  connectedCount={connectedVoiceCountsByChannelId.get(channel.id) ?? 0}
                />
              ))}
            </div>
          </ChannelDropZone>
        )}

        {false ? <div /> : null}
      </ScrollArea>

    </div>
  );
};
