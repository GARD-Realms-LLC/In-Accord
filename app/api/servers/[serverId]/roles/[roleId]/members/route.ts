import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { getServerManagementAccess } from "@/lib/server-management-access";
import { ensureServerRolesSchema } from "@/lib/server-roles";

type Params = { params: Promise<{ serverId: string; roleId: string }> };

const getIds = (params: Awaited<Params["params"]>) => ({
  serverId: String(params.serverId ?? "").trim(),
  roleId: String(params.roleId ?? "").trim(),
});

export async function GET(_req: Request, { params }: Params) {
  try {
    const resolvedParams = await params;

    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId, roleId } = getIds(resolvedParams);
    if (!serverId || !roleId) {
      return new NextResponse("Server ID and Role ID are required", { status: 400 });
    }

    const access = await getServerManagementAccess({ serverId, profileId: profile.id, profileRole: profile.role });
    if (!access.target) {
      return new NextResponse("Server not found", { status: 404 });
    }

    if (!access.canView) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await ensureServerRolesSchema();

    const roleExists = await db.execute(sql`
      select "id"
      from "ServerRole"
      where "id" = ${roleId} and "serverId" = ${serverId}
      limit 1
    `);

    if (!((roleExists as unknown as { rows?: Array<{ id: string }> }).rows?.[0])) {
      return new NextResponse("Role not found", { status: 404 });
    }

    const membersResult = await db.execute(sql`
      with role_ranked as (
        select
          a."memberId",
          r."name" as "roleName",
          row_number() over (
            partition by a."memberId"
            order by r."position" desc, r."name" asc
          ) as "rn"
        from "ServerRoleAssignment" a
        inner join "ServerRole" r on r."id" = a."roleId"
        where a."serverId" = ${serverId}
      ),
      role_counts as (
        select
          a."memberId",
          count(*) as "roleCount"
        from "ServerRoleAssignment" a
        where a."serverId" = ${serverId}
        group by a."memberId"
      ),
      role_highest as (
        select
          rr."memberId",
          rr."roleName" as "highestRoleName"
        from role_ranked rr
        where rr."rn" = 1
      ),
      role_assigned as (
        select distinct
          a."memberId"
        from "ServerRoleAssignment" a
        where a."serverId" = ${serverId}
          and a."roleId" = ${roleId}
      )
      select
        m."id" as "memberId",
        m."profileId" as "profileId",
        nullif(trim(up."profileName"), '') as "profileName",
        coalesce(nullif(trim(up."profileName"), ''), u."name", u."email", m."profileId") as "displayName",
        u."email" as "email",
        coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
        m."createdAt" as "memberSince",
        u.[account.created] as "joinedInAccord",
        case
          when m."profileId" = s."profileId" then 'Owner Created Server'
          else 'Invite'
        end as "joinedMethod",
        rh."highestRoleName" as "highestRoleName",
        coalesce(rc."roleCount", 0) as "roleCount",
        (ra."memberId" is not null) as "isAssigned"
      from "Member" m
      inner join "Server" s on s."id" = m."serverId"
      left join "Users" u on u."userId" = m."profileId"
      left join "UserProfile" up on up."userId" = m."profileId"
      left join role_counts rc on rc."memberId" = m."id"
      left join role_highest rh on rh."memberId" = m."id"
      left join role_assigned ra on ra."memberId" = m."id"
      where m."serverId" = ${serverId}
      order by coalesce(nullif(trim(up."profileName"), ''), u."name", u."email", m."profileId") asc
    `);

    const members = ((membersResult as unknown as {
      rows?: Array<{
        memberId: string;
        profileId: string;
        profileName: string | null;
        displayName: string;
        email: string | null;
        imageUrl: string | null;
        memberSince: Date | string | null;
        joinedInAccord: Date | string | null;
        joinedMethod: string;
        highestRoleName: string | null;
        roleCount: number;
        isAssigned: boolean;
      }>;
    }).rows ?? []).map((row) => ({
      ...row,
      roleCount: Number(row.roleCount ?? 0),
      isAssigned: Boolean(row.isAssigned),
    }));

    return NextResponse.json({
      members,
      canManageRoleMembers: access.canManage,
    });
  } catch (error) {
    console.error("[SERVER_ROLE_MEMBERS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const resolvedParams = await params;

    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId, roleId } = getIds(resolvedParams);
    if (!serverId || !roleId) {
      return new NextResponse("Server ID and Role ID are required", { status: 400 });
    }

    const access = await getServerManagementAccess({ serverId, profileId: profile.id, profileRole: profile.role });
    if (!access.target) {
      return new NextResponse("Server not found", { status: 404 });
    }

    if (!access.canManage) {
      return new NextResponse("Only the server owner or an In-Accord administrator can manage role members", { status: 403 });
    }

    await ensureServerRolesSchema();

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
    const resolvedParams = await params;

    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId, roleId } = getIds(resolvedParams);
    if (!serverId || !roleId) {
      return new NextResponse("Server ID and Role ID are required", { status: 400 });
    }

    const access = await getServerManagementAccess({ serverId, profileId: profile.id, profileRole: profile.role });
    if (!access.target) {
      return new NextResponse("Server not found", { status: 404 });
    }

    if (!access.canManage) {
      return new NextResponse("Only the server owner or an In-Accord administrator can manage role members", { status: 403 });
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
