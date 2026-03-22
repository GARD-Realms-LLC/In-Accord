import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ChannelType } from "@/lib/db/types";
import { resolveMemberContext, visibleChannelIdsForMember } from "@/lib/channel-permissions";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { resolveServerRouteContext } from "@/lib/route-slug-resolver";
import { buildChannelPath } from "@/lib/route-slugs";
import { pickDefaultServerChannel } from "@/lib/default-server-channel";

type ServerChannelRow = {
  id: string | null;
  name: string | null;
  type: ChannelType | null;
};

export async function resolveServerRootRedirectPath(input: {
  profileId: string;
  profileRole?: string | null;
  serverParam: string;
}) {
  const hasAdministrativeAccess = hasInAccordAdministrativeAccess(input.profileRole);
  const resolvedServer = await resolveServerRouteContext({
    profileId: input.profileId,
    serverParam: input.serverParam,
    profileRole: input.profileRole,
  });

  if (!resolvedServer) {
    return null;
  }

  const serverId = resolvedServer.id;

  const ownerRows = await db.execute(sql`
    select s."id" as "id"
    from "Server" s
    where trim(s."id") = trim(${serverId})
      and trim(s."profileId") = trim(${input.profileId})
    limit 1
  `);

  const isServerOwner = Boolean(
    ((ownerRows as unknown as {
      rows?: Array<{ id: string | null }>;
    }).rows ?? [])[0]?.id
  );

  const memberRows = await db.execute(sql`
    select m."id" as "id"
    from "Member" m
    where trim(m."serverId") = trim(${serverId})
      and trim(m."profileId") = trim(${input.profileId})
    limit 1
  `);

  const memberRow = ((memberRows as unknown as {
    rows?: Array<{ id: string | null }>;
  }).rows ?? [])[0];

  if (!memberRow?.id && !isServerOwner && !hasAdministrativeAccess) {
    return null;
  }

  const memberContext = await resolveMemberContext({
    profileId: input.profileId,
    serverId,
  });

  const channelRowsResult = await db.execute(sql`
    select
      c."id" as "id",
      c."name" as "name",
      c."type" as "type"
    from "Channel" c
    where trim(c."serverId") = trim(${serverId})
    order by c."createdAt" asc, c."id" asc
  `);

  const allChannels = (((channelRowsResult as unknown as {
    rows?: ServerChannelRow[];
  }).rows ?? [])
    .map((row) => ({
      id: String(row.id ?? "").trim(),
      name: String(row.name ?? "").trim(),
      type: row.type,
    }))
    .filter(
      (row): row is { id: string; name: string; type: ChannelType } => Boolean(row.id) && Boolean(row.type)
    ));

  const visibleIds = isServerOwner || hasAdministrativeAccess
    ? new Set(allChannels.map((item) => item.id))
    : memberContext
    ? await visibleChannelIdsForMember({
        serverId,
        memberContext,
        channelIds: allChannels.map((item) => item.id),
      })
      : new Set<string>();

  const visibleChannels = allChannels.filter((item) => visibleIds.has(item.id));
  const defaultChannel = pickDefaultServerChannel(visibleChannels);

  if (!defaultChannel?.id) {
    return null;
  }

  return buildChannelPath({
    server: { id: serverId, name: resolvedServer.name },
    channel: { id: defaultChannel.id, name: defaultChannel.name },
  });
}