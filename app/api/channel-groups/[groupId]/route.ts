import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, member, MemberRole, server } from "@/lib/db";
import { ensureChannelGroupSchema } from "@/lib/channel-groups";
import { ensureChannelOtherSettingsSchema } from "@/lib/channel-discord-settings";
import { ensureChannelPermissionSchema } from "@/lib/channel-permissions";
import { ensureChannelThreadSchema } from "@/lib/channel-threads";
import { ensureChannelTopicSchema } from "@/lib/channel-topic";
import { ensureVoiceStateSchema } from "@/lib/voice-states";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId: rawGroupId } = await params;

    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as { name?: string; icon?: string } | null;
    const name = String(body?.name ?? "").trim();
    const icon =
      typeof body?.icon === "string" && body.icon.trim().length > 0
        ? body.icon.trim().slice(0, 16)
        : null;
    const groupId = String(rawGroupId ?? "").trim();

    if (!groupId) {
      return new NextResponse("Group ID missing", { status: 400 });
    }

    if (!name) {
      return new NextResponse("Group name is required", { status: 400 });
    }

    await ensureChannelGroupSchema();

    const groupResult = await db.execute(sql`
      select "id", "serverId"
      from "ChannelGroup"
      where "id" = ${groupId}
      limit 1
    `);

    const groupRow = (groupResult as unknown as {
      rows: Array<{ id: string; serverId: string }>;
    }).rows?.[0];

    if (!groupRow) {
      return new NextResponse("Group not found", { status: 404 });
    }

    const serverId = groupRow.serverId;

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
      columns: { id: true },
    });

    if (!isServerOwner && !authorizedMember) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await db.execute(sql`
      update "ChannelGroup"
      set
        "name" = ${name},
        "icon" = ${icon},
        "updatedAt" = ${new Date()}
      where "id" = ${groupId}
    `);

    return NextResponse.json({ ok: true, id: groupId, name, icon });
  } catch (error) {
    console.error("[CHANNEL_GROUP_PATCH]", error);

    const message = error instanceof Error ? error.message : String(error);
    if (/duplicate key|ChannelGroup_unique_name_per_server/i.test(message)) {
      return new NextResponse("Channel group name already exists in this server", { status: 409 });
    }

    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId: rawGroupId } = await params;

    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const groupId = String(rawGroupId ?? "").trim();

    if (!groupId) {
      return new NextResponse("Group ID missing", { status: 400 });
    }

    await ensureChannelGroupSchema();

    const groupResult = await db.execute(sql`
      select "id", "serverId"
      from "ChannelGroup"
      where "id" = ${groupId}
      limit 1
    `);

    const groupRow = (groupResult as unknown as {
      rows: Array<{ id: string; serverId: string }>;
    }).rows?.[0];

    if (!groupRow) {
      return new NextResponse("Group not found", { status: 404 });
    }

    const serverId = groupRow.serverId;

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
      columns: { id: true },
    });

    if (!isServerOwner && !authorizedMember) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await ensureChannelTopicSchema();
    await ensureChannelOtherSettingsSchema();
    await ensureChannelPermissionSchema();
    await ensureChannelThreadSchema();
    await ensureVoiceStateSchema();

    await db.transaction(async (tx) => {
      const channelResult = await tx.execute(sql`
        select "id"
        from "Channel"
        where "serverId" = ${serverId}
          and "channelGroupId" = ${groupId}
      `);

      const channelIds = ((channelResult as unknown as { rows?: Array<{ id: string | null }> }).rows ?? [])
        .map((row) => String(row.id ?? "").trim())
        .filter(Boolean);

      if (channelIds.length > 0) {
        await tx.execute(sql`
          delete from "ThreadReadState"
          where "threadId" in (
            select "id"
            from "ChannelThread"
            where "serverId" = ${serverId}
              and "channelId" in (${sql.join(channelIds.map((id) => sql`${id}`), sql`, `)})
          )
        `);

        await tx.execute(sql`
          delete from "ChannelThread"
          where "serverId" = ${serverId}
            and "channelId" in (${sql.join(channelIds.map((id) => sql`${id}`), sql`, `)})
        `);

        await tx.execute(sql`
          delete from "Message"
          where "channelId" in (${sql.join(channelIds.map((id) => sql`${id}`), sql`, `)})
        `);

        await tx.execute(sql`
          delete from "VoiceState"
          where "serverId" = ${serverId}
            and "channelId" in (${sql.join(channelIds.map((id) => sql`${id}`), sql`, `)})
        `);

        await tx.execute(sql`
          delete from "ChannelPermission"
          where "serverId" = ${serverId}
            and "channelId" in (${sql.join(channelIds.map((id) => sql`${id}`), sql`, `)})
        `);

        await tx.execute(sql`
          delete from "ChannelTopic"
          where "channelId" in (${sql.join(channelIds.map((id) => sql`${id}`), sql`, `)})
        `);

        await tx.execute(sql`
          delete from "ChannelOtherSettings"
          where "serverId" = ${serverId}
            and "channelId" in (${sql.join(channelIds.map((id) => sql`${id}`), sql`, `)})
        `);

        await tx.execute(sql`
          delete from "Channel"
          where "serverId" = ${serverId}
            and "id" in (${sql.join(channelIds.map((id) => sql`${id}`), sql`, `)})
        `);
      }

      await tx.execute(sql`
        delete from "ChannelGroup"
        where "id" = ${groupId}
      `);
    });

    return NextResponse.json({ ok: true, deletedGroupId: groupId });
  } catch (error) {
    console.error("[CHANNEL_GROUP_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
