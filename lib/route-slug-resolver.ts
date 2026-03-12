import { and, eq } from "drizzle-orm";

import { channel, db, member, server } from "@/lib/db";
import { buildRouteSegment, matchesRouteParam } from "@/lib/route-slugs";

type ServerCandidate = { id: string; name: string };
type ChannelCandidate = { id: string; name: string };
type ProfileChannelCandidate = {
  channelId: string;
  channelName: string;
  serverId: string;
  serverName: string;
};
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

export async function resolveChannelRouteContextForProfile(input: {
  profileId: string;
  channelParam: string;
}): Promise<{
  channelId: string;
  channelName: string;
  channelSegment: string;
  serverId: string;
  serverName: string;
  serverSegment: string;
} | null> {
  const normalizedParam = safeDecode(String(input.channelParam ?? "").trim());
  if (!normalizedParam) {
    return null;
  }

  const direct = await db
    .select({
      channelId: channel.id,
      channelName: channel.name,
      serverId: server.id,
      serverName: server.name,
    })
    .from(channel)
    .innerJoin(server, eq(server.id, channel.serverId))
    .innerJoin(member, and(eq(member.serverId, channel.serverId), eq(member.profileId, input.profileId)))
    .where(eq(channel.id, normalizedParam))
    .limit(1);

  if (direct[0]) {
    return {
      channelId: direct[0].channelId,
      channelName: direct[0].channelName,
      channelSegment: buildRouteSegment(direct[0].channelName, direct[0].channelId),
      serverId: direct[0].serverId,
      serverName: direct[0].serverName,
      serverSegment: buildRouteSegment(direct[0].serverName, direct[0].serverId),
    };
  }

  const candidates = await db
    .select({
      channelId: channel.id,
      channelName: channel.name,
      serverId: server.id,
      serverName: server.name,
    })
    .from(channel)
    .innerJoin(server, eq(server.id, channel.serverId))
    .innerJoin(member, and(eq(member.serverId, channel.serverId), eq(member.profileId, input.profileId)));

  const match = (candidates as ProfileChannelCandidate[]).find((item) =>
    matchesRouteParam(normalizedParam, {
      id: item.channelId,
      name: item.channelName,
    })
  );

  if (!match) {
    return null;
  }

  return {
    channelId: match.channelId,
    channelName: match.channelName,
    channelSegment: buildRouteSegment(match.channelName, match.channelId),
    serverId: match.serverId,
    serverName: match.serverName,
    serverSegment: buildRouteSegment(match.serverName, match.serverId),
  };
}
