import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, ChannelType, db, member, server } from "@/lib/db";
import { resolveMemberContext, visibleChannelIdsForMember } from "@/lib/channel-permissions";
import { resolveServerRouteContext } from "@/lib/route-slug-resolver";
import { buildChannelPath } from "@/lib/route-slugs";
import { pickDefaultServerChannel } from "@/lib/default-server-channel";

interface ServerIdPageProps {
  params: Promise<{
    serverId: string;
  }>;
}

const ServerIdPage = async ({ params }: ServerIdPageProps) => {
  const { serverId: serverParam } = await params;

  const profile = await currentProfile();

  if (!profile) {
    return redirect("/sign-in");
  }

  const resolvedServer = await resolveServerRouteContext({
    profileId: profile.id,
    serverParam,
  });

  if (!resolvedServer) {
    return redirect("/");
  }

  const serverId = resolvedServer.id;

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
  const memberContext = await resolveMemberContext({ profileId: profile.id, serverId });

  const serverChannels = await db
    .select({ id: channel.id, name: channel.name, type: channel.type, createdAt: channel.createdAt })
    .from(channel)
    .where(eq(channel.serverId, serverId))
    .orderBy(asc(channel.createdAt));

  const visibleIds = memberContext
    ? await visibleChannelIdsForMember({
        serverId,
        memberContext,
        channelIds: serverChannels.map((item) => item.id),
      })
    : new Set(serverChannels.map((item) => item.id));

  const visibleChannels = serverChannels.filter((item) => visibleIds.has(item.id));
  const initialChannel = pickDefaultServerChannel(visibleChannels);

  if (!initialChannel?.id) {
    return redirect("/");
  }

  return redirect(
    buildChannelPath({
      server: { id: serverId, name: resolvedServer.name },
      channel: { id: initialChannel.id, name: initialChannel.name },
    })
  );
}
 
export default ServerIdPage;