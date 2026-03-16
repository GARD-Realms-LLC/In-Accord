import { sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { db } from "@/lib/db";
import { ensureChannelOtherSettingsSchema } from "@/lib/channel-other-settings";

export type ChannelInviteItem = {
  code: string;
  createdAt: string;
  source: "created" | "regenerated";
  createdByProfileId?: string;
  maxUses?: number | null;
  usedCount?: number;
  expiresAt?: string | null;
};

const parseSettingsObject = (rawSettingsJson: string | null | undefined) => {
  if (!rawSettingsJson || typeof rawSettingsJson !== "string") {
    return {} as Record<string, unknown>;
  }

  try {
    const parsed = JSON.parse(rawSettingsJson) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {} as Record<string, unknown>;
  }
};

const toIsoOrNull = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

export const normalizeChannelInvites = (value: unknown): ChannelInviteItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const row = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
      if (!row) {
        return null;
      }

      const code = typeof row.code === "string" ? row.code.trim().slice(0, 128) : "";
      if (!code) {
        return null;
      }

      const createdAtRaw = typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString();
      const createdAt = Number.isFinite(new Date(createdAtRaw).getTime())
        ? new Date(createdAtRaw).toISOString()
        : new Date().toISOString();

      const source = row.source === "regenerated" ? "regenerated" : "created";
      const createdByProfileId = typeof row.createdByProfileId === "string" ? row.createdByProfileId : undefined;

      const maxUsesRaw = row.maxUses;
      const maxUses =
        maxUsesRaw === null || maxUsesRaw === undefined
          ? null
          : typeof maxUsesRaw === "number" && Number.isFinite(maxUsesRaw)
            ? Math.max(1, Math.min(100000, Math.floor(maxUsesRaw)))
            : null;

      const usedCountRaw = row.usedCount;
      const usedCount =
        typeof usedCountRaw === "number" && Number.isFinite(usedCountRaw)
          ? Math.max(0, Math.floor(usedCountRaw))
          : 0;

      const expiresAt = toIsoOrNull(row.expiresAt);

      return {
        code,
        createdAt,
        source,
        createdByProfileId,
        maxUses,
        usedCount,
        expiresAt,
      } as ChannelInviteItem;
    })
    .filter((item): item is ChannelInviteItem => Boolean(item))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

const upsertChannelOtherSettingsRaw = async (input: {
  channelId: string;
  serverId: string;
  rawSettingsJson: string;
}) => {
  await db.execute(sql`
    insert into "ChannelOtherSettings" (
      "channelId", "serverId", "OtherType", "rawSettingsJson", "createdAt", "updatedAt"
    )
    values (
      ${input.channelId},
      ${input.serverId},
      ${null},
      ${input.rawSettingsJson},
      now(),
      now()
    )
    on conflict ("channelId") do update
    set
      "serverId" = excluded."serverId",
      "rawSettingsJson" = excluded."rawSettingsJson",
      "updatedAt" = excluded."updatedAt"
  `);
};

export const getChannelSettingsAndInvites = async (channelId: string, serverId: string) => {
  await ensureChannelOtherSettingsSchema();

  const settingsRow = await db.execute(sql`
    select "rawSettingsJson"
    from "ChannelOtherSettings"
    where "channelId" = ${channelId}
      and "serverId" = ${serverId}
    limit 1
  `);

  const row = (settingsRow as unknown as { rows?: Array<{ rawSettingsJson: string | null }> }).rows?.[0];
  const parsed = parseSettingsObject(row?.rawSettingsJson);
  const invites = normalizeChannelInvites(parsed.channelInvites);

  return { parsedSettings: parsed, invites };
};

export const saveChannelInvites = async (input: {
  channelId: string;
  serverId: string;
  parsedSettings: Record<string, unknown>;
  invites: ChannelInviteItem[];
}) => {
  const nextRaw = JSON.stringify({
    ...input.parsedSettings,
    channelInvites: input.invites,
  });

  await upsertChannelOtherSettingsRaw({
    channelId: input.channelId,
    serverId: input.serverId,
    rawSettingsJson: nextRaw,
  });
};

export const createChannelInvite = async (input: {
  channelId: string;
  serverId: string;
  createdByProfileId: string;
  maxUses?: number | null;
  expiresInHours?: number | null;
}) => {
  const { parsedSettings, invites } = await getChannelSettingsAndInvites(input.channelId, input.serverId);

  const normalizedMaxUses =
    typeof input.maxUses === "number" && Number.isFinite(input.maxUses)
      ? Math.max(1, Math.min(100000, Math.floor(input.maxUses)))
      : null;

  const normalizedExpiresInHours =
    typeof input.expiresInHours === "number" && Number.isFinite(input.expiresInHours)
      ? Math.max(1, Math.min(24 * 365, Math.floor(input.expiresInHours)))
      : null;

  const now = new Date();
  const expiresAt = normalizedExpiresInHours
    ? new Date(now.getTime() + normalizedExpiresInHours * 60 * 60 * 1000).toISOString()
    : null;

  const nextInvite: ChannelInviteItem = {
    code: uuidv4(),
    source: "created",
    createdAt: now.toISOString(),
    createdByProfileId: input.createdByProfileId,
    maxUses: normalizedMaxUses,
    usedCount: 0,
    expiresAt,
  };

  const nextInvites = [nextInvite, ...invites].slice(0, 200);
  await saveChannelInvites({
    channelId: input.channelId,
    serverId: input.serverId,
    parsedSettings,
    invites: nextInvites,
  });

  return nextInvite;
};

export const deleteChannelInvite = async (input: {
  channelId: string;
  serverId: string;
  code: string;
}) => {
  const normalizedCode = String(input.code ?? "").trim();
  if (!normalizedCode) {
    return false;
  }

  const { parsedSettings, invites } = await getChannelSettingsAndInvites(input.channelId, input.serverId);
  const nextInvites = invites.filter((item) => item.code !== normalizedCode);

  if (nextInvites.length === invites.length) {
    return false;
  }

  await saveChannelInvites({
    channelId: input.channelId,
    serverId: input.serverId,
    parsedSettings,
    invites: nextInvites,
  });

  return true;
};

export const resolveChannelInviteByCode = async (codeInput: string) => {
  const code = String(codeInput ?? "").trim();
  if (!code) {
    return null;
  }

  await ensureChannelOtherSettingsSchema();

  const rowsResult = await db.execute(sql`
    select
      cos."channelId",
      cos."serverId",
      cos."rawSettingsJson",
      c."name" as "channelName",
      s."name" as "serverName"
    from "ChannelOtherSettings" cos
    inner join "Channel" c
      on c."id" = cos."channelId"
      and c."serverId" = cos."serverId"
    inner join "Server" s
      on s."id" = cos."serverId"
    where cos."rawSettingsJson" like ${`%${code}%`}
  `);

  const rows = (rowsResult as unknown as {
    rows?: Array<{
      channelId: string;
      serverId: string;
      rawSettingsJson: string | null;
      channelName: string;
      serverName: string;
    }>;
  }).rows ?? [];

  for (const row of rows) {
    const parsed = parseSettingsObject(row.rawSettingsJson);
    const invites = normalizeChannelInvites(parsed.channelInvites);
    const invite = invites.find((item) => item.code === code);

    if (invite) {
      return {
        serverId: row.serverId,
        channelId: row.channelId,
        serverName: row.serverName,
        channelName: row.channelName,
        parsedSettings: parsed,
        invites,
        invite,
      };
    }
  }

  return null;
};

export const isChannelInviteUsable = (invite: ChannelInviteItem) => {
  const usedCount = typeof invite.usedCount === "number" ? invite.usedCount : 0;
  const maxUses = typeof invite.maxUses === "number" ? invite.maxUses : null;

  if (maxUses !== null && usedCount >= maxUses) {
    return { ok: false as const, reason: "max-uses" as const };
  }

  if (invite.expiresAt) {
    const expiresAt = new Date(invite.expiresAt);
    if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
      return { ok: false as const, reason: "expired" as const };
    }
  }

  return { ok: true as const };
};

export const recordChannelInviteUse = async (input: {
  channelId: string;
  serverId: string;
  code: string;
}) => {
  const { parsedSettings, invites } = await getChannelSettingsAndInvites(input.channelId, input.serverId);

  let changed = false;
  const nextInvites = invites.map((item) => {
    if (item.code !== input.code) {
      return item;
    }

    changed = true;
    const currentUsedCount = typeof item.usedCount === "number" ? item.usedCount : 0;
    return {
      ...item,
      usedCount: currentUsedCount + 1,
    };
  });

  if (!changed) {
    return false;
  }

  await saveChannelInvites({
    channelId: input.channelId,
    serverId: input.serverId,
    parsedSettings,
    invites: nextInvites,
  });

  return true;
};
