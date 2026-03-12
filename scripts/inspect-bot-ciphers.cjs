const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) {
      continue;
    }

    const key = m[1];
    let value = m[2] ?? "";
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key === "LIVE_DATABASE_URL" && value === "${DATABASE_URL}") {
      continue;
    }

    process.env[key] = value;
  }
}

if (!process.env.LIVE_DATABASE_URL || process.env.LIVE_DATABASE_URL === "${DATABASE_URL}") {
  process.env.LIVE_DATABASE_URL = process.env.DATABASE_URL;
}

const normalizeTemplateBotName = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/["'`]+/g, "")
    .replace(/\s+/g, " ");

(async () => {
  const dbUrl = String(process.env.LIVE_DATABASE_URL ?? process.env.DATABASE_URL ?? "").trim();
  if (!dbUrl) {
    throw new Error("No DATABASE_URL/LIVE_DATABASE_URL available.");
  }

  const pool = new Pool({ connectionString: dbUrl, max: 1 });

  try {
    const result = await pool.query(
      'select "userId", "OtherBotsJson", "OtherBotTokenSecretsJson" from "UserPreference"'
    );

    let totalBots = 0;
    let botsWithCipher = 0;
    let templateBots = 0;
    let templateBotsWithCipher = 0;

    for (const row of result.rows ?? []) {
      let bots = [];
      let secrets = {};

      try {
        bots = JSON.parse(row.OtherBotsJson ?? "[]");
      } catch {
        bots = [];
      }

      try {
        secrets = JSON.parse(row.OtherBotTokenSecretsJson ?? "{}") ?? {};
      } catch {
        secrets = {};
      }

      for (const bot of Array.isArray(bots) ? bots : []) {
        const botId = String(bot?.id ?? "").trim();
        if (!botId) {
          continue;
        }

        totalBots += 1;

        const hasCipher = String(secrets?.[botId] ?? "").trim().length > 0;
        if (hasCipher) {
          botsWithCipher += 1;
        }

        if (normalizeTemplateBotName(bot?.name) === "template me bot") {
          templateBots += 1;
          if (hasCipher) {
            templateBotsWithCipher += 1;
          }
        }
      }
    }

    console.log(`totalBots=${totalBots}`);
    console.log(`botsWithCipher=${botsWithCipher}`);
    console.log(`templateBots=${templateBots}`);
    console.log(`templateBotsWithCipher=${templateBotsWithCipher}`);
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
