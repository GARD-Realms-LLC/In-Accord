import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { isInAccordAdministrator } from "@/lib/in-accord-admin";
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

const getRows = <TRow extends Record<string, unknown>>(result: unknown) =>
  ((result as { rows?: TRow[] }).rows ?? []) as TRow[];

export async function resolveServerRouteContext(input: {
  profileId: string;
  serverParam: string;
  profileRole?: string | null;
}): Promise<{ id: string; name: string; segment: string } | null> {
  const normalizedParam = safeDecode(String(input.serverParam ?? "").trim());
  const isGlobalAdministrator = isInAccordAdministrator(input.profileRole);
  if (!normalizedParam) {
    return null;
  }

  const directServerResult = await db.execute(
    isGlobalAdministrator
      ? sql`
          select
            s."id" as "id",
            s."name" as "name"
          from "Server" s
          where trim(s."id") = trim(${normalizedParam})
          limit 1
        `
      : sql`
          select
            s."id" as "id",
            s."name" as "name"
          from "Server" s
          where trim(s."id") = trim(${normalizedParam})
            and (
              trim(s."profileId") = trim(${input.profileId})
              or exists (
                select 1
                from "Member" m
                where m."serverId" = s."id"
                  and trim(m."profileId") = trim(${input.profileId})
              )
            )
          limit 1
        `
  );

  const directServer = getRows<{ id: string; name: string }>(directServerResult);

  if (directServer[0]) {
    return {
      id: directServer[0].id,
      name: directServer[0].name,
      segment: buildRouteSegment(directServer[0].name, directServer[0].id),
    };
  }

  const candidatesResult = await db.execute(
    isGlobalAdministrator
      ? sql`
          select
            s."id" as "id",
            s."name" as "name"
          from "Server" s
        `
      : sql`
          select
            s."id" as "id",
            s."name" as "name"
          from "Server" s
          where trim(s."profileId") = trim(${input.profileId})
             or exists (
               select 1
               from "Member" m
               where m."serverId" = s."id"
                 and trim(m."profileId") = trim(${input.profileId})
             )
        `
  );

  const candidates = getRows<ServerCandidate>(candidatesResult);

  const match = candidates.find((item) => matchesRouteParam(normalizedParam, item));

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

  const directChannelResult = await db.execute(sql`
    select
      c."id" as "id",
      c."name" as "name"
    from "Channel" c
    where c."serverId" = ${input.serverId}
      and trim(c."id") = trim(${normalizedParam})
    limit 1
  `);

  const directChannel = getRows<{ id: string; name: string }>(directChannelResult);

  if (directChannel[0]) {
    return {
      id: directChannel[0].id,
      name: directChannel[0].name,
      segment: buildRouteSegment(directChannel[0].name, directChannel[0].id),
    };
  }

  const candidatesResult = await db.execute(sql`
    select
      c."id" as "id",
      c."name" as "name"
    from "Channel" c
    where c."serverId" = ${input.serverId}
  `);

  const candidates = getRows<ChannelCandidate>(candidatesResult);

  const match = candidates.find((item) => matchesRouteParam(normalizedParam, item));

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

  const directResult = await db.execute(sql`
    select
      c."id" as "channelId",
      c."name" as "channelName",
      s."id" as "serverId",
      s."name" as "serverName"
    from "Channel" c
    inner join "Server" s on s."id" = c."serverId"
    where trim(c."id") = trim(${normalizedParam})
      and (
        trim(s."profileId") = trim(${input.profileId})
        or exists (
          select 1
          from "Member" m
          where m."serverId" = c."serverId"
            and trim(m."profileId") = trim(${input.profileId})
        )
      )
    limit 1
  `);

  const direct = getRows<ProfileChannelCandidate>(directResult);

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

  const candidatesResult = await db.execute(sql`
    select
      c."id" as "channelId",
      c."name" as "channelName",
      s."id" as "serverId",
      s."name" as "serverName"
    from "Channel" c
    inner join "Server" s on s."id" = c."serverId"
    where trim(s."profileId") = trim(${input.profileId})
       or exists (
         select 1
         from "Member" m
         where m."serverId" = c."serverId"
           and trim(m."profileId") = trim(${input.profileId})
       )
  `);

  const candidates = getRows<ProfileChannelCandidate>(candidatesResult);

  const match = candidates.find((item) =>
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
