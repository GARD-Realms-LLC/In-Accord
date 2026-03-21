import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { currentProfile } from "@/lib/current-profile";
import { ServerSidebar } from "@/components/server/server-sidebar";
import { ServerUserRolesRail } from "@/components/server/server-user-roles-rail";
import { ServerRouteShell } from "@/components/server/server-route-shell";
import { ChannelType, MemberRole } from "@/lib/db/types";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { resolveServerRouteContext } from "@/lib/route-slug-resolver";
import { buildRouteSegment } from "@/lib/route-slugs";

type ChannelRow = {
  id: string;
  name: string;
  type: ChannelType;
};

type MemberRow = {
  id: string;
  role: MemberRole;
  profileId: string;
  presenceStatus: string | null;
  name: string | null;
  email: string | null;
};

const normalizeMemberRole = (value: unknown): MemberRole => {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (
    normalized === MemberRole.ADMIN ||
    normalized === "ADMINISTRATOR" ||
    normalized === "ADMINS" ||
    normalized === "ADMINISTRATORS"
  ) {
    return MemberRole.ADMIN;
  }
  if (
    normalized === MemberRole.MODERATOR ||
    normalized === "MOD" ||
    normalized === "MODS" ||
    normalized === "MODERATORS"
  ) {
    return MemberRole.MODERATOR;
  }
  return MemberRole.GUEST;
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
    profileRole: profile.role,
  });

  if (!resolvedServer) {
    return redirect("/servers");
  }

  const serverId = resolvedServer.id;
  const targetServerResult = await db.execute(sql`
    select
      s."id" as "id",
      s."name" as "name",
      s."profileId" as "profileId"
    from "Server" s
    where trim(s."id") = trim(${serverId})
    limit 1
  `);
  const targetServer = ((targetServerResult as unknown as {
    rows?: Array<{ id: string | null; name: string | null; profileId: string | null }>;
  }).rows ?? [])[0];

  if (!targetServer?.id) {
    return redirect("/servers");
  }

  const currentServerName = String(targetServer.name ?? "").trim() || resolvedServer.name;
  const isServerOwner =
    String(targetServer.profileId ?? "").trim() === profile.id || hasInAccordAdministrativeAccess(profile.role);

  const channelsResult = await db.execute(sql`
    select
      c."id" as "id",
      c."name" as "name",
      c."type" as "type"
    from "Channel" c
    where trim(c."serverId") = trim(${serverId})
    order by c."createdAt" asc, c."id" asc
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

  const channelRows = (((channelsResult as unknown as {
    rows?: Array<{ id: string | null; name: string | null; type: string | null }>;
  }).rows ?? []).map((row) => ({
    id: String(row.id ?? "").trim(),
    name: String(row.name ?? "").trim(),
    type: String(row.type ?? "").trim() as ChannelType,
  }))).filter((row) => row.id) as ChannelRow[];
  const memberRows = (((membersResult as unknown as {
    rows?: Array<{
      id: string;
      role: string | null;
      profileId: string;
      presenceStatus: string | null;
      name: string | null;
      email: string | null;
    }>;
  }).rows ?? []).map((row) => ({
    ...row,
    role: normalizeMemberRole(row.role),
  }))) as MemberRow[];

  const textChannels = channelRows.filter((row) => row.type === ChannelType.TEXT);
  const announcementChannels = channelRows.filter((row) => row.type === ChannelType.ANNOUNCEMENT);
  const voiceChannels = channelRows.filter((row) => row.type === ChannelType.AUDIO);
  const videoChannels = channelRows.filter((row) => row.type === ChannelType.VIDEO);

  const currentMemberRole = memberRows.find((row) => row.profileId === profile.id)?.role;
  const canSeeInvisibleMembers = hasInAccordAdministrativeAccess(profile.role) || currentMemberRole === MemberRole.ADMIN;
  const canSeeInvisibleBoxes =
    hasInAccordAdministrativeAccess(profile.role) ||
    currentMemberRole === MemberRole.ADMIN ||
    isServerOwner;

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
      announcementChannels={announcementChannels.map((channel) => ({ id: channel.id, name: channel.name, routeSegment: buildRouteSegment(channel.name, channel.id) }))}
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
      showInvisibleBoxes={canSeeInvisibleBoxes}
    >
      {children}
    </ServerRouteShell>
  );
};

export default ServerIdLayout;
