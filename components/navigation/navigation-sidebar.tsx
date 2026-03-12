import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { isInAccordAdministrator, isInAccordDeveloper } from "@/lib/in-accord-admin";
import { ensureFriendRelationsSchema } from "@/lib/friend-relations";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NavigationAction } from "@/components/navigation/navigation-action";
import { NavigationJoinAction } from "@/components/navigation/navigation-join-action";
import { NavigationHomeButton } from "@/components/navigation/navigation-home-button";
import { NavigationUsersHomeButton } from "@/components/navigation/navigation-users-home-button";
import { NavigationServersCollection } from "@/components/navigation/navigation-servers-collection";
import { AdminTotalsButtons } from "@/components/navigation/admin-totals-buttons";

export const NavigationSidebar = async () => {
  const profile = await currentProfile();

  if (!profile) {
    return (
      <div
        className="theme-servers-rail settings-scrollbar flex h-full min-h-0 w-full flex-col items-center space-y-4 overflow-hidden rounded-b-2xl border border-border bg-card pt-0 pb-3 text-primary"
        aria-label="Servers rail"
      />
    );
  }

  const serversResult = await db.execute(sql`
    select distinct
      s."id" as "id",
      s."name" as "name",
      s."imageUrl" as "imageUrl",
      s."profileId" as "profileId",
      s."createdAt" as "createdAt",
      s."updatedAt" as "updatedAt"
    from "Member" m
    inner join "Server" s on s."id" = m."serverId"
    where m."profileId" = ${profile.id}
    order by "createdAt" asc
  `);

  const servers = (
    serversResult as unknown as {
      rows: Array<{
        id: string;
        name: string;
        imageUrl: string | null;
        profileId: string;
        createdAt: Date | string;
        updatedAt?: Date | string;
      }>;
    }
  ).rows;

  const myServers = servers.filter((item) => item.profileId === profile.id);
  const joinedServers = servers.filter((item) => item.profileId !== profile.id);
  const fallbackServerId = myServers[0]?.id ?? joinedServers[0]?.id;

  const canSeeAdminTotalsButtons =
    isInAccordAdministrator(profile.role) || isInAccordDeveloper(profile.role);

  let totalMembers = 0;
  let totalServers = 0;
  let openBugCount = 0;
  let openReportCount = 0;
  let friendedCount = 0;
  let onlineFriendedCount = 0;
  let offlineFriendedCount = 0;

  if (canSeeAdminTotalsButtons) {
    const totalsResult = await db.execute(sql`
      select
        (select count(*)::int from "Users") as "totalMembers",
        (select count(*)::int from "Server") as "totalServers"
    `);

    const totalsRow = (totalsResult as unknown as {
      rows: Array<{
        totalMembers: number | string | null;
        totalServers: number | string | null;
      }>;
    }).rows?.[0];

    totalMembers = Number(totalsRow?.totalMembers ?? 0);
    totalServers = Number(totalsRow?.totalServers ?? 0);

    try {
      const reportTotalsResult = await db.execute(sql`
        select
          count(*) filter (
            where coalesce(r."targetType", '') = 'BUG'
              and coalesce(r."status", '') in ('OPEN', 'IN_REVIEW')
          )::int as "openBugCount",
          count(*) filter (
            where coalesce(r."targetType", '') <> 'BUG'
              and coalesce(r."status", '') in ('OPEN', 'IN_REVIEW')
          )::int as "openReportCount"
        from "Report" r
      `);

      const reportTotalsRow = (reportTotalsResult as unknown as {
        rows: Array<{
          openBugCount: number | string | null;
          openReportCount: number | string | null;
        }>;
      }).rows?.[0];

      openBugCount = Number(reportTotalsRow?.openBugCount ?? 0);
      openReportCount = Number(reportTotalsRow?.openReportCount ?? 0);
    } catch {
      openBugCount = 0;
      openReportCount = 0;
    }
  }

  await ensureFriendRelationsSchema();

  const friendedCountResult = await db.execute(sql`
    with normalized_friend_requests as (
      select
        upper(trim(coalesce(fr."status", ''))) as "status",
        coalesce(reqm."profileId", fr."requesterProfileId") as "requesterProfileId",
        coalesce(recm."profileId", fr."recipientProfileId") as "recipientProfileId"
      from "FriendRequest" fr
      left join "Member" reqm on reqm."id" = fr."requesterProfileId"
      left join "Member" recm on recm."id" = fr."recipientProfileId"
    ),
    accepted_friend_profiles as (
      select distinct
        case
          when nfr."requesterProfileId" = ${profile.id} then nfr."recipientProfileId"
          when nfr."recipientProfileId" = ${profile.id} then nfr."requesterProfileId"
          else null
        end as "friendProfileId"
      from normalized_friend_requests nfr
      where nfr."status" = 'ACCEPTED'
        and (
          nfr."requesterProfileId" = ${profile.id}
          or nfr."recipientProfileId" = ${profile.id}
        )
    )
    select
      count(*)::int as "friendedCount",
      count(*) filter (
        where upper(trim(coalesce(up."presenceStatus", 'OFFLINE'))) not in ('OFFLINE', 'INVISIBLE')
      )::int as "onlineFriendedCount",
      count(*) filter (
        where upper(trim(coalesce(up."presenceStatus", 'OFFLINE'))) in ('OFFLINE', 'INVISIBLE')
      )::int as "offlineFriendedCount"
    from accepted_friend_profiles afp
    left join "UserProfile" up on up."userId" = afp."friendProfileId"
    where afp."friendProfileId" is not null
  `);

  const friendedCountsRow = (friendedCountResult as unknown as {
    rows: Array<{
      friendedCount: number | string | null;
      onlineFriendedCount: number | string | null;
      offlineFriendedCount: number | string | null;
    }>;
  }).rows?.[0];

  friendedCount = Number(friendedCountsRow?.friendedCount ?? 0);
  onlineFriendedCount = Number(friendedCountsRow?.onlineFriendedCount ?? 0);
  offlineFriendedCount = Number(friendedCountsRow?.offlineFriendedCount ?? 0);

  return (
    <div
      className="theme-servers-rail settings-scrollbar flex h-full min-h-0 w-full flex-col items-center space-y-4 overflow-hidden rounded-b-2xl border border-border bg-card pt-0 pb-3 text-primary"
      aria-label="Servers rail"
    >
      <NavigationHomeButton />

      {canSeeAdminTotalsButtons ? (
        <>
          <AdminTotalsButtons
            totalMembers={totalMembers}
            totalServers={totalServers}
            openBugCount={openBugCount}
            openReportCount={openReportCount}
            profileId={profile.id}
            profileName={String(profile.profileName ?? profile.name ?? "In-Accord Admin")}
            profileRole={String(profile.role ?? "USER")}
            profileEmail={String(profile.email ?? "")}
            profileImageUrl={String(profile.imageUrl ?? "")}
          />
        </>
      ) : null}

      <div className="h-[2px] w-[85%] rounded bg-zinc-700 dark:bg-zinc-200" />

      <NavigationUsersHomeButton />
      <NavigationAction />
      <NavigationJoinAction />
      <Separator className="h-[2px] bg-zinc-300 dark:bg-zinc-700 rounded-md w-10 mx-auto" />
      <ScrollArea className="settings-scrollbar min-h-0 flex-1 w-full">
        <NavigationServersCollection
          myServers={myServers}
          joinedServers={joinedServers}
          fallbackServerId={fallbackServerId}
        />
      </ScrollArea>

      <div className="w-full px-3 pb-1">
        <div className="mx-auto w-full max-w-[120px] text-center text-[8px] font-semibold uppercase tracking-[0.04em] text-zinc-700 dark:text-zinc-300">
          <div className="flex flex-col items-center gap-1">
            <div className="mb-1 h-0.5 w-full rounded-none bg-blue-900 dark:bg-blue-200" />
            <div className="floating-3d-text w-full rounded-md border border-blue-900/70 bg-blue-700 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.04em] text-white dark:border-blue-900/80 dark:bg-blue-800 dark:text-white">
              Owned: {myServers.length}
            </div>
            <div className="floating-3d-text mb-2 w-full rounded-md border border-blue-900/70 bg-blue-700 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.04em] text-white dark:border-blue-900/80 dark:bg-blue-800 dark:text-white">
              Joined: {joinedServers.length}
            </div>
            <div className="floating-3d-text w-full rounded-md border border-emerald-900/70 bg-emerald-700 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.04em] text-white dark:border-emerald-900/80 dark:bg-emerald-800 dark:text-white">
              Friended: {friendedCount}
            </div>
            <div className="floating-3d-text w-full rounded-md border border-emerald-900/70 bg-emerald-700 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.04em] text-white dark:border-emerald-900/80 dark:bg-emerald-800 dark:text-white">
              Online: {onlineFriendedCount}
            </div>
            <div className="floating-3d-text w-full rounded-md border border-emerald-900/70 bg-emerald-700 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.04em] text-white dark:border-emerald-900/80 dark:bg-emerald-800 dark:text-white">
              Offline: {offlineFriendedCount}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
