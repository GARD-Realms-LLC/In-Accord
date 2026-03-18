import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export type ServerAnnouncementSettings = {
  communityEnabled: boolean;
  announcementChannelId: string | null;
  guidelines: string | null;
};

const DEFAULT_SETTINGS: ServerAnnouncementSettings = {
  communityEnabled: false,
  announcementChannelId: null,
  guidelines: null,
};

let serverAnnouncementSettingsSchemaReady = false;

const normalizeAnnouncementChannelId = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeGuidelines = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized.slice(0, 1200) : null;
};

const normalizeSettings = (
  value: Partial<ServerAnnouncementSettings> | null | undefined
): ServerAnnouncementSettings => ({
  communityEnabled: value?.communityEnabled === true,
  announcementChannelId: normalizeAnnouncementChannelId(value?.announcementChannelId),
  guidelines: normalizeGuidelines(value?.guidelines),
});

export const ensureServerAnnouncementSettingsSchema = async () => {
  if (serverAnnouncementSettingsSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "ServerAnnouncementSettings" (
      "serverId" varchar(191) primary key,
      "communityEnabled" boolean not null default false,
      "announcementChannelId" varchar(191),
      "guidelines" text not null default '',
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    create index if not exists "ServerAnnouncementSettings_announcementChannelId_idx"
    on "ServerAnnouncementSettings" ("announcementChannelId")
  `);

  serverAnnouncementSettingsSchemaReady = true;
};

export const getServerAnnouncementSettings = async (
  serverId: string
): Promise<ServerAnnouncementSettings> => {
  const normalizedServerId = String(serverId ?? "").trim();
  if (!normalizedServerId) {
    return { ...DEFAULT_SETTINGS };
  }

  await ensureServerAnnouncementSettingsSchema();

  const result = await db.execute(sql`
    select
      "communityEnabled",
      "announcementChannelId",
      "guidelines"
    from "ServerAnnouncementSettings"
    where "serverId" = ${normalizedServerId}
    limit 1
  `);

  const row = (result as unknown as {
    rows?: Array<{
      communityEnabled: boolean | null;
      announcementChannelId: string | null;
      guidelines: string | null;
    }>;
  }).rows?.[0];

  if (!row) {
    return { ...DEFAULT_SETTINGS };
  }

  return normalizeSettings({
    communityEnabled: row.communityEnabled === true,
    announcementChannelId: row.announcementChannelId,
    guidelines: row.guidelines,
  });
};

export const setServerAnnouncementSettings = async (
  serverId: string,
  next: Partial<ServerAnnouncementSettings>
): Promise<ServerAnnouncementSettings> => {
  const normalizedServerId = String(serverId ?? "").trim();
  if (!normalizedServerId) {
    return { ...DEFAULT_SETTINGS };
  }

  await ensureServerAnnouncementSettingsSchema();

  const current = await getServerAnnouncementSettings(normalizedServerId);
  const merged = normalizeSettings({
    ...current,
    ...next,
  });

  await db.execute(sql`
    insert into "ServerAnnouncementSettings" (
      "serverId",
      "communityEnabled",
      "announcementChannelId",
      "guidelines",
      "createdAt",
      "updatedAt"
    )
    values (
      ${normalizedServerId},
      ${merged.communityEnabled},
      ${merged.announcementChannelId},
      ${merged.guidelines ?? ""},
      now(),
      now()
    )
    on conflict ("serverId") do update
    set
      "communityEnabled" = excluded."communityEnabled",
      "announcementChannelId" = excluded."announcementChannelId",
      "guidelines" = excluded."guidelines",
      "updatedAt" = excluded."updatedAt"
  `);

  return merged;
};
