import { NextResponse } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, member, server } from "@/lib/db";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { makeIntegrationBotProfileId } from "@/lib/integration-bot-profile";
import { getOtherApiOrigin } from "@/lib/other-upstream-identifiers";
import { getDecryptedOtherBotToken } from "@/lib/user-preferences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ServerUsageRow = {
  id: string;
  name: string;
};

type PreferenceRow = {
  userId: string | null;
  OtherBotsJson: string | null;
};

type TemplateBotReference = {
  ownerUserId: string;
  botId: string;
  importsMadeCount: number;
  templatesImportedCount: number;
  templateServerIds: string[];
  statsUpdatedAt: string | null;
};

type ExternalGuildRow = {
  id?: unknown;
  name?: unknown;
};

const normalizeTemplateBotName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/["'`]+/g, "")
    .replace(/\s+/g, " ");

const isTemplateMeBotName = (value: unknown) => normalizeTemplateBotName(value) === "template me bot";

const fetchTemplateBotGuilds = async (token: string): Promise<Array<{ id: string; name: string }>> => {
  const normalizedToken = String(token ?? "").trim();
  if (!normalizedToken) {
    return [];
  }

  const response = await fetch(`${getOtherApiOrigin()}/api/v10/users/@me/guilds?limit=200`, {
    method: "GET",
    headers: {
      Authorization: `Bot ${normalizedToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json().catch(() => [])) as unknown;
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .filter((entry): entry is ExternalGuildRow => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      id: String(entry.id ?? "").trim(),
      name: String(entry.name ?? "").trim() || String(entry.id ?? "").trim(),
    }))
    .filter((entry) => entry.id.length > 0);
};

const ensureAdmin = async () => {
  const profile = await currentProfile();
  if (!profile) {
    return { ok: false as const, response: new NextResponse("Unauthorized", { status: 401 }) };
  }

  if (!hasInAccordAdministrativeAccess(profile.role)) {
    return { ok: false as const, response: new NextResponse("Forbidden", { status: 403 }) };
  }

  return { ok: true as const, profile };
};

export async function GET(req: Request) {
  try {
    const auth = await ensureAdmin();
    if (!auth.ok) {
      return auth.response;
    }

    const url = new URL(req.url);
    const fallbackUserId = String(auth.profile.userId ?? "").trim();
    const userId = String(url.searchParams.get("userId") ?? fallbackUserId).trim();
    const botIdFromQuery = String(url.searchParams.get("botId") ?? "").trim();

    if (!userId) {
      return new NextResponse("Unable to resolve current admin user.", { status: 400 });
    }

    const preferenceResult = await db.execute(sql`
      select
        up."userId" as "userId",
        up."OtherBotsJson" as "OtherBotsJson"
      from "UserPreference" up
    `);

    const preferenceRows = (preferenceResult as unknown as { rows?: PreferenceRow[] }).rows ?? [];

    const templateBotRefs: TemplateBotReference[] = [];

    for (const row of preferenceRows) {
      const ownerUserId = String(row.userId ?? "").trim();
      if (!ownerUserId) {
        continue;
      }

      let parsedBots: unknown = [];
      try {
        parsedBots = JSON.parse(row.OtherBotsJson ?? "[]") as unknown;
      } catch {
        parsedBots = [];
      }

      if (!Array.isArray(parsedBots)) {
        continue;
      }

      for (const item of parsedBots) {
        if (!item || typeof item !== "object") {
          continue;
        }

        const typed = item as {
          id?: unknown;
          name?: unknown;
          templateImportsMade?: unknown;
          templatesImportedCount?: unknown;
          templateServerIds?: unknown;
          templateStatsUpdatedAt?: unknown;
        };

        if (!isTemplateMeBotName(typed.name)) {
          continue;
        }

        const botId = String(typed.id ?? "").trim();
        if (!botId) {
          continue;
        }

        const importsMadeCount =
          typeof typed.templateImportsMade === "number" && Number.isFinite(typed.templateImportsMade)
            ? Math.max(0, Math.floor(typed.templateImportsMade))
            : 0;
        const templatesImportedCount =
          typeof typed.templatesImportedCount === "number" && Number.isFinite(typed.templatesImportedCount)
            ? Math.max(0, Math.floor(typed.templatesImportedCount))
            : 0;
        const templateServerIds = Array.isArray(typed.templateServerIds)
          ? Array.from(
              new Set(
                typed.templateServerIds
                  .map((entry) => String(entry ?? "").trim())
                  .filter((entry) => entry.length > 0)
              )
            )
          : [];
        const statsUpdatedAtRaw = String(typed.templateStatsUpdatedAt ?? "").trim();
        const statsUpdatedAt =
          statsUpdatedAtRaw && !Number.isNaN(new Date(statsUpdatedAtRaw).getTime())
            ? new Date(statsUpdatedAtRaw).toISOString()
            : null;

        templateBotRefs.push({
          ownerUserId,
          botId,
          importsMadeCount,
          templatesImportedCount,
          templateServerIds,
          statsUpdatedAt,
        });
      }
    }

    const selectedBotRef = botIdFromQuery
      ? templateBotRefs.find((entry) => entry.botId === botIdFromQuery) ?? null
      : null;

    const botProfileIds = Array.from(
      new Set(
        templateBotRefs
          .map((entry) => makeIntegrationBotProfileId(entry.ownerUserId, entry.botId))
          .filter((entry) => entry.length > 0)
      )
    );

    const templateBotIds = Array.from(
      new Set(templateBotRefs.map((entry) => `${entry.ownerUserId}:${entry.botId}`))
    );
    const templateBotIdSuffixes = Array.from(new Set(templateBotRefs.map((entry) => entry.botId)));

    const attachedRows = botProfileIds.length
      ? await db
          .select({ id: server.id, name: server.name })
          .from(member)
          .innerJoin(server, eq(member.serverId, server.id))
          .where(inArray(member.profileId, botProfileIds))
      : [];

    const attachedServers = attachedRows
      .map((row: { id: string | null; name: string | null }) => ({
        id: String(row.id ?? "").trim(),
        name: String(row.name ?? "").trim() || String(row.id ?? "").trim(),
      }))
      .filter((row: ServerUsageRow) => row.id.length > 0);

    let statsServers: ServerUsageRow[] = [];

    const serverIdsFromStats = Array.from(
      new Set(templateBotRefs.flatMap((entry) => entry.templateServerIds))
    );

    if (serverIdsFromStats.length > 0) {
      const rows = await db
        .select({ id: server.id, name: server.name })
        .from(server)
        .where(inArray(server.id, serverIdsFromStats));

      statsServers = rows
        .map((row: { id: string | null; name: string | null }) => ({
          id: String(row.id ?? "").trim(),
          name: String(row.name ?? "").trim() || String(row.id ?? "").trim(),
        }))
        .filter((row: ServerUsageRow) => row.id.length > 0);
    }

    const mergedServerMap = new Map<string, ServerUsageRow>();
    [...statsServers, ...attachedServers].forEach((entry) => {
      mergedServerMap.set(entry.id, entry);
    });

    const runtimeGuildMap = new Map<string, ServerUsageRow>();
    const runtimeGuildSourceBots: string[] = [];

    await Promise.all(
      templateBotRefs.map(async (entry) => {
        try {
          const token = await getDecryptedOtherBotToken(entry.ownerUserId, entry.botId);
          if (!token) {
            return;
          }

          const guilds = await fetchTemplateBotGuilds(token);
          if (guilds.length === 0) {
            return;
          }

          runtimeGuildSourceBots.push(`${entry.ownerUserId}:${entry.botId}`);
          guilds.forEach((guild) => {
            runtimeGuildMap.set(guild.id, { id: guild.id, name: guild.name });
          });
        } catch {
          // ignore per-bot runtime lookup failures and continue with fallbacks
        }
      })
    );

    if (runtimeGuildMap.size > 0) {
      runtimeGuildMap.forEach((entry, id) => {
        mergedServerMap.set(id, entry);
      });
    }

    const globalTemplateBotMembershipRows = await db.execute(sql`
      select distinct s."id" as "id", s."name" as "name"
      from "Member" m
      inner join "Users" u on u."userId" = m."profileId"
      inner join "Server" s on s."id" = m."serverId"
      where
        regexp_replace(lower(coalesce(u."name", '')), '\\s+', ' ', 'g') like '%template%'
        and regexp_replace(lower(coalesce(u."name", '')), '\\s+', ' ', 'g') like '%bot%'
    `);

    const globalRows = (globalTemplateBotMembershipRows as unknown as {
      rows?: Array<{ id: string | null; name: string | null }>;
    }).rows ?? [];

    const globalServerIds: string[] = [];
    const genericBotcfgServerIds: string[] = [];
    const suffixMatchedServerIds: string[] = [];
    const suffixMatchedProfileIds: string[] = [];

    globalRows
      .map((row) => ({
        id: String(row.id ?? "").trim(),
        name: String(row.name ?? "").trim() || String(row.id ?? "").trim(),
      }))
      .filter((row) => row.id.length > 0)
      .forEach((row) => {
        globalServerIds.push(row.id);
        mergedServerMap.set(row.id, row);
      });

    const genericBotMembershipRows = await db.execute(sql`
      select distinct m."profileId" as "profileId", s."id" as "id", s."name" as "name"
      from "Member" m
      inner join "Server" s on s."id" = m."serverId"
      where m."profileId" like 'botcfg_%'
    `);

    const genericRows = (genericBotMembershipRows as unknown as {
      rows?: Array<{ profileId: string | null; id: string | null; name: string | null }>;
    }).rows ?? [];

    genericRows
      .map((row) => ({
        profileId: String(row.profileId ?? "").trim(),
        id: String(row.id ?? "").trim(),
        name: String(row.name ?? "").trim() || String(row.id ?? "").trim(),
      }))
      .filter((row) => row.profileId.length > 0 && row.id.length > 0)
      .forEach((row) => {
        const isSuffixMatch = templateBotIdSuffixes.some((botId) => row.profileId.endsWith(`_${botId}`));
        if (isSuffixMatch) {
          suffixMatchedProfileIds.push(row.profileId);
          suffixMatchedServerIds.push(row.id);
          mergedServerMap.set(row.id, { id: row.id, name: row.name });
          return;
        }

        if (mergedServerMap.size === 0) {
          genericBotcfgServerIds.push(row.id);
          mergedServerMap.set(row.id, { id: row.id, name: row.name });
        }
      });

    const serversUsingTemplates = Array.from(mergedServerMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(
      {
        importsMadeCount:
          templateBotRefs.reduce((total, entry) => total + entry.importsMadeCount, 0),
        templatesImportedCount:
          templateBotRefs.reduce((total, entry) => total + entry.templatesImportedCount, 0),
        serversUsingTemplatesCount: serversUsingTemplates.length,
        serversUsingTemplates,
        statsUpdatedAt:
          templateBotRefs
            .map((entry) => entry.statsUpdatedAt)
            .filter((entry): entry is string => Boolean(entry))
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null,
        activeTemplateBotId: selectedBotRef?.botId ?? null,
        debug: {
          requestedUserId: userId,
          requestedBotId: botIdFromQuery || null,
          templateBotIds,
          templateBotIdSuffixes,
          botProfileIds,
          statsServerIds: serverIdsFromStats,
          attachedServerIds: attachedServers.map((entry: ServerUsageRow) => entry.id),
          runtimeGuildIds: Array.from(runtimeGuildMap.keys()),
          runtimeGuildSourceBots,
          globalServerIds,
          genericBotcfgServerIds,
          suffixMatchedProfileIds,
          suffixMatchedServerIds,
          mergedServerIds: serversUsingTemplates.map((entry: ServerUsageRow) => entry.id),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("[ADMIN_TEMPLATE_ME_STATS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
