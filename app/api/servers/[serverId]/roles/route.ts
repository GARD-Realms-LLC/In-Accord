import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db, member, server } from "@/lib/db";
import { ensureServerRolesSchema, seedDefaultServerRoles } from "@/lib/server-roles";

type Params = { params: { serverId: string } };

const colorRegex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export async function GET(_req: Request, { params }: Params) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const serverId = String(params.serverId ?? "").trim();
    if (!serverId) {
      return new NextResponse("Server ID is required", { status: 400 });
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

    const ownerServer = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
      columns: { id: true },
    });

    const canManageRoles = Boolean(ownerServer);

    const rolesResult = await db.execute(sql`
      select
        r."id",
        r."name",
        r."color",
        r."iconUrl",
        r."position",
        r."isManaged",
        count(a."memberId")::int as "memberCount"
      from "ServerRole" r
      left join "ServerRoleAssignment" a
        on a."roleId" = r."id"
      where r."serverId" = ${serverId}
      group by r."id", r."name", r."color", r."iconUrl", r."position", r."isManaged"
      order by r."position" asc, r."name" asc
    `);

    const totalMembersResult = await db.execute(sql`
      select count(*)::int as "totalMembers"
      from "Member"
      where "serverId" = ${serverId}
    `);

    const roles = ((rolesResult as unknown as {
      rows?: Array<{
        id: string;
        name: string;
        color: string;
        iconUrl: string | null;
        position: number;
        isManaged: boolean;
        memberCount: number;
      }>;
    }).rows ?? []).map((row) => ({
      ...row,
      memberCount: Number(row.memberCount ?? 0),
    }));

    const totalMembers = Number(
      (totalMembersResult as unknown as { rows?: Array<{ totalMembers: number }> }).rows?.[0]?.totalMembers ?? 0
    );

    return NextResponse.json({ roles, totalMembers, canManageRoles });
  } catch (error) {
    console.error("[SERVER_ROLES_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const serverId = String(params.serverId ?? "").trim();
    if (!serverId) {
      return new NextResponse("Server ID is required", { status: 400 });
    }

    const ownerServer = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
      columns: { id: true },
    });

    if (!ownerServer) {
      return new NextResponse("Only the server owner can create roles", { status: 403 });
    }

    await ensureServerRolesSchema();
    await seedDefaultServerRoles(serverId);

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      color?: string;
      iconUrl?: string | null;
    };

    const name = String(body.name ?? "").trim();
    const color = String(body.color ?? "#99aab5").trim();
    const iconUrl = body.iconUrl === null ? null : String(body.iconUrl ?? "").trim() || null;

    if (!name) {
      return new NextResponse("Role name is required", { status: 400 });
    }
    if (name.length > 100) {
      return new NextResponse("Role name must be 100 characters or fewer", { status: 400 });
    }
    if (!colorRegex.test(color)) {
      return new NextResponse("Role color must be a valid hex value", { status: 400 });
    }

    const nextPositionResult = await db.execute(sql`
      select coalesce(max("position"), 0)::int + 1 as "nextPosition"
      from "ServerRole"
      where "serverId" = ${serverId}
    `);

    const nextPosition = Number(
      (nextPositionResult as unknown as { rows?: Array<{ nextPosition: number }> }).rows?.[0]?.nextPosition ?? 1
    );

    const roleId = crypto.randomUUID();

    const insertResult = await db.execute(sql`
      insert into "ServerRole" (
        "id",
        "serverId",
        "name",
        "color",
        "iconUrl",
        "position",
        "isManaged",
        "createdAt",
        "updatedAt"
      )
      values (
        ${roleId},
        ${serverId},
        ${name},
        ${color},
        ${iconUrl},
        ${nextPosition},
        false,
        now(),
        now()
      )
      returning "id", "name", "color", "iconUrl", "position", "isManaged"
    `);

    const role = (insertResult as unknown as {
      rows?: Array<{
        id: string;
        name: string;
        color: string;
        iconUrl: string | null;
        position: number;
        isManaged: boolean;
      }>;
    }).rows?.[0];

    return NextResponse.json({ role }, { status: 201 });
  } catch (error) {
    console.error("[SERVER_ROLES_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
