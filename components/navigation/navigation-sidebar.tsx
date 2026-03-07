import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NavigationAction } from "@/components/navigation/navigation-action";
import { NavigationJoinAction } from "@/components/navigation/navigation-join-action";
import { NavigationHomeButton } from "@/components/navigation/navigation-home-button";
import { NavigationUsersHomeButton } from "@/components/navigation/navigation-users-home-button";
import { NavigationServersCollection } from "@/components/navigation/navigation-servers-collection";

export const NavigationSidebar = async () => {
  const profile = await currentProfile();

  if (!profile) {
    return (
      <div
        className="theme-servers-rail settings-scrollbar flex h-full min-h-0 w-full flex-col items-center space-y-4 overflow-hidden rounded-2xl border border-border bg-card py-3 text-primary"
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

  const normalizedRole = (profile.role ?? "").trim().toUpperCase();
  const isInAccordAdministrator =
    normalizedRole === "ADMINISTRATOR" ||
    normalizedRole === "IN-ACCORD ADMINISTRATOR" ||
    normalizedRole === "IN_ACCORD_ADMINISTRATOR" ||
    normalizedRole === "ADMIN";

  let totalMembers = 0;
  let totalServers = 0;

  if (isInAccordAdministrator) {
    const totalsResult = await db.execute(sql`
      select
        (select count(*)::int from "Member") as "totalMembers",
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
  }

  return (
    <div
      className="theme-servers-rail settings-scrollbar flex h-full min-h-0 w-full flex-col items-center space-y-4 overflow-hidden rounded-2xl border border-border bg-card py-3 text-primary"
      aria-label="Servers rail"
    >
      <NavigationHomeButton />

      <div className="text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-300">
        In-Accord
      </div>

      {isInAccordAdministrator ? (
        <>
          <div className="w-full px-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-300">
            <p className="mb-1">TOTALs</p>
            <p>Members: {totalMembers}</p>
            <p className="mt-1">Servers: {totalServers}</p>
          </div>
          <div className="h-[2px] w-[85%] rounded bg-zinc-700 dark:bg-zinc-200" />
          <NavigationUsersHomeButton />
        </>
      ) : null}

      <Separator className="h-[2px] bg-zinc-300 dark:bg-zinc-700 rounded-md w-10 mx-auto" />
      <NavigationAction />
      <NavigationJoinAction />
      <Separator className="h-[2px] bg-zinc-300 dark:bg-zinc-700 rounded-md w-10 mx-auto" />
      <ScrollArea className="settings-scrollbar min-h-0 flex-1 w-full">
        <NavigationServersCollection myServers={myServers} joinedServers={joinedServers} />
      </ScrollArea>

      <div className="w-full px-3 pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-600 dark:text-zinc-400">
        <p>My Servers: {myServers.length}</p>
        <p className="mt-1">Joined: {joinedServers.length}</p>
      </div>
    </div>
  );
};
