import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, member, server } from "@/lib/db";
import { visibleChannelIdsForRole } from "@/lib/channel-permissions";

interface ServerIdPageProps {
  params: Promise<{
    serverId: string;
  }>;
}

const ServerIdPage = async ({ params }: ServerIdPageProps) => {
  const { serverId } = await params;

  const profile = await currentProfile();

  if (!profile) {
    return redirect("/sign-in");
  }

  const access = await db
    .select({ id: server.id })
    .from(server)
    .innerJoin(
      member,
      and(
        eq(member.serverId, server.id),
        eq(member.profileId, profile.id),
        eq(server.id, serverId)
      )
    )
    .limit(1);

  if (!access[0]) {
    return redirect("/");
  }

  const currentMember = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.serverId, serverId), eq(member.profileId, profile.id)))
    .limit(1);

  if (!currentMember[0]) {
    return redirect("/");
  }

  const serverOwner = await db
    .select({ id: server.id })
    .from(server)
    .where(and(eq(server.id, serverId), eq(server.profileId, profile.id)))
    .limit(1);

  const serverChannels = await db
    .select({ id: channel.id, name: channel.name, createdAt: channel.createdAt })
    .from(channel)
    .where(eq(channel.serverId, serverId))
    .orderBy(asc(channel.createdAt));

  const visibleIds = await visibleChannelIdsForRole({
    serverId,
    role: currentMember[0].role,
    isServerOwner: !!serverOwner[0],
    channelIds: serverChannels.map((item) => item.id),
  });

  const visibleChannels = serverChannels.filter((item) => visibleIds.has(item.id));
  const initialChannel =
    visibleChannels.find((item) => item.name === "general") ?? visibleChannels[0] ?? null;

  if (!initialChannel?.id) {
    return null;
  }

  return redirect(`/servers/${serverId}/channels/${initialChannel.id}`);
}
 
export default ServerIdPage;