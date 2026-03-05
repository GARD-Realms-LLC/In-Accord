import { sql } from "drizzle-orm";
import { ShieldAlert, ShieldCheck } from "lucide-react";

import { db } from "@/lib/db";
import { MemberRole } from "@/lib/db/types";

interface ServerUserRolesRailProps {
  serverId: string;
}

type RoleRow = {
  id: string;
  role: MemberRole;
  profileId: string;
  name: string | null;
  email: string | null;
};

export const ServerUserRolesRail = async ({ serverId }: ServerUserRolesRailProps) => {
  const membersResult = await db.execute(sql`
    select
      m."id" as "id",
      m."role" as "role",
      m."profileId" as "profileId",
      u."name" as "name",
      u."email" as "email"
    from "Member" m
    left join "Users" u on u."userId" = m."profileId"
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
    displayName: row.name || row.email || row.profileId,
  }));

  const roleIconMap = {
    [MemberRole.GUEST]: null,
    [MemberRole.MODERATOR]: <ShieldCheck className="h-4 w-4 mr-2 text-indigo-500" />,
    [MemberRole.ADMIN]: <ShieldAlert className="h-4 w-4 mr-2 text-rose-500" />,
  };

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
            <div className="space-y-1">
              {onlineUsers.map((member) => (
                <div key={`online-${member.profileId}`} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-[#2a2b2f]">
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                  <p className="truncate text-xs text-[#dbdee1]">{member.displayName}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </aside>
  );
};
