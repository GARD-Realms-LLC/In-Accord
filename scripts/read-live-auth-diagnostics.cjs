const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

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

(async () => {
  const env = readEnvMap();
  const live = (process.env.LIVE_DATABASE_URL || env.LIVE_DATABASE_URL || "").trim();
  const database = (process.env.DATABASE_URL || env.DATABASE_URL || "").trim();
  const connectionString = live && !/^replace_/i.test(live) ? live : database;

  if (!connectionString) {
    throw new Error("No DB URL configured");
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const users = await client.query('select count(*)::int as users from "Users"');
    const creds = await client.query('select count(*)::int as creds from "LocalCredential"');
    const usersWithPasswordHash = await client.query(
      'select count(*)::int as users_with_password_hash from "Users" where coalesce("password_hash",\'\') <> \'\''
    );

    const targetUsers = await client.query(
      'select "userId", lower(coalesce("email",\'\')) as email, (coalesce("password_hash",\'\') <> \'\') as has_password_hash from "Users" where lower(coalesce("email",\'\')) in (\'docrst@gmail.com\',\'test@example.com\') order by email'
    );

    const targetCreds = await client.query(
      'select "userId" from "LocalCredential" where "userId" in (select "userId" from "Users" where lower(coalesce("email",\'\')) in (\'docrst@gmail.com\',\'test@example.com\')) order by "userId"'
    );

    console.log("users=" + users.rows[0].users);
    console.log("localcredential_rows=" + creds.rows[0].creds);
    console.log("users_with_password_hash=" + usersWithPasswordHash.rows[0].users_with_password_hash);
    console.log("target_users=" + JSON.stringify(targetUsers.rows));
    console.log("target_localcredential=" + JSON.stringify(targetCreds.rows));
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error("Failed live auth diagnostics:", error);
  process.exit(1);
});
