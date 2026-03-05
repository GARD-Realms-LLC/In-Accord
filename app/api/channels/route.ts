import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, MemberRole, member, server } from "@/lib/db";
import { ensureChannelGroupSchema } from "@/lib/channel-groups";

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();
    const { name, type, channelGroupId } = await req.json();
    const { searchParams } = new URL(req.url);

    const serverId = searchParams.get("serverId");

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (name.toLowerCase() === "general") {
      return new NextResponse("Name cannot be 'general'", { status: 400 })
    }

    await ensureChannelGroupSchema();

    const isServerOwner = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
      columns: { id: true },
    });

    const authorizedMember = await db.query.member.findFirst({
      where: and(
        eq(member.serverId, serverId),
        eq(member.profileId, profile.id),
        inArray(member.role, [MemberRole.ADMIN, MemberRole.MODERATOR])
      ),
    });

    if (!isServerOwner && !authorizedMember) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const now = new Date();
    const id = uuidv4();
    const normalizedGroupId =
      typeof channelGroupId === "string" && channelGroupId.trim().length > 0
        ? channelGroupId.trim()
        : null;

    if (normalizedGroupId) {
      const groupResult = await db.execute(sql`
        select "id"
        from "ChannelGroup"
        where "id" = ${normalizedGroupId}
          and "serverId" = ${serverId}
        limit 1
      `);

      const groupExists = (groupResult as unknown as { rows: Array<{ id: string }> }).rows?.[0];
      if (!groupExists) {
        return new NextResponse("Channel group not found", { status: 404 });
      }
    }

    await db.execute(sql`
      insert into "Channel" (
        "id",
        "name",
        "type",
        "profileId",
        "serverId",
        "channelGroupId",
        "createdAt",
        "updatedAt"
      )
      values (
        ${id},
        ${name},
        ${type},
        ${profile.id},
        ${serverId},
        ${normalizedGroupId},
        ${now},
        ${now}
      )
    `);

    const updatedServer = await db.query.server.findFirst({
      where: eq(server.id, serverId),
      with: {
        channels: true,
      },
    });

    return NextResponse.json(updatedServer)

  } catch (error) {
    console.log("[CHANNEL_POST]", error);

    const message = error instanceof Error ? error.message : String(error);
    if (/duplicate key|Channel_unique_name_per_server/i.test(message)) {
      return new NextResponse("Channel name already exists in this server", { status: 409 });
    }

    return new NextResponse("Internal Error", { status: 500 });
  }
}