import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { MemberRole } from "@/lib/db/types";
import { OnlineUsersList } from "@/components/server/online-users-list";
import { currentProfile } from "@/lib/current-profile";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { makeIntegrationBotProfileId } from "@/lib/integration-bot-profile";
import { ensureServerRolesSchema } from "@/lib/server-roles";
import { server } from "@/lib/db/schema";
import { getUserPreferences } from "@/lib/user-preferences";
import { and, eq } from "drizzle-orm";

interface ServerUserRolesRailProps {
  serverId: string;
}

type RoleRow = {
  id: string;
  role: MemberRole;
  assignedRoleName: string | null;
  assignedRolePosition: number | null;
  profileId: string;
  globalRole: string | null;
  realName: string | null;
  profileName: string | null;
  bannerUrl: string | null;
  presenceStatus: string | null;
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

export const ServerUserRolesRail = async ({ serverId }: ServerUserRolesRailProps) => {
  const profile = await currentProfile();
  await ensureServerRolesSchema();

  const targetServer = await db.query.server.findFirst({
    where: eq(server.id, serverId),
    columns: {
      id: true,
      profileId: true,
    },
  });

  if (!targetServer) {
    return null;
  }

  const ownerPreferences = await getUserPreferences(targetServer.profileId);
  const validOwnedBotProfileIds = new Set(
    ownerPreferences.OtherBots.map((bot) => makeIntegrationBotProfileId(targetServer.profileId, bot.id))
  );

  const ownerBotPrefix = `botcfg_${targetServer.profileId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60)}_`;

  const ownerRecord = profile?.id && profile.id === targetServer.profileId ? { id: targetServer.id } : null;

  const membersResult = await db.execute(sql`
    select
      m."id" as "id",
      m."role" as "role",
      top_role."name" as "assignedRoleName",
      top_role."position" as "assignedRolePosition",
      m."profileId" as "profileId",
      u."role" as "globalRole",
      u."name" as "realName",
      up."profileName" as "profileName",
      up."bannerUrl" as "bannerUrl",
      up."presenceStatus" as "presenceStatus",
      u."email" as "email",
      coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
      u."account.created" as "joinedAt",
      u."lastLogin" as "lastLogonAt"
    from "Member" m
    left join lateral (
      select
        sr."name" as "name",
        sr."position" as "position"
      from "ServerRoleAssignment" sra
      inner join "ServerRole" sr on sr."id" = sra."roleId"
      where sra."memberId" = m."id"
        and sra."serverId" = ${serverId}
      order by sr."position" asc, sr."name" asc
      limit 1
    ) top_role on true
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
    order by r."position" asc, r."name" asc
  `);

  const roleGroups = ((roleGroupsResult as unknown as { rows?: ServerRoleGroupRow[] }).rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    position: Number(row.position ?? 0),
  }));

  const rows = ((membersResult as unknown as { rows: RoleRow[] }).rows ?? []).filter((row) => {
    if (!row.profileId.startsWith(ownerBotPrefix)) {
      return true;
    }

    return validOwnedBotProfileIds.has(row.profileId);
  });

  const currentMemberRole = rows.find((row) => row.profileId === profile?.id)?.role;
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
            <OnlineUsersList users={onlineUsers} roleGroups={roleGroups} />
          )}

          <div className="mt-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
              Offline ({offlineUsers.length})
            </p>

            {offlineUsers.length === 0 ? (
              <p className="text-xs text-[#6f7680]">N/A</p>
            ) : (
              <OnlineUsersList users={offlineUsers} roleGroups={roleGroups} />
            )}
          </div>
        </div>
      </div>

    </aside>
  );
};
