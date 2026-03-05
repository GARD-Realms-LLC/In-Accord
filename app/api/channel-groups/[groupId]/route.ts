import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, member, MemberRole, server } from "@/lib/db";
import { ensureChannelGroupSchema } from "@/lib/channel-groups";

export async function PATCH(
  req: Request,
  { params }: { params: { groupId: string } }
) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as { name?: string } | null;
    const name = String(body?.name ?? "").trim();
    const groupId = String(params.groupId ?? "").trim();

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
        "updatedAt" = ${new Date()}
      where "id" = ${groupId}
    `);

    return NextResponse.json({ ok: true, id: groupId, name });
  } catch (error) {
    console.error("[CHANNEL_GROUP_PATCH]", error);

    const message = error instanceof Error ? error.message : String(error);
    if (/duplicate key|ChannelGroup_unique_name_per_server/i.test(message)) {
      return new NextResponse("Channel group name already exists in this server", { status: 409 });
    }

    return new NextResponse("Internal Error", { status: 500 });
  }
}
