import { sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { db } from "@/lib/db";

type VoiceStateRow = {
  id: string;
  serverId: string;
  channelId: string;
  memberId: string;
  connectedAt: Date;
  updatedAt: Date;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  isSpeaking: boolean;
};

export type ActiveVoiceMember = {
  memberId: string;
  profileId: string;
  displayName: string;
  profileImageUrl: string;
  presenceStatus: string;
  connectedAt: Date;
  updatedAt: Date;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  isSpeaking: boolean;
};

let voiceStateSchemaReady = false;
let lastVoiceStatePruneAt = 0;
const MIN_PRUNE_INTERVAL_MS = 15_000;

export const ensureVoiceStateSchema = async () => {
  if (voiceStateSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "VoiceState" (
      "id" varchar(191) primary key,
      "serverId" varchar(191) not null,
      "channelId" varchar(191) not null,
      "memberId" varchar(191) not null,
      "isMuted" boolean not null default false,
      "isDeafened" boolean not null default false,
      "isCameraOn" boolean not null default false,
      "isSpeaking" boolean not null default false,
      "connectedAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    alter table "VoiceState"
    add column if not exists "isMuted" boolean not null default false
  `);

  await db.execute(sql`
    alter table "VoiceState"
    add column if not exists "isDeafened" boolean not null default false
  `);

  await db.execute(sql`
    alter table "VoiceState"
    add column if not exists "isCameraOn" boolean not null default false
  `);

  await db.execute(sql`
    alter table "VoiceState"
    add column if not exists "isSpeaking" boolean not null default false
  `);

  await db.execute(sql`
    create unique index if not exists "VoiceState_unique_member_per_server"
    on "VoiceState" ("serverId", "memberId")
  `);

  await db.execute(sql`
    create index if not exists "VoiceState_server_channel_idx"
    on "VoiceState" ("serverId", "channelId")
  `);

  await db.execute(sql`
    create index if not exists "VoiceState_server_channel_updatedAt_idx"
    on "VoiceState" ("serverId", "channelId", "updatedAt")
  `);

  await db.execute(sql`
    create index if not exists "VoiceState_updatedAt_idx"
    on "VoiceState" ("updatedAt")
  `);

  voiceStateSchemaReady = true;
};

export const pruneStaleVoiceStates = async ({
  maxAgeSeconds = 90,
}: {
  maxAgeSeconds?: number;
} = {}) => {
  await ensureVoiceStateSchema();

  const now = Date.now();
  if (now - lastVoiceStatePruneAt < MIN_PRUNE_INTERVAL_MS) {
    return;
  }
  lastVoiceStatePruneAt = now;

  await db.execute(sql`
    delete from "VoiceState"
    where "updatedAt" < now() - (${maxAgeSeconds} * interval '1 second')
  `);
};

export const upsertVoiceState = async ({
  serverId,
  channelId,
  memberId,
  isMuted = false,
  isDeafened = false,
  isCameraOn = false,
  isSpeaking = false,
}: {
  serverId: string;
  channelId: string;
  memberId: string;
  isMuted?: boolean;
  isDeafened?: boolean;
  isCameraOn?: boolean;
  isSpeaking?: boolean;
}) => {
  await ensureVoiceStateSchema();

  const now = new Date();

  await db.execute(sql`
    insert into "VoiceState" (
      "id",
      "serverId",
      "channelId",
      "memberId",
      "isMuted",
      "isDeafened",
      "isCameraOn",
      "isSpeaking",
      "connectedAt",
      "updatedAt"
    )
    values (
      ${uuidv4()},
      ${serverId},
      ${channelId},
      ${memberId},
      ${isMuted},
      ${isDeafened},
      ${isCameraOn},
      ${isSpeaking},
      ${now},
      ${now}
    )
    on conflict ("serverId", "memberId")
    do update set
      "channelId" = excluded."channelId",
      "isMuted" = excluded."isMuted",
      "isDeafened" = excluded."isDeafened",
      "isCameraOn" = excluded."isCameraOn",
      "isSpeaking" = excluded."isSpeaking",
      "updatedAt" = excluded."updatedAt"
  `);
};

export const clearVoiceState = async ({
  serverId,
  memberId,
}: {
  serverId: string;
  memberId: string;
}) => {
  await ensureVoiceStateSchema();

  await db.execute(sql`
    delete from "VoiceState"
    where "serverId" = ${serverId}
      and "memberId" = ${memberId}
  `);
};

export const getMemberVoiceState = async ({
  serverId,
  memberId,
  maxAgeSeconds = 90,
}: {
  serverId: string;
  memberId: string;
  maxAgeSeconds?: number;
}) => {
  await ensureVoiceStateSchema();

  const result = await db.execute(sql`
    select
      vs."id" as "id",
      vs."serverId" as "serverId",
      vs."channelId" as "channelId",
      vs."memberId" as "memberId",
      vs."isMuted" as "isMuted",
      vs."isDeafened" as "isDeafened",
      vs."isCameraOn" as "isCameraOn",
      vs."isSpeaking" as "isSpeaking",
      vs."connectedAt" as "connectedAt",
      vs."updatedAt" as "updatedAt"
    from "VoiceState" vs
    where vs."serverId" = ${serverId}
      and vs."memberId" = ${memberId}
      and vs."updatedAt" >= now() - (${maxAgeSeconds} * interval '1 second')
    limit 1
  `);

  return ((result as unknown as { rows?: VoiceStateRow[] }).rows ?? [])[0] ?? null;
};

export const listActiveVoiceMembersForChannel = async ({
  serverId,
  channelId,
  maxAgeSeconds = 90,
}: {
  serverId: string;
  channelId: string;
  maxAgeSeconds?: number;
}) => {
  await ensureVoiceStateSchema();

  const result = await db.execute(sql`
    select
      m."id" as "memberId",
      m."profileId" as "profileId",
      coalesce(nullif(trim(u."name"), ''), nullif(trim(u."email"), ''), m."profileId") as "displayName",
      coalesce(u."avatarUrl", u."avatar", u."icon", '/in-accord-steampunk-logo.png') as "profileImageUrl",
      coalesce(up."presenceStatus", 'OFFLINE') as "presenceStatus",
      vs."isMuted" as "isMuted",
      vs."isDeafened" as "isDeafened",
      vs."isCameraOn" as "isCameraOn",
      vs."isSpeaking" as "isSpeaking",
      vs."connectedAt" as "connectedAt",
      vs."updatedAt" as "updatedAt"
    from "VoiceState" vs
    inner join "Member" m on m."id" = vs."memberId"
    left join "Users" u on u."userId" = m."profileId"
    left join "UserProfile" up on up."userId" = m."profileId"
    where vs."serverId" = ${serverId}
      and vs."channelId" = ${channelId}
      and vs."updatedAt" >= now() - (${maxAgeSeconds} * interval '1 second')
    order by vs."connectedAt" asc
  `);

  return (((result as unknown as { rows?: ActiveVoiceMember[] }).rows ?? []) as ActiveVoiceMember[]).map((row) => ({
    ...row,
    presenceStatus: String(row.presenceStatus ?? "OFFLINE").toUpperCase(),
    isMuted: Boolean((row as ActiveVoiceMember).isMuted),
    isDeafened: Boolean((row as ActiveVoiceMember).isDeafened),
    isCameraOn: Boolean((row as ActiveVoiceMember).isCameraOn),
    isSpeaking: Boolean((row as ActiveVoiceMember).isSpeaking),
  }));
};

export const listActiveVoiceCountsForServer = async ({
  serverId,
  maxAgeSeconds = 90,
}: {
  serverId: string;
  maxAgeSeconds?: number;
}) => {
  await ensureVoiceStateSchema();

  const result = await db.execute(sql`
    select
      vs."channelId" as "channelId",
      count(*)::int as "connectedCount"
    from "VoiceState" vs
    where vs."serverId" = ${serverId}
      and vs."updatedAt" >= now() - (${maxAgeSeconds} * interval '1 second')
    group by vs."channelId"
  `);

  const rows = (result as unknown as {
    rows?: Array<{ channelId: string; connectedCount: number | string }>;
  }).rows ?? [];

  return new Map(
    rows.map((row) => [String(row.channelId), Number(row.connectedCount ?? 0)])
  );
};
