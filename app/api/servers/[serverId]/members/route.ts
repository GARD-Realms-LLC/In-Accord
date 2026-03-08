import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, member, server } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const membership = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
    });

    if (!membership) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const serverRecord = await db.query.server.findFirst({
      where: eq(server.id, serverId),
    });

    if (!serverRecord) {
      return new NextResponse("Server not found", { status: 404 });
    }

    const membersResult = await db.execute(sql`
      select
        m."id",
        m."role",
        m."profileId",
        m."serverId",
        m."createdAt",
        m."updatedAt",
        u."userId" as "userId",
        u."name" as "name",
        u."email" as "email",
        coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
        u."account.created" as "accountCreated",
        u."lastLogin" as "lastLogin"
      from "Member" m
      left join "Users" u on u."userId" = m."profileId"
      where m."serverId" = ${serverId}
      order by
        case m."role"
          when 'ADMIN' then 0
          when 'MODERATOR' then 1
          else 2
        end,
        coalesce(u."name", u."email", m."profileId") asc
    `);

    const members = (
      membersResult as unknown as {
        rows: Array<{
          id: string;
          role: string;
          profileId: string;
          serverId: string;
          createdAt: Date | string;
          updatedAt: Date | string;
          userId: string | null;
          name: string | null;
          email: string | null;
          imageUrl: string | null;
          accountCreated: Date | string | null;
          lastLogin: Date | string | null;
        }>;
      }
    ).rows.map((row) => ({
      id: row.id,
      role: row.role,
      profileId: row.profileId,
      serverId: row.serverId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      profile: {
        id: row.userId ?? row.profileId,
        userId: row.userId ?? row.profileId,
        name: row.name ?? row.email ?? "User",
        email: row.email ?? "",
        imageUrl: row.imageUrl ?? "/in-accord-steampunk-logo.png",
        createdAt: row.accountCreated,
        updatedAt: row.lastLogin,
      },
    }));

    return NextResponse.json({
      serverId: serverRecord.id,
      memberCount: members.length,
      members,
    });
  } catch (error) {
    console.log("[SERVERS_SERVER_ID_MEMBERS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
