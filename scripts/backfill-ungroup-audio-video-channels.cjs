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

    const affectedResult = await client.query(`
      select
        c."serverId" as "serverId",
        c."type" as "type",
        count(*)::int as "count"
      from "Channel" c
      where c."channelGroupId" is not null
        and c."type" in ('AUDIO', 'VIDEO')
      group by c."serverId", c."type"
      order by c."serverId", c."type"
    `);

    const affectedRows = affectedResult.rows;
    const totalToUngroup = affectedRows.reduce((sum, row) => sum + Number(row.count || 0), 0);

    if (!totalToUngroup) {
      await client.query("ROLLBACK");
      console.log("No grouped AUDIO/VIDEO channels found. Nothing to change.");
      return;
    }

    console.log(
      `${apply ? "Applying" : "Dry run"}: would ungroup ${totalToUngroup} AUDIO/VIDEO channel(s) across ${new Set(affectedRows.map((row) => row.serverId)).size} server(s).`
    );

    for (const row of affectedRows) {
      console.log(`- ${row.serverId}: ${row.type} x${row.count}`);
    }

    if (!apply) {
      await client.query("ROLLBACK");
      console.log("Dry run complete. No rows were modified.");
      return;
    }

    const updateResult = await client.query(`
      update "Channel"
      set
        "channelGroupId" = null,
        "updatedAt" = now()
      where "channelGroupId" is not null
        and "type" in ('AUDIO', 'VIDEO')
    `);

    await client.query("COMMIT");
    console.log(`Applied. Ungrouped ${updateResult.rowCount || 0} AUDIO/VIDEO channel(s).`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Ungroup AUDIO/VIDEO backfill failed; transaction rolled back.");
    console.error(error?.message || error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
