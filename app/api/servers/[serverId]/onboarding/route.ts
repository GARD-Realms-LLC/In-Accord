import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { ChannelType, channel, db } from "@/lib/db";
import { resolveServerRouteContext } from "@/lib/route-slug-resolver";
import { getServerManagementAccess } from "@/lib/server-management-access";
import {
  getServerOnboardingConfig,
  setServerOnboardingConfig,
  type ServerOnboardingConfig,
} from "@/lib/server-onboarding-store";

type OnboardingPatchBody = Partial<ServerOnboardingConfig>;

async function getServerChannels(serverId: string) {
  const channels = await db.query.channel.findMany({
    where: eq(channel.serverId, serverId),
    orderBy: (channelTable, { asc }) => [asc(channelTable.name)],
  });

  return channels.map((channelItem) => ({
    id: channelItem.id,
    name: channelItem.name,
    type: channelItem.type,
  }));
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const resolvedServer = await resolveServerRouteContext({
      profileId: profile.id,
      serverParam: serverId,
      profileRole: profile.role,
    });

    if (!resolvedServer) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const resolvedServerId = resolvedServer.id;

    const access = await getServerManagementAccess({ serverId: resolvedServerId, profileId: profile.id, profileRole: profile.role });

    if (!access.canView) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const config = await getServerOnboardingConfig(resolvedServerId);
    const channels = await getServerChannels(resolvedServerId);

    return NextResponse.json({
      serverId: resolvedServerId,
      canManageOnboarding: access.canManage,
      channels,
      config,
    });
  } catch (error) {
    console.log("[SERVERS_SERVER_ID_ONBOARDING_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const resolvedServer = await resolveServerRouteContext({
      profileId: profile.id,
      serverParam: serverId,
      profileRole: profile.role,
    });

    if (!resolvedServer) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const resolvedServerId = resolvedServer.id;

    const access = await getServerManagementAccess({ serverId: resolvedServerId, profileId: profile.id, profileRole: profile.role });

    if (!access.canManage) {
      return new NextResponse("Only the server owner or an In-Accord administrator can manage onboarding.", { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as OnboardingPatchBody;
    const channels = await getServerChannels(resolvedServerId);
    const validTextChannelIds = new Set(
      channels
        .filter(
          (channelItem) =>
            channelItem.type === ChannelType.TEXT || channelItem.type === ChannelType.ANNOUNCEMENT
        )
        .map((channelItem) => channelItem.id)
    );

    const nextChecklistIds = Array.isArray(body.checklistChannelIds)
      ? body.checklistChannelIds.filter((id): id is string => typeof id === "string" && validTextChannelIds.has(id))
      : undefined;

    const nextResourceIds = Array.isArray(body.resourceChannelIds)
      ? body.resourceChannelIds.filter((id): id is string => typeof id === "string" && validTextChannelIds.has(id))
      : undefined;

    const nextConfig = await setServerOnboardingConfig(resolvedServerId, {
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      welcomeMessage: typeof body.welcomeMessage === "string" ? body.welcomeMessage : undefined,
      bannerPreset: typeof body.bannerPreset === "string" ? body.bannerPreset : undefined,
      bannerUrl: typeof body.bannerUrl === "string" ? body.bannerUrl : undefined,
      checklistChannelIds: nextChecklistIds,
      resourceChannelIds: nextResourceIds,
      prompts: Array.isArray(body.prompts) ? body.prompts : undefined,
    });

    return NextResponse.json({
      serverId: resolvedServerId,
      canManageOnboarding: true,
      channels,
      config: nextConfig,
    });
  } catch (error) {
    console.log("[SERVERS_SERVER_ID_ONBOARDING_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
