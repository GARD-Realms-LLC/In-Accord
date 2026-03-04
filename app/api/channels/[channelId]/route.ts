import { NextResponse } from "next/server";
import { MemberRole } from "@/lib/db";
import { and, eq, inArray, ne } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, member, server } from "@/lib/db";

export async function DELETE(
  req: Request,
  { params }: { params: { channelId: string } }
) {
  try {
    const profile = await currentProfile();
    const { searchParams } = new URL(req.url);

    const serverId = searchParams.get("serverId");

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!params.channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
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

    await db.delete(channel).where(
      and(
        eq(channel.id, params.channelId),
        eq(channel.serverId, serverId),
        ne(channel.name, "general")
      )
    );

    const currentServer = await db.query.server.findFirst({
      where: eq(server.id, serverId),
    });

    return NextResponse.json(currentServer);
  } catch (error) {
    console.log("[CHANNEL_ID_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { channelId: string } }
) {
  try {
    const profile = await currentProfile();
    const { name, type } = await req.json();
    const { searchParams } = new URL(req.url);

    const serverId = searchParams.get("serverId");

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!params.channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    if (name === "general") {
      return new NextResponse("Name cannot be 'general'", { status: 400 });
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

    await db.update(channel).set({
      name,
      type,
      updatedAt: new Date(),
    }).where(
      and(
        eq(channel.id, params.channelId),
        eq(channel.serverId, serverId),
        ne(channel.name, "general")
      )
    );

    const currentServer = await db.query.server.findFirst({
      where: eq(server.id, serverId),
    });

    return NextResponse.json(currentServer);
  } catch (error) {
    console.log("[CHANNEL_ID_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
