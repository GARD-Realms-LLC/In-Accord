import { NextResponse } from "next/server";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, member, MemberRole, server } from "@/lib/db";
import { ensureChannelGroupSchema } from "@/lib/channel-groups";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId: rawChannelId } = await params;

    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as
      | { serverId?: string; channelGroupId?: string | null }
      | null;

    const serverId = String(body?.serverId ?? "").trim();
    const channelId = String(rawChannelId ?? "").trim();
    const channelGroupId =
      typeof body?.channelGroupId === "string" && body.channelGroupId.trim().length > 0
        ? body.channelGroupId.trim()
        : null;

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
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

    if (channelGroupId) {
      const targetGroup = await db.execute(sql`
        select "id"
        from "ChannelGroup"
        where "id" = ${channelGroupId}
          and "serverId" = ${serverId}
        limit 1
      `);

      const exists = (targetGroup as unknown as { rows: Array<{ id: string }> }).rows?.[0];
      if (!exists) {
        return new NextResponse("Channel group not found", { status: 404 });
      }
    }

    await db.execute(sql`
      update "Channel"
      set
        "channelGroupId" = ${channelGroupId},
        "updatedAt" = ${new Date()}
      where "id" = ${channelId}
        and "serverId" = ${serverId}
        and "name" <> 'general'
    `);

    return NextResponse.json({ ok: true, channelId, channelGroupId });
  } catch (error) {
    console.error("[CHANNEL_GROUP_MOVE_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
