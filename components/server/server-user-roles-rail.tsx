import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { MemberRole } from "@/lib/db/types";
import { OnlineUsersList } from "@/components/server/online-users-list";
import { currentProfile } from "@/lib/current-profile";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { makeIntegrationBotProfileId } from "@/lib/integration-bot-profile";
import { ensureServerRolesSchema } from "@/lib/server-roles";
import { getUserPreferences } from "@/lib/user-preferences";

interface ServerUserRolesRailProps {
  serverId: string;
}

type RoleRow = {
  id: string;
  role: MemberRole;
  assignedRoleId: string | null;
  assignedRoleName: string | null;
  assignedRolePosition: number | null;
  profileId: string;
  globalRole: string | null;
  realName: string | null;
  profileName: string | null;
  bannerUrl: string | null;
  presenceStatus: string | null;
  currentGame: string | null;
  email: string | null;
  imageUrl: string | null;
  joinedAt: Date | string | null;
  lastLogonAt: Date | string | null;
};

type ServerRoleGroupRow = {
  id: string;
  name: string;
  position: number;
};

type TargetServerRow = {
  id: string;
  profileId: string;
};

const normalizeMemberRole = (value: unknown): MemberRole => {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (
    normalized === MemberRole.ADMIN ||
    normalized === "ADMINISTRATOR" ||
    normalized === "ADMINS" ||
    normalized === "ADMINISTRATORS"
  ) {
    return MemberRole.ADMIN;
  }
  if (
    normalized === MemberRole.MODERATOR ||
    normalized === "MOD" ||
    normalized === "MODS" ||
    normalized === "MODERATORS"
  ) {
    return MemberRole.MODERATOR;
  }
  return MemberRole.GUEST;
};

export const ServerUserRolesRail = async ({ serverId }: ServerUserRolesRailProps) => {
  const profile = await currentProfile();
  await ensureServerRolesSchema();

  const targetServerResult = await db.execute(sql`
    select
      s."id" as "id",
      s."profileId" as "profileId"
    from "Server" s
    where trim(s."id") = trim(${serverId})
    limit 1
  `);

  const targetServerRows = ((targetServerResult as unknown as {
    rows?: Array<{ id: string | null; profileId: string | null }>;
  }).rows ?? []).map((row) => ({
    id: String(row.id ?? "").trim(),
    profileId: String(row.profileId ?? "").trim(),
  } satisfies TargetServerRow));

  const targetServer = targetServerRows[0] ?? null;

  if (!targetServer) {
    return null;
  }

  const ownerPreferences = await getUserPreferences(targetServer.profileId);
  const ownedBots = Array.isArray(ownerPreferences.OtherBots)
    ? ownerPreferences.OtherBots
    : [];
  const validOwnedBotProfileIds = new Set(
    ownedBots.map((bot) => makeIntegrationBotProfileId(targetServer.profileId, bot.id))
  );

  const ownerBotPrefix = `botcfg_${targetServer.profileId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60)}_`;

  const ownerRecord = profile?.id && profile.id === targetServer.profileId ? { id: targetServer.id } : null;

  const membersResult = await db.execute(sql`
    select
      m."id" as "id",
      m."role" as "role",
      (
        select sr."id"
        from "ServerRoleAssignment" sra
        inner join "ServerRole" sr on sr."id" = sra."roleId"
        where sra."memberId" = m."id"
          and sra."serverId" = ${serverId}
          and coalesce(sr."showInOnlineMembers", false) = true
        order by sr."position" asc, sr."name" asc
        limit 1
      ) as "assignedRoleId",
      (
        select sr."name"
        from "ServerRoleAssignment" sra
        inner join "ServerRole" sr on sr."id" = sra."roleId"
        where sra."memberId" = m."id"
          and sra."serverId" = ${serverId}
          and coalesce(sr."showInOnlineMembers", false) = true
        order by sr."position" asc, sr."name" asc
        limit 1
      ) as "assignedRoleName",
      (
        select sr."position"
        from "ServerRoleAssignment" sra
        inner join "ServerRole" sr on sr."id" = sra."roleId"
        where sra."memberId" = m."id"
          and sra."serverId" = ${serverId}
          and coalesce(sr."showInOnlineMembers", false) = true
        order by sr."position" asc, sr."name" asc
        limit 1
      ) as "assignedRolePosition",
      m."profileId" as "profileId",
      u."role" as "globalRole",
      u."name" as "realName",
      up."profileName" as "profileName",
      up."bannerUrl" as "bannerUrl",
      up."presenceStatus" as "presenceStatus",
      nullif(trim(up."currentGame"), '') as "currentGame",
      u."email" as "email",
      coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
      u."createdAt" as "joinedAt",
      u."lastLogin" as "lastLogonAt"
    from "Member" m
    left join "Users" u on u."userId" = m."profileId"
    left join "UserProfile" up on up."userId" = m."profileId"
    where m."serverId" = ${serverId}
    order by
      case m."role"
        when 'ADMIN' then 1
        when 'MODERATOR' then 2
        else 3
      end,
      coalesce(nullif(trim(up."profileName"), ''), u."name", u."email", m."profileId") asc
  `);

  const roleGroupsResult = await db.execute(sql`
    select
      r."id" as "id",
      r."name" as "name",
      r."position" as "position"
    from "ServerRole" r
    where r."serverId" = ${serverId}
      and coalesce(r."showInOnlineMembers", false) = true
    order by r."position" asc, r."name" asc
  `);

  const roleGroups = ((roleGroupsResult as unknown as { rows?: ServerRoleGroupRow[] }).rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    position: Number(row.position ?? 0),
  }));

  const rolesCountResult = await db.execute(sql`
        select count(*) as "count"
    from "ServerRole" r
    where r."serverId" = ${serverId}
      and coalesce(r."isManaged", false) = false
  `);
  const rolesCount = Number(
    (
      rolesCountResult as unknown as {
        rows?: Array<{ count?: number | string | null }>;
      }
    ).rows?.[0]?.count ?? 0
  );
  const roleGroupsCount = roleGroups.length;

  const rows = (((membersResult as unknown as { rows: RoleRow[] }).rows ?? []).map((row) => ({
    ...row,
    role: normalizeMemberRole(row.role),
  })) as RoleRow[]).filter((row) => {
    if (!String(row.profileId ?? "").startsWith(ownerBotPrefix)) {
      return true;
    }

    return validOwnedBotProfileIds.has(String(row.profileId ?? "").trim());
  });

  const currentMemberRole = rows.find((row) => row.profileId === profile?.id)?.role;
  const viewerMemberId = rows.find((row) => row.profileId === profile?.id)?.id ?? null;
  const canSeeInvisibleMembers = hasInAccordAdministrativeAccess(profile?.role) || currentMemberRole === MemberRole.ADMIN;
  const canSeeInvisibleCount = Boolean(ownerRecord) || hasInAccordAdministrativeAccess(profile?.role);

  const totalMembersCount = rows.length;
  const onlineCount = rows.filter((row) => {
    const status = String(row.presenceStatus ?? "ONLINE").toUpperCase();
    return status !== "OFFLINE" && status !== "INVISIBLE";
  }).length;
  const offlineCount = rows.filter(
    (row) => String(row.presenceStatus ?? "ONLINE").toUpperCase() === "OFFLINE"
  ).length;
  const invisibleCount = rows.filter(
    (row) => String(row.presenceStatus ?? "ONLINE").toUpperCase() === "INVISIBLE"
  ).length;

  const resolveEffectiveRole = (row: RoleRow): MemberRole => {
    const globalRole = String(row.globalRole ?? "").trim().toUpperCase();
    if (globalRole.includes("ADMIN")) {
      return MemberRole.ADMIN;
    }

    const assignedRoleName = String(row.assignedRoleName ?? "").trim().toUpperCase();
    if (assignedRoleName.includes("ADMIN")) {
      return MemberRole.ADMIN;
    }

    if (assignedRoleName.includes("MODERATOR") || assignedRoleName === "MOD") {
      return MemberRole.MODERATOR;
    }

    const memberRole = String(row.role ?? "").trim().toUpperCase();
    if (memberRole === MemberRole.ADMIN) {
      return MemberRole.ADMIN;
    }

    if (memberRole === MemberRole.MODERATOR) {
      return MemberRole.MODERATOR;
    }

    return MemberRole.GUEST;
  };

  const roleRank: Record<MemberRole, number> = {
    [MemberRole.ADMIN]: 1,
    [MemberRole.MODERATOR]: 2,
    [MemberRole.GUEST]: 3,
  };

  const visibleUsers = rows
    .filter((row) => canSeeInvisibleMembers || String(row.presenceStatus ?? "ONLINE").toUpperCase() !== "INVISIBLE")
    .map((row) => ({
    ...row,
    role: resolveEffectiveRole(row),
    assignedRoleName: row.assignedRoleName,
    realName: row.realName ?? "",
    displayName: row.realName || row.email || row.profileId,
    presenceStatus: String(row.presenceStatus ?? "ONLINE").toUpperCase(),
    currentGame: row.currentGame ?? null,
    joinedAt: row.joinedAt ? new Date(row.joinedAt).toISOString() : null,
    lastLogonAt: row.lastLogonAt ? new Date(row.lastLogonAt).toISOString() : null,
  }))
    .sort((a, b) => {
      const byRole = roleRank[a.role] - roleRank[b.role];
      if (byRole !== 0) {
        return byRole;
      }

      const aName = (a.profileName || a.realName || a.email || a.profileId || "").toLowerCase();
      const bName = (b.profileName || b.realName || b.email || b.profileId || "").toLowerCase();
      return aName.localeCompare(bName);
    });

  const onlineUsers = visibleUsers.filter(
    (item) => String(item.presenceStatus ?? "ONLINE").toUpperCase() !== "OFFLINE"
  );

  const offlineUsers = visibleUsers.filter(
    (item) => String(item.presenceStatus ?? "ONLINE").toUpperCase() === "OFFLINE"
  );

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-black/20 bg-[#2b2d31] text-primary shadow-xl shadow-black/35">
      <div className="border-b border-black/20 px-4 py-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-[#949ba4]">
          Online Members
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded bg-[#1e1f22] px-2 py-1 text-[#b5bac1]">
            <span className="text-[#949ba4]">Members:</span> {totalMembersCount}
          </div>
          <div className="rounded bg-[#1e1f22] px-2 py-1 text-[#b5bac1]">
            <span className="text-[#949ba4]">Online:</span> {onlineCount}
          </div>
          <div className="rounded bg-[#1e1f22] px-2 py-1 text-[#b5bac1]">
            <span className="text-[#949ba4]">Offline:</span> {offlineCount}
          </div>
          {canSeeInvisibleCount ? (
            <div className="rounded bg-[#1e1f22] px-2 py-1 text-[#b5bac1]">
              <span className="text-[#949ba4]">Invisible:</span> {invisibleCount}
            </div>
          ) : null}
        </div>
      </div>

      <div className="settings-scrollbar min-h-0 flex-1 overflow-auto p-3">
        <div className="rounded-md bg-[#1e1f22] p-2.5">
          {onlineUsers.length === 0 ? (
            <p className="text-xs text-[#6f7680]">N/A</p>
          ) : (
            <OnlineUsersList
              users={onlineUsers}
              roleGroups={roleGroups}
              serverId={serverId}
              viewerProfileId={profile?.id ?? null}
              viewerMemberId={viewerMemberId}
              canReorderRoleGroups={Boolean(ownerRecord)}
            />
          )}

          <div className="mt-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
              Offline ({offlineUsers.length})
            </p>

            {offlineUsers.length === 0 ? (
              <p className="text-xs text-[#6f7680]">N/A</p>
            ) : (
              <OnlineUsersList
                users={offlineUsers}
                roleGroups={roleGroups}
                serverId={serverId}
                viewerProfileId={profile?.id ?? null}
                viewerMemberId={viewerMemberId}
                canReorderRoleGroups={Boolean(ownerRecord)}
              />
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-black/20 px-3 py-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded bg-[#1e1f22] px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[clamp(0.5rem,1.2vw,0.625rem)] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Roles</p>
              <p className="shrink-0 text-[clamp(0.625rem,1.4vw,0.75rem)] font-semibold text-[#dbdee1]">{rolesCount}</p>
            </div>
          </div>
          <div className="rounded bg-[#1e1f22] px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[clamp(0.5rem,1.2vw,0.625rem)] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Groups</p>
              <p className="shrink-0 text-[clamp(0.625rem,1.4vw,0.75rem)] font-semibold text-[#dbdee1]">{roleGroupsCount}</p>
            </div>
          </div>
        </div>
      </div>

    </aside>
  );
};
