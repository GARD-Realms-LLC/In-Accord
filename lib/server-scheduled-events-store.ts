import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export type ServerScheduledEventRow = {
  id: string;
  serverId: string;
  title: string;
  description: string | null;
  startsAt: string;
  frequency: string;
  bannerUrl: string | null;
  channelKind: string | null;
  channelId: string | null;
  createdByProfileId: string;
  createdAt: string;
  updatedAt: string;
};

const ensureServerScheduledEventsSchema = async () => {
  await db.execute(sql`
    create table if not exists "ServerScheduledEvent" (
      "id" varchar(191) primary key,
      "serverId" varchar(191) not null,
      "title" varchar(160) not null,
      "description" varchar(1200),
      "startsAt" timestamp(3) not null,
      "createdByProfileId" varchar(191) not null,
      "createdAt" timestamp(3) not null default now(),
      "updatedAt" timestamp(3) not null default now()
    )
  `);

  await db.execute(sql`
    create index if not exists "ServerScheduledEvent_serverId_startsAt_idx"
      on "ServerScheduledEvent" ("serverId", "startsAt")
  `);

  await db.execute(sql`
    alter table "ServerScheduledEvent"
    add column if not exists "frequency" varchar(24) not null default 'ONCE'
  `);

  await db.execute(sql`
    alter table "ServerScheduledEvent"
    add column if not exists "bannerUrl" varchar(2048)
  `);

  await db.execute(sql`
    alter table "ServerScheduledEvent"
    add column if not exists "channelKind" varchar(16)
  `);

  await db.execute(sql`
    alter table "ServerScheduledEvent"
    add column if not exists "channelId" varchar(191)
  `);
};

const toIso = (value: unknown): string => {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
};

const normalizeTitle = (value: unknown) => String(value ?? "").trim().slice(0, 160);
const normalizeDescription = (value: unknown) => {
  const normalized = String(value ?? "").trim().slice(0, 1200);
  return normalized || null;
};
const normalizeFrequency = (value: unknown) => {
  const normalized = String(value ?? "ONCE").trim().toUpperCase();
  if (normalized === "DAILY" || normalized === "WEEKLY" || normalized === "MONTHLY") {
    return normalized;
  }
  return "ONCE";
};
const normalizeBannerUrl = (value: unknown) => {
  const normalized = String(value ?? "").trim().slice(0, 2048);
  return normalized || null;
};
const normalizeChannelKind = (value: unknown) => {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "STAGE" || normalized === "VOICE" || normalized === "TEXT") {
    return normalized;
  }
  return null;
};
const normalizeChannelId = (value: unknown) => {
  const normalized = String(value ?? "").trim().slice(0, 191);
  return normalized || null;
};

export const listServerScheduledEvents = async (serverId: string) => {
  await ensureServerScheduledEventsSchema();

  const result = await db.execute(sql`
    select
      e."id" as "id",
      e."serverId" as "serverId",
      e."title" as "title",
      e."description" as "description",
      e."startsAt" as "startsAt",
      e."frequency" as "frequency",
      e."bannerUrl" as "bannerUrl",
      e."channelKind" as "channelKind",
      e."channelId" as "channelId",
      e."createdByProfileId" as "createdByProfileId",
      e."createdAt" as "createdAt",
      e."updatedAt" as "updatedAt"
    from "ServerScheduledEvent" e
    where e."serverId" = ${serverId}
    order by e."startsAt" asc, e."createdAt" asc
    limit 100
  `);

  const rows = (result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [];

  return rows.map((row) => ({
    id: String(row.id ?? ""),
    serverId: String(row.serverId ?? serverId),
    title: String(row.title ?? ""),
    description: row.description == null ? null : String(row.description),
    startsAt: toIso(row.startsAt),
    frequency: normalizeFrequency(row.frequency),
    bannerUrl: row.bannerUrl == null ? null : String(row.bannerUrl),
    channelKind: row.channelKind == null ? null : String(row.channelKind),
    channelId: row.channelId == null ? null : String(row.channelId),
    createdByProfileId: String(row.createdByProfileId ?? ""),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  })) satisfies ServerScheduledEventRow[];
};

export const createServerScheduledEvent = async (input: {
  serverId: string;
  title: string;
  description?: string | null;
  startsAt: string;
  frequency?: string;
  bannerUrl?: string | null;
  channelKind?: string | null;
  channelId?: string | null;
  createdByProfileId: string;
}) => {
  await ensureServerScheduledEventsSchema();

  const title = normalizeTitle(input.title);
  if (!title) {
    throw new Error("Event title is required.");
  }

  const startsAtDate = new Date(String(input.startsAt ?? ""));
  if (Number.isNaN(startsAtDate.getTime())) {
    throw new Error("Event start date is invalid.");
  }

  const id = randomUUID();
  const description = normalizeDescription(input.description);
  const frequency = normalizeFrequency(input.frequency);
  const bannerUrl = normalizeBannerUrl(input.bannerUrl);
  const channelKind = normalizeChannelKind(input.channelKind);
  const channelId = normalizeChannelId(input.channelId);

  await db.execute(sql`
    insert into "ServerScheduledEvent" (
      "id", "serverId", "title", "description", "startsAt", "frequency", "bannerUrl", "channelKind", "channelId", "createdByProfileId", "createdAt", "updatedAt"
    )
    values (
      ${id}, ${input.serverId}, ${title}, ${description}, ${startsAtDate.toISOString()}, ${frequency}, ${bannerUrl}, ${channelKind}, ${channelId}, ${input.createdByProfileId}, now(), now()
    )
  `);

  const rows = await listServerScheduledEvents(input.serverId);
  return rows.find((item) => item.id === id) ?? null;
};

export const updateServerScheduledEvent = async (input: {
  serverId: string;
  eventId: string;
  title?: string;
  description?: string | null;
  startsAt?: string;
  frequency?: string;
  bannerUrl?: string | null;
  channelKind?: string | null;
  channelId?: string | null;
}) => {
  await ensureServerScheduledEventsSchema();

  const sets: Array<ReturnType<typeof sql>> = [];

  if (input.title !== undefined) {
    const title = normalizeTitle(input.title);
    if (!title) {
      throw new Error("Event title is required.");
    }
    sets.push(sql`"title" = ${title}`);
  }

  if (input.description !== undefined) {
    sets.push(sql`"description" = ${normalizeDescription(input.description)}`);
  }

  if (input.startsAt !== undefined) {
    const startsAtDate = new Date(String(input.startsAt ?? ""));
    if (Number.isNaN(startsAtDate.getTime())) {
      throw new Error("Event start date is invalid.");
    }
    sets.push(sql`"startsAt" = ${startsAtDate.toISOString()}`);
  }

  if (input.frequency !== undefined) {
    sets.push(sql`"frequency" = ${normalizeFrequency(input.frequency)}`);
  }

  if (input.bannerUrl !== undefined) {
    sets.push(sql`"bannerUrl" = ${normalizeBannerUrl(input.bannerUrl)}`);
  }

  if (input.channelKind !== undefined) {
    sets.push(sql`"channelKind" = ${normalizeChannelKind(input.channelKind)}`);
  }

  if (input.channelId !== undefined) {
    sets.push(sql`"channelId" = ${normalizeChannelId(input.channelId)}`);
  }

  if (sets.length === 0) {
    return null;
  }

  await db.execute(sql`
    update "ServerScheduledEvent"
    set ${sql.join([...sets, sql`"updatedAt" = now()`], sql`, `)}
    where "id" = ${input.eventId}
      and "serverId" = ${input.serverId}
  `);

  const rows = await listServerScheduledEvents(input.serverId);
  return rows.find((item) => item.id === input.eventId) ?? null;
};

export const deleteServerScheduledEvent = async (input: { serverId: string; eventId: string }) => {
  await ensureServerScheduledEventsSchema();

  await db.execute(sql`
    delete from "ServerScheduledEvent"
    where "id" = ${input.eventId}
      and "serverId" = ${input.serverId}
  `);
};
