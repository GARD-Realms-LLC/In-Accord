#!/usr/bin/env node

require("dotenv").config();

const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");

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

const normalize = (value) => String(value || "").trim().toLowerCase();

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

    const groupsResult = await client.query(`
      select g."id", g."serverId", g."name", g."sortOrder"
      from "ChannelGroup" g
      order by g."serverId", g."sortOrder" asc, g."createdAt" asc
    `);

    const channelsResult = await client.query(`
      select c."id", c."serverId", c."name", c."type", c."channelGroupId"
      from "Channel" c
      order by c."serverId", c."sortOrder" asc, c."createdAt" asc
    `);

    const groupsByServer = new Map();
    for (const row of groupsResult.rows || []) {
      const serverId = String(row.serverId || "").trim();
      if (!serverId) continue;
      const arr = groupsByServer.get(serverId) || [];
      arr.push({
        id: String(row.id || "").trim(),
        name: String(row.name || "").trim(),
        normalizedName: normalize(row.name),
        sortOrder: Number(row.sortOrder || 0),
      });
      groupsByServer.set(serverId, arr);
    }

    const channelsByServer = new Map();
    for (const row of channelsResult.rows || []) {
      const serverId = String(row.serverId || "").trim();
      if (!serverId) continue;
      const arr = channelsByServer.get(serverId) || [];
      arr.push({
        id: String(row.id || "").trim(),
        name: String(row.name || "").trim(),
        normalizedName: normalize(row.name),
        type: String(row.type || "").trim().toUpperCase(),
        channelGroupId: row.channelGroupId ? String(row.channelGroupId).trim() : null,
      });
      channelsByServer.set(serverId, arr);
    }

    let createdGroups = 0;
    let assignedAudio = 0;
    let assignedVideo = 0;

    for (const serverRow of serversResult.rows || []) {
      const serverId = String(serverRow.serverId || "").trim();
      const profileId = String(serverRow.profileId || "").trim();
      if (!serverId || !profileId) continue;

      const serverGroups = groupsByServer.get(serverId) || [];
      const serverChannels = channelsByServer.get(serverId) || [];

      let voiceGroup = serverGroups.find((g) => g.normalizedName === "voice channels" || g.normalizedName === "audio channels") || null;
      let videoGroup = serverGroups.find((g) => g.normalizedName === "video channels") || null;

      const needsVoice = serverChannels.some((c) => c.type === "AUDIO" && !c.channelGroupId && c.normalizedName !== "stage");
      const needsVideo = serverChannels.some((c) => c.type === "VIDEO" && !c.channelGroupId && c.normalizedName !== "stage");

      const maxSort = serverGroups.reduce((max, g) => Math.max(max, Number(g.sortOrder || 0)), 0);
      let nextSort = maxSort + 1;

      if (needsVoice && !voiceGroup) {
        const id = uuidv4();
        await client.query(
          `
          insert into "ChannelGroup" (
            "id", "name", "icon", "serverId", "profileId", "sortOrder", "createdAt", "updatedAt"
          ) values ($1, $2, $3, $4, $5, $6, now(), now())
          `,
          [id, "Voice Channels", null, serverId, profileId, nextSort]
        );

        voiceGroup = { id, name: "Voice Channels", normalizedName: "voice channels", sortOrder: nextSort };
        nextSort += 1;
        createdGroups += 1;
        console.log(`- ${serverId}: created group Voice Channels (${id})`);
      } else if (voiceGroup && voiceGroup.name !== "Voice Channels") {
        await client.query(
          `update "ChannelGroup" set "name" = 'Voice Channels', "updatedAt" = now() where "id" = $1`,
          [voiceGroup.id]
        );
      }

      if (needsVideo && !videoGroup) {
        const id = uuidv4();
        await client.query(
          `
          insert into "ChannelGroup" (
            "id", "name", "icon", "serverId", "profileId", "sortOrder", "createdAt", "updatedAt"
          ) values ($1, $2, $3, $4, $5, $6, now(), now())
          `,
          [id, "Video Channels", null, serverId, profileId, nextSort]
        );

        videoGroup = { id, name: "Video Channels", normalizedName: "video channels", sortOrder: nextSort };
        nextSort += 1;
        createdGroups += 1;
        console.log(`- ${serverId}: created group Video Channels (${id})`);
      }

      if (voiceGroup) {
        const res = await client.query(
          `
          update "Channel"
          set "channelGroupId" = $2, "updatedAt" = now()
          where "serverId" = $1
            and "type" = 'AUDIO'
            and "channelGroupId" is null
            and lower(trim(coalesce("name", ''))) <> 'stage'
          `,
          [serverId, voiceGroup.id]
        );
        const n = Number(res.rowCount || 0);
        assignedAudio += n;
        if (n > 0) {
          console.log(`- ${serverId}: moved ${n} AUDIO channel(s) into Voice Channels`);
        }
      }

      if (videoGroup) {
        const res = await client.query(
          `
          update "Channel"
          set "channelGroupId" = $2, "updatedAt" = now()
          where "serverId" = $1
            and "type" = 'VIDEO'
            and "channelGroupId" is null
            and lower(trim(coalesce("name", ''))) <> 'stage'
          `,
          [serverId, videoGroup.id]
        );
        const n = Number(res.rowCount || 0);
        assignedVideo += n;
        if (n > 0) {
          console.log(`- ${serverId}: moved ${n} VIDEO channel(s) into Video Channels`);
        }
      }
    }

    if (!apply) {
      await client.query("ROLLBACK");
      console.log(`Dry run complete. Would create ${createdGroups} group(s), move ${assignedAudio} AUDIO and ${assignedVideo} VIDEO channels.`);
      return;
    }

    await client.query("COMMIT");
    console.log(`Applied. Created ${createdGroups} group(s), moved ${assignedAudio} AUDIO and ${assignedVideo} VIDEO channels.`);
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
