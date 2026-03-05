import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { MemberRole } from "@/lib/db/types";
import { OnlineUsersList } from "@/components/server/online-users-list";

interface ServerUserRolesRailProps {
  serverId: string;
}

type RoleRow = {
  id: string;
  role: MemberRole;
  profileId: string;
  realName: string | null;
  profileName: string | null;
  bannerUrl: string | null;
  email: string | null;
  imageUrl: string | null;
  joinedAt: Date | string | null;
  lastLogonAt: Date | string | null;
};

export const ServerUserRolesRail = async ({ serverId }: ServerUserRolesRailProps) => {
  const membersResult = await db.execute(sql`
    select
      m."id" as "id",
      m."role" as "role",
      m."profileId" as "profileId",
      u."name" as "realName",
      up."profileName" as "profileName",
      up."bannerUrl" as "bannerUrl",
      u."email" as "email",
      coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
      u."account.created" as "joinedAt",
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
      coalesce(u."name", u."email", m."profileId") asc
  `);

  const rows = (membersResult as unknown as { rows: RoleRow[] }).rows;

  const onlineUsers = rows.map((row) => ({
    ...row,
    displayName: row.profileName || row.realName || row.email || row.profileId,
    joinedAt: row.joinedAt ? new Date(row.joinedAt).toISOString() : null,
    lastLogonAt: row.lastLogonAt ? new Date(row.lastLogonAt).toISOString() : null,
  }));

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-black/20 bg-[#2b2d31] text-primary shadow-xl shadow-black/35">
      <div className="border-b border-black/20 px-4 py-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-[#949ba4]">
          Online Members
        </h3>
      </div>

      <div className="flex-1 overflow-auto p-3">
        <div className="rounded-md bg-[#1e1f22] p-2.5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
            Online ({onlineUsers.length})
          </p>

          {onlineUsers.length === 0 ? (
            <p className="text-xs text-[#6f7680]">N/A</p>
          ) : (
            <OnlineUsersList users={onlineUsers} />
          )}
        </div>
      </div>

    </aside>
  );
};
