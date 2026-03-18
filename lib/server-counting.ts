import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { normalizeChannelCountingState } from "@/lib/channel-counting";
import { ensureChannelOtherSettingsSchema } from "@/lib/channel-other-settings";
import {
  normalizeChannelFeatureSettings,
  parseStoredChannelSettings,
} from "@/lib/channel-feature-settings";
import { ensureServerOtherSettingsSchema } from "@/lib/server-other-settings";

type SqlExecutor = Pick<typeof db, "execute">;

export type ServerCountingSettings = {
  enabled: boolean;
  channelId: string | null;
  startingNumber: number;
  preventConsecutiveTurns: boolean;
};

export type ServerCountingState = {
  nextNumber: number;
  lastProfileId: string | null;
  lastMessageId: string | null;
  updatedAt: string | null;
};

export const DEFAULT_SERVER_COUNTING_SETTINGS: ServerCountingSettings = {
  enabled: false,
  channelId: null,
  startingNumber: 1,
  preventConsecutiveTurns: true,
};

const toBoundedPositiveInteger = (value: unknown, fallback: number) => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(1_000_000_000, Math.floor(parsed)));
};

const normalizeNullableId = (value: unknown) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? normalized.slice(0, 191) : null;
};

const normalizeUpdatedAt = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

export const parseStoredServerSettings = (rawSettingsJson: string | null | undefined) => {
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

export const normalizeServerCountingSettings = (value: unknown): ServerCountingSettings => {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    enabled: row.enabled === true,
    channelId: normalizeNullableId(row.channelId),
    startingNumber: toBoundedPositiveInteger(row.startingNumber, DEFAULT_SERVER_COUNTING_SETTINGS.startingNumber),
    preventConsecutiveTurns:
      typeof row.preventConsecutiveTurns === "boolean"
        ? row.preventConsecutiveTurns
        : DEFAULT_SERVER_COUNTING_SETTINGS.preventConsecutiveTurns,
  };
};

export const createDefaultServerCountingState = (
  settings: ServerCountingSettings
): ServerCountingState => ({
  nextNumber: toBoundedPositiveInteger(settings.startingNumber, 1),
  lastProfileId: null,
  lastMessageId: null,
  updatedAt: null,
});

export const normalizeServerCountingState = (
  value: unknown,
  settings: ServerCountingSettings
): ServerCountingState => {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const fallback = createDefaultServerCountingState(settings);

  return {
    nextNumber: toBoundedPositiveInteger(row.nextNumber, fallback.nextNumber),
    lastProfileId: normalizeNullableId(row.lastProfileId),
    lastMessageId: normalizeNullableId(row.lastMessageId),
    updatedAt: normalizeUpdatedAt(row.updatedAt),
  };
};

export const getServerCountingSnapshot = async ({
  serverId,
  executor = db,
}: {
  serverId: string;
  executor?: SqlExecutor;
}) => {
  await ensureServerOtherSettingsSchema();

  const rowResult = await executor.execute(sql`
    select "rawSettingsJson"
    from "ServerOtherSettings"
    where "serverId" = ${serverId}
    limit 1
  `);

  const row = (rowResult as unknown as { rows?: Array<{ rawSettingsJson: string | null }> }).rows?.[0];
  const parsedSettings = parseStoredServerSettings(row?.rawSettingsJson);
  const hasExplicitServerCountingSettings =
    Object.prototype.hasOwnProperty.call(parsedSettings, "serverCountingSettings") ||
    Object.prototype.hasOwnProperty.call(parsedSettings, "serverCountingState");

  if (!hasExplicitServerCountingSettings) {
    await ensureChannelOtherSettingsSchema();

    const legacyRowResult = await executor.execute(sql`
      select "channelId", "rawSettingsJson"
      from "ChannelOtherSettings"
      where "serverId" = ${serverId}
      order by "updatedAt" desc
    `);

    const legacyRows = (legacyRowResult as unknown as {
      rows?: Array<{ channelId: string; rawSettingsJson: string | null }>;
    }).rows ?? [];

    for (const legacyRow of legacyRows) {
      const parsedLegacySettings = parseStoredChannelSettings(legacyRow.rawSettingsJson);
      const normalizedLegacyFeatures = normalizeChannelFeatureSettings(parsedLegacySettings.channelFeatureSettings);

      if (!normalizedLegacyFeatures.counting.enabled) {
        continue;
      }

      const migratedCountingSettings: ServerCountingSettings = {
        enabled: true,
        channelId: normalizeNullableId(legacyRow.channelId),
        startingNumber: normalizedLegacyFeatures.counting.startingNumber,
        preventConsecutiveTurns: normalizedLegacyFeatures.counting.preventConsecutiveTurns,
      };
      const legacyCountingState = normalizeChannelCountingState(
        parsedLegacySettings.channelCountingState,
        normalizedLegacyFeatures.counting
      );
      const migratedCountingState: ServerCountingState = {
        nextNumber: legacyCountingState.nextNumber,
        lastProfileId: legacyCountingState.lastProfileId,
        lastMessageId: legacyCountingState.lastMessageId,
        updatedAt: legacyCountingState.updatedAt,
      };

      await saveServerCountingSnapshot({
        serverId,
        parsedSettings,
        countingSettings: migratedCountingSettings,
        countingState: migratedCountingState,
        executor,
      });

      return {
        parsedSettings: {
          ...parsedSettings,
          serverCountingSettings: migratedCountingSettings,
          serverCountingState: migratedCountingState,
        },
        countingSettings: migratedCountingSettings,
        countingState: migratedCountingState,
      };
    }
  }

  const countingSettings = normalizeServerCountingSettings(parsedSettings.serverCountingSettings);
  const countingState = normalizeServerCountingState(parsedSettings.serverCountingState, countingSettings);

  return {
    parsedSettings,
    countingSettings,
    countingState,
  };
};

export const saveServerCountingSnapshot = async ({
  serverId,
  parsedSettings,
  countingSettings,
  countingState,
  executor = db,
}: {
  serverId: string;
  parsedSettings: Record<string, unknown>;
  countingSettings: ServerCountingSettings;
  countingState: ServerCountingState;
  executor?: SqlExecutor;
}) => {
  await ensureServerOtherSettingsSchema();

  const nextRaw = JSON.stringify({
    ...parsedSettings,
    serverCountingSettings: countingSettings,
    serverCountingState: countingState,
  });

  await executor.execute(sql`
    insert into "ServerOtherSettings" (
      "serverId", "rawSettingsJson", "createdAt", "updatedAt"
    )
    values (
      ${serverId},
      ${nextRaw},
      now(),
      now()
    )
    on conflict ("serverId") do update
    set
      "rawSettingsJson" = excluded."rawSettingsJson",
      "updatedAt" = excluded."updatedAt"
  `);
};