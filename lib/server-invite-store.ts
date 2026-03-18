import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export type ServerInviteHistoryItem = {
  code: string;
  createdAt: string;
  source: "created" | "regenerated";
  createdByProfileId?: string;
  usedCount?: number;
  usedByProfileIds?: string[];
};

declare global {
  // eslint-disable-next-line no-var
  var inAccordServerInviteHistorySchemaReady: boolean | undefined;
}

const ensureServerInviteHistorySchema = async () => {
  if (globalThis.inAccordServerInviteHistorySchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "ServerInviteHistory" (
      "serverId" varchar(191) not null,
      "code" varchar(191) not null,
      "source" varchar(32) not null,
      "createdByProfileId" varchar(191),
      "createdAt" timestamp not null,
      primary key ("serverId", "code")
    )
  `);

  await db.execute(sql`
    create table if not exists "ServerInviteHistoryUse" (
      "serverId" varchar(191) not null,
      "code" varchar(191) not null,
      "profileId" varchar(191) not null,
      "usedAt" timestamp not null,
      primary key ("serverId", "code", "profileId")
    )
  `);

  globalThis.inAccordServerInviteHistorySchemaReady = true;
};

export async function getServerInviteHistory(serverId: string): Promise<ServerInviteHistoryItem[]> {
  const normalizedServerId = String(serverId ?? "").trim();
  if (!normalizedServerId) {
    return [];
  }

  await ensureServerInviteHistorySchema();

  const result = await db.execute(sql`
    select
      h."code" as "code",
      h."source" as "source",
      h."createdByProfileId" as "createdByProfileId",
      h."createdAt" as "createdAt",
      coalesce(count(u."profileId"), 0) as "usedCount",
      coalesce(json_agg(u."profileId") filter (where u."profileId" is not null), '[]'::json) as "usedByProfileIds"
    from "ServerInviteHistory" h
    left join "ServerInviteHistoryUse" u
      on u."serverId" = h."serverId"
     and u."code" = h."code"
    where h."serverId" = ${normalizedServerId}
    group by h."serverId", h."code", h."source", h."createdByProfileId", h."createdAt"
    order by h."createdAt" desc
  `);

  return (((result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [])).map((row) => ({
    code: String(row.code ?? "").trim(),
    source: row.source === "regenerated" ? "regenerated" : "created",
    createdByProfileId:
      typeof row.createdByProfileId === "string" && row.createdByProfileId.trim().length > 0
        ? row.createdByProfileId.trim()
        : undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(String(row.createdAt ?? "")).toISOString(),
    usedCount: Number(row.usedCount ?? 0),
    usedByProfileIds: Array.isArray(row.usedByProfileIds)
      ? Array.from(new Set(row.usedByProfileIds.map((item) => String(item ?? "").trim()).filter(Boolean)))
      : [],
  })) as ServerInviteHistoryItem[];
}

export async function appendServerInviteHistory(
  serverId: string,
  input: {
    code: string;
    source: "created" | "regenerated";
    createdByProfileId?: string;
    createdAt?: string;
  }
) {
  const code = (input.code ?? "").trim();
  const normalizedServerId = String(serverId ?? "").trim();
  if (!normalizedServerId || !code) {
    return;
  }

  await ensureServerInviteHistorySchema();

  const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();

  await db.execute(sql`
    insert into "ServerInviteHistory" ("serverId", "code", "source", "createdByProfileId", "createdAt")
    values (${normalizedServerId}, ${code}, ${input.source}, ${input.createdByProfileId ?? null}, ${createdAt})
    on conflict ("serverId", "code") do nothing
  `);
}

export async function recordServerInviteUse(serverId: string, codeInput: string, profileIdInput: string) {
  const code = (codeInput ?? "").trim();
  const profileId = (profileIdInput ?? "").trim();
  const normalizedServerId = String(serverId ?? "").trim();

  if (!normalizedServerId || !code || !profileId) {
    return;
  }

  await ensureServerInviteHistorySchema();
  await appendServerInviteHistory(normalizedServerId, { code, source: "created" });

  await db.execute(sql`
    insert into "ServerInviteHistoryUse" ("serverId", "code", "profileId", "usedAt")
    values (${normalizedServerId}, ${code}, ${profileId}, ${new Date()})
    on conflict ("serverId", "code", "profileId") do nothing
  `);
}

export async function removeServerInviteHistory(serverId: string, codeInput: string) {
  const code = (codeInput ?? "").trim();
  const normalizedServerId = String(serverId ?? "").trim();
  if (!normalizedServerId || !code) {
    return;
  }

  await ensureServerInviteHistorySchema();

  await db.execute(sql`
    delete from "ServerInviteHistoryUse"
    where "serverId" = ${normalizedServerId}
      and "code" = ${code}
  `);

  await db.execute(sql`
    delete from "ServerInviteHistory"
    where "serverId" = ${normalizedServerId}
      and "code" = ${code}
  `);
}
