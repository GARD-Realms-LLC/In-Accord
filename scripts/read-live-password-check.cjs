const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { promisify } = require("util");
const { Client } = require("pg");

const scrypt = promisify(crypto.scrypt);

function readEnvMap() {
  const envPath = path.join(process.cwd(), ".env");
  const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const map = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) map[m[1]] = m[2];
  }
  return map;
}

async function verifyScrypt(password, storedHash) {
  const [salt, stored] = String(storedHash || "").split(":");
  if (!salt || !stored) return false;

  const derived = await scrypt(password, salt, 64);
  const storedBuffer = Buffer.from(stored, "hex");

  if (storedBuffer.length !== derived.length) return false;
  return crypto.timingSafeEqual(storedBuffer, derived);
}

(async () => {
  const email = String(process.argv[2] || "").trim().toLowerCase();
  const password = String(process.argv[3] || "");

  if (!email || !password) {
    throw new Error("Usage: node scripts/read-live-password-check.cjs <email> <password>");
  }

  const env = readEnvMap();
  const live = (process.env.LIVE_DATABASE_URL || env.LIVE_DATABASE_URL || "").trim();
  const database = (process.env.DATABASE_URL || env.DATABASE_URL || "").trim();
  const connectionString = live && !/^replace_/i.test(live) ? live : database;

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const result = await client.query(
      `
      select
        u."userId",
        lower(coalesce(u."email", '')) as email,
        lc."passwordHash" as "localCredentialHash",
        u."password_hash" as "usersPasswordHash"
      from "Users" u
      left join "LocalCredential" lc on lc."userId" = u."userId"
      where lower(coalesce(u."email", '')) = $1
      order by u."userId" asc
      `,
      [email]
    );

    console.log(`candidates=${result.rowCount}`);

    for (const row of result.rows) {
      const localHash = row.localCredentialHash || "";
      const usersHash = row.usersPasswordHash || "";

      const localMatch = localHash ? await verifyScrypt(password, localHash) : false;
      const usersMatch = usersHash ? await verifyScrypt(password, usersHash) : false;

      console.log(
        JSON.stringify({
          userId: row.userId,
          hasLocalCredentialHash: !!localHash,
          hasUsersPasswordHash: !!usersHash,
          localHashPrefix: localHash ? localHash.slice(0, 8) : null,
          usersHashPrefix: usersHash ? usersHash.slice(0, 8) : null,
          localHashLooksScrypt: localHash.includes(":"),
          usersHashLooksScrypt: usersHash.includes(":"),
          localMatch,
          usersMatch,
        })
      );
    }
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error("Failed live password check:", error.message);
  process.exit(1);
});
