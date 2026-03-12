#!/usr/bin/env node

require("dotenv").config();

const { Pool } = require("pg");

const args = new Set(process.argv.slice(2));
const useDatabaseUrl = args.has("--use-database-url");
const apply = args.has("--apply");

const selectedUrl = useDatabaseUrl ? process.env.DATABASE_URL : process.env.LIVE_DATABASE_URL;
const connectionString = String(selectedUrl || "").trim();

if (!connectionString || /^replace_/i.test(connectionString)) {
  console.error(
    useDatabaseUrl
      ? "DATABASE_URL is missing or still a placeholder. Aborting."
      : "LIVE_DATABASE_URL is missing or still a placeholder. Aborting."
  );
  process.exit(1);
}

const AUTO_GROUP_NAMES = ["text channels", "audio channels", "video channels"];

async function main() {
  const pool = new Pool({ connectionString, max: 2 });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const candidatesResult = await client.query(
      `
      select
        g."id" as "groupId",
        g."serverId" as "serverId",
        g."name" as "name",
        (
          select count(*)::int
          from "Channel" c
          where c."channelGroupId" = g."id"
        ) as "channelCount"
      from "ChannelGroup" g
      where lower(trim(coalesce(g."name", ''))) = any($1::text[])
      order by g."serverId", g."name", g."id"
      `,
      [AUTO_GROUP_NAMES]
    );

    const candidates = candidatesResult.rows || [];
    const emptyCandidates = candidates.filter((row) => Number(row.channelCount || 0) === 0);

    if (candidates.length === 0) {
      await client.query("ROLLBACK");
      console.log("No auto-labeled channel groups found.");
      return;
    }

    console.log(
      `${apply ? "Applying" : "Dry run"}: found ${candidates.length} auto-labeled group(s), ${emptyCandidates.length} are empty and safe to revert.`
    );

    for (const row of candidates) {
      console.log(
        `- ${row.serverId}: ${row.name} (${row.groupId}) [channels=${row.channelCount}]${Number(row.channelCount || 0) === 0 ? " [REVERT]" : " [SKIP:not-empty]"}`
      );
    }

    if (!apply) {
      await client.query("ROLLBACK");
      console.log("Dry run complete. No rows were modified.");
      return;
    }

    if (emptyCandidates.length === 0) {
      await client.query("ROLLBACK");
      console.log("No empty auto-labeled groups to revert. No changes applied.");
      return;
    }

    const deleteIds = emptyCandidates.map((row) => String(row.groupId));

    const deleteResult = await client.query(
      `delete from "ChannelGroup" where "id" = any($1::varchar[])`,
      [deleteIds]
    );

    await client.query("COMMIT");
    console.log(`Applied. Removed ${deleteResult.rowCount || 0} empty auto-labeled channel group(s).`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Revert failed; transaction rolled back.");
    console.error(error?.message || error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
