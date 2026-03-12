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

const VOICE_TARGET = "Voice Channels";
const VIDEO_TARGET = "Video Channels";

const VOICE_SOURCE_NAMES = [
  "audio channels",
  "voice channels",
  "audio channel",
  "voice channel",
];

const VIDEO_SOURCE_NAMES = [
  "video channels",
  "video channel",
];

async function main() {
  const pool = new Pool({ connectionString, max: 2 });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const candidatesResult = await client.query(
      `
      select
        g."id" as "id",
        g."serverId" as "serverId",
        g."name" as "name",
        lower(trim(coalesce(g."name", ''))) as "normalizedName"
      from "ChannelGroup" g
      where lower(trim(coalesce(g."name", ''))) = any($1::text[])
         or lower(trim(coalesce(g."name", ''))) = any($2::text[])
      order by g."serverId", g."name", g."id"
      `,
      [VOICE_SOURCE_NAMES, VIDEO_SOURCE_NAMES]
    );

    const candidates = candidatesResult.rows || [];

    if (candidates.length === 0) {
      await client.query("ROLLBACK");
      console.log("No media channel groups found to convert.");
      return;
    }

    let renameCount = 0;

    for (const row of candidates) {
      const normalizedName = String(row.normalizedName || "").trim();
      const nextName = VOICE_SOURCE_NAMES.includes(normalizedName)
        ? VOICE_TARGET
        : VIDEO_SOURCE_NAMES.includes(normalizedName)
          ? VIDEO_TARGET
          : null;

      if (!nextName || row.name === nextName) {
        continue;
      }

      await client.query(
        `
        update "ChannelGroup"
        set
          "name" = $2,
          "updatedAt" = now()
        where "id" = $1
        `,
        [row.id, nextName]
      );

      renameCount += 1;
      console.log(`- ${row.serverId}: ${row.name} -> ${nextName} (${row.id})`);
    }

    if (!apply) {
      await client.query("ROLLBACK");
      console.log(`Dry run complete. Would rename ${renameCount} media group(s).`);
      return;
    }

    await client.query("COMMIT");
    console.log(`Applied. Renamed ${renameCount} media group(s).`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Conversion failed; transaction rolled back.");
    console.error(error?.message || error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
