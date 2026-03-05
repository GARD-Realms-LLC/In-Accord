import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, member, message } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();
    const { content, fileUrl } = await req.json();
    const { searchParams } = new URL(req.url);

    const serverId = searchParams.get("serverId");
    const channelId = searchParams.get("channelId");

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    const currentMember = await db.query.member.findFirst({
      where: and(
        eq(member.serverId, serverId),
        eq(member.profileId, profile.id)
      ),
    });

    if (!currentMember) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const currentChannel = await db.query.channel.findFirst({
      where: and(
        eq(channel.id, channelId),
        eq(channel.serverId, serverId)
      ),
    });

    if (!currentChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    const normalizedContent = typeof content === "string" ? content.trim() : "";

    if (!normalizedContent && !fileUrl) {
      return new NextResponse("Content is required", { status: 400 });
    }

    const now = new Date();

    const inserted = await db
      .insert(message)
      .values({
        id: uuidv4(),
        content: normalizedContent || "[attachment]",
        fileUrl: fileUrl ?? null,
        memberId: currentMember.id,
        channelId: currentChannel.id,
        deleted: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json(inserted[0]);
  } catch (error) {
    console.error("[SOCKET_MESSAGES_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
