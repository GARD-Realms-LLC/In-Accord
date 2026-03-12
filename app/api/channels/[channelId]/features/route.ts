import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, member, server } from "@/lib/db";
import { MemberRole } from "@/lib/db/types";
import { ensureChannelOtherSettingsSchema } from "@/lib/channel-discord-settings";

type Params = {
  params: Promise<{
    channelId: string;
  }>;
};

type ChannelFeatureSettings = {
  integrations: {
    enabled: boolean;
    provider: string;
    syncMentions: boolean;
  };
  webhooks: {
    items: Array<{
      id: string;
      name: string;
      url: string;
      enabled: boolean;
    }>;
  };
  apps: {
    allowedAppIds: string[];
    allowPinnedApps: boolean;
  };
  moderation: {
    requireVerifiedEmail: boolean;
    blockedWords: string[];
    slowmodeSeconds: number;
    flaggedWordsAction: "warn" | "block";
  };
};

const DEFAULT_FEATURE_SETTINGS: ChannelFeatureSettings = {
  integrations: {
    enabled: false,
    provider: "",
    syncMentions: false,
  },
  webhooks: {
    items: [],
  },
  apps: {
    allowedAppIds: [],
    allowPinnedApps: true,
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

const normalizeFeatureSettings = (input: unknown): ChannelFeatureSettings => {
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
      if (!name || !url) {
        return null;
      }

      return {
        id: asText(row.id, 64) || crypto.randomUUID(),
        name,
        url,
        enabled: asBoolean(row.enabled, true),
      };
    })
    .filter(
      (item): item is { id: string; name: string; url: string; enabled: boolean } => Boolean(item)
    )
    .slice(0, 25);

  const flaggedWordsActionRaw = asText(moderationRaw.flaggedWordsAction, 10).toLowerCase();

  return {
    integrations: {
      enabled: asBoolean(integrationsRaw.enabled, DEFAULT_FEATURE_SETTINGS.integrations.enabled),
      provider: asText(integrationsRaw.provider, 80),
      syncMentions: asBoolean(
        integrationsRaw.syncMentions,
        DEFAULT_FEATURE_SETTINGS.integrations.syncMentions
      ),
    },
    webhooks: {
      items: webhookItems,
    },
    apps: {
      allowedAppIds: asStringArray(appsRaw.allowedAppIds, 100, 80),
      allowPinnedApps: asBoolean(appsRaw.allowPinnedApps, DEFAULT_FEATURE_SETTINGS.apps.allowPinnedApps),
    },
    moderation: {
      requireVerifiedEmail: asBoolean(
        moderationRaw.requireVerifiedEmail,
        DEFAULT_FEATURE_SETTINGS.moderation.requireVerifiedEmail
      ),
      blockedWords: asStringArray(moderationRaw.blockedWords, 100, 80),
      slowmodeSeconds: asBoundedInt(
        moderationRaw.slowmodeSeconds,
        0,
        21600,
        DEFAULT_FEATURE_SETTINGS.moderation.slowmodeSeconds
      ),
      flaggedWordsAction: flaggedWordsActionRaw === "block" ? "block" : "warn",
    },
  };
};

const parseStoredSettings = (rawSettingsJson: string | null | undefined) => {
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

const getMemberContext = async (profileId: string, serverId: string) => {
  const currentMember = await db.query.member.findFirst({
    where: and(eq(member.serverId, serverId), eq(member.profileId, profileId)),
    columns: { id: true, role: true },
  });

  const isServerOwner = await db.query.server.findFirst({
    where: and(eq(server.id, serverId), eq(server.profileId, profileId)),
    columns: { id: true },
  });

  return {
    currentMember,
    isServerOwner: Boolean(isServerOwner),
  };
};

export async function GET(req: Request, { params }: Params) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { channelId: rawChannelId } = await params;
    const { searchParams } = new URL(req.url);
    const serverId = String(searchParams.get("serverId") ?? "").trim();
    const channelId = String(rawChannelId ?? "").trim();

    if (!serverId || !channelId) {
      return new NextResponse("Server ID and channel ID are required", { status: 400 });
    }

    const context = await getMemberContext(profile.id, serverId);
    if (!context.currentMember && !context.isServerOwner) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await ensureChannelOtherSettingsSchema();

    const channelRow = await db.execute(sql`
      select "id"
      from "Channel"
      where "id" = ${channelId}
        and "serverId" = ${serverId}
      limit 1
    `);

    const existingChannel = (channelRow as unknown as { rows?: Array<{ id: string }> }).rows?.[0];
    if (!existingChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    const rowResult = await db.execute(sql`
      select "rawSettingsJson"
      from "ChannelOtherSettings"
      where "channelId" = ${channelId}
        and "serverId" = ${serverId}
      limit 1
    `);

    const row = (rowResult as unknown as { rows?: Array<{ rawSettingsJson: string | null }> }).rows?.[0];
    const parsed = parseStoredSettings(row?.rawSettingsJson);

    return NextResponse.json({
      settings: normalizeFeatureSettings(parsed.channelFeatureSettings),
    });
  } catch (error) {
    console.error("[CHANNEL_FEATURES_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { channelId: rawChannelId } = await params;
    const body = (await req.json().catch(() => null)) as
      | {
          serverId?: string;
          settings?: unknown;
        }
      | null;

    const serverId = String(body?.serverId ?? "").trim();
    const channelId = String(rawChannelId ?? "").trim();

    if (!serverId || !channelId) {
      return new NextResponse("Server ID and channel ID are required", { status: 400 });
    }

    const context = await getMemberContext(profile.id, serverId);
    const role = context.currentMember?.role;
    const canManage =
      context.isServerOwner || (role ? [MemberRole.ADMIN, MemberRole.MODERATOR].includes(role) : false);

    if (!canManage) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await ensureChannelOtherSettingsSchema();

    const channelRow = await db.execute(sql`
      select "id"
      from "Channel"
      where "id" = ${channelId}
        and "serverId" = ${serverId}
      limit 1
    `);

    const existingChannel = (channelRow as unknown as { rows?: Array<{ id: string }> }).rows?.[0];
    if (!existingChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    const currentRowResult = await db.execute(sql`
      select "rawSettingsJson"
      from "ChannelOtherSettings"
      where "channelId" = ${channelId}
        and "serverId" = ${serverId}
      limit 1
    `);

    const currentRow = (currentRowResult as unknown as {
      rows?: Array<{ rawSettingsJson: string | null }>;
    }).rows?.[0];

    const parsed = parseStoredSettings(currentRow?.rawSettingsJson);
    const nextFeatureSettings = normalizeFeatureSettings(body?.settings);

    const nextRaw = JSON.stringify({
      ...parsed,
      channelFeatureSettings: nextFeatureSettings,
    });

    await db.execute(sql`
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

    return NextResponse.json({
      ok: true,
      settings: nextFeatureSettings,
    });
  } catch (error) {
    console.error("[CHANNEL_FEATURES_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
