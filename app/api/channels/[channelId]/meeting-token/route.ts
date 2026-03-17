import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

import { computeChannelPermissionForMember, resolveMemberContext } from "@/lib/channel-permissions";
import { currentProfile } from "@/lib/current-profile";
import { channel, ChannelType, db, member } from "@/lib/db";
import { buildMeetingRoomName, getLiveKitServerConfig } from "@/lib/livekit-meeting-server";

type Params = {
  params: Promise<{
    channelId: string;
  }>;
};

const resolveServerId = (request: Request) => {
  const { searchParams } = new URL(request.url);
  return String(searchParams.get("serverId") ?? "").trim();
};

export async function GET(request: Request, { params }: Params) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { channelId } = await params;
    const serverId = resolveServerId(request);

    if (!channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const currentMember = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
    });

    if (!currentMember) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const currentChannel = await db.query.channel.findFirst({
      where: and(eq(channel.id, channelId), eq(channel.serverId, serverId)),
    });

    if (!currentChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    if (currentChannel.type !== ChannelType.VIDEO) {
      return new NextResponse("Meeting token is only available on video channels", { status: 400 });
    }

    const memberContext = await resolveMemberContext({
      profileId: profile.id,
      serverId,
    });

    if (!memberContext) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const permissions = await computeChannelPermissionForMember({
      serverId,
      channelId,
      memberContext,
    });

    if (!permissions.allowConnect) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const liveKit = getLiveKitServerConfig();
    const roomName = buildMeetingRoomName(serverId, channelId);
    const accessToken = new AccessToken(liveKit.apiKey, liveKit.apiSecret, {
      identity: profile.id,
      name: profile.name,
      metadata: JSON.stringify({
        profileId: profile.id,
        serverId,
        channelId,
      }),
      attributes: {
        profileId: profile.id,
        serverId,
        channelId,
      },
      ttl: "2h",
    });

    accessToken.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: false,
    });

    return NextResponse.json({
      token: await accessToken.toJwt(),
      url: liveKit.url,
      roomName,
      participant: {
        profileId: profile.id,
        displayName: profile.name,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Error";
    const isConfigError = /LiveKit SFU is not configured/i.test(message);
    return new NextResponse(message, { status: isConfigError ? 503 : 500 });
  }
}
