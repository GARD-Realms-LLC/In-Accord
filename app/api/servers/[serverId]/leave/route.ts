import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, member, server } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: { serverId: string } }
) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!params.serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const targetServer = await db.query.server.findFirst({
      where: and(eq(server.id, params.serverId), ne(server.profileId, profile.id)),
    });

    if (!targetServer) {
      return new NextResponse("Server not found", { status: 404 });
    }

    await db.delete(member).where(
      and(eq(member.serverId, params.serverId), eq(member.profileId, profile.id))
    );

    return NextResponse.json(targetServer)
  } catch (error) {
    console.log("[SERVER_ID_LEAVE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
