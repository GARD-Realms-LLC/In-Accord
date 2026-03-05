import { sql } from "drizzle-orm";
import Link from "next/link";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NavigationAction } from "@/components/navigation/navigation-action";
import { NavigationItem } from "@/components/navigation/navigation-item";
import { NavigationJoinAction } from "@/components/navigation/navigation-join-action";

export const NavigationSidebar = async () => {
  const profile = await currentProfile();

  if (!profile) {
    return (
      <div
        className="space-y-4 flex flex-col items-center h-full w-full overflow-hidden rounded-2xl border border-black/20 text-primary dark:bg-[#1E1F22] bg-[#E3E5E8] py-3"
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
      s."createdAt" as "createdAt"
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
      }>;
    }
  ).rows;

  const myServers = servers.filter((item) => item.profileId === profile.id);
  const joinedServers = servers.filter((item) => item.profileId !== profile.id);

  return (
    <div
      className="space-y-4 flex flex-col items-center h-full w-full overflow-hidden rounded-2xl border border-black/20 text-primary dark:bg-[#1E1F22] bg-[#E3E5E8] py-3"
      aria-label="Servers rail"
    >
      <div className="text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-300">
        In-Accord
      </div>

      <Link
        href="/users"
        className="group relative flex w-full items-center justify-center"
        title="In-Accord Home"
        aria-label="In-Accord Home"
      >
        <div className="absolute left-0 bg-primary rounded-r-full transition-all w-[4px] h-[8px] group-hover:h-[20px]" />
        <div className="relative flex mx-3 h-[48px] w-[48px] rounded-[24px] group-hover:rounded-[16px] transition-all overflow-hidden bg-[#5865F2]">
          <img
            src="/in-accord-steampunk-logo.png"
            alt="In-Accord"
            className="h-full w-full object-cover"
          />
        </div>
      </Link>

      <Separator className="h-[2px] bg-zinc-300 dark:bg-zinc-700 rounded-md w-10 mx-auto" />
      <NavigationAction />
      <NavigationJoinAction />
      <Separator className="h-[2px] bg-zinc-300 dark:bg-zinc-700 rounded-md w-10 mx-auto" />
      <div className="text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-300">
        My Servers
      </div>
      <ScrollArea className="flex-1 w-full">
        {myServers.map(({ id, name, imageUrl }) => (
          <div key={id} className="mb-4 flex justify-center">
            <NavigationItem
              id={id}
              name={name}
              imageUrl={imageUrl}
            />
          </div>
        ))}
        <div className="mt-1 mb-2 flex justify-center">
          <Separator className="h-[2px] bg-zinc-300 dark:bg-zinc-700 rounded-md w-10" />
        </div>
        <div className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-300">
          Joined Servers
        </div>
        {joinedServers.map(({ id, name, imageUrl }) => (
          <div key={`joined-${id}`} className="mb-4 flex justify-center">
            <NavigationItem
              id={id}
              name={name}
              imageUrl={imageUrl}
            />
          </div>
        ))}
        {joinedServers.length === 0 ? (
          <div className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
            N/A
          </div>
        ) : null}
      </ScrollArea>
    </div>
  );
};
