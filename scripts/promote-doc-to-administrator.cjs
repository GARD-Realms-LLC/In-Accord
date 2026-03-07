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

function readDatabaseUrlFromEnvFile(key) {
  const envPath = path.join(process.cwd(), ".env");
  const envRaw = fs.readFileSync(envPath, "utf8");
  const line = envRaw
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith(`${key}=`));

  if (!line) {
    return "";
  }

  return line.slice(`${key}=`.length).trim();
}

function isUnsafeUrl(url) {
  const value = String(url || "").trim();
  if (!value) {
    return true;
  }

  if (/localhost|127\.0\.0\.1/i.test(value)) {
    return true;
  }

  if (!/^postgres(ql)?:\/\//i.test(value)) {
    return true;
  }

  return false;
}

function resolveConnectionString() {
  const candidates = [
    process.env.LIVE_DATABASE_URL,
    process.env.DATABASE_URL,
    readDatabaseUrlFromEnvFile("LIVE_DATABASE_URL"),
    readDatabaseUrlFromEnvFile("DATABASE_URL"),
  ].map((value) => String(value || "").trim());

  const picked = candidates.find((value) => !isUnsafeUrl(value));
  if (!picked) {
    throw new Error("Could not resolve a valid non-local postgres URL from LIVE_DATABASE_URL or DATABASE_URL");
  }

  return picked;
}

(async () => {
  const connectionString = resolveConnectionString();
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const aliases = ["doc cowles", "docrst"];

    const users = await client.query(
      `
      SELECT "userId", "name", "email"
      FROM "Users"
      WHERE lower(coalesce("name", '')) = ANY($1::text[])
         OR lower(coalesce("email", '')) = ANY($1::text[])
      ORDER BY "name" NULLS LAST, "email" NULLS LAST;
      `,
      [aliases]
    );

    if (users.rowCount === 0) {
      console.log("No matching user found for Doc Cowles / DocRST in Users table.");
      return;
    }

    const profileIds = users.rows.map((u) => u.userId);

    const roleColumnCheck = await client.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Users'
        AND column_name = 'role'
      LIMIT 1;
    `);

    if (roleColumnCheck.rowCount > 0) {
      const usersRoleUpdate = await client.query(
        `
        UPDATE "Users"
        SET "role" = 'ADMINISTRATOR'
        WHERE "userId" = ANY($1::text[])
        RETURNING "userId", "name", "email", "role";
        `,
        [profileIds]
      );

      console.log(`Updated Users.role rows to ADMINISTRATOR: ${usersRoleUpdate.rowCount}`);
      for (const r of usersRoleUpdate.rows) {
        console.log(`- ${r.name ?? "(no name)"} <${r.email ?? "no-email"}> | role=${r.role}`);
      }
    } else {
      console.log("Users.role column not present; skipped website-level role update.");
    }

    const result = await client.query(
      `
      UPDATE "Member"
      SET "role" = 'ADMIN'
      WHERE "profileId" = ANY($1::text[])
      RETURNING "id", "profileId", "serverId", "role"::text as role;
      `,
      [profileIds]
    );

    console.log("Matched user(s):");
    for (const u of users.rows) {
      console.log(`- ${u.name ?? "(no name)"} <${u.email ?? "no-email"}> (${u.userId})`);
    }

    console.log(`Updated Member rows to ADMIN: ${result.rowCount}`);

    if (result.rowCount > 0) {
      const verify = await client.query(
        `
        SELECT m."profileId", u."name", u."email", m."serverId", m."role"::text as role
        FROM "Member" m
        JOIN "Users" u ON u."userId" = m."profileId"
        WHERE m."profileId" = ANY($1::text[])
        ORDER BY u."name" NULLS LAST, m."serverId";
        `,
        [profileIds]
      );

      console.log("Verification:");
      for (const r of verify.rows) {
        console.log(`- ${r.name ?? "(no name)"} | ${r.email ?? "no-email"} | server=${r.serverId} | role=${r.role}`);
      }
    }

    console.log("Done. No tables/columns were dropped or removed.");
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error("Failed to promote user to ADMINISTRATOR:", error);
  process.exit(1);
});
