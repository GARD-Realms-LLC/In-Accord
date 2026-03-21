import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { resolveServerRouteContext } from "@/lib/route-slug-resolver";
import { hasServerMembership, listServerSlashCommands } from "@/lib/slash-commands";

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

    const serverParam = String(serverId ?? "").trim();
    if (!serverParam) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const resolvedServer = await resolveServerRouteContext({
      profileId: profile.id,
      serverParam,
      profileRole: profile.role,
    });

    if (!resolvedServer) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const normalizedServerId = resolvedServer.id;

    const membership = await hasServerMembership({
      serverId: normalizedServerId,
      profileId: profile.id,
    });

    if (!membership) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const channelId = String(searchParams.get("channelId") ?? "").trim();

    const commands = await listServerSlashCommands(normalizedServerId, { channelId });

    return NextResponse.json({
      serverId: normalizedServerId,
      commandCount: commands.length,
      commands,
    });
  } catch (error) {
    console.error("[SERVERS_SERVER_ID_SLASH_COMMANDS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
