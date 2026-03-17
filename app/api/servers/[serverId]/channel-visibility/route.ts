import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, member, server } from "@/lib/db";
import { getServerProfileSettings, setServerProfileSettings } from "@/lib/server-profile-settings-store";

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

    const body = (await req.json().catch(() => null)) as
      | {
          action?: "hide" | "unhideAll";
          channelId?: string;
        }
      | null;

    const action = String(body?.action ?? "").trim();
    if (action !== "hide" && action !== "unhideAll") {
      return new NextResponse("Invalid action", { status: 400 });
    }

    const serverRecord = await db.query.server.findFirst({
      where: eq(server.id, serverId),
      columns: { id: true, profileId: true },
    });

    if (!serverRecord) {
      return new NextResponse("Server not found", { status: 404 });
    }

    const membership = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
      columns: { id: true },
    });

    const isServerOwner = serverRecord.profileId === profile.id;
    if (!isServerOwner && !membership) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const currentSettings = await getServerProfileSettings(serverId);

    if (action === "unhideAll") {
      const nextSettings = await setServerProfileSettings(serverId, {
        hideAllChannels: false,
        hiddenChannelIds: [],
      });

      return NextResponse.json({
        hideAllChannels: nextSettings.hideAllChannels,
        hiddenChannelIds: nextSettings.hiddenChannelIds,
      });
    }

    const channelId = String(body?.channelId ?? "").trim();
    if (!channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    const channelRecord = await db.query.channel.findFirst({
      where: and(eq(channel.serverId, serverId), eq(channel.id, channelId)),
      columns: { id: true },
    });

    if (!channelRecord) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    const hiddenChannelIds = Array.from(new Set([...currentSettings.hiddenChannelIds, channelId]));
    const nextSettings = await setServerProfileSettings(serverId, {
      hideAllChannels: false,
      hiddenChannelIds,
    });

    return NextResponse.json({
      hideAllChannels: nextSettings.hideAllChannels,
      hiddenChannelIds: nextSettings.hiddenChannelIds,
    });
  } catch (error) {
    console.log("[SERVERS_SERVER_ID_CHANNEL_VISIBILITY_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
