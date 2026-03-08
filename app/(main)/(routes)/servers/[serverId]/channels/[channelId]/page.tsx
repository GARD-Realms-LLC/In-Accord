import { redirect } from "next/navigation";
import { ChannelType } from "@/lib/db";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatItem } from "@/components/chat/chat-item";
import { ChatScrollBox } from "@/components/chat/chat-scroll-box";
import { ChatLiveRefresh } from "@/components/chat/chat-live-refresh";
// import { MediaRoom } from "@/components/media-room";
import { channel, db, member, message } from "@/lib/db";
import { computeChannelPermissionForRole } from "@/lib/channel-permissions";
import { resolveMemberContext } from "@/lib/channel-permissions";
import { getUserProfileNameMap } from "@/lib/user-profile";
import type { Profile } from "@/lib/db/types";
import { listThreadsForMessages } from "@/lib/channel-threads";

interface ChannelIdPageProps {
  params: Promise<{
    serverId: string;
    channelId: string;
  }>;
}

const ChannelIdPage = async ({ params }: ChannelIdPageProps) => {
  const perfStart = Date.now();
  const isPerfLoggingEnabled = process.env.NODE_ENV !== "production";
  const { serverId, channelId } = await params;

  const profile = await currentProfile();

  if (!profile) {
    return redirect("/sign-in");
  }

  if (isPerfLoggingEnabled) {
    console.info(
      `[PERF][ChannelPage] auth+params ${Date.now() - perfStart}ms server=${serverId} channel=${channelId}`
    );
  }

  const currentChannel = await db.query.channel.findFirst({
    where: eq(channel.id, channelId),
  });

  const currentMember = await db.query.member.findFirst({
    where: and(
      eq(member.serverId, serverId),
      eq(member.profileId, profile.id)
    ),
  });

  if (!currentChannel || !currentMember) {
    redirect("/");
  }

  const topicResult = await db.execute(sql`
    select "topic"
    from "ChannelTopic"
    where "channelId" = ${currentChannel.id}
      and "serverId" = ${currentChannel.serverId}
    limit 1
  `);

  const channelTopic = (topicResult as unknown as {
    rows?: Array<{ topic: string | null }>;
  }).rows?.[0]?.topic ?? null;

  const memberContext = await resolveMemberContext({
    profileId: profile.id,
    serverId,
  });

  const channelPermissions = await computeChannelPermissionForRole({
    serverId,
    channelId: currentChannel.id,
    role: currentMember.role,
    isServerOwner: memberContext?.isServerOwner ?? false,
  });

  if (!channelPermissions.allowView) {
    redirect(`/servers/${serverId}`);
  }

  const channelMessages = await db.query.message.findMany({
    where: and(eq(message.channelId, currentChannel.id), isNull(message.threadId)),
    orderBy: [asc(message.createdAt)],
    with: {
      member: {
        with: {
          profile: true,
        },
      },
    },
  });

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

  const profileNameMap = await getUserProfileNameMap(
    channelMessages.map((item) => item.member.profileId)
  );

  const uniqueMessageProfileIds = Array.from(
    new Set(channelMessages.map((item) => item.member.profileId).filter(Boolean))
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

  const serverMembers = await db.query.member.findMany({
    where: eq(member.serverId, serverId),
    with: {
      profile: true,
    },
    orderBy: [asc(member.createdAt)],
  });

  const mentionProfileNameMap = await getUserProfileNameMap(serverMembers.map((item) => item.profileId));

  const mentionUsers = serverMembers.map((item) => {
    const resolvedName =
      mentionProfileNameMap.get(item.profileId) ??
      item.profile.name ??
      item.profile.email ??
      "User";

    return {
      id: item.profileId,
      label: resolvedName,
    };
  });

  const roleRows = await db.execute(sql`
    select "id", "name"
    from "ServerRole"
    where "serverId" = ${serverId}
    order by "position" asc, "name" asc
  `);

  const mentionRoles = ((roleRows as unknown as { rows?: Array<{ id: string; name: string }> }).rows ?? [])
    .map((row) => ({
      id: String(row.id ?? "").trim(),
      label: String(row.name ?? "").trim(),
    }))
    .filter((row) => row.id && row.label);

  const hydratedChannelMessages = channelMessages.map((item) => {
    const profileName = profileNameMap.get(item.member.profileId);
    const safeProfile: Profile & { role?: string | null } = {
      id: item.member.profile.id,
      userId: item.member.profile.userId ?? item.member.profile.id,
      name: profileName ?? item.member.profile.name ?? item.member.profile.email ?? "User",
      imageUrl: item.member.profile.imageUrl ?? "/in-accord-steampunk-logo.png",
      email: item.member.profile.email ?? "",
      role: profileRoleMap.get(item.member.profileId) ?? null,
      createdAt: item.member.profile.createdAt ?? new Date(0),
      updatedAt: item.member.profile.updatedAt ?? new Date(0),
    };

    return {
      ...item,
      member: {
        ...item.member,
        profile: safeProfile,
      },
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="theme-server-chat-surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-xl shadow-black/35">
        <ChatHeader
          channelId={currentChannel.id}
          channelIcon={(currentChannel as { icon?: string | null }).icon ?? null}
          name={currentChannel.name}
          topic={channelTopic}
          serverId={currentChannel.serverId}
          type="channel"
        />

        {currentChannel.type === ChannelType.TEXT ? (
          <>
          <ChatLiveRefresh />
          <ChatScrollBox
            className="flex-1 overflow-y-auto"
            scrollKey={`${currentChannel.id}:${hydratedChannelMessages.length}:${lastChannelMessageId}`}
            forceStickToBottom
          >
            {hydratedChannelMessages.length === 0 ? (
              <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400">
                No messages yet. Start the conversation in #{currentChannel.name}.
              </div>
            ) : (
              hydratedChannelMessages.map((item) => (
                <ChatItem
                  key={item.id}
                  id={item.id}
                  content={item.content}
                  member={item.member}
                  timestamp={new Date(item.createdAt).toLocaleString()}
                  fileUrl={item.fileUrl}
                  deleted={item.deleted}
                  currentMember={currentMember}
                  isUpdated={new Date(item.updatedAt).getTime() !== new Date(item.createdAt).getTime()}
                  socketUrl="/api/socket/messages"
                  socketQuery={{
                    channelId: currentChannel.id,
                    serverId: currentChannel.serverId,
                  }}
                  reactionScope="channel"
                  initialReactions={reactionMap.get(item.id) ?? []}
                  serverId={currentChannel.serverId}
                  channelId={currentChannel.id}
                  thread={threadBySourceMessageId.get(item.id) ?? null}
                />
              ))
            )}
          </ChatScrollBox>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
            This channel type does not use text chat.
          </div>
        )}
      </div>

      {currentChannel.type === ChannelType.TEXT ? (
        <div className="theme-server-chat-bar w-[calc(100vw-584px)] max-w-full rounded-2xl border border-border bg-card shadow-lg shadow-black/25">
          <ChatInput
            name={currentChannel.name}
            type="channel"
            apiUrl="/api/socket/messages"
            query={{
              channelId: currentChannel.id,
              serverId: currentChannel.serverId,
            }}
            disabled={!channelPermissions.allowSend}
            mentionUsers={mentionUsers}
            mentionRoles={mentionRoles}
          />
        </div>
      ) : null}
    </div>
  );
};

export default ChannelIdPage;
