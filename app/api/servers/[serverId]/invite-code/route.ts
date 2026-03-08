import { v4 as uuidv4 } from "uuid";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, server } from "@/lib/db";
import { appendServerInviteHistory } from "@/lib/server-invite-store";

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

    const nextInviteCode = uuidv4();

    await db
      .update(server)
      .set({
        inviteCode: nextInviteCode,
      })
      .where(and(eq(server.id, serverId), eq(server.profileId, profile.id)));

    await appendServerInviteHistory(serverId, {
      code: nextInviteCode,
      source: "regenerated",
      createdByProfileId: profile.id,
    });

    const updatedServer = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
    });

    return NextResponse.json(updatedServer)
  } catch (error) {
    console.log(error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
