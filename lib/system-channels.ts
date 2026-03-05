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
    where lower(trim(coalesce("name", ''))) in ('general', 'rules')
  `);

  // Keep only one exact "general" and one exact "rules" name per server by
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
      where lower(trim(coalesce(c."name", ''))) in ('general', 'rules')
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
    order by "createdAt" asc, "id" asc
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

  try {
    await db.execute(sql`
      insert into "Channel" (
        "id",
        "name",
        "type",
        "profileId",
        "serverId",
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
