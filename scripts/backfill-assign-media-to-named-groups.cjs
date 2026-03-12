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

async function main() {
  const pool = new Pool({ connectionString, max: 2 });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const groupsResult = await client.query(`
      select
        g."serverId" as "serverId",
        g."id" as "groupId",
        lower(trim(coalesce(g."name", ''))) as "normalizedName"
      from "ChannelGroup" g
      where lower(trim(coalesce(g."name", ''))) in ('voice channels', 'video channels')
    `);

    const groupByServer = new Map();
    for (const row of groupsResult.rows || []) {
      const serverId = String(row.serverId || "").trim();
      const normalizedName = String(row.normalizedName || "").trim();
      const groupId = String(row.groupId || "").trim();

      if (!serverId || !normalizedName || !groupId) {
        continue;
      }

      const entry = groupByServer.get(serverId) || {};
      if (normalizedName === "voice channels" && !entry.voiceGroupId) {
        entry.voiceGroupId = groupId;
      }
      if (normalizedName === "video channels" && !entry.videoGroupId) {
        entry.videoGroupId = groupId;
      }
      groupByServer.set(serverId, entry);
    }

    if (groupByServer.size === 0) {
      await client.query("ROLLBACK");
      console.log("No 'Voice Channels' or 'Video Channels' groups found. Nothing to backfill.");
      return;
    }

    let voiceAssigned = 0;
    let videoAssigned = 0;

    for (const [serverId, entry] of groupByServer.entries()) {
      if (entry.voiceGroupId) {
        const voiceUpdate = await client.query(
          `
          update "Channel"
          set
            "channelGroupId" = $2,
            "updatedAt" = now()
          where "serverId" = $1
            and "type" = 'AUDIO'
            and "channelGroupId" is null
            and lower(trim(coalesce("name", ''))) <> 'stage'
          `,
          [serverId, entry.voiceGroupId]
        );

        const count = Number(voiceUpdate.rowCount || 0);
        voiceAssigned += count;
        if (count > 0) {
          console.log(`- ${serverId}: assigned ${count} AUDIO channel(s) to Voice Channels`);
        }
      }

      if (entry.videoGroupId) {
        const videoUpdate = await client.query(
          `
          update "Channel"
          set
            "channelGroupId" = $2,
            "updatedAt" = now()
          where "serverId" = $1
            and "type" = 'VIDEO'
            and "channelGroupId" is null
            and lower(trim(coalesce("name", ''))) <> 'stage'
          `,
          [serverId, entry.videoGroupId]
        );

        const count = Number(videoUpdate.rowCount || 0);
        videoAssigned += count;
        if (count > 0) {
          console.log(`- ${serverId}: assigned ${count} VIDEO channel(s) to Video Channels`);
        }
      }
    }

    if (!apply) {
      await client.query("ROLLBACK");
      console.log(`Dry run complete. Would assign ${voiceAssigned} AUDIO and ${videoAssigned} VIDEO channels.`);
      return;
    }

    await client.query("COMMIT");
    console.log(`Applied. Assigned ${voiceAssigned} AUDIO and ${videoAssigned} VIDEO channels.`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Backfill failed; transaction rolled back.");
    console.error(error?.message || error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
