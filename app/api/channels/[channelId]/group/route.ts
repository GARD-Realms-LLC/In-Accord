import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";

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

    const draggedChannelResult = await db.execute(sql`
      select
        c."id" as "id",
        c."type" as "type",
        c."channelGroupId" as "channelGroupId",
        c."sortOrder" as "sortOrder",
        c."name" as "name"
      from "Channel" c
      where c."id" = ${channelId}
        and c."serverId" = ${serverId}
      limit 1
    `);

    const draggedChannel = (
      draggedChannelResult as unknown as {
        rows: Array<{
          id: string;
          type: string;
          channelGroupId: string | null;
          sortOrder: number | string | null;
          name: string;
        }>;
      }
    ).rows?.[0];

    if (!draggedChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    if (String(draggedChannel.name ?? "").trim().toLowerCase() === "general") {
      return new NextResponse("Cannot move default channel", { status: 400 });
    }

    const effectiveChannelGroupId = channelGroupId;

    if (effectiveChannelGroupId) {
      const targetGroup = await db.execute(sql`
        select "id"
        from "ChannelGroup"
        where "id" = ${effectiveChannelGroupId}
          and "serverId" = ${serverId}
        limit 1
      `);

      const exists = (targetGroup as unknown as { rows: Array<{ id: string }> }).rows?.[0];
      if (!exists) {
        return new NextResponse("Channel group not found", { status: 404 });
      }
    }

    const currentGroupId = draggedChannel.channelGroupId ?? null;
    const currentSortOrder = Number(draggedChannel.sortOrder ?? 0);

    if (currentGroupId !== effectiveChannelGroupId) {
      const maxSortOrderResult = await db.execute(sql`
        select coalesce(max(c."sortOrder"), 0) as "maxSortOrder"
        from "Channel" c
        where c."serverId" = ${serverId}
          and c."channelGroupId" is not distinct from ${effectiveChannelGroupId}
      `);

      const nextSortOrder =
        Number(
          (
            maxSortOrderResult as unknown as {
              rows: Array<{ maxSortOrder: number | string | null }>;
            }
          ).rows?.[0]?.maxSortOrder ?? 0
        ) + 1;

      await db.transaction(async (tx) => {
        await tx.execute(sql`
          update "Channel" c
          set
            "sortOrder" = c."sortOrder" - 1,
            "updatedAt" = ${new Date()}
          where c."serverId" = ${serverId}
            and c."channelGroupId" is not distinct from ${currentGroupId}
            and c."sortOrder" > ${currentSortOrder}
        `);

        await tx.execute(sql`
          update "Channel"
          set
            "channelGroupId" = ${effectiveChannelGroupId},
            "sortOrder" = ${nextSortOrder},
            "updatedAt" = ${new Date()}
          where "id" = ${channelId}
            and "serverId" = ${serverId}
        `);
      });
    }

    return NextResponse.json({ ok: true, channelId, channelGroupId: effectiveChannelGroupId });
  } catch (error) {
    console.error("[CHANNEL_GROUP_MOVE_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
