import { createHmac } from "node:crypto";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ensureChannelOtherSettingsSchema } from "@/lib/channel-other-settings";

export const channelWebhookEventTypes = ["MESSAGE_CREATED", "MESSAGE_UPDATED", "MESSAGE_DELETED"] as const;
export type ChannelWebhookEventType = (typeof channelWebhookEventTypes)[number];

export type ChannelFeatureSettings = {
  integrations: {
    enabled: boolean;
    provider: string;
    providerApiUrl: string;
    syncMentions: boolean;
    allowedBotIds: string[];
  };
  webhooks: {
    items: Array<{
      id: string;
      name: string;
      url: string;
      enabled: boolean;
      secret: string;
      eventTypes: ChannelWebhookEventType[];
    }>;
  };
  apps: {
    allowedAppIds: string[];
    allowPinnedApps: boolean;
    apiUrl: string;
  };
  moderation: {
    requireVerifiedEmail: boolean;
    blockedWords: string[];
    slowmodeSeconds: number;
    flaggedWordsAction: "warn" | "block";
  };
};

export const DEFAULT_CHANNEL_FEATURE_SETTINGS: ChannelFeatureSettings = {
  integrations: {
    enabled: false,
    provider: "",
    providerApiUrl: "",
    syncMentions: false,
    allowedBotIds: [],
  },
  webhooks: {
    items: [],
  },
  apps: {
    allowedAppIds: [],
    allowPinnedApps: true,
    apiUrl: "",
  },
  moderation: {
    requireVerifiedEmail: false,
    blockedWords: [],
    slowmodeSeconds: 0,
    flaggedWordsAction: "warn",
  },
};

const asText = (value: unknown, maxLength = 120) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
};

const asBoolean = (value: unknown, fallback = false) => {
  return typeof value === "boolean" ? value : fallback;
};

const asBoundedInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  if (!Number.isFinite(n)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.floor(n)));
};

const asStringArray = (value: unknown, maxItems: number, maxItemLength: number) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  const unique = new Set<string>();
  for (const entry of value) {
    const normalized = asText(entry, maxItemLength);
    if (normalized) {
      unique.add(normalized);
    }
    if (unique.size >= maxItems) {
      break;
    }
  }

  return Array.from(unique);
};

const asWebhookEventTypes = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [...channelWebhookEventTypes] as ChannelWebhookEventType[];
  }

  const allowed = new Set<ChannelWebhookEventType>(channelWebhookEventTypes);
  const normalized = value
    .map((entry) => String(entry ?? "").trim().toUpperCase())
    .filter((entry): entry is ChannelWebhookEventType => allowed.has(entry as ChannelWebhookEventType));

  return normalized.length > 0 ? Array.from(new Set(normalized)) : [...channelWebhookEventTypes];
};

export const normalizeChannelFeatureSettings = (input: unknown): ChannelFeatureSettings => {
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const integrationsRaw =
    record.integrations && typeof record.integrations === "object"
      ? (record.integrations as Record<string, unknown>)
      : {};
  const webhooksRaw =
    record.webhooks && typeof record.webhooks === "object"
      ? (record.webhooks as Record<string, unknown>)
      : {};
  const appsRaw =
    record.apps && typeof record.apps === "object" ? (record.apps as Record<string, unknown>) : {};
  const moderationRaw =
    record.moderation && typeof record.moderation === "object"
      ? (record.moderation as Record<string, unknown>)
      : {};

  const webhookItemsRaw = Array.isArray(webhooksRaw.items) ? webhooksRaw.items : [];
  const webhookItems = webhookItemsRaw
    .map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
      if (!row) {
        return null;
      }

      const name = asText(row.name, 80);
      const url = asText(row.url, 512);
      if (!name || !url || !/^https?:\/\//i.test(url)) {
        return null;
      }

      return {
        id: asText(row.id, 64) || crypto.randomUUID(),
        name,
        url,
        enabled: asBoolean(row.enabled, true),
        secret: asText(row.secret, 120),
        eventTypes: asWebhookEventTypes(row.eventTypes),
      };
    })
    .filter((item): item is {
      id: string;
      name: string;
      url: string;
      enabled: boolean;
      secret: string;
      eventTypes: ChannelWebhookEventType[];
    } => Boolean(item))
    .slice(0, 25);

  const flaggedWordsActionRaw = asText(moderationRaw.flaggedWordsAction, 10).toLowerCase();

  return {
    integrations: {
      enabled: asBoolean(integrationsRaw.enabled, DEFAULT_CHANNEL_FEATURE_SETTINGS.integrations.enabled),
      provider: asText(integrationsRaw.provider, 80),
      providerApiUrl: asText(integrationsRaw.providerApiUrl, 512),
      syncMentions: asBoolean(
        integrationsRaw.syncMentions,
        DEFAULT_CHANNEL_FEATURE_SETTINGS.integrations.syncMentions
      ),
      allowedBotIds: asStringArray(integrationsRaw.allowedBotIds, 100, 80),
    },
    webhooks: {
      items: webhookItems,
    },
    apps: {
      allowedAppIds: asStringArray(appsRaw.allowedAppIds, 100, 80),
      allowPinnedApps: asBoolean(appsRaw.allowPinnedApps, DEFAULT_CHANNEL_FEATURE_SETTINGS.apps.allowPinnedApps),
      apiUrl: asText(appsRaw.apiUrl, 512),
    },
    moderation: {
      requireVerifiedEmail: asBoolean(
        moderationRaw.requireVerifiedEmail,
        DEFAULT_CHANNEL_FEATURE_SETTINGS.moderation.requireVerifiedEmail
      ),
      blockedWords: asStringArray(moderationRaw.blockedWords, 100, 80),
      slowmodeSeconds: asBoundedInt(
        moderationRaw.slowmodeSeconds,
        0,
        21600,
        DEFAULT_CHANNEL_FEATURE_SETTINGS.moderation.slowmodeSeconds
      ),
      flaggedWordsAction: flaggedWordsActionRaw === "block" ? "block" : "warn",
    },
  };
};

export const parseStoredChannelSettings = (rawSettingsJson: string | null | undefined) => {
  if (!rawSettingsJson || typeof rawSettingsJson !== "string") {
    return {} as Record<string, unknown>;
  }

  try {
    const parsed = JSON.parse(rawSettingsJson) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // noop
  }

  return {} as Record<string, unknown>;
};

export const getChannelFeatureSettings = async ({
  serverId,
  channelId,
}: {
  serverId: string;
  channelId: string;
}): Promise<ChannelFeatureSettings> => {
  const normalizedServerId = String(serverId ?? "").trim();
  const normalizedChannelId = String(channelId ?? "").trim();

  if (!normalizedServerId || !normalizedChannelId) {
    return { ...DEFAULT_CHANNEL_FEATURE_SETTINGS };
  }

  await ensureChannelOtherSettingsSchema();

  const rowResult = await db.execute(sql`
    select "rawSettingsJson"
    from "ChannelOtherSettings"
    where "channelId" = ${normalizedChannelId}
      and "serverId" = ${normalizedServerId}
    limit 1
  `);

  const row = (rowResult as unknown as { rows?: Array<{ rawSettingsJson: string | null }> }).rows?.[0];
  const parsed = parseStoredChannelSettings(row?.rawSettingsJson);

  return normalizeChannelFeatureSettings(parsed.channelFeatureSettings);
};

export const emitChannelWebhookEvent = async ({
  serverId,
  channelId,
  channelName,
  eventType,
  actorProfileId,
  payload,
}: {
  serverId: string;
  channelId: string;
  channelName?: string | null;
  eventType: string;
  actorProfileId?: string | null;
  payload: Record<string, unknown>;
}) => {
  const normalizedEventType = String(eventType ?? "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 80);
  if (!normalizedEventType) {
    return;
  }

  const settings = await getChannelFeatureSettings({ serverId, channelId });
  const enabledHooks = settings.webhooks.items.filter(
    (item) =>
      item.enabled &&
      /^https?:\/\//i.test(item.url) &&
      (item.eventTypes.length === 0 || item.eventTypes.includes(normalizedEventType as ChannelWebhookEventType))
  );

  if (enabledHooks.length === 0) {
    return;
  }

  const body = JSON.stringify({
    eventType: normalizedEventType,
    serverId,
    channelId,
    channelName: String(channelName ?? "").trim() || null,
    actorProfileId: String(actorProfileId ?? "").trim() || null,
    occurredAt: new Date().toISOString(),
    payload,
  });

  await Promise.all(
    enabledHooks.map(async (hook) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const signature = hook.secret ? createHmac("sha256", hook.secret).update(body).digest("hex") : "";

        await fetch(hook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-InAccord-Channel-Event": normalizedEventType,
            "X-InAccord-Channel-Id": channelId,
            "X-InAccord-Server-Id": serverId,
            ...(signature ? { "X-InAccord-Signature": signature } : {}),
          },
          body,
          cache: "no-store",
          signal: controller.signal,
        });
      } catch {
        // best effort only
      } finally {
        clearTimeout(timeout);
      }
    })
  );
};
