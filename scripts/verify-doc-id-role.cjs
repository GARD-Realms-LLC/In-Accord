const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function readLiveDatabaseUrl() {
  const envPath = path.join(process.cwd(), ".env");
  const envRaw = fs.readFileSync(envPath, "utf8");
  const line = envRaw
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith("LIVE_DATABASE_URL="));

  if (!line) {
    throw new Error("LIVE_DATABASE_URL not found in .env");
  }

  const url = line.slice("LIVE_DATABASE_URL=".length).trim();
  if (/localhost|127\.0\.0\.1/i.test(url)) {
    throw new Error("LIVE_DATABASE_URL points to localhost. Refusing to run.");
  }

  return url;
}

(async () => {
  const client = new Client({ connectionString: process.env.LIVE_DATABASE_URL || readLiveDatabaseUrl() });
  await client.connect();

  try {
    const user = await client.query(`
      SELECT "userId", "name", "email", "role"
      FROM "Users"
      WHERE "userId" = '00000001'
      LIMIT 1;
    `);

    const memberRoles = await client.query(`
      SELECT "serverId", "role"::text AS role
      FROM "Member"
      WHERE "profileId" = '00000001'
      ORDER BY "serverId";
    `);

    console.log("Users row for 00000001:");
    console.log(user.rows[0] || null);
    console.log("Member roles for 00000001:");

    if (!memberRoles.rows.length) {
      console.log("- none");
    } else {
      for (const r of memberRoles.rows) {
        console.log(`- server ${r.serverId}: ${r.role}`);
      }
    }
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error("Verification failed:", error);
  process.exit(1);
});
