#!/usr/bin/env node

require("dotenv").config();

const { Pool } = require("pg");

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

async function main() {
  const pool = new Pool({ connectionString, max: 2 });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const groupsResult = await client.query(`
      select
        g."id" as "groupId",
        g."serverId" as "serverId",
        g."name" as "name",
        (
          select count(*)::int
          from "Channel" c
          where c."channelGroupId" = g."id"
        ) as "attachedChannels"
      from "ChannelGroup" g
      where lower(trim(coalesce(g."name", ''))) like 'stage%'
      order by g."serverId", g."name", g."id"
    `);

    const stageGroups = groupsResult.rows;

    if (!stageGroups.length) {
      await client.query("ROLLBACK");
      console.log("No stage channel groups found.");
      return;
    }

    const totalAttached = stageGroups.reduce(
      (sum, row) => sum + Number(row.attachedChannels || 0),
      0
    );

    console.log(
      `${apply ? "Applying" : "Dry run"}: found ${stageGroups.length} stage group(s) across ${new Set(stageGroups.map((r) => r.serverId)).size} server(s).`
    );
    console.log(`Channels currently attached to those groups: ${totalAttached}`);

    for (const row of stageGroups) {
      console.log(`- ${row.serverId}: ${row.name} (${row.groupId}) [channels=${row.attachedChannels}]`);
    }

    if (!apply) {
      await client.query("ROLLBACK");
      console.log("Dry run complete. No changes applied.");
      return;
    }

    const groupIds = stageGroups.map((row) => row.groupId);

    const ungroupResult = await client.query(
      `
        update "Channel"
        set
          "channelGroupId" = null,
          "updatedAt" = now()
        where "channelGroupId" = any($1::varchar[])
      `,
      [groupIds]
    );

    const deleteResult = await client.query(
      `delete from "ChannelGroup" where "id" = any($1::varchar[])`,
      [groupIds]
    );

    await client.query("COMMIT");

    console.log(
      `Applied. Ungrouped ${ungroupResult.rowCount || 0} channel(s) and deleted ${deleteResult.rowCount || 0} stage group(s).`
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Stage group removal failed; transaction rolled back.");
    console.error(error?.message || error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
