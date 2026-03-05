import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db, member, server } from "@/lib/db";
import { currentProfile } from "@/lib/current-profile";
import { ServerSidebar } from "@/components/server/server-sidebar";

const ServerIdLayout = async ({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { serverId: string };
}) => {
  const profile = await currentProfile();
  if (!profile) {
    return redirect("/sign-in");
  }

  const hasAccess = await db
    .select({ id: server.id })
    .from(server)
    .innerJoin(
      member,
      and(
        eq(member.serverId, server.id),
        eq(member.profileId, profile.id),
        eq(server.id, params.serverId)
      )
    )
    .limit(1);

  if (!hasAccess[0]) {
    return redirect("/");
  }

  return (
    <div className="h-full">
      <aside className="fixed inset-y-0 left-[88px] w-60 z-40">
        <ServerSidebar serverId={params.serverId} />
      </aside>
      <main className="h-full pl-[328px]">{children}</main>
    </div>
  );
};

export default ServerIdLayout;
