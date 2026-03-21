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
      | { serverId?: string; orderedGroupIds?: string[] }
      | null;

    const serverId = String(body?.serverId ?? "").trim();
    const incomingOrderedGroupIds = body?.orderedGroupIds;
    const orderedGroupIds = Array.isArray(incomingOrderedGroupIds)
      ? incomingOrderedGroupIds.map((id) => String(id ?? "").trim()).filter(Boolean)
      : [];

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!orderedGroupIds.length) {
      return new NextResponse("orderedGroupIds is required", { status: 400 });
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

    const existingResult = await db.execute(sql`
      select "id"
      from "ChannelGroup"
      where "serverId" = ${serverId}
    `);

    const existingIds = new Set(
      ((existingResult as unknown as { rows: Array<{ id: string }> }).rows ?? []).map((row) => row.id)
    );

    const incomingIds = new Set(orderedGroupIds);
    if (existingIds.size !== incomingIds.size) {
      return new NextResponse("orderedGroupIds must include all groups", { status: 400 });
    }

    for (const id of Array.from(existingIds)) {
      if (!incomingIds.has(id)) {
        return new NextResponse("orderedGroupIds must include all groups", { status: 400 });
      }
    }

    await db.transaction(async (tx: any) => {
      for (let i = 0; i < orderedGroupIds.length; i += 1) {
        const groupId = orderedGroupIds[i];
        await tx.execute(sql`
          update "ChannelGroup"
          set
            "sortOrder" = ${i + 1},
            "updatedAt" = ${new Date()}
          where "id" = ${groupId}
            and "serverId" = ${serverId}
        `);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[CHANNEL_GROUP_REORDER_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
