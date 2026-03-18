import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ensureChannelOtherSettingsSchema } from "@/lib/channel-other-settings";
import {
  normalizeChannelFeatureSettings,
  parseStoredChannelSettings,
  type ChannelCountingSettings,
} from "@/lib/channel-feature-settings";

type SqlExecutor = Pick<typeof db, "execute">;

export type ChannelCountingState = {
  nextNumber: number;
  lastProfileId: string | null;
  lastMessageId: string | null;
  updatedAt: string | null;
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

export const createDefaultChannelCountingState = (
  settings: ChannelCountingSettings
): ChannelCountingState => ({
  nextNumber: toBoundedPositiveInteger(settings.startingNumber, 1),
  lastProfileId: null,
  lastMessageId: null,
  updatedAt: null,
});

export const normalizeChannelCountingState = (
  value: unknown,
  settings: ChannelCountingSettings
): ChannelCountingState => {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const fallback = createDefaultChannelCountingState(settings);

  return {
    nextNumber: toBoundedPositiveInteger(row.nextNumber, fallback.nextNumber),
    lastProfileId: normalizeNullableId(row.lastProfileId),
    lastMessageId: normalizeNullableId(row.lastMessageId),
    updatedAt: normalizeUpdatedAt(row.updatedAt),
  };
};

export const getChannelCountingSnapshot = async ({
  serverId,
  channelId,
  executor = db,
}: {
  serverId: string;
  channelId: string;
  executor?: SqlExecutor;
}) => {
  await ensureChannelOtherSettingsSchema();

  const rowResult = await executor.execute(sql`
    select "rawSettingsJson"
    from "ChannelOtherSettings"
    where "channelId" = ${channelId}
      and "serverId" = ${serverId}
    limit 1
  `);

  const row = (rowResult as unknown as { rows?: Array<{ rawSettingsJson: string | null }> }).rows?.[0];
  const parsedSettings = parseStoredChannelSettings(row?.rawSettingsJson);
  const featureSettings = normalizeChannelFeatureSettings(parsedSettings.channelFeatureSettings);
  const countingState = normalizeChannelCountingState(parsedSettings.channelCountingState, featureSettings.counting);

  return {
    parsedSettings,
    countingSettings: featureSettings.counting,
    countingState,
  };
};

export const saveChannelCountingState = async ({
  serverId,
  channelId,
  parsedSettings,
  countingState,
  executor = db,
}: {
  serverId: string;
  channelId: string;
  parsedSettings: Record<string, unknown>;
  countingState: ChannelCountingState;
  executor?: SqlExecutor;
}) => {
  await ensureChannelOtherSettingsSchema();

  const nextRaw = JSON.stringify({
    ...parsedSettings,
    channelCountingState: countingState,
  });

  await executor.execute(sql`
    insert into "ChannelOtherSettings" (
      "channelId", "serverId", "OtherType", "rawSettingsJson", "createdAt", "updatedAt"
    )
    values (
      ${channelId},
      ${serverId},
      ${null},
      ${nextRaw},
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