#!/usr/bin/env node

require("dotenv").config();
const { Pool } = require("pg");

const args = new Set(process.argv.slice(2));
const useDatabaseUrl = args.has("--use-database-url") || !args.has("--use-live-database-url");
const limitArg = [...args].find((arg) => arg.startsWith("--limit="));
const limit = Math.max(1, Math.min(500, Number((limitArg || "").split("=")[1] || 120)));

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

async function main() {
  const pool = new Pool({ connectionString, max: 2 });
  const client = await pool.connect();

  try {
    const result = await client.query(
      `
      select
        g."id",
        g."serverId",
        g."name",
        g."createdAt",
        g."updatedAt",
        (
          select count(*)::int
          from "Channel" c
          where c."channelGroupId" = g."id"
        ) as "channelCount"
      from "ChannelGroup" g
      order by g."updatedAt" desc nulls last, g."createdAt" desc nulls last
      limit $1
      `,
      [limit]
    );

    console.log(JSON.stringify(result.rows, null, 2));
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
