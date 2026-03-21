import { Channel, ChannelType, MemberRole } from "@/lib/db/types";
import { Bell, Hash, Mic, Video } from "lucide-react";
import { asc, eq, sql } from "drizzle-orm";

import { ScrollArea } from "@/components/ui/scroll-area";
import { currentProfile } from "@/lib/current-profile";
import { channel, db, server } from "@/lib/db";
import { ensureChannelGroupSchema } from "@/lib/channel-groups";
import { isInAccordAdministrator } from "@/lib/in-accord-admin";
import { resolveMemberContext, visibleChannelIdsForMember } from "@/lib/channel-permissions";
import { getServerBannerConfig } from "@/lib/server-banner-store";
import { getServerProfileSettings } from "@/lib/server-profile-settings-store";
import { listActiveVoiceCountsForServer } from "@/lib/voice-states";
import { listUnreadChannelIds } from "@/lib/channel-read-state";
import { resolveBannerUrl } from "@/lib/asset-url";

import { ServerHeader } from "./server-header";
import { ServerSection } from "./server-section";
import { ServerChannel } from "./server-channel";
import { ChannelDropZone } from "./channel-drop-zone";
import { ChannelGroupsList } from "./channel-groups-list";
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
  channelGroupId: string | null;
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type ChannelGroupRow = {
  id: string;
  name: string;
  icon: string | null;
  sortOrder: number;
};

type CurrentServerRow = {
  id: string | null;
  name: string | null;
  imageUrl: string | null;
  inviteCode: string | null;
  profileId: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
};

const iconMap = {
  [ChannelType.TEXT]: <Hash className="mr-2 h-4 w-4" />,
  [ChannelType.ANNOUNCEMENT]: <Bell className="mr-2 h-4 w-4" />,
  [ChannelType.AUDIO]: <Mic className="mr-2 h-4 w-4" />,
  [ChannelType.VIDEO]: <Video className="mr-2 h-4 w-4" />,
};

export const ServerSidebar = async ({ serverId }: ServerSidebarProps) => {
  const profile = await currentProfile();

  await ensureChannelGroupSchema();

  const currentServerResult = await db.execute(sql`
    select
      s."id" as "id",
      s."name" as "name",
      s."imageUrl" as "imageUrl",
      s."inviteCode" as "inviteCode",
      s."profileId" as "profileId",
      s."createdAt" as "createdAt",
      s."updatedAt" as "updatedAt"
    from "Server" s
    where s."id" = ${serverId}
    limit 1
  `);

  const currentServerRow = ((currentServerResult as unknown as {
    rows?: CurrentServerRow[];
  }).rows ?? [])[0] ?? null;
  const currentServer = currentServerRow?.id
    ? {
        id: String(currentServerRow.id).trim(),
        name: String(currentServerRow.name ?? "").trim(),
        imageUrl: String(currentServerRow.imageUrl ?? "").trim(),
        inviteCode: String(currentServerRow.inviteCode ?? "").trim(),
        profileId: String(currentServerRow.profileId ?? "").trim(),
        createdAt: currentServerRow.createdAt ? new Date(currentServerRow.createdAt) : new Date(0),
        updatedAt: currentServerRow.updatedAt ? new Date(currentServerRow.updatedAt) : new Date(0),
      }
    : null;
  const bannerConfig = currentServer ? await getServerBannerConfig(currentServer.id) : null;
  const serverProfileSettings = currentServer ? await getServerProfileSettings(currentServer.id) : null;

  const rawChannels = (
    (await db.execute(sql`
      select
        c."id",
        c."name",
        c."type",
        c."profileId",
        c."serverId",
        c."channelGroupId",
        coalesce(c."sortOrder", 0) as "sortOrder",
        c."createdAt",
        c."updatedAt"
      from "Channel" c
      where c."serverId" = ${serverId}
      order by
        case when c."channelGroupId" is null then 0 else 1 end,
        c."sortOrder" asc,
        c."createdAt" asc,
        c."id" asc
    `) as unknown as {
      rows?: ChannelRow[];
    }).rows ?? []
  ) as ChannelRow[];

  const channelGroups = (
    (await db.execute(sql`
      select
        g."id",
        g."name",
        g."icon",
        coalesce(g."sortOrder", 0) as "sortOrder"
      from "ChannelGroup" g
      where g."serverId" = ${serverId}
      order by g."sortOrder" asc, g."createdAt" asc, g."id" asc
    `) as unknown as {
      rows?: ChannelGroupRow[];
    }).rows ?? []
  ) as ChannelGroupRow[];

  const channels = rawChannels.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    profileId: item.profileId,
    serverId: item.serverId,
    channelGroupId: item.channelGroupId,
    sortOrder: Number(item.sortOrder ?? 0),
    createdAt: item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt),
    updatedAt: item.updatedAt instanceof Date ? item.updatedAt : new Date(item.updatedAt),
  }));

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

  const viewerMemberId = members.find((member) => member.profileId === profile?.id)?.id ?? null;

  const role = members.find(
    (member) => member.profileId === profile?.id
  )?.role;
  const isServerOwner = (!!profile?.id && currentServer.profileId === profile.id) || isInAccordAdministrator(profile?.role);

  const visibleChannelIds = role
    ? await visibleChannelIdsForMember({
        serverId,
        memberContext:
          (await resolveMemberContext({ profileId: profile?.id ?? "", serverId })) ?? {
            memberId: "",
            profileId: profile?.id ?? "",
            role,
            assignedRoleIds: [],
            isServerOwner,
          },
        channelIds: channels.map((item) => item.id),
      })
    : new Set(channels.map((item) => item.id));

  const hiddenChannelIdSet = new Set(serverProfileSettings?.hiddenChannelIds ?? []);
  const visibleChannels = channels.filter(
    (item) => visibleChannelIds.has(item.id) && !hiddenChannelIdSet.has(item.id)
  );
  const unfilteredVisibleChannels = channels.filter((item) => visibleChannelIds.has(item.id));
  const unreadAnnouncementChannelIds = await listUnreadChannelIds({
    profileId: profile?.id ?? "",
    channelIds: visibleChannels
      .filter((item) => item.type === ChannelType.ANNOUNCEMENT)
      .map((item) => item.id),
  });

  const stageChannel =
    visibleChannels.find((item) => String(item.name ?? "").trim().toLowerCase() === "stage") ?? null;
  const rulesChannel =
    visibleChannels.find((item) => String(item.name ?? "").trim().toLowerCase() === "rules") ?? null;
  const visibleChannelsWithoutSpecial = visibleChannels.filter((item) => {
    const normalizedName = String(item.name ?? "").trim().toLowerCase();
    return normalizedName !== "stage" && normalizedName !== "rules";
  });

  const channelGroupsCount = channelGroups.length;
  const channelsCount = visibleChannelsWithoutSpecial.length;

  const channelGroupById = new Map(channelGroups.map((group) => [group.id, group]));
  const toEpoch = (value: Date | string) => (value instanceof Date ? value.getTime() : new Date(value).getTime());
  const sortChannelsForDisplay = (left: (typeof visibleChannelsWithoutSpecial)[number], right: (typeof visibleChannelsWithoutSpecial)[number]) => {
    const leftOrder = Number(left.sortOrder ?? 0);
    const rightOrder = Number(right.sortOrder ?? 0);
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    const leftCreatedAt = toEpoch(left.createdAt);
    const rightCreatedAt = toEpoch(right.createdAt);
    if (leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt - rightCreatedAt;
    }

    return left.id.localeCompare(right.id);
  };

  const groupedChannelGroups = channelGroups.map((group) => ({
    id: group.id,
    name: group.name,
    icon: group.icon,
    channels: visibleChannelsWithoutSpecial
      .filter((channelItem) => channelItem.channelGroupId === group.id)
      .sort(sortChannelsForDisplay) as Channel[],
  }));

  const groupedChannelGroupsWithChannels = groupedChannelGroups.filter((group) => group.channels.length > 0);

  const ungroupedChannels = visibleChannelsWithoutSpecial
    .filter((channelItem) => !channelItem.channelGroupId || !channelGroupById.has(channelItem.channelGroupId))
    .sort(sortChannelsForDisplay) as Channel[];
  const serverWithMembers = {
    ...currentServer,
    members,
  };

  const connectedVoiceCountsByChannelId = await listActiveVoiceCountsForServer({ serverId });
  const stageJoinedCount = stageChannel?.id
    ? connectedVoiceCountsByChannelId.get(stageChannel.id) ?? 0
    : 0;
  const hasHiddenChannels =
    serverProfileSettings?.hideAllChannels === true || hiddenChannelIdSet.size > 0;
  const areChannelsHidden = serverProfileSettings?.hideAllChannels === true;
  const hasAnyBaseChannels = unfilteredVisibleChannels.some((item) => {
    const normalizedName = String(item.name ?? "").trim().toLowerCase();
    return normalizedName !== "stage" && normalizedName !== "rules";
  });
  const hasVisibleRenderableChannels =
    ungroupedChannels.length > 0 ||
    (serverProfileSettings?.showChannelGroups !== false && groupedChannelGroupsWithChannels.length > 0);
  const shouldShowHiddenChannelsPlaceholder =
    areChannelsHidden || (hasHiddenChannels && hasAnyBaseChannels && !hasVisibleRenderableChannels);

  const serverWithBanner = {
    ...serverWithMembers,
    bannerUrl: bannerConfig?.url ?? null,
    bannerFit: bannerConfig?.fit ?? "cover",
    bannerScale: bannerConfig?.scale ?? 1,
  };
  const resolvedServerBannerUrl = resolveBannerUrl(serverWithBanner.bannerUrl);
  const serverBannerFit =
    serverWithBanner.bannerFit === "contain" || serverWithBanner.bannerFit === "scale"
      ? serverWithBanner.bannerFit
      : "cover";
  const serverBannerScale =
    typeof serverWithBanner.bannerScale === "number" && !Number.isNaN(serverWithBanner.bannerScale)
      ? Math.min(2, Math.max(0.25, serverWithBanner.bannerScale))
      : 1;

  const eventsCount = 0;
  const invitesCount = 0;

  return (
    <div className="theme-channels-rail flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-primary">
      <div className="px-3 pt-2 pb-2">
        <div className="relative overflow-hidden rounded-2xl">
          {resolvedServerBannerUrl ? (
            <>
              <img
                src={resolvedServerBannerUrl}
                alt={`${currentServer.name} banner`}
                className={`absolute inset-0 h-full w-full ${
                  serverBannerFit === "contain" ? "object-contain" : "object-cover"
                }`}
                style={
                  serverBannerFit === "scale"
                    ? { transform: `scale(${serverBannerScale})`, transformOrigin: "center" }
                    : undefined
                }
              />
              <div className="absolute inset-0 bg-black/15" />
            </>
          ) : (
            <div className="absolute inset-0 bg-[#1f2023]" />
          )}
          <ServerHeader
            serverId={serverId}
            serverName={currentServer.name}
            server={serverWithBanner}
            viewerProfileId={profile?.id ?? null}
            viewerMemberId={viewerMemberId}
            role={role}
            isServerOwner={isServerOwner}
            channelGroups={groupedChannelGroups}
            hasHiddenChannels={hasHiddenChannels}
            showBackgroundMedia={!resolvedServerBannerUrl}
          />
        </div>
        <ServerEventsMenu
          server={serverWithMembers}
          viewerProfileId={profile?.id ?? null}
          viewerMemberId={viewerMemberId}
          eventsCount={eventsCount}
          invitesCount={invitesCount}
          boostersCount={0}
          stageJoinedCount={stageJoinedCount}
          stageChannel={stageChannel}
          rulesChannel={rulesChannel}
        />
      </div>
      <ScrollArea className="settings-scrollbar min-h-0 flex-1 px-3 pt-3">
        {!areChannelsHidden && !!ungroupedChannels?.length && (
          <ChannelDropZone serverId={serverId} targetGroupId={null} className="mb-2">
            <ServerSection
              sectionType="channels"
              channelType={undefined}
              role={role}
              label="Channels"
              server={serverWithMembers}
              viewerProfileId={profile?.id ?? null}
              viewerMemberId={viewerMemberId}
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
                  hasUnreadMarker={unreadAnnouncementChannelIds.has(channel.id)}
                />
              ))}
            </div>
          </ChannelDropZone>
        )}

        {!areChannelsHidden && serverProfileSettings?.showChannelGroups !== false && groupedChannelGroupsWithChannels.length > 0 ? (
          <div className="mb-2">
            <ChannelGroupsList
              serverId={serverId}
              role={role}
              server={serverWithMembers}
              groups={groupedChannelGroupsWithChannels}
              connectedVoiceCountsByChannelId={Object.fromEntries(connectedVoiceCountsByChannelId)}
            />
          </div>
        ) : null}

        {shouldShowHiddenChannelsPlaceholder ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-background/40 px-3 py-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              All channels hidden
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              Use the server dropdown menu at the top to show them again or open a channel group from the new groups menu.
            </p>
          </div>
        ) : null}

        {false ? <div /> : null}
      </ScrollArea>

      <div className="border-t border-border/70 px-3 py-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-border/70 bg-background/50 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[clamp(0.5rem,1.2vw,0.625rem)] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Channels</p>
              <p className="shrink-0 text-[clamp(0.625rem,1.4vw,0.75rem)] font-semibold text-primary">{channelsCount}</p>
            </div>
          </div>
          <div className="rounded-md border border-border/70 bg-background/50 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[clamp(0.5rem,1.2vw,0.625rem)] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Groups</p>
              <p className="shrink-0 text-[clamp(0.625rem,1.4vw,0.75rem)] font-semibold text-primary">{channelGroupsCount}</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
