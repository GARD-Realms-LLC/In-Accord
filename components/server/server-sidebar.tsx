import { ChannelType, MemberRole } from "@/lib/db/types";
import { Hash, Mic, Video } from "lucide-react";
import { eq, sql } from "drizzle-orm";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { currentProfile } from "@/lib/current-profile";
import { db, server } from "@/lib/db";
import { ensureChannelGroupSchema } from "@/lib/channel-groups";
import { ensureChannelTopicSchema } from "@/lib/channel-topic";
import { visibleChannelIdsForRole } from "@/lib/channel-permissions";
import { getServerBannerConfig } from "@/lib/server-banner-store";
import { ensureRulesChannelForServer } from "@/lib/system-channels";

import { ServerHeader } from "./server-header";
import { ServerSection } from "./server-section";
import { ServerChannel } from "./server-channel";
import { ChannelDropZone } from "./channel-drop-zone";
import { ChannelGroupsList } from "./channel-groups-list";

interface ServerSidebarProps {
  serverId: string;
}

type ChannelRow = {
  id: string;
  name: string;
  topic: string | null;
  type: ChannelType;
  profileId: string;
  serverId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  channelGroupId: string | null;
};

type ChannelGroupRow = {
  id: string;
  name: string;
  sortOrder: number | string | null;
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

  if (currentServer) {
    await ensureRulesChannelForServer(currentServer.id, currentServer.profileId);
  }

  await ensureChannelGroupSchema();
  await ensureChannelTopicSchema();

  const channelsResult = await db.execute(sql`
    select
      c."id" as "id",
      c."name" as "name",
      ct."topic" as "topic",
      c."type" as "type",
      c."profileId" as "profileId",
      c."serverId" as "serverId",
      c."createdAt" as "createdAt",
      c."updatedAt" as "updatedAt",
      c."channelGroupId" as "channelGroupId"
    from "Channel" c
    left join "ChannelTopic" ct on ct."channelId" = c."id" and ct."serverId" = c."serverId"
    where c."serverId" = ${serverId}
    order by c."createdAt" asc
  `);

  const channels = ((channelsResult as unknown as { rows: ChannelRow[] }).rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    topic: row.topic,
    type: row.type,
    profileId: row.profileId,
    serverId: row.serverId,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    channelGroupId: row.channelGroupId,
  }));

  const channelGroupsResult = await db.execute(sql`
    select
      cg."id" as "id",
      cg."name" as "name",
      cg."sortOrder" as "sortOrder"
    from "ChannelGroup" cg
    where cg."serverId" = ${serverId}
    order by cg."sortOrder" asc, cg."createdAt" asc
  `);

  const channelGroups = (channelGroupsResult as unknown as { rows: ChannelGroupRow[] }).rows ?? [];

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

  const textChannels = visibleChannels.filter(
    (channel) => channel.type === ChannelType.TEXT
  );
  const audioChannels = visibleChannels.filter(
    (channel) => channel.type === ChannelType.AUDIO
  );
  const videoChannels = visibleChannels.filter(
    (channel) => channel.type === ChannelType.VIDEO
  );
  const groupedChannels = channelGroups.map((group) => ({
    id: group.id,
    name: group.name,
    channels: visibleChannels.filter((item) => item.channelGroupId === group.id),
  }));
  const groupedChannelIds = new Set(
    groupedChannels.flatMap((group) => group.channels.map((item) => item.id))
  );

  const textChannelsUngrouped = textChannels.filter((item) => !groupedChannelIds.has(item.id));
  const audioChannelsUngrouped = audioChannels.filter((item) => !groupedChannelIds.has(item.id));
  const videoChannelsUngrouped = videoChannels.filter((item) => !groupedChannelIds.has(item.id));
  const serverWithMembers = {
    ...currentServer,
    members,
  };

  const serverWithBanner = {
    ...serverWithMembers,
    bannerUrl: bannerConfig?.url ?? null,
    bannerFit: bannerConfig?.fit ?? "cover",
    bannerScale: bannerConfig?.scale ?? 1,
  };

  return (
    <div className="theme-channels-rail flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-primary">
      <ServerHeader server={serverWithBanner} role={role} isServerOwner={isServerOwner} />
      <ScrollArea className="settings-scrollbar min-h-0 flex-1 px-3">
        <Separator className="bg-zinc-200 dark:bg-zinc-700 rounded-md my-2" />
        {!!textChannelsUngrouped?.length && (
          <ChannelDropZone serverId={serverId} targetGroupId={null} className="mb-2">
            <ServerSection
              sectionType="channels"
              channelType={ChannelType.TEXT}
              role={role}
              label="Channels"
              server={serverWithMembers}
            />
            <div className="space-y-0.5">
              {textChannelsUngrouped.map((channel) => (
                <ServerChannel
                  key={channel.id}
                  channel={channel}
                  role={role}
                  server={serverWithMembers}
                  draggable
                />
              ))}
            </div>
          </ChannelDropZone>
        )}
        {!!audioChannelsUngrouped?.length && (
          <ChannelDropZone serverId={serverId} targetGroupId={null} className="mb-2">
            <ServerSection
              sectionType="channels"
              channelType={ChannelType.AUDIO}
              role={role}
              label="Voice Channels"
              server={serverWithMembers}
            />
            <div className="space-y-0.5">
              {audioChannelsUngrouped.map((channel) => (
                <ServerChannel
                  key={channel.id}
                  channel={channel}
                  role={role}
                  server={serverWithMembers}
                  draggable
                />
              ))}
            </div>
          </ChannelDropZone>
        )}
        {!!videoChannelsUngrouped?.length && (
          <ChannelDropZone serverId={serverId} targetGroupId={null} className="mb-2">
            <ServerSection
              sectionType="channels"
              channelType={ChannelType.VIDEO}
              role={role}
              label="Video Channels"
              server={serverWithMembers}
            />
            <div className="space-y-0.5">
              {videoChannelsUngrouped.map((channel) => (
                <ServerChannel
                  key={channel.id}
                  channel={channel}
                  role={role}
                  server={serverWithMembers}
                  draggable
                />
              ))}
            </div>
          </ChannelDropZone>
        )}

        {!!channelGroups.length && (
          <div className="mb-2">
            <ServerSection
              sectionType="channels"
              channelType={ChannelType.TEXT}
              role={role}
              label={`Channel Groups - ${channelGroups.length}`}
              server={serverWithMembers}
            />
            <ChannelGroupsList
              serverId={serverId}
              role={role}
              server={serverWithMembers}
              groups={groupedChannels}
            />
          </div>
        )}
      </ScrollArea>

    </div>
  );
};
