import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { ChannelType } from "@/lib/db/types";
import { resolveMemberContext, visibleChannelIdsForMember } from "@/lib/channel-permissions";
import { resolveServerRouteContext } from "@/lib/route-slug-resolver";
import { buildChannelPath } from "@/lib/route-slugs";
import { pickDefaultServerChannel } from "@/lib/default-server-channel";

interface ServerIdPageProps {
  params: Promise<{
    serverId: string;
  }>;
}

type ServerChannelRow = {
  id: string | null;
  name: string | null;
  type: ChannelType | null;
  createdAt: Date | string | null;
};

const normalizeChannelRows = (rows: ServerChannelRow[]) =>
  rows
    .map((row) => ({
      id: String(row.id ?? "").trim(),
      name: String(row.name ?? "").trim(),
      type: row.type,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(0),
    }))
    .filter(
      (
        row,
      ): row is {
        id: string;
        name: string;
        type: ChannelType;
        createdAt: Date;
      } => Boolean(row.id) && Boolean(row.type),
    );

const ServerIdPage = async ({ params }: ServerIdPageProps) => {
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

  const memberRows = await db.execute(sql`
    select
      m."id" as "id"
    from "Member" m
    where trim(m."serverId") = trim(${serverId})
      and trim(m."profileId") = trim(${profile.id})
    limit 1
  `);

  const memberRow = ((memberRows as unknown as {
    rows?: Array<{ id: string | null }>;
  }).rows ?? [])[0];

  if (!memberRow?.id) {
    return redirect("/servers");
  }

  const memberContext = await resolveMemberContext({
    profileId: profile.id,
    serverId,
  });

  const channelRowsResult = await db.execute(sql`
    select
      c."id" as "id",
      c."name" as "name",
      c."type" as "type",
      c."createdAt" as "createdAt"
    from "Channel" c
    where trim(c."serverId") = trim(${serverId})
    order by c."createdAt" asc, c."id" asc
  `);

  const allChannels = normalizeChannelRows(
    ((channelRowsResult as unknown as {
      rows?: ServerChannelRow[];
    }).rows ?? []),
  );

  const visibleIds = memberContext
    ? await visibleChannelIdsForMember({
        serverId,
        memberContext,
        channelIds: allChannels.map((item) => item.id),
      })
    : new Set(allChannels.map((item) => item.id));

  const visibleChannels = allChannels.filter((item) => visibleIds.has(item.id));
  const initialChannel = pickDefaultServerChannel(visibleChannels);

  if (!initialChannel?.id) {
    return redirect("/servers");
  }

  return redirect(
    buildChannelPath({
      server: { id: serverId, name: resolvedServer.name },
      channel: { id: initialChannel.id, name: initialChannel.name },
    }),
  );
};

export default ServerIdPage;
