import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { ChannelType, channel, db, member, server } from "@/lib/db";
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

    const requesterMembership = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
    });

    if (!requesterMembership) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const ownerServer = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
    });

    const config = await getServerOnboardingConfig(serverId);
    const channels = await getServerChannels(serverId);

    return NextResponse.json({
      serverId,
      canManageOnboarding: Boolean(ownerServer),
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

    const ownerServer = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
    });

    if (!ownerServer) {
      return new NextResponse("Only the server owner can manage onboarding.", { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as OnboardingPatchBody;
    const channels = await getServerChannels(serverId);
    const validTextChannelIds = new Set(
      channels.filter((channelItem) => channelItem.type === ChannelType.TEXT).map((channelItem) => channelItem.id)
    );

    const nextChecklistIds = Array.isArray(body.checklistChannelIds)
      ? body.checklistChannelIds.filter((id): id is string => typeof id === "string" && validTextChannelIds.has(id))
      : undefined;

    const nextResourceIds = Array.isArray(body.resourceChannelIds)
      ? body.resourceChannelIds.filter((id): id is string => typeof id === "string" && validTextChannelIds.has(id))
      : undefined;

    const nextConfig = await setServerOnboardingConfig(serverId, {
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      welcomeMessage: typeof body.welcomeMessage === "string" ? body.welcomeMessage : undefined,
      bannerPreset: typeof body.bannerPreset === "string" ? body.bannerPreset : undefined,
      bannerUrl: typeof body.bannerUrl === "string" ? body.bannerUrl : undefined,
      checklistChannelIds: nextChecklistIds,
      resourceChannelIds: nextResourceIds,
      prompts: Array.isArray(body.prompts) ? body.prompts : undefined,
    });

    return NextResponse.json({
      serverId,
      canManageOnboarding: true,
      channels,
      config: nextConfig,
    });
  } catch (error) {
    console.log("[SERVERS_SERVER_ID_ONBOARDING_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
