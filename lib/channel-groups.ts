import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

type MediaChannelType = "AUDIO" | "VIDEO";

const MEDIA_GROUP_CONFIG: Record<
  MediaChannelType,
  { targetName: string; aliases: string[] }
> = {
  AUDIO: {
    targetName: "Voice Channels",
    aliases: ["voice channels", "audio channels", "voice channel", "audio channel"],
  },
  VIDEO: {
    targetName: "Video Channels",
    aliases: ["video channels", "video channel"],
  },
};

export const ensureChannelGroupSchema = async () => {
  await db.execute(sql`select pg_advisory_lock(hashtext('ensure_channel_group_schema_v1'))`);

  try {
    await db.execute(sql`
      create table if not exists "ChannelGroup" (
        "id" varchar(191) primary key,
        "name" varchar(191) not null,
        "serverId" varchar(191) not null,
        "profileId" varchar(191) not null,
        "sortOrder" integer not null default 0,
        "createdAt" timestamp not null,
        "updatedAt" timestamp not null
      )
    `);

    await db.execute(sql`
      alter table "ChannelGroup"
      add column if not exists "sortOrder" integer not null default 0
    `);

    await db.execute(sql`
      alter table "ChannelGroup"
      add column if not exists "icon" varchar(32)
    `);

    await db.execute(sql`
      with ranked as (
        select
          g."id",
          row_number() over (
            partition by g."serverId"
            order by g."sortOrder" asc, g."createdAt" asc, g."id" asc
          ) as rn
        from "ChannelGroup" g
      )
      update "ChannelGroup" g
      set "sortOrder" = r.rn
      from ranked r
      where g."id" = r."id"
    `);

    await db.execute(sql`
      create index if not exists "ChannelGroup_serverId_idx"
      on "ChannelGroup" ("serverId")
    `);

    await db.execute(sql`
      create index if not exists "ChannelGroup_serverId_sortOrder_idx"
      on "ChannelGroup" ("serverId", "sortOrder")
    `);

    await db.execute(sql`
      alter table "Channel"
      add column if not exists "channelGroupId" varchar(191)
    `);

    await db.execute(sql`
      alter table "Channel"
      add column if not exists "icon" varchar(32)
    `);

    await db.execute(sql`
      alter table "Channel"
      add column if not exists "sortOrder" integer not null default 0
    `);

    await db.execute(sql`
      with ranked as (
        select
          c."id",
          row_number() over (
            partition by c."serverId", coalesce(c."channelGroupId", '')
            order by c."sortOrder" asc, c."createdAt" asc, c."id" asc
          ) as rn
        from "Channel" c
      )
      update "Channel" c
      set "sortOrder" = r.rn
      from ranked r
      where c."id" = r."id"
    `);

    await db.execute(sql`
      create index if not exists "Channel_channelGroupId_idx"
      on "Channel" ("channelGroupId")
    `);

    await db.execute(sql`
      create index if not exists "Channel_serverId_group_sortOrder_idx"
      on "Channel" ("serverId", "channelGroupId", "sortOrder")
    `);

  // Dedupe channel names per server (case-insensitive, trimmed), keeping oldest.
    await db.execute(sql`
      with ranked as (
        select
          c."id",
          row_number() over (
            partition by c."serverId", lower(trim(coalesce(c."name", '')))
            order by c."createdAt" asc, c."id" asc
          ) as rn
        from "Channel" c
      )
      update "Channel" c
      set
        "name" = concat(
          coalesce(nullif(trim(c."name"), ''), 'channel'),
          '-',
          left(c."id", 6)
        ),
        "updatedAt" = now()
      from ranked r
      where c."id" = r."id"
        and r.rn > 1
    `);

  // Dedupe channel-group names per server (case-insensitive, trimmed), keeping oldest.
    await db.execute(sql`
      with ranked as (
        select
          g."id",
          row_number() over (
            partition by g."serverId", lower(trim(coalesce(g."name", '')))
            order by g."createdAt" asc, g."id" asc
          ) as rn
        from "ChannelGroup" g
      )
      update "ChannelGroup" g
      set
        "name" = concat(
          coalesce(nullif(trim(g."name"), ''), 'group'),
          '-',
          left(g."id", 6)
        ),
        "updatedAt" = now()
      from ranked r
      where g."id" = r."id"
        and r.rn > 1
    `);

    await db.execute(sql`
      create unique index if not exists "Channel_unique_name_per_server"
      on "Channel" (
        "serverId",
        lower(trim(coalesce("name", '')))
      )
    `);

    await db.execute(sql`
      create unique index if not exists "ChannelGroup_unique_name_per_server"
      on "ChannelGroup" (
        "serverId",
        lower(trim(coalesce("name", '')))
      )
    `);
  } finally {
    await db.execute(sql`select pg_advisory_unlock(hashtext('ensure_channel_group_schema_v1'))`);
  }
};

type EnsureMediaChannelsGroupedForServerArgs = {
  serverId: string;
  profileId: string;
  requiredTypes?: MediaChannelType[];
};

export const ensureMediaChannelsGroupedForServer = async ({
  serverId,
  profileId,
  requiredTypes = ["AUDIO", "VIDEO"],
}: EnsureMediaChannelsGroupedForServerArgs) => {
  const normalizedServerId = String(serverId ?? "").trim();
  const normalizedProfileId = String(profileId ?? "").trim();
  const normalizedTypes = Array.from(
    new Set(
      requiredTypes.filter(
        (type): type is MediaChannelType => type === "AUDIO" || type === "VIDEO",
      ),
    ),
  );

  const result: Record<MediaChannelType, string | null> = {
    AUDIO: null,
    VIDEO: null,
  };

  if (!normalizedServerId || !normalizedProfileId || normalizedTypes.length === 0) {
    return {
      audioGroupId: result.AUDIO,
      videoGroupId: result.VIDEO,
    };
  }

  await ensureChannelGroupSchema();

  await db.transaction(async (tx) => {
    for (const mediaType of normalizedTypes) {
      const config = MEDIA_GROUP_CONFIG[mediaType];
      const groupLookupResult = await tx.execute(sql`
        select
          g."id" as "id",
          g."name" as "name",
          lower(trim(coalesce(g."name", ''))) as "normalizedName"
        from "ChannelGroup" g
        where g."serverId" = ${normalizedServerId}
          and lower(trim(coalesce(g."name", ''))) in (${sql.join(
            config.aliases.map((alias) => sql`${alias}`),
            sql`, `,
          )})
        order by
          case
            when lower(trim(coalesce(g."name", ''))) = lower(trim(${config.targetName})) then 0
            else 1
          end,
          g."sortOrder" asc,
          g."createdAt" asc
        limit 5
      `);

      const existingGroups = ((groupLookupResult as unknown as {
        rows?: Array<{ id: string; name: string; normalizedName: string }>;
      }).rows ?? []);

      let selectedGroupId = existingGroups[0]?.id ?? null;

      if (selectedGroupId) {
        await tx.execute(sql`
          update "ChannelGroup" g
          set
            "name" = ${config.targetName},
            "updatedAt" = now()
          where g."id" = ${selectedGroupId}
            and lower(trim(coalesce(g."name", ''))) <> lower(trim(${config.targetName}))
            and not exists (
              select 1
              from "ChannelGroup" conflict
              where conflict."serverId" = ${normalizedServerId}
                and conflict."id" <> g."id"
                and lower(trim(coalesce(conflict."name", ''))) = lower(trim(${config.targetName}))
            )
        `);
      }

      const exactGroupAfterRenameResult = await tx.execute(sql`
        select g."id" as "id"
        from "ChannelGroup" g
        where g."serverId" = ${normalizedServerId}
          and lower(trim(coalesce(g."name", ''))) = lower(trim(${config.targetName}))
        order by g."sortOrder" asc, g."createdAt" asc
        limit 1
      `);

      selectedGroupId =
        (exactGroupAfterRenameResult as unknown as { rows?: Array<{ id: string }> }).rows?.[0]?.id ??
        selectedGroupId;

      if (!selectedGroupId) {
        const maxSortOrderResult = await tx.execute(sql`
          select coalesce(max(g."sortOrder"), 0) as "maxSortOrder"
          from "ChannelGroup" g
          where g."serverId" = ${normalizedServerId}
        `);

        const nextSortOrder =
          Number(
            (
              maxSortOrderResult as unknown as {
                rows?: Array<{ maxSortOrder: number | string | null }>;
              }
            ).rows?.[0]?.maxSortOrder ?? 0,
          ) + 1;

        const candidateId = randomUUID();

        await tx.execute(sql`
          insert into "ChannelGroup" (
            "id",
            "name",
            "icon",
            "serverId",
            "profileId",
            "sortOrder",
            "createdAt",
            "updatedAt"
          )
          values (
            ${candidateId},
            ${config.targetName},
            ${null},
            ${normalizedServerId},
            ${normalizedProfileId},
            ${nextSortOrder},
            now(),
            now()
          )
          on conflict do nothing
        `);

        const ensuredGroupResult = await tx.execute(sql`
          select g."id" as "id"
          from "ChannelGroup" g
          where g."serverId" = ${normalizedServerId}
            and lower(trim(coalesce(g."name", ''))) = lower(trim(${config.targetName}))
          order by g."sortOrder" asc, g."createdAt" asc
          limit 1
        `);

        selectedGroupId =
          (ensuredGroupResult as unknown as { rows?: Array<{ id: string }> }).rows?.[0]?.id ?? null;
      }

      result[mediaType] = selectedGroupId;

      if (!selectedGroupId) {
        continue;
      }

      await tx.execute(sql`
        update "Channel" c
        set
          "channelGroupId" = ${selectedGroupId},
          "updatedAt" = now()
        where c."serverId" = ${normalizedServerId}
          and c."type" = ${mediaType}
          and c."channelGroupId" is null
          and lower(trim(coalesce(c."name", ''))) <> 'stage'
      `);
    }
  });

  return {
    audioGroupId: result.AUDIO,
    videoGroupId: result.VIDEO,
  };
};

