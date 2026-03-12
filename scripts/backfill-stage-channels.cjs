#!/usr/bin/env node

require("dotenv").config();

const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");

const args = new Set(process.argv.slice(2));
const useDatabaseUrl = args.has("--use-database-url");
const apply = args.has("--apply");

const selectedUrl = useDatabaseUrl ? process.env.DATABASE_URL : process.env.LIVE_DATABASE_URL;
const connectionString = (selectedUrl || "").trim();

if (!connectionString || /^replace_/i.test(connectionString)) {
  console.error(
    useDatabaseUrl
      ? "DATABASE_URL is missing or still a placeholder. Aborting."
      : "LIVE_DATABASE_URL is missing or still a placeholder. Aborting."
  );
  process.exit(1);
}

const STAGE_NAME = "stage";
const VIDEO_TYPE = "VIDEO";

const toSortOrderNumber = (value) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

async function main() {
  const pool = new Pool({ connectionString, max: 2 });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const serversResult = await client.query(`
      select s."id" as "serverId", s."profileId" as "profileId"
      from "Server" s
      order by s."createdAt" asc, s."id" asc
    `);

    const servers = serversResult.rows.map((row) => ({
      serverId: String(row.serverId || "").trim(),
      profileId: String(row.profileId || "").trim(),
    })).filter((row) => row.serverId.length > 0 && row.profileId.length > 0);

    if (!servers.length) {
      await client.query("ROLLBACK");
      console.log("No servers found. Nothing to backfill.");
      return;
    }

    let createdCount = 0;
    let normalizedCount = 0;
    let duplicateRenamedCount = 0;

    for (const serverRow of servers) {
      const stageRowsResult = await client.query(
        `
          select c."id", c."type", c."isSystem"
          from "Channel" c
          where c."serverId" = $1
            and lower(trim(coalesce(c."name", ''))) = $2
          order by c."sortOrder" asc nulls last, c."createdAt" asc, c."id" asc
        `,
        [serverRow.serverId, STAGE_NAME]
      );

      const stageRows = stageRowsResult.rows;

      if (stageRows.length === 0) {
        const maxSortOrderResult = await client.query(
          `
            select coalesce(max(c."sortOrder"), 0) as "maxSortOrder"
            from "Channel" c
            where c."serverId" = $1
          `,
          [serverRow.serverId]
        );

        const nextSortOrder = toSortOrderNumber(maxSortOrderResult.rows?.[0]?.maxSortOrder) + 1;

        await client.query(
          `
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
            values ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
          `,
          [uuidv4(), STAGE_NAME, VIDEO_TYPE, serverRow.profileId, serverRow.serverId, null, nextSortOrder, true]
        );

        createdCount += 1;
        continue;
      }

      const primary = stageRows[0];

      if (String(primary.type || "") !== VIDEO_TYPE || primary.isSystem !== true) {
        await client.query(
          `
            update "Channel"
            set
              "type" = $2,
              "isSystem" = true,
              "channelGroupId" = null,
              "updatedAt" = now()
            where "id" = $1
          `,
          [primary.id, VIDEO_TYPE]
        );

        normalizedCount += 1;
      }

      if (stageRows.length > 1) {
        for (const duplicate of stageRows.slice(1)) {
          await client.query(
            `
              update "Channel"
              set
                "name" = concat('channel-', left($2::text, 6)),
                "isSystem" = false,
                "updatedAt" = now()
              where "id" = $1
            `,
            [duplicate.id, duplicate.id]
          );

          duplicateRenamedCount += 1;
        }
      }
    }

    if (!apply) {
      await client.query("ROLLBACK");
      console.log(
        `Dry run complete. Would create ${createdCount} stage channel(s), normalize ${normalizedCount}, and rename ${duplicateRenamedCount} duplicate(s) across ${servers.length} server(s).`
      );
      return;
    }

    await client.query("COMMIT");
    console.log(
      `Applied. Created ${createdCount} stage channel(s), normalized ${normalizedCount}, and renamed ${duplicateRenamedCount} duplicate(s) across ${servers.length} server(s).`
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Stage backfill failed; transaction rolled back.");
    console.error(error?.message || error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
