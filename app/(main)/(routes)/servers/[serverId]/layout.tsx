import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";

import { db, member, server } from "@/lib/db";
import { currentProfile } from "@/lib/current-profile";
import { ServerSidebar } from "@/components/server/server-sidebar";
import { ServerUserRolesRail } from "@/components/server/server-user-roles-rail";
import { ServerRouteShell } from "@/components/server/server-route-shell";
import { ChannelType, MemberRole } from "@/lib/db/types";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { ensureChannelGroupSchema, ensureDefaultMediaChannelGroups } from "@/lib/channel-groups";
import { resolveServerRouteContext } from "@/lib/route-slug-resolver";
import { buildRouteSegment } from "@/lib/route-slugs";

type ChannelRow = {
  id: string;
  name: string;
  type: ChannelType;
  sortOrder: number | string | null;
};

type MemberRow = {
  id: string;
  role: MemberRole;
  profileId: string;
  presenceStatus: string | null;
  name: string | null;
  email: string | null;
};

const ServerIdLayout = async ({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ serverId: string }>;
}) => {
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

  const hasAccess = await db
    .select({ id: server.id, name: server.name })
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

  if (!hasAccess[0]) {
    return redirect("/");
  }

  const currentServerName = hasAccess[0].name;

  await ensureChannelGroupSchema();
  await ensureDefaultMediaChannelGroups({
    serverId,
    profileId: profile.id,
  });

  const channelsResult = await db.execute(sql`
    select
      c."id" as "id",
      c."name" as "name",
      c."type" as "type",
      c."sortOrder" as "sortOrder"
    from "Channel" c
    where c."serverId" = ${serverId}
    order by c."channelGroupId" asc nulls first, c."sortOrder" asc, c."createdAt" asc
  `);

  const membersResult = await db.execute(sql`
    select
      m."id" as "id",
      m."role" as "role",
      m."profileId" as "profileId",
      up."presenceStatus" as "presenceStatus",
      u."name" as "name",
      u."email" as "email"
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

  const channelRows = (channelsResult as unknown as { rows: ChannelRow[] }).rows;
  const memberRows = (membersResult as unknown as { rows: MemberRow[] }).rows;

  const textChannels = channelRows.filter((row) => row.type === ChannelType.TEXT);
  const voiceChannels = channelRows.filter((row) => row.type === ChannelType.AUDIO);
  const videoChannels = channelRows.filter((row) => row.type === ChannelType.VIDEO);

  const currentMemberRole = memberRows.find((row) => row.profileId === profile.id)?.role;
  const canSeeInvisibleMembers = hasInAccordAdministrativeAccess(profile.role) || currentMemberRole === MemberRole.ADMIN;

  const onlineUsers = memberRows
    .filter((row) => canSeeInvisibleMembers || String(row.presenceStatus ?? "ONLINE").toUpperCase() !== "INVISIBLE")
    .map((row) => ({
    ...row,
    displayName: row.name || row.email || row.profileId,
  }));

  return (
    <ServerRouteShell
      serverName={currentServerName}
      serverId={serverId}
      serverRouteSegment={resolvedServer.segment}
      textChannels={textChannels.map((channel) => ({ id: channel.id, name: channel.name, routeSegment: buildRouteSegment(channel.name, channel.id) }))}
      voiceChannels={voiceChannels.map((channel) => ({ id: channel.id, name: channel.name, routeSegment: buildRouteSegment(channel.name, channel.id) }))}
      videoChannels={videoChannels.map((channel) => ({ id: channel.id, name: channel.name, routeSegment: buildRouteSegment(channel.name, channel.id) }))}
      onlineUsers={onlineUsers.map((member) => ({
        id: member.id,
        name: member.displayName,
        role: member.role,
      }))}
      leftSidebar={<ServerSidebar serverId={serverId} />}
      rightSidebar={<ServerUserRolesRail serverId={serverId} />}
      rightFooter={null}
    >
      {children}
    </ServerRouteShell>
  );
};

export default ServerIdLayout;
