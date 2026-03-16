const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { Pool } = require("pg");
const { Client, GatewayIntentBits } = require(path.join(__dirname, "..", "In-Accord.js"));

const normalizeTemplateBotName = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/["'`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

const loadDotEnv = () => {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    let value = match[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
      process.env[key] = value;
    }
  }
};

const parseJsonSafe = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const decryptToken = (cipherText) => {
  const configured = String(process.env.BOT_TOKEN_ENCRYPTION_KEY ?? process.env.SESSION_SECRET ?? "").trim();
  if (!configured) {
    throw new Error("Missing BOT_TOKEN_ENCRYPTION_KEY or SESSION_SECRET.");
  }

  const [ivRaw, tagRaw, encryptedRaw] = String(cipherText ?? "").split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted token payload.");
  }

  const key = crypto.createHash("sha256").update(configured).digest();
  const iv = Buffer.from(ivRaw, "base64");
  const tag = Buffer.from(tagRaw, "base64");
  const encrypted = Buffer.from(encryptedRaw, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8").trim();
};

const pickTemplateBotWithToken = (rows) => {
  const diagnostics = {
    templateBotRows: 0,
    templateBotsEnabled: 0,
    templateBotsWithCipher: 0,
    decryptFailures: 0,
  };

  for (const row of rows) {
    const userId = String(row.userId ?? "").trim();
    if (!userId) {
      continue;
    }

    const bots = parseJsonSafe(row.OtherBotsJson ?? "[]");
    const tokenMap = parseJsonSafe(row.OtherBotTokenSecretsJson ?? "{}");

    if (!Array.isArray(bots) || !tokenMap || typeof tokenMap !== "object") {
      continue;
    }

    for (const bot of bots) {
      if (!bot || typeof bot !== "object") {
        continue;
      }

      const botId = String(bot.id ?? "").trim();
      const botName = String(bot.name ?? "").trim();
      const enabled = bot.enabled !== false;
      if (!botId || normalizeTemplateBotName(botName) !== "template me bot") {
        continue;
      }

      diagnostics.templateBotRows += 1;

      if (!enabled) {
        continue;
      }

      diagnostics.templateBotsEnabled += 1;

      const cipher = String(tokenMap[botId] ?? "").trim();
      if (!cipher) {
        continue;
      }

      diagnostics.templateBotsWithCipher += 1;

      let token = "";
      try {
        token = decryptToken(cipher);
      } catch {
        diagnostics.decryptFailures += 1;
        continue;
      }

      if (!token) {
        continue;
      }

      return {
        target: {
          userId,
          botId,
          botName,
          token,
        },
        diagnostics,
      };
    }
  }

  return {
    target: null,
    diagnostics,
  };
};

const requestHealth = () =>
  new Promise((resolve, reject) => {
    const req = http.get("http://127.0.0.1:3030/health", (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });

    req.on("error", reject);
    req.setTimeout(8000, () => {
      req.destroy(new Error("Health request timed out"));
    });
  });

const main = async () => {
  loadDotEnv();

  const dbUrl = String(process.env.LIVE_DATABASE_URL ?? process.env.DATABASE_URL ?? "").trim();
  if (!dbUrl) {
    throw new Error("Missing LIVE_DATABASE_URL or DATABASE_URL.");
  }

  const pool = new Pool({ connectionString: dbUrl, max: 2 });
  let client;
  let controlServer;

  try {
    const result = await pool.query(
      'select "userId", "OtherBotsJson", "OtherBotTokenSecretsJson" from "UserPreference"'
    );

    const picked = pickTemplateBotWithToken(result.rows ?? []);
    const target = picked.target;
    if (!target) {
      throw new Error(
        `No enabled \"Template Me Bot\" with decryptable token found in UserPreference. ` +
          `template=${picked.diagnostics.templateBotRows}, enabled=${picked.diagnostics.templateBotsEnabled}, ` +
          `withCipher=${picked.diagnostics.templateBotsWithCipher}, decryptFailures=${picked.diagnostics.decryptFailures}`
      );
    }

    client = new Client({ intents: [GatewayIntentBits.Guilds] });

    const readyPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Upstream ready timeout (30s)")), 30000);
      client.once("ready", () => {
        clearTimeout(timeout);
        resolve(true);
      });
      client.once("error", (error) => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });

    await client.login(target.token);
    await readyPromise;

    controlServer = http.createServer((req, res) => {
      if (String(req.url ?? "").toLowerCase() !== "/health") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }

      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: "running",
          botId: target.botId,
          botName: target.botName,
          botTag: client.user?.tag ?? null,
          guildCount: Number(client.guilds?.cache?.size ?? 0),
          updatedAt: new Date().toISOString(),
        })
      );
    });

    await new Promise((resolve, reject) => {
      controlServer.once("error", reject);
      controlServer.listen(3030, "127.0.0.1", () => resolve(true));
    });

    const health = await requestHealth();
    console.log("BOT_START=ok");
    console.log(`CONTROL_PORT=3030`);
    console.log(`HEALTH_STATUS=${health.statusCode}`);
    console.log(`HEALTH_BODY=${health.body}`);
  } finally {
    if (controlServer) {
      await new Promise((resolve) => controlServer.close(() => resolve(true)));
    }

    if (client) {
      try {
        client.destroy();
      } catch {
        // no-op
      }
    }

    await pool.end();
  }
};

main().catch((error) => {
  console.error("BOT_START=failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
