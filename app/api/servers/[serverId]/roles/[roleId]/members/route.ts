import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db, member, server } from "@/lib/db";
import { ensureServerRolesSchema, seedDefaultServerRoles } from "@/lib/server-roles";

type Params = { params: { serverId: string; roleId: string } };

const getIds = (params: Params["params"]) => ({
  serverId: String(params.serverId ?? "").trim(),
  roleId: String(params.roleId ?? "").trim(),
});

export async function GET(_req: Request, { params }: Params) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId, roleId } = getIds(params);
    if (!serverId || !roleId) {
      return new NextResponse("Server ID and Role ID are required", { status: 400 });
    }

    const existingMember = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
      columns: { id: true },
    });

    if (!existingMember) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await ensureServerRolesSchema();
    await seedDefaultServerRoles(serverId);

    const roleExists = await db.execute(sql`
      select "id"
      from "ServerRole"
      where "id" = ${roleId} and "serverId" = ${serverId}
      limit 1
    `);

    if (!((roleExists as unknown as { rows?: Array<{ id: string }> }).rows?.[0])) {
      return new NextResponse("Role not found", { status: 404 });
    }

    const ownerServer = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
      columns: { id: true },
    });

    const membersResult = await db.execute(sql`
      select
        m."id" as "memberId",
        m."profileId" as "profileId",
        coalesce(nullif(trim(up."profileName"), ''), u."name", u."email", m."profileId") as "displayName",
        u."email" as "email",
        coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
        exists (
          select 1
          from "ServerRoleAssignment" a
          where a."serverId" = ${serverId}
            and a."roleId" = ${roleId}
            and a."memberId" = m."id"
        ) as "isAssigned"
      from "Member" m
      left join "Users" u on u."userId" = m."profileId"
      left join "UserProfile" up on up."userId" = m."profileId"
      where m."serverId" = ${serverId}
      order by coalesce(nullif(trim(up."profileName"), ''), u."name", u."email", m."profileId") asc
    `);

    const members = ((membersResult as unknown as {
      rows?: Array<{
        memberId: string;
        profileId: string;
        displayName: string;
        email: string | null;
        imageUrl: string | null;
        isAssigned: boolean;
      }>;
    }).rows ?? []).map((row) => ({
      ...row,
      isAssigned: Boolean(row.isAssigned),
    }));

    return NextResponse.json({
      members,
      canManageRoleMembers: Boolean(ownerServer),
    });
  } catch (error) {
    console.error("[SERVER_ROLE_MEMBERS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId, roleId } = getIds(params);
    if (!serverId || !roleId) {
      return new NextResponse("Server ID and Role ID are required", { status: 400 });
    }

    const ownerServer = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
      columns: { id: true },
    });

    if (!ownerServer) {
      return new NextResponse("Only the server owner can manage role members", { status: 403 });
    }

    await ensureServerRolesSchema();
    await seedDefaultServerRoles(serverId);

    const body = (await req.json().catch(() => ({}))) as { memberId?: string };
    const memberId = String(body.memberId ?? "").trim();

    if (!memberId) {
      return new NextResponse("memberId is required", { status: 400 });
    }

    await db.execute(sql`
      insert into "ServerRoleAssignment" ("roleId", "memberId", "serverId", "createdAt")
      values (${roleId}, ${memberId}, ${serverId}, now())
      on conflict ("roleId", "memberId") do nothing
    `);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[SERVER_ROLE_MEMBERS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId, roleId } = getIds(params);
    if (!serverId || !roleId) {
      return new NextResponse("Server ID and Role ID are required", { status: 400 });
    }

    const ownerServer = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
      columns: { id: true },
    });

    if (!ownerServer) {
      return new NextResponse("Only the server owner can manage role members", { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { memberId?: string };
    const memberId = String(body.memberId ?? "").trim();

    if (!memberId) {
      return new NextResponse("memberId is required", { status: 400 });
    }

    await db.execute(sql`
      delete from "ServerRoleAssignment"
      where "serverId" = ${serverId}
        and "roleId" = ${roleId}
        and "memberId" = ${memberId}
    `);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[SERVER_ROLE_MEMBERS_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
