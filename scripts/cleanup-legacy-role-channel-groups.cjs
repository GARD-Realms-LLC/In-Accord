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

    const candidatesSql = `
      select
        cg."id" as "groupId",
        cg."serverId" as "serverId",
        cg."name" as "name",
        cg."icon" as "icon",
        count(c."id")::int as "channelCount"
      from "ChannelGroup" cg
      left join "Channel" c
        on c."channelGroupId" = cg."id"
       and c."serverId" = cg."serverId"
      where cg."icon" = '🛡️'
        and exists (
          select 1
          from "ServerRole" sr
          where sr."serverId" = cg."serverId"
            and lower(trim(coalesce(sr."name", ''))) = lower(trim(coalesce(cg."name", '')))
        )
      group by cg."id", cg."serverId", cg."name", cg."icon"
      having count(c."id") = 0
      order by cg."serverId", lower(cg."name")
    `;

    const candidates = (await client.query(candidatesSql)).rows;

    if (!candidates.length) {
      await client.query("ROLLBACK");
      console.log("No legacy role-channel-group artifacts found.");
      return;
    }

    const byServer = new Map();
    for (const row of candidates) {
      const list = byServer.get(row.serverId) ?? [];
      list.push(row);
      byServer.set(row.serverId, list);
    }

    console.log(`${apply ? "Applying" : "Dry run"}: found ${candidates.length} legacy group(s) across ${byServer.size} server(s).`);
    for (const [serverId, rows] of byServer.entries()) {
      console.log(`- ${serverId}: ${rows.length} group(s)`);
      for (const row of rows) {
        console.log(`  • ${row.name} (${row.groupId})`);
      }
    }

    if (!apply) {
      await client.query("ROLLBACK");
      console.log("Dry run complete. No rows were deleted.");
      return;
    }

    const ids = candidates.map((row) => row.groupId);
    const deleteResult = await client.query(
      `delete from "ChannelGroup" where "id" = any($1::varchar[])`,
      [ids]
    );

    await client.query("COMMIT");
    console.log(`Deleted ${deleteResult.rowCount || 0} legacy group(s).`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Cleanup failed; transaction rolled back.");
    console.error(error?.message || error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
