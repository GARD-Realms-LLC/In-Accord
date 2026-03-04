import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, MemberRole, member, server } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();
    const { name, type } = await req.json();
    const { searchParams } = new URL(req.url);

    const serverId = searchParams.get("serverId");

    if (!profile) {
      return new NextResponse("Unauthorize", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (name.toLowerCase() === "general") {
      return new NextResponse("Name cannot be 'general'", { status: 400 })
    }

    const authorizedMember = await db.query.member.findFirst({
      where: and(
        eq(member.serverId, serverId),
        eq(member.profileId, profile.id),
        inArray(member.role, [MemberRole.ADMIN, MemberRole.MODERATOR])
      ),
    });

    if (!authorizedMember) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const now = new Date();
    await db.insert(channel).values({
      id: uuidv4(),
      profileId: profile.id,
      serverId,
      name,
      type,
      createdAt: now,
      updatedAt: now,
    });

    const updatedServer = await db.query.server.findFirst({
      where: eq(server.id, serverId),
      with: {
        channels: true,
      },
    });

    return NextResponse.json(updatedServer)

  } catch (error) {
    console.log("[CHANNEL_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}