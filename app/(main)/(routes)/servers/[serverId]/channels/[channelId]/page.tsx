import { redirect } from "next/navigation";
import Link from "next/link";
import { Activity, Headphones, Mic, Video } from "lucide-react";
import { ChannelType } from "@/lib/db";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatInput } from "@/components/chat/chat-input";
import { LiveChannelMessagesPane } from "@/components/chat/live-channel-messages-pane";
import { VoiceStateSession } from "@/components/server/voice-state-session";
import { VideoChannelMeetingPanel } from "@/components/server/video-channel-meeting-panel";
import { MeetingParticipantsRail } from "@/components/server/meeting-participants-rail";
// import { MediaRoom } from "@/components/media-room";
import { channel, db, member, message, server } from "@/lib/db";
import {
  computeChannelPermissionForMember,
  resolveMemberContext,
  visibleChannelIdsForMember,
} from "@/lib/channel-permissions";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { getUserProfileNameMap } from "@/lib/user-profile";
import type { Member, Profile } from "@/lib/db/types";
import { listThreadsForMessages } from "@/lib/channel-threads";
import { listActiveVoiceMembersForChannel, pruneStaleVoiceStates } from "@/lib/voice-states";
import { resolveChannelRouteContext, resolveServerRouteContext } from "@/lib/route-slug-resolver";
import { buildChannelPath, buildServerPath } from "@/lib/route-slugs";
import { pickDefaultServerChannel } from "@/lib/default-server-channel";
import { MemberRole } from "@/lib/db/types";
import { markChannelRead } from "@/lib/channel-read-state";

interface ChannelIdPageProps {
  params: Promise<{
    serverId: string;
    channelId: string;
  }>;
  searchParams: Promise<{
    live?: string;
    meetingPopout?: string;
    popoutChat?: string;
  }>;
}

type ServerChannelRow = {
  id: string;
  name: string;
  type: ChannelType;
  createdAt: Date;
};

type ChannelMessageRow = {
  id: string;
  content: string;
  fileUrl: string | null;
  deleted: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  member?: (Member & {
    profile?: Profile | null;
  }) | null;
};

type ServerMemberRow = {
  id: string;
  profileId: string;
  role: string;
  createdAt: Date;
  profile: Profile | null;
};

type CurrentMemberRow = {
  id: string;
  serverId: string;
  profileId: string;
  role: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type CurrentChannelRow = {
  id: string;
  serverId: string;
  profileId: string;
  name: string;
  type: ChannelType;
  icon: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const normalizeMemberRole = (value: unknown): MemberRole => {
  const normalized = String(value ?? "").trim().toUpperCase();

  if (normalized === MemberRole.ADMIN || normalized === "ADMINISTRATOR") {
    return MemberRole.ADMIN;
  }

  if (normalized === MemberRole.MODERATOR) {
    return MemberRole.MODERATOR;
  }

  return MemberRole.GUEST;
};

const formatPostTimestamp = (value: Date | string) => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString();
};

const normalizeDateValue = (value: Date | string | null | undefined) => {
  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value ?? 0);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
};

const ChannelIdPage = async ({ params, searchParams }: ChannelIdPageProps) => {
  const perfStart = Date.now();
  const isPerfLoggingEnabled = process.env.NODE_ENV !== "production";
  const { serverId: serverParam, channelId: channelParam } = await params;
  const resolvedSearchParams = await searchParams;

  const profile = await currentProfile();

  if (!profile) {
    return redirect("/sign-in");
  }

  const resolvedServer = await resolveServerRouteContext({
    profileId: profile.id,
    serverParam,
  });

  if (!resolvedServer) {
    redirect("/");
  }

  const serverId = resolvedServer.id;
  const serverPath = buildServerPath({ id: resolvedServer.id, name: resolvedServer.name });

  const currentMemberRows = await db.execute(sql`
    select
      m."id" as "id",
      m."serverId" as "serverId",
      m."profileId" as "profileId",
      m."role" as "role",
      m."createdAt" as "createdAt",
      m."updatedAt" as "updatedAt"
    from "Member" m
    where m."serverId" = ${serverId}
      and m."profileId" = ${profile.id}
    limit 1
  `);

  const currentMemberRow = ((currentMemberRows as unknown as { rows?: CurrentMemberRow[] }).rows ?? [])[0] ?? null;

  if (!currentMemberRow) {
    redirect("/");
  }

  const currentMember: Member = {
    id: currentMemberRow.id,
    serverId: currentMemberRow.serverId,
    profileId: currentMemberRow.profileId,
    role: normalizeMemberRole(currentMemberRow.role),
    createdAt: normalizeDateValue(currentMemberRow.createdAt),
    updatedAt: normalizeDateValue(currentMemberRow.updatedAt),
  };

  const serverOwner = await db
    .select({ id: server.id })
    .from(server)
    .where(and(eq(server.id, serverId), eq(server.profileId, profile.id)))
    .limit(1);

  const resolveDefaultVisibleChannelPath = async () => {
    const channels: ServerChannelRow[] = await db
      .select({ id: channel.id, name: channel.name, type: channel.type, createdAt: channel.createdAt })
      .from(channel)
      .where(eq(channel.serverId, serverId))
      .orderBy(asc(channel.createdAt));

    const visibleIds = memberContext
      ? await visibleChannelIdsForMember({
          serverId,
          memberContext,
          channelIds: channels.map((item) => item.id),
        })
      : new Set(channels.map((item) => item.id));

    const visibleChannels = channels.filter((item) => visibleIds.has(item.id));
    const defaultChannel = pickDefaultServerChannel(visibleChannels);

    if (!defaultChannel) {
      return null;
    }

    return buildChannelPath({
      server: { id: serverId, name: resolvedServer.name },
      channel: { id: defaultChannel.id, name: defaultChannel.name },
    });
  };

  const resolvedChannel = await resolveChannelRouteContext({
    serverId,
    channelParam,
  });

  if (!resolvedChannel) {
    const defaultChannelPath = await resolveDefaultVisibleChannelPath();
    redirect(defaultChannelPath ?? serverPath);
  }

  const channelId = resolvedChannel.id;

  if (isPerfLoggingEnabled) {
    console.info(
      `[PERF][ChannelPage] auth+params ${Date.now() - perfStart}ms server=${serverId} channel=${channelId}`
    );
  }

  const currentChannelRows = await db.execute(sql`
    select
      c."id" as "id",
      c."serverId" as "serverId",
      c."profileId" as "profileId",
      c."name" as "name",
      c."type" as "type",
      c."icon" as "icon",
      c."createdAt" as "createdAt",
      c."updatedAt" as "updatedAt"
    from "Channel" c
    where c."id" = ${channelId}
      and c."serverId" = ${serverId}
    limit 1
  `);

  const currentChannel = ((currentChannelRows as unknown as { rows?: CurrentChannelRow[] }).rows ?? [])[0] ?? null;

  if (!currentChannel) {
    redirect("/");
  }

  const meetingOwnerProfileId = currentChannel.profileId;

  const isMediaChannel =
    currentChannel.type === ChannelType.AUDIO || currentChannel.type === ChannelType.VIDEO;
  const isTextLikeChannel =
    currentChannel.type === ChannelType.TEXT || currentChannel.type === ChannelType.ANNOUNCEMENT;

  const channelTopic = null;

  const memberContext = await resolveMemberContext({
    profileId: profile.id,
    serverId,
  });

  const channelPermissions = memberContext
    ? await computeChannelPermissionForMember({
        serverId,
        channelId: currentChannel.id,
        memberContext,
      })
    : { allowView: false, allowSend: false, allowConnect: false };

  const isLiveSessionRequested = String(resolvedSearchParams?.live ?? "").toLowerCase() === "true";
  const isLiveSessionSuppressed = ["false", "0", "no"].includes(
    String(resolvedSearchParams?.live ?? "").toLowerCase()
  );
  const isMeetingPopoutRequested = ["true", "1", "yes"].includes(
    String(resolvedSearchParams?.meetingPopout ?? "").toLowerCase()
  );
  const isPopoutChatRequested = ["true", "1", "yes"].includes(
    String(resolvedSearchParams?.popoutChat ?? "").toLowerCase()
  );

  if (isMediaChannel) {
    await pruneStaleVoiceStates();
  }

  const connectedVoiceMembers = isMediaChannel
    ? await listActiveVoiceMembersForChannel({
        serverId,
        channelId: currentChannel.id,
      })
    : [];

  if (!channelPermissions.allowView) {
    const defaultChannelPath = await resolveDefaultVisibleChannelPath();
    redirect(defaultChannelPath ?? serverPath);
  }

  if (currentChannel.type === ChannelType.ANNOUNCEMENT) {
    await markChannelRead({
      channelId: currentChannel.id,
      profileId: profile.id,
    });
  }

  const canonicalChannelPath = buildChannelPath({
    server: { id: serverId, name: resolvedServer.name },
    channel: { id: currentChannel.id, name: currentChannel.name },
  });

  const channelMessageRows = await db.execute(sql`
    select
      msg."id" as "id",
      msg."content" as "content",
      msg."fileUrl" as "fileUrl",
      msg."deleted" as "deleted",
      msg."createdAt" as "createdAt",
      msg."updatedAt" as "updatedAt",
      m."id" as "memberId",
      m."serverId" as "memberServerId",
      m."profileId" as "memberProfileId",
      m."role" as "memberRole",
      m."createdAt" as "memberCreatedAt",
      m."updatedAt" as "memberUpdatedAt",
      u."userId" as "profileUserId",
      u."name" as "profileName",
      u."email" as "profileEmail",
      coalesce(u."avatarUrl", u."avatar", u."icon") as "profileImageUrl",
      u."createdAt" as "profileCreatedAt",
      u."lastLogin" as "profileUpdatedAt"
    from "Message" msg
    left join "Member" m on m."id" = msg."memberId"
    left join "Users" u on u."userId" = m."profileId"
    where msg."channelId" = ${currentChannel.id}
      and msg."threadId" is null
    order by msg."createdAt" asc
  `);

  const channelMessages: ChannelMessageRow[] = (((channelMessageRows as unknown as {
    rows?: Array<{
      id: string;
      content: string | null;
      fileUrl: string | null;
      deleted: boolean | null;
      createdAt: Date | string;
      updatedAt: Date | string;
      memberId: string | null;
      memberServerId: string | null;
      memberProfileId: string | null;
      memberRole: string | null;
      memberCreatedAt: Date | string | null;
      memberUpdatedAt: Date | string | null;
      profileUserId: string | null;
      profileName: string | null;
      profileEmail: string | null;
      profileImageUrl: string | null;
      profileCreatedAt: Date | string | null;
      profileUpdatedAt: Date | string | null;
    }>;
  }).rows ?? []).map((row) => ({
    id: String(row.id ?? "").trim(),
    content: String(row.content ?? ""),
    fileUrl: typeof row.fileUrl === "string" ? row.fileUrl : null,
    deleted: Boolean(row.deleted),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    member: row.memberId
      ? {
          id: String(row.memberId).trim(),
          serverId: String(row.memberServerId ?? serverId).trim() || serverId,
          profileId: String(row.memberProfileId ?? "").trim(),
          role: normalizeMemberRole(row.memberRole),
          createdAt: normalizeDateValue(row.memberCreatedAt),
          updatedAt: normalizeDateValue(row.memberUpdatedAt),
          profile: row.memberProfileId
            ? {
                id: String(row.memberProfileId).trim(),
                userId: String(row.profileUserId ?? row.memberProfileId).trim() || String(row.memberProfileId).trim(),
                name: String(row.profileName ?? row.profileEmail ?? "Deleted User").trim() || "Deleted User",
                email: row.profileEmail ?? "",
                imageUrl: String(row.profileImageUrl ?? "/in-accord-steampunk-logo.png").trim() || "/in-accord-steampunk-logo.png",
                createdAt: normalizeDateValue(row.profileCreatedAt),
                updatedAt: normalizeDateValue(row.profileUpdatedAt),
              }
            : null,
        }
      : null,
  })));

  if (isPerfLoggingEnabled) {
    console.info(
      `[PERF][ChannelPage] messages ${Date.now() - perfStart}ms server=${serverId} channel=${channelId} count=${channelMessages.length}`
    );
  }

  const reactionRows = channelMessages.length
    ? await db.execute(sql`
        select "messageId", "emoji", "count"
        from "MessageReaction"
        where "scope" = 'channel'
          and "messageId" in (${sql.join(
            channelMessages.map((item) => sql`${item.id}`),
            sql`, `
          )})
      `)
    : { rows: [] };

  const reactionMap = new Map<string, Array<{ emoji: string; count: number }>>();
  for (const row of ((reactionRows as unknown as {
    rows?: Array<{ messageId: string; emoji: string; count: number }>;
  }).rows ?? [])) {
    const bucket = reactionMap.get(row.messageId) ?? [];
    bucket.push({ emoji: row.emoji, count: Number(row.count ?? 0) });
    reactionMap.set(row.messageId, bucket);
  }

  const messageProfileIds = channelMessages
    .map((item) => item.member?.profileId)
    .filter((value): value is string => Boolean(value));

  const profileNameMap = await getUserProfileNameMap(messageProfileIds);

  const uniqueMessageProfileIds = Array.from(
    new Set(messageProfileIds)
  );

  const profileRoleRows = uniqueMessageProfileIds.length
    ? await db.execute(sql`
        select "userId", "role"
        from "Users"
        where "userId" in (${sql.join(uniqueMessageProfileIds.map((id) => sql`${id}`), sql`, `)})
      `)
    : { rows: [] };

  const profileRoleMap = new Map<string, string | null>(
    ((profileRoleRows as unknown as {
      rows?: Array<{ userId: string; role: string | null }>;
    }).rows ?? []).map((row) => [row.userId, row.role ?? null])
  );

  const serverMemberRows = await db.execute(sql`
    select
      m."id" as "id",
      m."profileId" as "profileId",
      m."role" as "role",
      m."createdAt" as "createdAt",
      u."userId" as "profileUserId",
      u."name" as "profileName",
      u."email" as "profileEmail",
      coalesce(u."avatarUrl", u."avatar", u."icon") as "profileImageUrl",
      u."createdAt" as "profileCreatedAt",
      u."lastLogin" as "profileUpdatedAt"
    from "Member" m
    left join "Users" u on u."userId" = m."profileId"
    where m."serverId" = ${serverId}
    order by m."createdAt" asc
  `);

  const serverMembers: ServerMemberRow[] = (((serverMemberRows as unknown as {
    rows?: Array<{
      id: string;
      profileId: string;
      role: string | null;
      createdAt: Date | string;
      profileUserId: string | null;
      profileName: string | null;
      profileEmail: string | null;
      profileImageUrl: string | null;
      profileCreatedAt: Date | string | null;
      profileUpdatedAt: Date | string | null;
    }>;
  }).rows ?? []).map((row) => ({
    id: String(row.id ?? "").trim(),
    profileId: String(row.profileId ?? "").trim(),
    role: normalizeMemberRole(row.role),
    createdAt: normalizeDateValue(row.createdAt),
    profile: row.profileId
      ? {
          id: String(row.profileId).trim(),
          userId: String(row.profileUserId ?? row.profileId).trim() || String(row.profileId).trim(),
          name: String(row.profileName ?? row.profileEmail ?? "Deleted User").trim() || "Deleted User",
          email: row.profileEmail ?? "",
          imageUrl: String(row.profileImageUrl ?? "/in-accord-steampunk-logo.png").trim() || "/in-accord-steampunk-logo.png",
          createdAt: normalizeDateValue(row.profileCreatedAt),
          updatedAt: normalizeDateValue(row.profileUpdatedAt),
        }
      : null,
  })));

  const mentionProfileNameMap = await getUserProfileNameMap(serverMembers.map((item) => item.profileId));

  const mediaPresenceRows = isMediaChannel
    ? await db.execute(sql`
        select
          m."id" as "memberId",
          m."profileId" as "profileId",
          m."role" as "role",
          up."presenceStatus" as "presenceStatus",
          u."name" as "name",
          u."email" as "email"
        from "Member" m
        left join "Users" u on u."userId" = m."profileId"
        left join "UserProfile" up on up."userId" = m."profileId"
        where m."serverId" = ${serverId}
      `)
    : { rows: [] };

  const mediaMembers = ((mediaPresenceRows as unknown as {
    rows?: Array<{
      memberId: string;
      profileId: string;
      role: string | null;
      presenceStatus: string | null;
      name: string | null;
      email: string | null;
    }>;
  }).rows ?? []).map((row) => {
    const normalizedPresence = String(row.presenceStatus ?? "OFFLINE").toUpperCase();

    return {
      memberId: row.memberId,
      profileId: row.profileId,
      displayName:
        row.name?.trim() ||
        mentionProfileNameMap.get(row.profileId) ||
        row.email?.trim() ||
        "Deleted User",
      presenceStatus: normalizedPresence,
    };
  });

  const visibleMediaMembers = mediaMembers.filter(
    (item) => item.profileId === profile.id || item.presenceStatus !== "INVISIBLE"
  );
  const connectedMediaMemberIds = new Set(connectedVoiceMembers.map((item) => item.memberId));
  const availableMediaMembers = visibleMediaMembers
    .filter((item) => item.profileId !== profile.id)
    .filter((item) => !connectedMediaMemberIds.has(item.memberId))
    .filter((item) => item.presenceStatus !== "OFFLINE")
    .slice(0, 10);

  const mentionUsers = serverMembers.map((item) => {
    const resolvedName =
      mentionProfileNameMap.get(item.profileId) ??
      item.profile?.name ??
      item.profile?.email ??
      "Deleted User";

    return {
      id: item.profileId,
      label: resolvedName,
    };
  });

  const roleRows = await db.execute(sql`
    select "id", "name"
    from "ServerRole"
    where "serverId" = ${serverId}
      and "isMentionable" = true
    order by "position" asc, "name" asc
  `);

  const mentionRoles = ((roleRows as unknown as { rows?: Array<{ id: string; name: string }> }).rows ?? [])
    .map((row) => ({
      id: String(row.id ?? "").trim(),
      label: String(row.name ?? "").trim(),
    }))
    .filter((row) => row.id && row.label);

  const memberDetailsByProfileId = new Map(
    serverMembers.map((item) => {
      const profileDisplayName =
        mentionProfileNameMap.get(item.profileId) ??
        item.profile?.name ??
        item.profile?.email ??
        "Deleted User";

      return [
        item.profileId,
        {
          profileImageUrl: item.profile?.imageUrl ?? "/in-accord-steampunk-logo.png",
          displayName: profileDisplayName,
        },
      ] as const;
    })
  );

  const hydratedChannelMessages = channelMessages.map((item) => {
    const fallbackProfileId =
      item.member?.profileId ??
      (typeof (item as { memberId?: unknown }).memberId === "string"
        ? ((item as { memberId?: string }).memberId as string)
        : `missing-member-${item.id}`);
    const profileName = profileNameMap.get(fallbackProfileId);

    const sourceProfile = item.member?.profile;
    const safeProfile: Profile & { role?: string | null } = {
      id: sourceProfile?.id ?? fallbackProfileId,
      userId: sourceProfile?.userId ?? sourceProfile?.id ?? fallbackProfileId,
      name: profileName ?? sourceProfile?.name ?? sourceProfile?.email ?? "Deleted User",
      imageUrl: sourceProfile?.imageUrl ?? "/in-accord-steampunk-logo.png",
      email: sourceProfile?.email ?? "",
      role: profileRoleMap.get(fallbackProfileId) ?? null,
      createdAt: sourceProfile?.createdAt ?? new Date(0),
      updatedAt: sourceProfile?.updatedAt ?? new Date(0),
    };

    const safeMember: Member & { profile: Profile & { role?: string | null } } = {
      ...(item.member ?? {}),
      id:
        item.member?.id ??
        (typeof (item as { memberId?: unknown }).memberId === "string"
          ? ((item as { memberId?: string }).memberId as string)
          : `missing-member-${item.id}`),
      profileId: item.member?.profileId ?? fallbackProfileId,
      role: normalizeMemberRole(item.member?.role),
      serverId: item.member?.serverId ?? serverId,
      createdAt: normalizeDateValue(item.member?.createdAt ?? item.createdAt),
      updatedAt: normalizeDateValue(item.member?.updatedAt ?? item.updatedAt),
      profile: safeProfile,
    };

    return {
      ...item,
      member: safeMember,
    };
  });

  const threadBySourceMessageId = await listThreadsForMessages({
    serverId,
    channelId: currentChannel.id,
    sourceMessageIds: hydratedChannelMessages.map((item) => item.id),
    viewerProfileId: profile.id,
  });

  if (isPerfLoggingEnabled) {
    console.info(
      `[PERF][ChannelPage] done ${Date.now() - perfStart}ms server=${serverId} channel=${channelId}`
    );
  }

  const lastChannelMessageId = hydratedChannelMessages[hydratedChannelMessages.length - 1]?.id ?? "none";

  const isAudioChannel = currentChannel.type === ChannelType.AUDIO;
  const isVideoChannel = currentChannel.type === ChannelType.VIDEO;
  const currentMemberRole = normalizeMemberRole(currentMember.role);
  const canPublishAnnouncement =
    currentChannel.type !== ChannelType.ANNOUNCEMENT || currentMemberRole !== MemberRole.GUEST;
  const canSendToChannel = channelPermissions.allowSend && canPublishAnnouncement;
  const mediaChannelLabel = isAudioChannel ? "Voice" : "Video";
  const isLiveSession =
    channelPermissions.allowConnect &&
    (isLiveSessionRequested || (isVideoChannel && !isLiveSessionSuppressed));
  const isMeetingPopoutView = isVideoChannel && isMeetingPopoutRequested;
  const isVideoPopoutChatMode = isVideoChannel && isPopoutChatRequested && !isMeetingPopoutView;
  const normalizedChannelIcon = String((currentChannel as { icon?: string | null }).icon ?? "").trim();
  const canBulkDeleteMessages =
    Boolean(memberContext?.isServerOwner) ||
    currentMemberRole === MemberRole.ADMIN ||
    hasInAccordAdministrativeAccess(profile.role);
  const initialLiveMessages = hydratedChannelMessages.map((item) => ({
    id: item.id,
    content: item.content,
    member: item.member,
    fileUrl: item.fileUrl,
    deleted: item.deleted,
    timestamp: formatPostTimestamp(item.createdAt),
    isUpdated: new Date(item.updatedAt).getTime() !== new Date(item.createdAt).getTime(),
  }));
  const initialLiveReactions = Object.fromEntries(Array.from(reactionMap.entries()));
  const initialLiveThreads = Object.fromEntries(
    Array.from(threadBySourceMessageId.entries()).map(([key, value]) => [
      key,
      value
        ? {
            id: value.id,
            title: value.title,
            replyCount: value.replyCount,
            archived: value.archived,
            participantCount: value.participantCount,
            unreadCount: value.unreadCount,
          }
        : null,
    ])
  );
  return (
    <div className={`flex h-full min-h-0 flex-col gap-2 ${isMeetingPopoutView ? "fixed inset-0 z-200 bg-[#0f1013] p-0" : ""}`}>
      <div className={`theme-server-chat-surface flex min-h-0 flex-1 flex-col overflow-hidden ${
        isMeetingPopoutView
          ? "rounded-none border-0 bg-transparent shadow-none"
          : "rounded-3xl border border-border bg-background shadow-xl shadow-black/35"
      }`}>
        {isMeetingPopoutView ? null : (
          <ChatHeader
            channelId={currentChannel.id}
            channelPath={canonicalChannelPath}
            channelIcon={(currentChannel as { icon?: string | null }).icon ?? null}
            name={currentChannel.name}
            topic={channelTopic}
            serverId={currentChannel.serverId}
            type="channel"
          />
        )}

        {isTextLikeChannel || isVideoPopoutChatMode ? null : (
          <div className={`${isMeetingPopoutView ? "w-full p-2" : "w-full border-b border-border/60 p-4"} ${isVideoChannel && !isMeetingPopoutView ? "max-h-[58vh] overflow-y-auto" : ""}`}>
            <VoiceStateSession
              serverId={serverId}
              channelId={currentChannel.id}
              active={isLiveSession}
              isVideoChannel={isVideoChannel}
              showUi={false}
            />
            <div className={`mx-auto w-full ${isMeetingPopoutView ? "max-w-none rounded-none border-0 bg-transparent p-0 shadow-none" : isVideoChannel ? "max-w-6xl rounded-[26px] border border-border/80 bg-card p-5 shadow-xl shadow-black/30" : "max-w-3xl rounded-2xl border border-border bg-card p-5 shadow-lg shadow-black/20"}`}>
              {isMeetingPopoutView ? null : (
              <p className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {normalizedChannelIcon ? (
                  <span className="inline-flex h-5 w-5 items-center justify-center text-base leading-none text-zinc-500 dark:text-zinc-300">
                    {normalizedChannelIcon}
                  </span>
                ) : isAudioChannel ? (
                  <Mic className="h-4 w-4 text-zinc-500 dark:text-zinc-300" />
                ) : (
                  <Video className="h-4 w-4 text-zinc-500 dark:text-zinc-300" />
                )}
                {mediaChannelLabel} Channel - {currentChannel.name}
              </p>
              )}

              {isVideoChannel ? (
                <VideoChannelMeetingPanel
                  serverId={serverId}
                  channelId={currentChannel.id}
                  channelPath={canonicalChannelPath}
                  meetingPopoutPath={`/meeting-popout/${encodeURIComponent(resolvedServer.segment)}/${encodeURIComponent(resolvedChannel.segment)}`}
                  meetingName={currentChannel.name}
                  canConnect={channelPermissions.allowConnect}
                  isLiveSession={isLiveSession}
                  isPopoutView={isMeetingPopoutView}
                  hideParticipantsSidebar
                  hideParticipantStrip
                  currentProfileId={profile.id}
                  meetingCreatorProfileId={meetingOwnerProfileId}
                  connectedMembers={connectedVoiceMembers.map((item) => ({
                    memberId: item.memberId,
                    profileId: item.profileId,
                    displayName: item.displayName,
                    profileImageUrl: item.profileImageUrl,
                    isMuted: item.isMuted,
                    isCameraOn: item.isCameraOn,
                    isStreaming: item.isStreaming,
                    streamLabel: item.streamLabel,
                    isSpeaking: item.isSpeaking,
                  }))}
                  availableMembers={availableMediaMembers.map((item) => ({
                    memberId: item.memberId,
                    displayName: item.displayName,
                    presenceStatus: item.presenceStatus,
                  }))}
                />
              ) : (
                <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {isAudioChannel
                    ? `Join #${currentChannel.name} to talk with members in real time.`
                    : `Join #${currentChannel.name} to talk and share camera in real time.`}
                </div>
              )}

              {isVideoChannel ? null : !channelPermissions.allowConnect ? (
                <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  You can view this channel, but you do not have permission to connect.
                </div>
              ) : isLiveSession ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                    Connected to #{currentChannel.name}. You are now in this {mediaChannelLabel.toLowerCase()} channel.
                  </div>
                  <ul className="space-y-1 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300">
                    <li>• Mute / unmute your microphone</li>
                    <li>• Deafen / undeafen incoming audio</li>
                    <li>• Switch channels anytime from the channel list.</li>
                  </ul>

                  <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300">
                    <p className="mb-2 font-semibold text-zinc-800 dark:text-zinc-100">Connected now</p>
                    {connectedVoiceMembers.length ? (
                      <ul className="space-y-1.5">
                        {connectedVoiceMembers.map((item) => (
                          <li
                            key={item.memberId}
                            className="flex items-center justify-between rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-emerald-200">
                                {item.profileId === profile.id ? "You" : item.displayName}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <span className="rounded-full border border-emerald-400/50 bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-200">
                                  Connected
                                </span>
                                {item.isMuted ? (
                                  <span className="rounded-full border border-rose-400/50 bg-rose-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-rose-200">
                                    Muted
                                  </span>
                                ) : null}
                                {item.isDeafened ? (
                                  <span className="rounded-full border border-rose-400/50 bg-rose-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-rose-200">
                                    Deafened
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Connecting... waiting for channel presence update.
                      </p>
                    )}
                  </div>
                  <Link
                    href={canonicalChannelPath}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300/40 bg-zinc-200/70 px-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-300/80 dark:border-zinc-600/70 dark:bg-zinc-700/60 dark:text-zinc-100 dark:hover:bg-zinc-600/70"
                  >
                    Disconnect
                  </Link>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-200">
                    Not connected yet. Click below to join this {mediaChannelLabel.toLowerCase()} channel.
                  </div>
                  <ul className="space-y-1 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300">
                    <li>• Talk instantly with people in this channel</li>
                    <li>• Members can join/leave without sending messages.</li>
                    <li>• Channel chat is available below.</li>
                  </ul>

                  <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300">
                    <p className="mb-2 font-semibold text-zinc-800 dark:text-zinc-100">Available to join</p>
                    {availableMediaMembers.length ? (
                      <ul className="space-y-1.5">
                        {availableMediaMembers.map((item) => (
                          <li
                            key={item.memberId}
                            className="flex items-center justify-between rounded-md border border-border/50 bg-background/70 px-2 py-1.5"
                          >
                            <span className="truncate">{item.displayName}</span>
                            <span className="ml-2 shrink-0 rounded-full border border-zinc-500/50 bg-zinc-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-300">
                              {item.presenceStatus}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        No one else is currently online in this server.
                      </p>
                    )}
                  </div>
                  <Link
                    href={`${canonicalChannelPath}?live=true`}
                    className="inline-flex h-9 items-center justify-center rounded-md bg-indigo-500 px-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
                  >
                    Connect to {mediaChannelLabel}
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {isMeetingPopoutView ? null : isVideoChannel && !isVideoPopoutChatMode ? (
          <div className="grid min-h-0 flex-1 gap-4 border-t border-border/60 p-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-h-0 rounded-[22px] border border-border/80 bg-background/55 shadow-lg shadow-black/25">
              <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[22px]">
                <LiveChannelMessagesPane
                  initialMessages={initialLiveMessages}
                  initialReactionsByMessageId={initialLiveReactions}
                  initialThreadsBySourceMessageId={initialLiveThreads}
                  currentMember={currentMember}
                  currentProfile={profile}
                  socketUrl="/api/socket/messages"
                  socketQuery={{ channelId: currentChannel.id, serverId: currentChannel.serverId }}
                  serverId={currentChannel.serverId}
                  channelId={currentChannel.id}
                  emptyState={
                    isMediaChannel
                      ? `No chat messages yet in #${currentChannel.name}. Say hi below.`
                      : `No messages yet. Start the conversation in #${currentChannel.name}.`
                  }
                  className="flex-1 overflow-y-auto"
                  canPurgeDeletedMessage={canBulkDeleteMessages}
                />
              </div>
            </div>

            <MeetingParticipantsRail
              serverId={serverId}
              channelId={currentChannel.id}
              currentProfileId={profile.id}
              initialMembers={connectedVoiceMembers.map((item) => ({
                memberId: item.memberId,
                profileId: item.profileId,
                displayName: item.displayName,
                isSpeaking: item.isSpeaking,
                isMuted: item.isMuted,
                isDeafened: item.isDeafened,
                isCameraOn: item.isCameraOn,
                isStreaming: item.isStreaming,
                streamLabel: item.streamLabel,
              }))}
              memberDetailsByProfileId={Object.fromEntries(memberDetailsByProfileId)}
            />
          </div>
        ) : (
          <>
          <LiveChannelMessagesPane
            initialMessages={initialLiveMessages}
            initialReactionsByMessageId={initialLiveReactions}
            initialThreadsBySourceMessageId={initialLiveThreads}
            currentMember={currentMember}
            currentProfile={profile}
            socketUrl="/api/socket/messages"
            socketQuery={{ channelId: currentChannel.id, serverId: currentChannel.serverId }}
            serverId={currentChannel.serverId}
            channelId={currentChannel.id}
            emptyState={
              isMediaChannel
                ? `No chat messages yet in #${currentChannel.name}. Say hi below.`
                : `No messages yet. Start the conversation in #${currentChannel.name}.`
            }
            className="flex-1 overflow-y-auto"
            canPurgeDeletedMessage={canBulkDeleteMessages}
          />
          </>
        )}
      </div>

      {isMeetingPopoutView || isVideoChannel ? null : (
        <div className="theme-server-chat-bar w-[calc(100vw-584px)] max-w-full rounded-2xl border border-border bg-card shadow-lg shadow-black/25">
          <ChatInput
            name={currentChannel.name}
            type="channel"
            apiUrl="/api/socket/messages"
            query={{
              channelId: currentChannel.id,
              serverId: currentChannel.serverId,
            }}
            disabled={!canSendToChannel}
            mentionUsers={mentionUsers}
            mentionRoles={mentionRoles}
            canBulkDeleteMessages={canBulkDeleteMessages}
          />
        </div>
      )}

      {isMeetingPopoutView || !isVideoChannel ? null : (
        <div className="theme-server-chat-bar w-full max-w-full rounded-[22px] border border-border/80 bg-card shadow-xl shadow-black/30">
          <ChatInput
            name={currentChannel.name}
            type="channel"
            apiUrl="/api/socket/messages"
            query={{
              channelId: currentChannel.id,
              serverId: currentChannel.serverId,
            }}
            disabled={!canSendToChannel}
            mentionUsers={mentionUsers}
            mentionRoles={mentionRoles}
            canBulkDeleteMessages={canBulkDeleteMessages}
          />
        </div>
      )}

      {currentChannel.type === ChannelType.ANNOUNCEMENT && currentMemberRole === MemberRole.GUEST ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          This announcement channel is read-only for guests. Moderators and server managers can publish updates here.
        </div>
      ) : null}
    </div>
  );
};

export default ChannelIdPage;
