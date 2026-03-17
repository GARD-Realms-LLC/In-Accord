import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, member, server } from "@/lib/db";
import { getServerInviteHistory } from "@/lib/server-invite-store";
import { ensureServerRolesSchema } from "@/lib/server-roles";
import { getUserProfileNameMap } from "@/lib/user-profile";

const baseRoleLabelMap = {
  ADMIN: "Admin",
  MODERATOR: "Moderator",
  GUEST: "Guest",
} as const;

const normalizeLabel = (value: unknown) => String(value ?? "").trim();

const dedupeRoles = (roles: Array<{ id: string; label: string; source: "owner" | "assigned" | "base" }>) => {
  const seen = new Set<string>();
  const next: Array<{ id: string; label: string; source: "owner" | "assigned" | "base" }> = [];

  for (const role of roles) {
    const key = `${role.source}:${role.label.toLowerCase()}`;
    if (!role.label || seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(role);
  }

  return next;
};

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

    await ensureServerRolesSchema();

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
      order by m."createdAt" asc, coalesce(u."name", u."email", m."profileId") asc
    `);

    const assignedRolesResult = await db.execute(sql`
      select
        a."memberId" as "memberId",
        a."roleId" as "roleId",
        r."name" as "roleName",
        r."position" as "rolePosition"
      from "ServerRoleAssignment" a
      inner join "ServerRole" r on r."id" = a."roleId"
      where a."serverId" = ${serverId}
      order by a."memberId" asc, r."position" desc, r."name" asc
    `);

    const inviteHistory = await getServerInviteHistory(serverId);

    const memberRows = (
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
    ).rows ?? [];

    const assignedRoleRows = (
      assignedRolesResult as unknown as {
        rows: Array<{
          memberId: string;
          roleId: string;
          roleName: string | null;
          rolePosition: number | null;
        }>;
      }
    ).rows ?? [];

    const assignedRolesByMemberId = new Map<
      string,
      Array<{ id: string; label: string; source: "assigned" }>
    >();

    for (const row of assignedRoleRows) {
      const memberId = normalizeLabel(row.memberId);
      const roleId = normalizeLabel(row.roleId);
      const roleName = normalizeLabel(row.roleName);

      if (!memberId || !roleId || !roleName) {
        continue;
      }

      const bucket = assignedRolesByMemberId.get(memberId) ?? [];
      bucket.push({
        id: roleId,
        label: roleName,
        source: "assigned",
      });
      assignedRolesByMemberId.set(memberId, bucket);
    }

    const joinedByProfileIdByMemberProfileId = new Map<string, string>();
    for (const invite of inviteHistory) {
      const createdByProfileId = normalizeLabel(invite.createdByProfileId);
      if (!createdByProfileId) {
        continue;
      }

      for (const usedByProfileId of invite.usedByProfileIds ?? []) {
        const normalizedUsedBy = normalizeLabel(usedByProfileId);
        if (!normalizedUsedBy || joinedByProfileIdByMemberProfileId.has(normalizedUsedBy)) {
          continue;
        }

        joinedByProfileIdByMemberProfileId.set(normalizedUsedBy, createdByProfileId);
      }
    }

    const profileNameMap = await getUserProfileNameMap(
      Array.from(
        new Set([
          serverRecord.profileId,
          ...memberRows.map((row) => normalizeLabel(row.profileId)),
          ...Array.from(joinedByProfileIdByMemberProfileId.values()),
        ].filter(Boolean))
      )
    );

    const members = memberRows.map((row) => {
      const profileId = normalizeLabel(row.profileId);
      const isServerOwner = profileId === normalizeLabel(serverRecord.profileId);
      const baseRoleLabel =
        baseRoleLabelMap[row.role as keyof typeof baseRoleLabelMap] ?? normalizeLabel(row.role) ?? "Guest";
      const assignedRoles = assignedRolesByMemberId.get(row.id) ?? [];
      const roles = dedupeRoles([
        ...(isServerOwner
          ? [
              {
                id: `owner:${row.id}`,
                label: "Owner",
                source: "owner" as const,
              },
            ]
          : []),
        ...assignedRoles,
        {
          id: `base:${row.id}:${baseRoleLabel.toLowerCase()}`,
          label: baseRoleLabel,
          source: "base" as const,
        },
      ]);
      const joinedByProfileId = joinedByProfileIdByMemberProfileId.get(profileId) ?? null;
      const joinedBy = isServerOwner
        ? profileNameMap.get(profileId) ?? row.name ?? row.email ?? "Server owner"
        : joinedByProfileId
          ? profileNameMap.get(joinedByProfileId) ?? "Invite link"
          : "Invite link";

      return {
        id: row.id,
        role: row.role,
        profileId: row.profileId,
        serverId: row.serverId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        joinedServerAt: row.createdAt,
        joinedInAccordAt: row.accountCreated,
        joinedBy,
        joinedByProfileId,
        isServerOwner,
        topRole: roles[0] ?? null,
        roles,
        profile: {
          id: row.userId ?? row.profileId,
          userId: row.userId ?? row.profileId,
          name: profileNameMap.get(profileId) ?? row.name ?? row.email ?? "User",
          email: row.email ?? "",
          imageUrl: row.imageUrl ?? "/in-accord-steampunk-logo.png",
          createdAt: row.accountCreated,
          updatedAt: row.lastLogin,
        },
      };
    });

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
