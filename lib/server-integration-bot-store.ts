import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

type IntegrationBotControl = {
  bootedProfileIds: string[];
  bannedProfileIds: string[];
};

declare global {
  // eslint-disable-next-line no-var
  var inAccordServerIntegrationBotControlSchemaReady: boolean | undefined;
}

const normalizeList = (value: unknown): string[] =>
  Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)))
    : [];

const ensureServerIntegrationBotControlSchema = async () => {
  if (globalThis.inAccordServerIntegrationBotControlSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "ServerIntegrationBotControl" (
      "serverId" varchar(191) primary key,
      "bootedProfileIds" jsonb not null default '[]'::jsonb,
      "bannedProfileIds" jsonb not null default '[]'::jsonb,
      "createdAt" timestamp not null default now(),
      "updatedAt" timestamp not null default now()
    )
  `);

  globalThis.inAccordServerIntegrationBotControlSchemaReady = true;
};

export async function getServerIntegrationBotControl(serverId: string): Promise<IntegrationBotControl> {
  const normalizedServerId = String(serverId ?? "").trim();
  if (!normalizedServerId) {
    return { bootedProfileIds: [], bannedProfileIds: [] };
  }

  await ensureServerIntegrationBotControlSchema();

  const result = await db.execute(sql`
    select
      sibc."bootedProfileIds" as "bootedProfileIds",
      sibc."bannedProfileIds" as "bannedProfileIds"
    from "ServerIntegrationBotControl" sibc
    where sibc."serverId" = ${normalizedServerId}
    limit 1
  `);

  const current = ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [])[0];
  if (!current) {
    return { bootedProfileIds: [], bannedProfileIds: [] };
  }

  return {
    bootedProfileIds: normalizeList(current.bootedProfileIds),
    bannedProfileIds: normalizeList(current.bannedProfileIds),
  };
}

export async function setServerIntegrationBotBooted(serverId: string, profileId: string, booted: boolean) {
  const normalizedServerId = String(serverId ?? "").trim();
  const normalizedProfileId = profileId.trim();
  if (!normalizedServerId || !normalizedProfileId) {
    return;
  }

  await ensureServerIntegrationBotControlSchema();

  const current = await getServerIntegrationBotControl(normalizedServerId);
  const next = new Set(current.bootedProfileIds);

  if (booted) {
    next.add(normalizedProfileId);
  } else {
    next.delete(normalizedProfileId);
  }

  const now = new Date();

  await db.execute(sql`
    insert into "ServerIntegrationBotControl" ("serverId", "bootedProfileIds", "bannedProfileIds", "createdAt", "updatedAt")
    values (
      ${normalizedServerId},
      ${JSON.stringify(Array.from(next))}::jsonb,
      ${JSON.stringify(current.bannedProfileIds)}::jsonb,
      ${now},
      ${now}
    )
    on conflict ("serverId") do update
    set "bootedProfileIds" = excluded."bootedProfileIds",
        "bannedProfileIds" = excluded."bannedProfileIds",
        "updatedAt" = excluded."updatedAt"
  `);
}

export async function setServerIntegrationBotBanned(serverId: string, profileId: string, banned: boolean) {
  const normalizedServerId = String(serverId ?? "").trim();
  const normalizedProfileId = profileId.trim();
  if (!normalizedServerId || !normalizedProfileId) {
    return;
  }

  await ensureServerIntegrationBotControlSchema();

  const current = await getServerIntegrationBotControl(normalizedServerId);
  const next = new Set(current.bannedProfileIds);

  if (banned) {
    next.add(normalizedProfileId);
  } else {
    next.delete(normalizedProfileId);
  }

  const now = new Date();

  await db.execute(sql`
    insert into "ServerIntegrationBotControl" ("serverId", "bootedProfileIds", "bannedProfileIds", "createdAt", "updatedAt")
    values (
      ${normalizedServerId},
      ${JSON.stringify(current.bootedProfileIds)}::jsonb,
      ${JSON.stringify(Array.from(next))}::jsonb,
      ${now},
      ${now}
    )
    on conflict ("serverId") do update
    set "bootedProfileIds" = excluded."bootedProfileIds",
        "bannedProfileIds" = excluded."bannedProfileIds",
        "updatedAt" = excluded."updatedAt"
  `);
}

export async function isServerIntegrationBotBanned(serverId: string, profileId: string): Promise<boolean> {
  const current = await getServerIntegrationBotControl(serverId);
  return current.bannedProfileIds.includes(profileId);
}

export async function clearServerIntegrationBotFlags(serverId: string, profileId: string) {
  const normalizedServerId = String(serverId ?? "").trim();
  const normalizedProfileId = String(profileId ?? "").trim();
  if (!normalizedServerId || !normalizedProfileId) {
    return;
  }

  await ensureServerIntegrationBotControlSchema();

  const current = await getServerIntegrationBotControl(normalizedServerId);
  const now = new Date();

  await db.execute(sql`
    insert into "ServerIntegrationBotControl" ("serverId", "bootedProfileIds", "bannedProfileIds", "createdAt", "updatedAt")
    values (
      ${normalizedServerId},
      ${JSON.stringify(current.bootedProfileIds.filter((id) => id !== normalizedProfileId))}::jsonb,
      ${JSON.stringify(current.bannedProfileIds.filter((id) => id !== normalizedProfileId))}::jsonb,
      ${now},
      ${now}
    )
    on conflict ("serverId") do update
    set "bootedProfileIds" = excluded."bootedProfileIds",
        "bannedProfileIds" = excluded."bannedProfileIds",
        "updatedAt" = excluded."updatedAt"
  `);
}
