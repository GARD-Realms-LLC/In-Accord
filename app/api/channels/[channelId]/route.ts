import { NextResponse } from "next/server";
import { MemberRole } from "@/lib/db";
import { and, eq, inArray, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, member, server } from "@/lib/db";
import { ensureChannelGroupSchema } from "@/lib/channel-groups";
import { ensureChannelTopicSchema } from "@/lib/channel-topic";
import { ensureSystemChannelSchema } from "@/lib/system-channels";

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

    await ensureSystemChannelSchema();

    const systemChannelResult = await db.execute(sql`
      select "id"
      from "Channel"
      where "id" = ${params.channelId}
        and "serverId" = ${serverId}
        and "isSystem" = true
      limit 1
    `);

    const systemChannelId = (systemChannelResult as unknown as {
      rows: Array<{ id: string }>;
    }).rows?.[0]?.id;

    if (systemChannelId) {
      return new NextResponse("System channels cannot be deleted", { status: 400 });
    }

    await db.transaction(async (tx) => {
      await ensureChannelTopicSchema();

      await tx.execute(sql`
        delete from "Message"
        where "channelId" = ${params.channelId}
      `);

      await tx.execute(sql`
        delete from "ChannelTopic"
        where "channelId" = ${params.channelId}
      `);

      await tx.delete(channel).where(
        and(
          eq(channel.id, params.channelId),
          eq(channel.serverId, serverId)
        )
      );
    });

    const currentServer = await db.query.server.findFirst({
      where: eq(server.id, serverId),
    });

    return NextResponse.json(currentServer);
  } catch (error) {
    console.log("[CHANNEL_ID_DELETE]", error);

    const message = error instanceof Error ? error.message : String(error);
    if (/foreign key|violates/i.test(message)) {
      return new NextResponse("Unable to delete channel because dependent records still exist", { status: 409 });
    }

    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { channelId: string } }
) {
  try {
    const profile = await currentProfile();
    const { name, type, channelGroupId, topic } = await req.json();
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

    await ensureChannelGroupSchema();
    await ensureChannelTopicSchema();

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

    const existingChannelResult = await db.execute(sql`
      select "id", "name"
      from "Channel"
      where "id" = ${params.channelId}
        and "serverId" = ${serverId}
      limit 1
    `);

    const existingChannel = (existingChannelResult as unknown as {
      rows: Array<{ id: string; name: string }>;
    }).rows?.[0];

    if (!existingChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

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

    const incomingName = String(name ?? "").trim();
    const nextName = incomingName;
    const nextTopic = typeof topic === "string" ? topic.trim() : "";

    if (!nextName) {
      return new NextResponse("Name is required", { status: 400 });
    }

    if (nextTopic.length > 500) {
      return new NextResponse("Channel topic must be 500 characters or fewer", { status: 400 });
    }

    await db.execute(sql`
      update "Channel"
      set
        "name" = ${nextName},
        "type" = ${type},
        "channelGroupId" = ${normalizedGroupId},
        "updatedAt" = ${new Date()}
      where "id" = ${params.channelId}
        and "serverId" = ${serverId}
    `);

    await db.execute(sql`
      insert into "ChannelTopic" ("channelId", "serverId", "topic", "createdAt", "updatedAt")
      values (${params.channelId}, ${serverId}, ${nextTopic || null}, now(), now())
      on conflict ("channelId") do update
      set
        "topic" = excluded."topic",
        "serverId" = excluded."serverId",
        "updatedAt" = now()
    `);

    const currentServer = await db.query.server.findFirst({
      where: eq(server.id, serverId),
    });

    return NextResponse.json(currentServer);
  } catch (error) {
    console.log("[CHANNEL_ID_PATCH]", error);

    const message = error instanceof Error ? error.message : String(error);
    if (/duplicate key|Channel_unique_name_per_server/i.test(message)) {
      return new NextResponse("Channel name already exists in this server", { status: 409 });
    }

    return new NextResponse("Internal Error", { status: 500 });
  }
}
