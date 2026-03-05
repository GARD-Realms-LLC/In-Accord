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
  const connectionString = process.env.LIVE_DATABASE_URL || readLiveDatabaseUrl();
  const client = new Client({ connectionString });

  await client.connect();

  try {
    // Non-destructive: add required roles only.
    await client.query(`ALTER TYPE "MemberRole" ADD VALUE IF NOT EXISTS 'ADMINISTRATOR';`);
    await client.query(`ALTER TYPE "MemberRole" ADD VALUE IF NOT EXISTS 'DEVELOPER';`);
    await client.query(`ALTER TYPE "MemberRole" ADD VALUE IF NOT EXISTS 'MODERATOR';`);
    await client.query(`ALTER TYPE "MemberRole" ADD VALUE IF NOT EXISTS 'IN_JAIL';`);
    await client.query(`ALTER TYPE "MemberRole" ADD VALUE IF NOT EXISTS 'USER';`);

    // Non-destructive data migration for existing members.
    await client.query(`UPDATE "Member" SET "role" = 'ADMINISTRATOR' WHERE "role"::text = 'ADMIN';`);
    await client.query(`UPDATE "Member" SET "role" = 'USER' WHERE "role"::text = 'GUEST';`);

    const enumValues = await client.query(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'MemberRole'
      ORDER BY e.enumsortorder;
    `);

    console.log("MemberRole enum values in LIVE DB:");
    for (const row of enumValues.rows) {
      console.log(`- ${row.enumlabel}`);
    }

    const roleUsage = await client.query(`
      SELECT "role"::text AS role, COUNT(*)::int AS count
      FROM "Member"
      GROUP BY "role"
      ORDER BY role;
    `);

    console.log("Member role usage counts:");
    for (const row of roleUsage.rows) {
      console.log(`- ${row.role}: ${row.count}`);
    }

    console.log("Done. No tables or columns were dropped.");
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error("Failed to apply live member roles:", error);
  process.exit(1);
});
