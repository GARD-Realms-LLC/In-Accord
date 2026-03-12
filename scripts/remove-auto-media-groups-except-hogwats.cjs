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

const AUTO_MEDIA_GROUP_NAMES = [
  "voice channels",
  "video channels",
  "voice channel",
  "video channel",
  "audio channels",
  "audio channel",
];

const EXCLUDED_SERVER_NAMES = ["hogwats", "hogwarts"];

async function main() {
  const pool = new Pool({ connectionString, max: 2 });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const excludedServersResult = await client.query(
      `
      select s."id", s."name"
      from "Server" s
      where lower(trim(coalesce(s."name", ''))) = any($1::text[])
      `,
      [EXCLUDED_SERVER_NAMES]
    );

    const excludedServerIds = excludedServersResult.rows.map((row) => String(row.id || "").trim()).filter(Boolean);

    const groupsResult = await client.query(
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
        and (
          cardinality($2::varchar[]) = 0
          or g."serverId" <> all($2::varchar[])
        )
      order by g."serverId", g."name", g."id"
      `,
      [AUTO_MEDIA_GROUP_NAMES, excludedServerIds]
    );

    const groups = groupsResult.rows || [];

    if (groups.length === 0) {
      await client.query("ROLLBACK");
      console.log("No auto-created media label groups found outside excluded servers.");
      if (excludedServersResult.rows.length > 0) {
        console.log(`Excluded servers: ${excludedServersResult.rows.map((row) => `${row.name} (${row.id})`).join(", ")}`);
      }
      return;
    }

    const groupIds = groups.map((row) => String(row.groupId || "").trim()).filter(Boolean);
    const totalAttachedBefore = groups.reduce((sum, row) => sum + Number(row.channelCount || 0), 0);

    console.log(`${apply ? "Applying" : "Dry run"}: found ${groups.length} auto media group(s) across ${new Set(groups.map((row) => row.serverId)).size} server(s).`);
    console.log(`Channels currently attached to those groups: ${totalAttachedBefore}`);

    if (excludedServersResult.rows.length > 0) {
      console.log(`Excluded servers: ${excludedServersResult.rows.map((row) => `${row.name} (${row.id})`).join(", ")}`);
    } else {
      console.log("Excluded servers: none matched [hogwats, hogwarts]");
    }

    for (const row of groups) {
      console.log(`- ${row.serverId}: ${row.name} (${row.groupId}) [channels=${row.channelCount}]`);
    }

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
      `
      delete from "ChannelGroup"
      where "id" = any($1::varchar[])
      `,
      [groupIds]
    );

    if (!apply) {
      await client.query("ROLLBACK");
      console.log(`Dry run complete. Would ungroup ${ungroupResult.rowCount || 0} channel(s) and delete ${deleteResult.rowCount || 0} group(s).`);
      return;
    }

    await client.query("COMMIT");
    console.log(`Applied. Ungrouped ${ungroupResult.rowCount || 0} channel(s) and deleted ${deleteResult.rowCount || 0} group(s).`);
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
