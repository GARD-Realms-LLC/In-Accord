import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import {
  channelWebhookEventTypes,
  DEFAULT_CHANNEL_FEATURE_SETTINGS,
  normalizeChannelFeatureSettings,
  parseStoredChannelSettings,
} from "@/lib/channel-feature-settings";
import {
  createDefaultChannelCountingState,
  normalizeChannelCountingState,
} from "@/lib/channel-counting";
import { currentProfile } from "@/lib/current-profile";
import { db, member, server } from "@/lib/db";
import { MemberRole } from "@/lib/db/types";
import { ensureChannelOtherSettingsSchema } from "@/lib/channel-other-settings";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { integrationProviderKeys, getEffectiveIntegrationProviderCredentials } from "@/lib/integration-provider-config";
import { getUserPreferences } from "@/lib/user-preferences";

type Params = {
  params: Promise<{
    channelId: string;
  }>;
};

const providerLabelMap: Record<string, string> = {
  github: "GitHub",
  google: "Google",
  steam: "Steam",
  twitch: "Twitch",
  xbox: "Xbox",
  youtube: "YouTube",
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
    if (!context.currentMember && !context.isServerOwner && !hasInAccordAdministrativeAccess(profile.role)) {
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
    const parsed = parseStoredChannelSettings(row?.rawSettingsJson);
    const ownerPreferences = await getUserPreferences(
      context.isServerOwner ? profile.id : (await db.query.server.findFirst({ where: eq(server.id, serverId), columns: { profileId: true } }))?.profileId ?? profile.id
    );
    const effectiveProviderConfig = await getEffectiveIntegrationProviderCredentials();

    return NextResponse.json({
      settings: normalizeChannelFeatureSettings(parsed.channelFeatureSettings),
      catalog: {
        providers: integrationProviderKeys.map((key) => ({
          key,
          label: providerLabelMap[key] ?? key,
          configured: Boolean(effectiveProviderConfig[key].clientId && effectiveProviderConfig[key].clientSecret),
        })),
        bots: ownerPreferences.OtherBots.filter((item) => item.enabled).map((item) => ({
          id: item.id,
          name: item.name,
          applicationId: item.applicationId,
          commands: item.commands ?? [],
        })),
        apps: ownerPreferences.OtherApps.filter((item) => item.enabled).map((item) => ({
          id: item.id,
          name: item.name,
          applicationId: item.applicationId,
          clientId: item.clientId,
          redirectUri: item.redirectUri,
          scopes: item.scopes ?? [],
        })),
        webhookEventTypes: channelWebhookEventTypes.map((value) => ({
          value,
          label: value
            .toLowerCase()
            .split("_")
            .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
            .join(" "),
        })),
      },
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
      context.isServerOwner ||
      (role ? [MemberRole.ADMIN, MemberRole.MODERATOR].includes(role) : false) ||
      hasInAccordAdministrativeAccess(profile.role);

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

    const parsed = parseStoredChannelSettings(currentRow?.rawSettingsJson);
    const previousFeatureSettings = normalizeChannelFeatureSettings(parsed.channelFeatureSettings);
    const nextFeatureSettings = normalizeChannelFeatureSettings(body?.settings ?? DEFAULT_CHANNEL_FEATURE_SETTINGS);
    const countingSettingsChanged =
      previousFeatureSettings.counting.enabled !== nextFeatureSettings.counting.enabled ||
      previousFeatureSettings.counting.startingNumber !== nextFeatureSettings.counting.startingNumber ||
      previousFeatureSettings.counting.preventConsecutiveTurns !== nextFeatureSettings.counting.preventConsecutiveTurns;

    const nextParsed: Record<string, unknown> = {
      ...parsed,
      channelFeatureSettings: nextFeatureSettings,
      channelCountingState: countingSettingsChanged
        ? createDefaultChannelCountingState(nextFeatureSettings.counting)
        : normalizeChannelCountingState(parsed.channelCountingState, nextFeatureSettings.counting),
    };

    const nextRaw = JSON.stringify(nextParsed);

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
