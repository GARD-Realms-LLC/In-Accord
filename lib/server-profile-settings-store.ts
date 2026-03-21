import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ensureSchemaInitialized } from "@/lib/schema-init-state";

export type ServerInviteMode = "normal" | "approval";

export type ServerProfileSettings = {
  description: string | null;
  traits: string[];
  gamesPlayed: string[];
  bannerColor: string | null;
  inviteMode: ServerInviteMode;
  showChannelGroups: boolean;
  hideAllChannels: boolean;
  hiddenChannelIds: string[];
};

const DEFAULT_SETTINGS: ServerProfileSettings = {
  description: null,
  traits: [],
  gamesPlayed: [],
  bannerColor: null,
  inviteMode: "normal",
  showChannelGroups: true,
  hideAllChannels: false,
  hiddenChannelIds: [],
};

const normalizeStringIdList = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    const trimmed = String(item ?? "").trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
};

const normalizeHexColor = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  if (!/^#([0-9a-fA-F]{6})$/.test(raw)) {
    return null;
  }

  return raw.toLowerCase();
};

const normalizeStringList = (value: unknown, maxItems: number, maxLength: number) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    const trimmed = String(item ?? "").trim();
    if (!trimmed) {
      continue;
    }

    const compact = trimmed.slice(0, maxLength);
    const key = compact.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(compact);

    if (normalized.length >= maxItems) {
      break;
    }
  }

  return normalized;
};

const normalizeInviteMode = (value: unknown): ServerInviteMode => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "approval" ? "approval" : "normal";
};

const normalizeDescription = (value: unknown) => {
  const raw = String(value ?? "").trim();
  return raw.length > 0 ? raw.slice(0, 800) : null;
};

const normalizeShowChannelGroups = (value: unknown) => {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }

  return true;
};

const normalizeHideAllChannels = (value: unknown) => {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
};

const normalizeSettings = (value: Partial<ServerProfileSettings> | undefined): ServerProfileSettings => ({
  description: normalizeDescription(value?.description),
  traits: normalizeStringList(value?.traits, 12, 36),
  gamesPlayed: normalizeStringList(value?.gamesPlayed, 24, 48),
  bannerColor: normalizeHexColor(value?.bannerColor),
  inviteMode: normalizeInviteMode(value?.inviteMode),
  showChannelGroups: normalizeShowChannelGroups(value?.showChannelGroups),
  hideAllChannels: normalizeHideAllChannels(value?.hideAllChannels),
  hiddenChannelIds: normalizeStringIdList(value?.hiddenChannelIds),
});

const ensureServerProfileSettingsSchema = async () => {
  await ensureSchemaInitialized("server-profile-settings-schema", async () => {
    await db.execute(sql`
      create table if not exists "ServerProfileSettings" (
        "serverId" varchar(191) primary key,
        "description" text,
        "traits" jsonb not null default '[]'::jsonb,
        "gamesPlayed" jsonb not null default '[]'::jsonb,
        "bannerColor" varchar(20),
        "inviteMode" varchar(20) not null default 'normal',
        "showChannelGroups" boolean not null default true,
        "hideAllChannels" boolean not null default false,
        "hiddenChannelIds" jsonb not null default '[]'::jsonb,
        "createdAt" timestamp not null default now(),
        "updatedAt" timestamp not null default now()
      )
    `);
  });
};

export async function getServerProfileSettings(serverId: string): Promise<ServerProfileSettings> {
  const normalizedServerId = String(serverId ?? "").trim();
  if (!normalizedServerId) {
    return { ...DEFAULT_SETTINGS };
  }

  await ensureServerProfileSettingsSchema();

  const result = await db.execute(sql`
    select
      sps."description" as "description",
      sps."traits" as "traits",
      sps."gamesPlayed" as "gamesPlayed",
      sps."bannerColor" as "bannerColor",
      sps."inviteMode" as "inviteMode",
      sps."showChannelGroups" as "showChannelGroups",
      sps."hideAllChannels" as "hideAllChannels",
      sps."hiddenChannelIds" as "hiddenChannelIds"
    from "ServerProfileSettings" sps
    where sps."serverId" = ${normalizedServerId}
    limit 1
  `);

  const row = ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [])[0];
  if (!row) {
    return { ...DEFAULT_SETTINGS };
  }

  return normalizeSettings({
    description: row.description as string | null | undefined,
    traits: row.traits as string[] | undefined,
    gamesPlayed: row.gamesPlayed as string[] | undefined,
    bannerColor: row.bannerColor as string | null | undefined,
    inviteMode: row.inviteMode as ServerInviteMode | undefined,
    showChannelGroups: row.showChannelGroups as boolean | undefined,
    hideAllChannels: row.hideAllChannels as boolean | undefined,
    hiddenChannelIds: row.hiddenChannelIds as string[] | undefined,
  });
}

export async function setServerProfileSettings(
  serverId: string,
  next: Partial<ServerProfileSettings>
): Promise<ServerProfileSettings> {
  const normalizedServerId = String(serverId ?? "").trim();
  if (!normalizedServerId) {
    throw new Error("Server ID is required.");
  }

  await ensureServerProfileSettingsSchema();

  const current = await getServerProfileSettings(normalizedServerId);
  const merged = normalizeSettings({ ...current, ...next });
  const now = new Date();

  await db.execute(sql`
    insert into "ServerProfileSettings" (
      "serverId",
      "description",
      "traits",
      "gamesPlayed",
      "bannerColor",
      "inviteMode",
      "showChannelGroups",
      "hideAllChannels",
      "hiddenChannelIds",
      "createdAt",
      "updatedAt"
    )
    values (
      ${normalizedServerId},
      ${merged.description},
      ${JSON.stringify(merged.traits)}::jsonb,
      ${JSON.stringify(merged.gamesPlayed)}::jsonb,
      ${merged.bannerColor},
      ${merged.inviteMode},
      ${merged.showChannelGroups},
      ${merged.hideAllChannels},
      ${JSON.stringify(merged.hiddenChannelIds)}::jsonb,
      ${now},
      ${now}
    )
    on conflict ("serverId") do update
    set "description" = excluded."description",
        "traits" = excluded."traits",
        "gamesPlayed" = excluded."gamesPlayed",
        "bannerColor" = excluded."bannerColor",
        "inviteMode" = excluded."inviteMode",
        "showChannelGroups" = excluded."showChannelGroups",
        "hideAllChannels" = excluded."hideAllChannels",
        "hiddenChannelIds" = excluded."hiddenChannelIds",
        "updatedAt" = excluded."updatedAt"
  `);

  return merged;
}

export async function isServerInviteApprovalRequired(serverId: string): Promise<boolean> {
  const settings = await getServerProfileSettings(serverId);
  return settings.inviteMode === "approval";
}
