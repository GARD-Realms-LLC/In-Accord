import { redirect } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, member, message } from "@/lib/db";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatItem } from "@/components/chat/chat-item";
import { ChatScrollBox } from "@/components/chat/chat-scroll-box";
import { ChatLiveRefresh } from "@/components/chat/chat-live-refresh";
import {
  canAccessChannelAsProfile,
  listThreadsForMessages,
  markThreadRead,
} from "@/lib/channel-threads";
import { resolveMemberContext } from "@/lib/channel-permissions";
import { getUserProfileNameMap } from "@/lib/user-profile";
import type { Profile } from "@/lib/db/types";
import { extractQuotedContent } from "@/lib/message-quotes";
import { ThreadToolbar } from "@/components/chat/thread-toolbar";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { resolveChannelRouteContext, resolveServerRouteContext } from "@/lib/route-slug-resolver";
import { buildChannelPath } from "@/lib/route-slugs";

interface ThreadPageProps {
  params: Promise<{
    serverId: string;
    channelId: string;
    threadId: string;
  }>;
}

const ThreadPage = async ({ params }: ThreadPageProps) => {
  const perfStart = Date.now();
  const isPerfLoggingEnabled = process.env.NODE_ENV !== "production";
  const { serverId: serverParam, channelId: channelParam, threadId } = await params;

  const profile = await currentProfile();

  if (!profile) {
    return redirect("/sign-in");
  }

  const resolvedServer = await resolveServerRouteContext({
    profileId: profile.id,
    serverParam,
  });

  if (!resolvedServer) {
    return redirect("/");
  }

  const serverId = resolvedServer.id;

  const resolvedChannel = await resolveChannelRouteContext({
    serverId,
    channelParam,
  });

  if (!resolvedChannel) {
    return redirect(`/servers/${resolvedServer.segment}`);
  }

  const channelId = resolvedChannel.id;

  if (isPerfLoggingEnabled) {
    console.info(
      `[PERF][ThreadPage] auth+params ${Date.now() - perfStart}ms server=${serverId} channel=${channelId} thread=${threadId}`
    );
  }

  const currentChannel = await db.query.channel.findFirst({
    where: and(eq(channel.id, channelId), eq(channel.serverId, serverId)),
  });

  if (!currentChannel) {
    return redirect(`/servers/${resolvedServer.segment}`);
  }

  const access = await canAccessChannelAsProfile({
    profileId: profile.id,
    serverId,
    channelId,
  });

  const canonicalChannelPath = buildChannelPath({
    server: { id: serverId, name: resolvedServer.name },
    channel: { id: currentChannel.id, name: currentChannel.name },
  });

  if (!access.allowed || !access.currentMember) {
    return redirect(`/servers/${resolvedServer.segment}`);
  }

  const threadResult = await db.execute(sql`
    select
      ct."id" as "id",
      ct."title" as "title",
      ct."sourceMessageId" as "sourceMessageId",
      ct."archived" as "archived",
      source."content" as "sourceContent",
      source."fileUrl" as "sourceFileUrl",
      source."deleted" as "sourceDeleted",
      sourceMember."id" as "sourceMemberId",
      sourceMember."profileId" as "sourceProfileId",
      coalesce(nullif(trim(up."profileName"), ''), sourceProfile."name", sourceProfile."email", 'User') as "sourceAuthorName"
    from "ChannelThread" ct
    inner join "Message" source on source."id" = ct."sourceMessageId"
    inner join "Member" sourceMember on sourceMember."id" = source."memberId"
    left join "Users" sourceProfile on sourceProfile."userId" = sourceMember."profileId"
    left join "UserProfile" up on up."userId" = sourceMember."profileId"
    where ct."id" = ${threadId}
      and ct."serverId" = ${serverId}
      and ct."channelId" = ${channelId}
    limit 1
  `);

  const threadRow = (threadResult as unknown as {
    rows?: Array<{
      id: string;
      title: string;
      sourceMessageId: string;
      archived: boolean;
      sourceContent: string;
      sourceFileUrl: string | null;
      sourceDeleted: boolean;
      sourceMemberId: string;
      sourceProfileId: string;
      sourceAuthorName: string | null;
    }>;
  }).rows?.[0];

  if (!threadRow) {
    return redirect(canonicalChannelPath);
  }

  await markThreadRead({
    threadId,
    profileId: profile.id,
  });

  const threadSummaryMap = await listThreadsForMessages({
    serverId,
    channelId,
    sourceMessageIds: [threadRow.sourceMessageId],
    viewerProfileId: profile.id,
  });

  const threadSummary = threadSummaryMap.get(threadRow.sourceMessageId) ?? null;

  const threadMessages = await db.query.message.findMany({
    where: eq(message.threadId, threadId),
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
      `[PERF][ThreadPage] messages ${Date.now() - perfStart}ms server=${serverId} channel=${channelId} thread=${threadId} count=${threadMessages.length}`
    );
  }

  const reactionRows = threadMessages.length
    ? await db.execute(sql`
        select "messageId", "emoji", "count"
        from "MessageReaction"
        where "scope" = 'channel'
          and "messageId" in (${sql.join(
            threadMessages.map((item) => sql`${item.id}`),
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
    threadMessages.map((item) => item.member.profileId)
  );

  const uniqueMessageProfileIds = Array.from(
    new Set(threadMessages.map((item) => item.member.profileId).filter(Boolean))
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

  const hydratedThreadMessages = threadMessages.map((item) => {
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
      "Unknown User";

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

  const { body: sourceBody } = extractQuotedContent(threadRow.sourceContent);
  const sourcePreview = threadRow.sourceDeleted
    ? "Original message was deleted"
    : sourceBody || threadRow.sourceContent;

  const memberContext = await resolveMemberContext({
    profileId: profile.id,
    serverId,
  });
  const canBulkDeleteMessages = Boolean(memberContext?.isServerOwner) || hasInAccordAdministrativeAccess(profile.role);

  const lastThreadMessageId = hydratedThreadMessages[hydratedThreadMessages.length - 1]?.id ?? "none";

  if (isPerfLoggingEnabled) {
    console.info(
      `[PERF][ThreadPage] done ${Date.now() - perfStart}ms server=${serverId} channel=${channelId} thread=${threadId}`
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="theme-server-chat-surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-xl shadow-black/35">
        <ChatHeader
          channelId={channelId}
          channelPath={canonicalChannelPath}
          channelIcon={(currentChannel as { icon?: string | null }).icon ?? null}
          name={threadRow.title}
          topic={`Thread in #${currentChannel.name}`}
          serverId={serverId}
          type="channel"
        />

        <div className="mx-3 mt-2 rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100/90">
          <p className="font-semibold text-indigo-200">Started from {threadRow.sourceAuthorName ?? "User"}</p>
          <p className="mt-1 truncate">{sourcePreview}</p>
        </div>

        <ThreadToolbar
          serverId={serverId}
          channelId={channelId}
          threadId={threadId}
          archived={threadSummary?.archived ?? Boolean(threadRow.archived)}
          participantCount={threadSummary?.participantCount ?? 0}
          autoArchiveMinutes={threadSummary?.autoArchiveMinutes ?? 1440}
          unreadCount={threadSummary?.unreadCount ?? 0}
        />

        <ChatLiveRefresh />
        <ChatScrollBox
          className="flex-1 overflow-y-auto"
          scrollKey={`${threadId}:${hydratedThreadMessages.length}:${lastThreadMessageId}`}
        >
          {hydratedThreadMessages.length === 0 ? (
            <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400">
              No replies yet. Start this thread.
            </div>
          ) : (
            hydratedThreadMessages.map((item) => (
              <ChatItem
                key={item.id}
                id={item.id}
                content={item.content}
                member={item.member}
                timestamp={new Date(item.createdAt).toLocaleString()}
                fileUrl={item.fileUrl}
                deleted={item.deleted}
                currentMember={access.currentMember!}
                isUpdated={new Date(item.updatedAt).getTime() !== new Date(item.createdAt).getTime()}
                socketUrl="/api/socket/messages"
                socketQuery={{
                  channelId,
                  serverId,
                  threadId,
                }}
                reactionScope="channel"
                initialReactions={reactionMap.get(item.id) ?? []}
                canPurgeDeletedMessage={Boolean(memberContext?.isServerOwner) || access.currentMember!.role === "ADMIN" || hasInAccordAdministrativeAccess(profile.role)}
              />
            ))
          )}
        </ChatScrollBox>
      </div>

      <div className="theme-server-chat-bar w-[calc(100vw-584px)] max-w-full rounded-2xl border border-border bg-card shadow-lg shadow-black/25">
        <ChatInput
          name={threadRow.title}
          type="channel"
          apiUrl="/api/socket/messages"
          query={{
            channelId,
            serverId,
            threadId,
          }}
          disabled={(threadSummary?.archived ?? Boolean(threadRow.archived)) || !access.permissions?.allowSend}
          mentionUsers={mentionUsers}
          mentionRoles={mentionRoles}
          canBulkDeleteMessages={canBulkDeleteMessages}
        />
      </div>
    </div>
  );
};

export default ThreadPage;
