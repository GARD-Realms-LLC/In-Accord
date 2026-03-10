import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, member } from "@/lib/db";
import { resolveServerRouteContext } from "@/lib/route-slug-resolver";
import { listServerSlashCommands } from "@/lib/slash-commands";

export async function GET(
  _req: Request,
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
    });

    if (!resolvedServer) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const normalizedServerId = resolvedServer.id;

    const membership = await db.query.member.findFirst({
      where: and(eq(member.serverId, normalizedServerId), eq(member.profileId, profile.id)),
    });

    if (!membership) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const commands = await listServerSlashCommands(normalizedServerId);

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
