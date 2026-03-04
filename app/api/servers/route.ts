import { v4 as uuidv4 } from "uuid";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, ChannelType, db, MemberRole, member, server } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { name, imageUrl } = await req.json();
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorize", { status: 401 });
    }

    const serverId = uuidv4();
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx.insert(server).values({
        id: serverId,
        profileId: profile.id,
        name,
        imageUrl,
        inviteCode: uuidv4(),
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(channel).values({
        id: uuidv4(),
        name: "general",
        type: ChannelType.TEXT,
        profileId: profile.id,
        serverId,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(member).values({
        id: uuidv4(),
        profileId: profile.id,
        serverId,
        role: MemberRole.ADMIN,
        createdAt: now,
        updatedAt: now,
      });
    });

    const createdServer = await db.query.server.findFirst({
      where: eq(server.id, serverId),
    });

    return NextResponse.json(createdServer)

  } catch (error) {
    console.log("[SERVERS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}