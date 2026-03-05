import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { currentProfile } from "@/lib/current-profile";
import { db, member, MemberRole, server } from "@/lib/db";
import { ensureChannelGroupSchema } from "@/lib/channel-groups";

export async function GET(req: Request) {
  try {
    const profile = await currentProfile();
    const { searchParams } = new URL(req.url);
    const serverId = String(searchParams.get("serverId") ?? "").trim();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const authorizedMember = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
    });

    if (!authorizedMember) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await ensureChannelGroupSchema();

    const result = await db.execute(sql`
      select
        cg."id" as "id",
        cg."name" as "name",
        cg."sortOrder" as "sortOrder"
      from "ChannelGroup" cg
      where cg."serverId" = ${serverId}
      order by cg."sortOrder" asc, cg."createdAt" asc
    `);

    const groups = ((result as unknown as { rows: Array<{ id: string; name: string; sortOrder: number | string | null }> }).rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      sortOrder: Number(row.sortOrder ?? 0),
    }));

    return NextResponse.json({ groups });
  } catch (error) {
    console.error("[CHANNEL_GROUPS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const body = (await req.json().catch(() => null)) as
      | { name?: string; serverId?: string }
      | null;

    const name = String(body?.name ?? "").trim();
    const serverId = String(body?.serverId ?? searchParams.get("serverId") ?? "").trim();

    if (!name) {
      return new NextResponse("Group name is required", { status: 400 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
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

    await ensureChannelGroupSchema();

    const now = new Date();
    const id = uuidv4();

    const orderResult = await db.execute(sql`
      select coalesce(max(cg."sortOrder"), 0) as "maxSortOrder"
      from "ChannelGroup" cg
      where cg."serverId" = ${serverId}
    `);

    const nextSortOrder =
      Number(
        (orderResult as unknown as {
          rows: Array<{ maxSortOrder: number | string | null }>;
        }).rows?.[0]?.maxSortOrder ?? 0
      ) + 1;

    await db.execute(sql`
      insert into "ChannelGroup" ("id", "name", "serverId", "profileId", "sortOrder", "createdAt", "updatedAt")
      values (${id}, ${name}, ${serverId}, ${profile.id}, ${nextSortOrder}, ${now}, ${now})
    `);

    return NextResponse.json({
      group: {
        id,
        name,
      },
    });
  } catch (error) {
    console.error("[CHANNEL_GROUPS_POST]", error);

    const message = error instanceof Error ? error.message : String(error);
    if (/duplicate key|ChannelGroup_unique_name_per_server/i.test(message)) {
      return new NextResponse("Channel group name already exists in this server", { status: 409 });
    }

    return new NextResponse("Internal Error", { status: 500 });
  }
}
