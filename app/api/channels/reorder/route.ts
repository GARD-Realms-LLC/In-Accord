import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, member, MemberRole, server } from "@/lib/db";
import { ensureChannelGroupSchema } from "@/lib/channel-groups";

export async function PATCH(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as
      | {
          serverId?: string;
          draggedChannelId?: string;
          targetChannelId?: string;
        }
      | null;

    const serverId = String(body?.serverId ?? "").trim();
    const draggedChannelId = String(body?.draggedChannelId ?? "").trim();
    const targetChannelId = String(body?.targetChannelId ?? "").trim();

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!draggedChannelId || !targetChannelId) {
      return new NextResponse("draggedChannelId and targetChannelId are required", { status: 400 });
    }

    if (draggedChannelId === targetChannelId) {
      return NextResponse.json({ ok: true });
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
      columns: { id: true },
    });

    if (!isServerOwner && !authorizedMember) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const channelResult = await db.execute(sql`
      select
        c."id" as "id",
        c."name" as "name",
        c."type" as "type",
        c."channelGroupId" as "channelGroupId",
        c."sortOrder" as "sortOrder"
      from "Channel" c
      where c."serverId" = ${serverId}
        and c."id" in (${draggedChannelId}, ${targetChannelId})
    `);

    const rows = (channelResult as unknown as {
      rows: Array<{
        id: string;
        name: string;
        type: string;
        channelGroupId: string | null;
        sortOrder: number | string | null;
      }>;
    }).rows;

    const dragged = rows.find((row) => row.id === draggedChannelId);
    const target = rows.find((row) => row.id === targetChannelId);

    if (!dragged || !target) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    if (String(dragged.name ?? "").trim().toLowerCase() === "general") {
      return new NextResponse("Cannot move default channel", { status: 400 });
    }

    const draggedName = String(dragged.name ?? "").trim().toLowerCase();
    const fromGroupId = dragged.channelGroupId ?? null;
    const toGroupIdRaw = target.channelGroupId ?? null;
    const toGroupId =
      draggedName === "stage"
        ? null
        : toGroupIdRaw;
    const fromSort = Number(dragged.sortOrder ?? 0);
    const toSort = Number(target.sortOrder ?? 0);

    await db.transaction(async (tx) => {
      const now = new Date();

      if (fromGroupId === toGroupId) {
        if (fromSort < toSort) {
          await tx.execute(sql`
            update "Channel" c
            set
              "sortOrder" = c."sortOrder" - 1,
              "updatedAt" = ${now}
            where c."serverId" = ${serverId}
              and c."channelGroupId" is not distinct from ${fromGroupId}
              and c."sortOrder" > ${fromSort}
              and c."sortOrder" <= ${toSort}
              and c."id" <> ${draggedChannelId}
          `);
        } else {
          await tx.execute(sql`
            update "Channel" c
            set
              "sortOrder" = c."sortOrder" + 1,
              "updatedAt" = ${now}
            where c."serverId" = ${serverId}
              and c."channelGroupId" is not distinct from ${fromGroupId}
              and c."sortOrder" >= ${toSort}
              and c."sortOrder" < ${fromSort}
              and c."id" <> ${draggedChannelId}
          `);
        }

        await tx.execute(sql`
          update "Channel"
          set
            "sortOrder" = ${toSort},
            "updatedAt" = ${now}
          where "id" = ${draggedChannelId}
            and "serverId" = ${serverId}
        `);

        return;
      }

      await tx.execute(sql`
        update "Channel" c
        set
          "sortOrder" = c."sortOrder" - 1,
          "updatedAt" = ${now}
        where c."serverId" = ${serverId}
          and c."channelGroupId" is not distinct from ${fromGroupId}
          and c."sortOrder" > ${fromSort}
      `);

      await tx.execute(sql`
        update "Channel" c
        set
          "sortOrder" = c."sortOrder" + 1,
          "updatedAt" = ${now}
        where c."serverId" = ${serverId}
          and c."channelGroupId" is not distinct from ${toGroupId}
          and c."sortOrder" >= ${toSort}
      `);

      await tx.execute(sql`
        update "Channel"
        set
          "channelGroupId" = ${toGroupId},
          "sortOrder" = ${toSort},
          "updatedAt" = ${now}
        where "id" = ${draggedChannelId}
          and "serverId" = ${serverId}
      `);
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[CHANNEL_REORDER_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
