import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, db } from "@/lib/db";
import {
  autoArchiveStaleThreadsForChannel,
  canAccessChannelAsProfile,
  ensureChannelThreadSchema,
} from "@/lib/channel-threads";
import { resolveChannelRouteContext, resolveServerRouteContext } from "@/lib/route-slug-resolver";
import { buildChannelPath, buildServerPath, buildThreadPath } from "@/lib/route-slugs";

type ThreadRow = {
  id: string;
  title: string;
  sourceMessageId: string;
  archived: boolean;
  autoArchiveMinutes: number | string;
  lastActivityAt: Date | string;
  createdAt: Date | string;
  replyCount: number | string;
  participantCount: number | string;
  unreadCount: number | string;
};

interface ChannelThreadsPageProps {
  params: Promise<{
    serverId: string;
    channelId: string;
  }>;
}

const ChannelThreadsPage = async ({ params }: ChannelThreadsPageProps) => {
  const { serverId: serverParam, channelId: channelParam } = await params;

  const profile = await currentProfile();

  if (!profile) {
    return redirect("/sign-in");
  }

  const resolvedServer = await resolveServerRouteContext({
    profileId: profile.id,
    serverParam,
    profileRole: profile.role,
  });

  if (!resolvedServer) {
    return redirect("/servers");
  }

  const serverId = resolvedServer.id;

  const resolvedChannel = await resolveChannelRouteContext({
    serverId,
    channelParam,
  });

  if (!resolvedChannel) {
    return redirect(buildServerPath({ id: resolvedServer.id, name: resolvedServer.name }));
  }

  const channelId = resolvedChannel.id;

  await ensureChannelThreadSchema();

  const currentChannel = await db.query.channel.findFirst({
    where: and(eq(channel.id, channelId), eq(channel.serverId, serverId)),
  });

  if (!currentChannel) {
    return redirect(buildServerPath({ id: resolvedServer.id, name: resolvedServer.name }));
  }

  const access = await canAccessChannelAsProfile({
    profileId: profile.id,
    serverId,
    channelId,
  });

  if (!access.allowed) {
    return redirect(buildServerPath({ id: resolvedServer.id, name: resolvedServer.name }));
  }

  const channelPath = buildChannelPath({
    server: { id: serverId, name: resolvedServer.name },
    channel: { id: currentChannel.id, name: currentChannel.name },
  });

  await autoArchiveStaleThreadsForChannel({
    serverId,
    channelId,
  });

  const viewerProfileId = profile.id;

  const result = await db.execute(sql`
    select
      ct."id" as "id",
      ct."title" as "title",
      ct."sourceMessageId" as "sourceMessageId",
      ct."archived" as "archived",
      ct."autoArchiveMinutes" as "autoArchiveMinutes",
      ct."lastActivityAt" as "lastActivityAt",
      ct."createdAt" as "createdAt",
      (
        select count(*)
        from "Message" tm
        where tm."threadId" = ct."id"
          and tm."deleted" = false
      ) as "replyCount",
      (
        select count(distinct participants."participantId")
        from (
          select source."memberId" as "participantId"
          from "Message" source
          where source."id" = ct."sourceMessageId"
          union all
          select tm."memberId" as "participantId"
          from "Message" tm
          where tm."threadId" = ct."id"
        ) participants
      ) as "participantCount",
      (
        select count(*)
        from "Message" tm
        where tm."threadId" = ct."id"
          and tm."deleted" = false
          and tm."memberId" in (
            select m."id"
            from "Member" m
            where m."profileId" <> ${viewerProfileId}
          )
          and tm."createdAt" > coalesce(
            (
              select trs."lastReadAt"
              from "ThreadReadState" trs
              where trs."threadId" = ct."id"
                and trs."profileId" = ${viewerProfileId}
              limit 1
            ),
            datetime('1970-01-01 00:00:00')
          )
      ) as "unreadCount"
    from "ChannelThread" ct
    where ct."serverId" = ${serverId}
      and ct."channelId" = ${channelId}
    order by ct."archived" asc, ct."lastActivityAt" desc
    limit 300
  `);

  const threads = ((result as unknown as { rows?: ThreadRow[] }).rows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    sourceMessageId: row.sourceMessageId,
    archived: Boolean(row.archived),
    autoArchiveMinutes: Number(row.autoArchiveMinutes ?? 1440),
    lastActivityAt: new Date(row.lastActivityAt).toLocaleString(),
    createdAt: new Date(row.createdAt).toLocaleString(),
    replyCount: Number(row.replyCount ?? 0),
    participantCount: Number(row.participantCount ?? 0),
    unreadCount: Number(row.unreadCount ?? 0),
  }));

  const activeThreads = threads.filter((thread) => !thread.archived);
  const archivedThreads = threads.filter((thread) => thread.archived);

  return (
    <div className="theme-server-chat-surface flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-xl shadow-black/35">
      <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-black dark:text-white">Threads in #{currentChannel.name}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Browse all channel threads, including archived ones.
            </p>
          </div>
          <Link
            href={channelPath}
            className="inline-flex items-center rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Back to channel
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {threads.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No threads yet. Start one from a message.</p>
        ) : (
          <div className="space-y-6">
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                Active ({activeThreads.length})
              </h2>
              <div className="space-y-2">
                {activeThreads.length === 0 ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No active threads.</p>
                ) : (
                  activeThreads.map((thread) => (
                    <Link
                      key={thread.id}
                      href={buildThreadPath({
                        server: { id: serverId, name: resolvedServer.name },
                        channel: { id: currentChannel.id, name: currentChannel.name },
                        threadId: thread.id,
                      })}
                      className="block rounded-lg border border-zinc-300 bg-white/70 p-3 transition hover:bg-zinc-100/90 dark:border-zinc-700 dark:bg-zinc-900/45 dark:hover:bg-zinc-800/75"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{thread.title}</p>
                        {thread.unreadCount > 0 ? (
                          <span className="rounded-full border border-amber-400/50 bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
                            {thread.unreadCount} unread
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Replies: {thread.replyCount} • Participants: {thread.participantCount} • Last activity: {thread.lastActivityAt}
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </section>

            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                Archived ({archivedThreads.length})
              </h2>
              <div className="space-y-2">
                {archivedThreads.length === 0 ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No archived threads.</p>
                ) : (
                  archivedThreads.map((thread) => (
                    <Link
                      key={thread.id}
                      href={buildThreadPath({
                        server: { id: serverId, name: resolvedServer.name },
                        channel: { id: currentChannel.id, name: currentChannel.name },
                        threadId: thread.id,
                      })}
                      className="block rounded-lg border border-zinc-300 bg-white/60 p-3 transition hover:bg-zinc-100/80 dark:border-zinc-700 dark:bg-zinc-900/35 dark:hover:bg-zinc-800/65"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{thread.title}</p>
                        <span className="rounded-full border border-zinc-400/40 bg-zinc-500/10 px-2 py-0.5 text-[10px] font-semibold text-zinc-500 dark:text-zinc-300">
                          Archived
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Replies: {thread.replyCount} • Participants: {thread.participantCount} • Last activity: {thread.lastActivityAt}
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChannelThreadsPage;
