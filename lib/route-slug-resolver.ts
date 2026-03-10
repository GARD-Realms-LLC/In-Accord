import { and, eq } from "drizzle-orm";

import { channel, db, member, server } from "@/lib/db";
import { buildRouteSegment, matchesRouteParam } from "@/lib/route-slugs";

type ServerCandidate = { id: string; name: string };
type ChannelCandidate = { id: string; name: string };
const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export async function resolveServerRouteContext(input: {
  profileId: string;
  serverParam: string;
}): Promise<{ id: string; name: string; segment: string } | null> {
  const normalizedParam = safeDecode(String(input.serverParam ?? "").trim());
  if (!normalizedParam) {
    return null;
  }

  const directServer = await db
    .select({ id: server.id, name: server.name })
    .from(server)
    .innerJoin(
      member,
      and(eq(member.serverId, server.id), eq(member.profileId, input.profileId))
    )
    .where(eq(server.id, normalizedParam))
    .limit(1);

  if (directServer[0]) {
    return {
      id: directServer[0].id,
      name: directServer[0].name,
      segment: buildRouteSegment(directServer[0].name, directServer[0].id),
    };
  }

  const candidates = await db
    .select({ id: server.id, name: server.name })
    .from(server)
    .innerJoin(
      member,
      and(eq(member.serverId, server.id), eq(member.profileId, input.profileId))
    );

  const match = (candidates as ServerCandidate[]).find((item) =>
    matchesRouteParam(normalizedParam, item)
  );

  if (!match) {
    return null;
  }

  return {
    id: match.id,
    name: match.name,
    segment: buildRouteSegment(match.name, match.id),
  };
}

export async function resolveChannelRouteContext(input: {
  serverId: string;
  channelParam: string;
}): Promise<{ id: string; name: string; segment: string } | null> {
  const normalizedParam = safeDecode(String(input.channelParam ?? "").trim());
  if (!normalizedParam) {
    return null;
  }

  const directChannel = await db
    .select({ id: channel.id, name: channel.name })
    .from(channel)
    .where(and(eq(channel.serverId, input.serverId), eq(channel.id, normalizedParam)))
    .limit(1);

  if (directChannel[0]) {
    return {
      id: directChannel[0].id,
      name: directChannel[0].name,
      segment: buildRouteSegment(directChannel[0].name, directChannel[0].id),
    };
  }

  const candidates = await db
    .select({ id: channel.id, name: channel.name })
    .from(channel)
    .where(eq(channel.serverId, input.serverId));

  const match = (candidates as ChannelCandidate[]).find((item) =>
    matchesRouteParam(normalizedParam, item)
  );

  if (!match) {
    return null;
  }

  return {
    id: match.id,
    name: match.name,
    segment: buildRouteSegment(match.name, match.id),
  };
}
