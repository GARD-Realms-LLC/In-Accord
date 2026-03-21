import { and, asc, eq, sql } from "drizzle-orm";

import { db, member, message } from "@/lib/db";
import { computeChannelPermissionForMember, resolveMemberContext } from "@/lib/channel-permissions";

let channelThreadSchemaReady = false;

export type ChannelThreadSummary = {
  id: string;
  sourceMessageId: string;
  title: string;
  archived: boolean;
  autoArchiveMinutes: number;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
  replyCount: number;
  participantCount: number;
  unreadCount: number;
};

const DEFAULT_AUTO_ARCHIVE_MINUTES = 1440;
const DEFAULT_AUTO_ARCHIVE_MINUTES_SQL = sql.raw(String(DEFAULT_AUTO_ARCHIVE_MINUTES));
const VALID_AUTO_ARCHIVE_MINUTES = new Set([60, 1440, 4320, 10080]);

const normalizeAutoArchiveMinutes = (value: unknown) => {
  const parsed = Number(value ?? DEFAULT_AUTO_ARCHIVE_MINUTES);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_AUTO_ARCHIVE_MINUTES;
  }

  const rounded = Math.round(parsed);
  return VALID_AUTO_ARCHIVE_MINUTES.has(rounded) ? rounded : DEFAULT_AUTO_ARCHIVE_MINUTES;
};

export const ensureChannelThreadSchema = async () => {
  if (channelThreadSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "ChannelThread" (
      "id" varchar(191) primary key,
      "serverId" varchar(191) not null,
      "channelId" varchar(191) not null,
      "sourceMessageId" varchar(191) not null,
      "title" varchar(191) not null,
      "createdByMemberId" varchar(191) not null,
      "archived" boolean not null default false,
      "autoArchiveMinutes" integer not null default ${DEFAULT_AUTO_ARCHIVE_MINUTES_SQL},
      "lastActivityAt" timestamp not null,
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    alter table "ChannelThread"
    add column if not exists "autoArchiveMinutes" integer not null default ${DEFAULT_AUTO_ARCHIVE_MINUTES_SQL}
  `);

  await db.execute(sql`
    alter table "ChannelThread"
    add column if not exists "lastActivityAt" timestamp not null default now()
  `);

  await db.execute(sql`
    create index if not exists "ChannelThread_serverId_idx"
    on "ChannelThread" ("serverId")
  `);

  await db.execute(sql`
    create index if not exists "ChannelThread_channelId_idx"
    on "ChannelThread" ("channelId")
  `);

  await db.execute(sql`
    create unique index if not exists "ChannelThread_sourceMessageId_key"
    on "ChannelThread" ("sourceMessageId")
  `);

  await db.execute(sql`
    create table if not exists "ThreadReadState" (
      "threadId" varchar(191) not null,
      "profileId" varchar(191) not null,
      "lastReadAt" timestamp not null,
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null,
      primary key ("threadId", "profileId")
    )
  `);

  await db.execute(sql`
    create index if not exists "ThreadReadState_profileId_idx"
    on "ThreadReadState" ("profileId")
  `);

  await db.execute(sql`
    alter table "Message"
    add column if not exists "threadId" varchar(191)
  `);

  await db.execute(sql`
    create index if not exists "Message_threadId_idx"
    on "Message" ("threadId")
  `);

  channelThreadSchemaReady = true;
};

export const autoArchiveStaleThreadsForChannel = async ({
  serverId,
  channelId,
}: {
  serverId: string;
  channelId: string;
}) => {
  if (!serverId || !channelId) {
    return;
  }

  await ensureChannelThreadSchema();

  await db.execute(sql`
    update "ChannelThread"
    set
      "archived" = true,
      "updatedAt" = now()
    where "ChannelThread"."serverId" = ${serverId}
      and "ChannelThread"."channelId" = ${channelId}
      and "ChannelThread"."archived" = false
      and "ChannelThread"."lastActivityAt" <
        datetime(CURRENT_TIMESTAMP, '-' || "ChannelThread"."autoArchiveMinutes" || ' minutes')
  `);
};

export const canAccessChannelAsProfile = async ({
  profileId,
  serverId,
  channelId,
}: {
  profileId: string;
  serverId: string;
  channelId: string;
}) => {
  const currentMember = await db.query.member.findFirst({
    where: and(eq(member.serverId, serverId), eq(member.profileId, profileId)),
  });

  if (!currentMember) {
    return { allowed: false as const, currentMember: null, permissions: null };
  }

  const memberContext = await resolveMemberContext({ profileId, serverId });

  const permissions = memberContext
    ? await computeChannelPermissionForMember({
        serverId,
        channelId,
        memberContext,
      })
    : { allowView: false, allowSend: false, allowConnect: false };

  return {
    allowed: permissions.allowView,
    currentMember,
    permissions,
  } as const;
};

export const getThreadForMessage = async ({
  serverId,
  channelId,
  sourceMessageId,
  viewerProfileId,
}: {
  serverId?: string | null;
  channelId: string;
  sourceMessageId: string;
  viewerProfileId?: string | null;
}) => {
  void serverId;

  const hasViewerProfile = Boolean(viewerProfileId);
  const viewerProfileIdValue = viewerProfileId ?? "";

  const result = await db.execute(sql`
    select
      ct."id" as "id",
      ct."sourceMessageId" as "sourceMessageId",
      ct."title" as "title",
      ct."archived" as "archived",
      ct."autoArchiveMinutes" as "autoArchiveMinutes",
      ct."lastActivityAt" as "lastActivityAt",
      ct."createdAt" as "createdAt",
      ct."updatedAt" as "updatedAt",
      (
        select count(*)
        from "Message" tm
        where tm."threadId" = ct."id"
          and tm."deleted" = false
      ) as "replyCount"
      ,(
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
      ) as "participantCount"
      ,(
        select count(*)
        from "Message" tm
        where tm."threadId" = ct."id"
          and tm."deleted" = false
          and ${hasViewerProfile}
          and tm."memberId" in (
            select m."id"
            from "Member" m
            where m."profileId" <> ${viewerProfileIdValue}
          )
          and tm."createdAt" > coalesce(
            (
              select trs."lastReadAt"
              from "ThreadReadState" trs
              where trs."threadId" = ct."id"
                and trs."profileId" = ${viewerProfileIdValue}
              limit 1
            ),
            timestamp 'epoch'
          )
      ) as "unreadCount"
    from "ChannelThread" ct
    where ct."channelId" = ${channelId}
      and ct."sourceMessageId" = ${sourceMessageId}
    limit 1
  `);

  const row = (result as unknown as {
    rows?: Array<{
      id: string;
      sourceMessageId: string;
      title: string;
      archived: boolean;
      autoArchiveMinutes: number | string;
      lastActivityAt: Date | string;
      createdAt: Date | string;
      updatedAt: Date | string;
      replyCount: number | string;
      participantCount: number | string;
      unreadCount: number | string;
    }>;
  }).rows?.[0];

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sourceMessageId: row.sourceMessageId,
    title: row.title,
    archived: Boolean(row.archived),
    autoArchiveMinutes: normalizeAutoArchiveMinutes(row.autoArchiveMinutes),
    lastActivityAt: new Date(row.lastActivityAt),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    replyCount: Number(row.replyCount ?? 0),
    participantCount: Number(row.participantCount ?? 0),
    unreadCount: Number(row.unreadCount ?? 0),
  } satisfies ChannelThreadSummary;
};

export const listThreadsForMessages = async ({
  serverId,
  channelId,
  sourceMessageIds,
  viewerProfileId,
}: {
  serverId?: string | null;
  channelId: string;
  sourceMessageIds: string[];
  viewerProfileId?: string | null;
}) => {
  void serverId;

  if (!sourceMessageIds.length) {
    return new Map<string, ChannelThreadSummary>();
  }

  const hasViewerProfile = Boolean(viewerProfileId);
  const viewerProfileIdValue = viewerProfileId ?? "";

  const result = await db.execute(sql`
    select
      ct."id" as "id",
      ct."sourceMessageId" as "sourceMessageId",
      ct."title" as "title",
      ct."archived" as "archived",
      ct."autoArchiveMinutes" as "autoArchiveMinutes",
      ct."lastActivityAt" as "lastActivityAt",
      ct."createdAt" as "createdAt",
      ct."updatedAt" as "updatedAt",
      (
        select count(*)
        from "Message" tm
        where tm."threadId" = ct."id"
          and tm."deleted" = false
      ) as "replyCount"
      ,(
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
      ) as "participantCount"
      ,(
        select count(*)
        from "Message" tm
        where tm."threadId" = ct."id"
          and tm."deleted" = false
          and ${hasViewerProfile}
          and tm."memberId" in (
            select m."id"
            from "Member" m
            where m."profileId" <> ${viewerProfileIdValue}
          )
          and tm."createdAt" > coalesce(
            (
              select trs."lastReadAt"
              from "ThreadReadState" trs
              where trs."threadId" = ct."id"
                and trs."profileId" = ${viewerProfileIdValue}
              limit 1
            ),
            timestamp 'epoch'
          )
      ) as "unreadCount"
    from "ChannelThread" ct
    where ct."channelId" = ${channelId}
      and ct."sourceMessageId" in (${sql.join(sourceMessageIds.map((id) => sql`${id}`), sql`, `)})
    order by ct."createdAt" asc
  `);

  const rows = (result as unknown as {
    rows?: Array<{
      id: string;
      sourceMessageId: string;
      title: string;
      archived: boolean;
      autoArchiveMinutes: number | string;
      lastActivityAt: Date | string;
      createdAt: Date | string;
      updatedAt: Date | string;
      replyCount: number | string;
      participantCount: number | string;
      unreadCount: number | string;
    }>;
  }).rows ?? [];

  const map = new Map<string, ChannelThreadSummary>();

  for (const row of rows) {
    map.set(row.sourceMessageId, {
      id: row.id,
      sourceMessageId: row.sourceMessageId,
      title: row.title,
      archived: Boolean(row.archived),
      autoArchiveMinutes: normalizeAutoArchiveMinutes(row.autoArchiveMinutes),
      lastActivityAt: new Date(row.lastActivityAt),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      replyCount: Number(row.replyCount ?? 0),
      participantCount: Number(row.participantCount ?? 0),
      unreadCount: Number(row.unreadCount ?? 0),
    });
  }

  return map;
};

export const listThreadMessages = async ({
  threadId,
}: {
  threadId: string;
}) => {
  return db.query.message.findMany({
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
};

export const markThreadRead = async ({
  threadId,
  profileId,
}: {
  threadId: string;
  profileId: string;
}) => {
  if (!threadId || !profileId) {
    return;
  }

  await ensureChannelThreadSchema();
  const now = new Date();

  await db.execute(sql`
    insert into "ThreadReadState" ("threadId", "profileId", "lastReadAt", "createdAt", "updatedAt")
    values (${threadId}, ${profileId}, ${now}, ${now}, ${now})
    on conflict ("threadId", "profileId")
    do update set
      "lastReadAt" = excluded."lastReadAt",
      "updatedAt" = excluded."updatedAt"
  `);
};

export const touchThreadActivity = async ({
  threadId,
}: {
  threadId: string;
}) => {
  if (!threadId) {
    return;
  }

  await ensureChannelThreadSchema();
  const now = new Date();

  await db.execute(sql`
    update "ChannelThread"
    set
      "lastActivityAt" = ${now},
      "updatedAt" = ${now}
    where "id" = ${threadId}
  `);
};

export const updateThreadSettings = async ({
  threadId,
  archived,
  autoArchiveMinutes,
}: {
  threadId: string;
  archived?: boolean;
  autoArchiveMinutes?: number;
}) => {
  await ensureChannelThreadSchema();

  const nextArchiveMinutes =
    typeof autoArchiveMinutes === "number"
      ? normalizeAutoArchiveMinutes(autoArchiveMinutes)
      : undefined;

  const now = new Date();

  await db.execute(sql`
    update "ChannelThread"
    set
      "archived" = coalesce(${typeof archived === "boolean" ? archived : null}, "archived"),
      "autoArchiveMinutes" = coalesce(${nextArchiveMinutes ?? null}, "autoArchiveMinutes"),
      "updatedAt" = ${now}
    where "id" = ${threadId}
  `);
};
