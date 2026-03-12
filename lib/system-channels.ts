import { sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { db } from "@/lib/db";
import { ChannelType } from "@/lib/db/types";

let systemChannelSchemaReady = false;

export const ensureSystemChannelSchema = async () => {
  if (systemChannelSchemaReady) {
    return;
  }

  await db.execute(sql`
    alter table "Channel"
    add column if not exists "isSystem" boolean not null default false
  `);

  await db.execute(sql`
    update "Channel"
    set "isSystem" = true
    where lower(trim(coalesce("name", ''))) in ('general', 'rules', 'stage')
  `);

  // Keep only one exact "general", "rules", and "stage" name per server by
  // renaming extras to non-system names (preserves history/messages).
  await db.execute(sql`
    with ranked as (
      select
        c."id",
        c."serverId",
        row_number() over (
          partition by c."serverId", lower(trim(coalesce(c."name", '')))
          order by c."createdAt" asc, c."id" asc
        ) as rn
      from "Channel" c
      where lower(trim(coalesce(c."name", ''))) in ('general', 'rules', 'stage')
    )
    update "Channel" c
    set
      "name" = concat('channel-', left(c."id", 6)),
      "isSystem" = false,
      "updatedAt" = now()
    from ranked r
    where c."id" = r."id"
      and r.rn > 1
  `);

  await db.execute(sql`
    create unique index if not exists "Channel_unique_general_per_server"
    on "Channel" ("serverId")
    where lower(trim(coalesce("name", ''))) = 'general'
  `);

  await db.execute(sql`
    create unique index if not exists "Channel_unique_rules_per_server"
    on "Channel" ("serverId")
    where lower(trim(coalesce("name", ''))) = 'rules'
  `);

  await db.execute(sql`
    create unique index if not exists "Channel_unique_stage_per_server"
    on "Channel" ("serverId")
    where lower(trim(coalesce("name", ''))) = 'stage'
  `);

  systemChannelSchemaReady = true;
};

export const ensureRulesChannelForServer = async (serverId: string, profileId?: string | null) => {
  const normalizedServerId = String(serverId ?? "").trim();
  if (!normalizedServerId) {
    return;
  }

  await ensureSystemChannelSchema();

  const rulesExistsResult = await db.execute(sql`
    select "id"
    from "Channel"
    where "serverId" = ${normalizedServerId}
      and lower(trim(coalesce("name", ''))) = 'rules'
    order by "sortOrder" asc, "createdAt" asc, "id" asc
  `);

  const existingRuleRows = (rulesExistsResult as unknown as {
    rows: Array<{ id: string }>;
  }).rows ?? [];

  const existingRulesId = existingRuleRows[0]?.id;

  if (existingRulesId) {
    await db.execute(sql`
      update "Channel"
      set "isSystem" = true
      where "id" = ${existingRulesId}
    `);

    const duplicateRuleIds = existingRuleRows.slice(1).map((row) => row.id);
    for (const duplicateId of duplicateRuleIds) {
      await db.execute(sql`
        update "Channel"
        set
          "name" = concat('channel-', left(${duplicateId}, 6)),
          "isSystem" = false,
          "updatedAt" = now()
        where "id" = ${duplicateId}
      `);
    }

    return;
  }

  let resolvedProfileId = String(profileId ?? "").trim();

  if (!resolvedProfileId) {
    const serverOwnerResult = await db.execute(sql`
      select "profileId"
      from "Server"
      where "id" = ${normalizedServerId}
      limit 1
    `);

    resolvedProfileId =
      (serverOwnerResult as unknown as { rows: Array<{ profileId: string | null }> }).rows?.[0]?.profileId ??
      "";
  }

  if (!resolvedProfileId) {
    return;
  }

  const now = new Date();

  const maxSortOrderResult = await db.execute(sql`
    select coalesce(max(c."sortOrder"), 0) as "maxSortOrder"
    from "Channel" c
    where c."serverId" = ${normalizedServerId}
  `);

  const nextSortOrder =
    Number(
      (
        maxSortOrderResult as unknown as {
          rows: Array<{ maxSortOrder: number | string | null }>;
        }
      ).rows?.[0]?.maxSortOrder ?? 0
    ) + 1;

  try {
    await db.execute(sql`
      insert into "Channel" (
        "id",
        "name",
        "type",
        "profileId",
        "serverId",
        "sortOrder",
        "isSystem",
        "createdAt",
        "updatedAt"
      )
      values (
        ${uuidv4()},
        ${"rules"},
        ${ChannelType.TEXT},
        ${resolvedProfileId},
        ${normalizedServerId},
        ${nextSortOrder},
        ${true},
        ${now},
        ${now}
      )
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/duplicate key|Channel_unique_rules_per_server/i.test(message)) {
      throw error;
    }
  }
};

export const ensureStageChannelForServer = async (serverId: string, profileId?: string | null) => {
  const normalizedServerId = String(serverId ?? "").trim();
  if (!normalizedServerId) {
    return;
  }

  await ensureSystemChannelSchema();

  const stageExistsResult = await db.execute(sql`
    select "id"
    from "Channel"
    where "serverId" = ${normalizedServerId}
      and lower(trim(coalesce("name", ''))) = 'stage'
    order by "sortOrder" asc, "createdAt" asc, "id" asc
  `);

  const existingStageRows = (stageExistsResult as unknown as {
    rows: Array<{ id: string }>;
  }).rows ?? [];

  const existingStageId = existingStageRows[0]?.id;

  if (existingStageId) {
    await db.execute(sql`
      update "Channel"
      set
        "isSystem" = true,
        "type" = ${ChannelType.VIDEO},
        "channelGroupId" = null,
        "updatedAt" = now()
      where "id" = ${existingStageId}
    `);

    const duplicateStageIds = existingStageRows.slice(1).map((row) => row.id);
    for (const duplicateId of duplicateStageIds) {
      await db.execute(sql`
        update "Channel"
        set
          "name" = concat('channel-', left(${duplicateId}, 6)),
          "isSystem" = false,
          "updatedAt" = now()
        where "id" = ${duplicateId}
      `);
    }

    return;
  }

  let resolvedProfileId = String(profileId ?? "").trim();

  if (!resolvedProfileId) {
    const serverOwnerResult = await db.execute(sql`
      select "profileId"
      from "Server"
      where "id" = ${normalizedServerId}
      limit 1
    `);

    resolvedProfileId =
      (serverOwnerResult as unknown as { rows: Array<{ profileId: string | null }> }).rows?.[0]?.profileId ??
      "";
  }

  if (!resolvedProfileId) {
    return;
  }

  const now = new Date();

  const maxSortOrderResult = await db.execute(sql`
    select coalesce(max(c."sortOrder"), 0) as "maxSortOrder"
    from "Channel" c
    where c."serverId" = ${normalizedServerId}
  `);

  const nextSortOrder =
    Number(
      (
        maxSortOrderResult as unknown as {
          rows: Array<{ maxSortOrder: number | string | null }>;
        }
      ).rows?.[0]?.maxSortOrder ?? 0
    ) + 1;

  try {
    await db.execute(sql`
      insert into "Channel" (
        "id",
        "name",
        "type",
        "profileId",
        "serverId",
        "channelGroupId",
        "sortOrder",
        "isSystem",
        "createdAt",
        "updatedAt"
      )
      values (
        ${uuidv4()},
        ${"stage"},
        ${ChannelType.VIDEO},
        ${resolvedProfileId},
        ${normalizedServerId},
        ${null},
        ${nextSortOrder},
        ${true},
        ${now},
        ${now}
      )
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/duplicate key|Channel_unique_stage_per_server/i.test(message)) {
      throw error;
    }
  }
};
