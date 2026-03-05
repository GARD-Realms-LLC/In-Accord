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

function pad8(n) {
  return String(n).padStart(8, "0");
}

(async () => {
  const connectionString = process.env.LIVE_DATABASE_URL || readLiveDatabaseUrl();
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("BEGIN");

    const usersRes = await client.query(`
      SELECT
        u."userId",
        u."name",
        u."email",
        EXISTS (
          SELECT 1 FROM "LocalCredential" lc WHERE lc."userId" = u."userId"
        ) AS "hasCredential"
      FROM "Users" u
      ORDER BY u."userId";
    `);

    const users = usersRes.rows;
    if (!users.length) {
      console.log("No users found.");
      await client.query("ROLLBACK");
      return;
    }

    const docCandidates = users.filter((u) => {
      const name = String(u.name || "").trim().toLowerCase();
      const email = String(u.email || "").trim().toLowerCase();
      const id = String(u.userId || "").trim().toLowerCase();
      return name === "doc cowles" || email === "docrst@gmail.com" || id === "docrst";
    });

    if (!docCandidates.length) {
      throw new Error("Could not find Doc Cowles/DocRST account in Users table.");
    }

    // Prefer the account with credential (actual sign-in account), then id 'docrst'.
    docCandidates.sort((a, b) => {
      if (a.hasCredential !== b.hasCredential) {
        return a.hasCredential ? -1 : 1;
      }
      const aIsDocrst = String(a.userId).toLowerCase() === "docrst";
      const bIsDocrst = String(b.userId).toLowerCase() === "docrst";
      if (aIsDocrst !== bIsDocrst) {
        return aIsDocrst ? -1 : 1;
      }
      return String(a.userId).localeCompare(String(b.userId));
    });

    const docUser = docCandidates[0];

    const mapping = [];
    const usedNewIds = new Set(["00000001"]);
    mapping.push({ oldId: docUser.userId, newId: "00000001" });

    let seq = 2;
    for (const u of users) {
      if (u.userId === docUser.userId) {
        continue;
      }
      let candidate = pad8(seq);
      while (usedNewIds.has(candidate)) {
        seq += 1;
        candidate = pad8(seq);
      }
      mapping.push({ oldId: u.userId, newId: candidate });
      usedNewIds.add(candidate);
      seq += 1;
    }

    const changes = mapping.filter((m) => m.oldId !== m.newId);

    console.log(`Total users: ${users.length}`);
    console.log(`Doc Cowles target account: ${docUser.userId} -> 00000001`);
    console.log(`Users requiring ID change: ${changes.length}`);

    if (!changes.length) {
      await client.query("COMMIT");
      console.log("All user IDs are already normalized.");
      return;
    }

    // Find all text/varchar columns likely storing user IDs.
    const idColsRes = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name IN ('userId', 'profileId')
        AND data_type IN ('character varying', 'text', 'character')
      ORDER BY table_name, column_name;
    `);

    const idCols = idColsRes.rows;
    if (!idCols.find((c) => c.table_name === "Users" && c.column_name === "userId")) {
      throw new Error('Users.userId column not found.');
    }

    // Two-phase rename to avoid collisions.
    const tempMap = changes.map((m, i) => ({
      oldId: m.oldId,
      tempId: `__uid_tmp_${String(i + 1).padStart(6, "0")}`,
      newId: m.newId,
    }));

    for (const m of tempMap) {
      for (const c of idCols) {
        await client.query(
          `UPDATE "${c.table_name}" SET "${c.column_name}" = $1 WHERE "${c.column_name}" = $2`,
          [m.tempId, m.oldId]
        );
      }
    }

    for (const m of tempMap) {
      for (const c of idCols) {
        await client.query(
          `UPDATE "${c.table_name}" SET "${c.column_name}" = $1 WHERE "${c.column_name}" = $2`,
          [m.newId, m.tempId]
        );
      }
    }

    await client.query("COMMIT");

    const verifyDoc = await client.query(`
      SELECT "userId", "name", "email"
      FROM "Users"
      WHERE "userId" = '00000001'
      LIMIT 1;
    `);

    const nonNumeric = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM "Users"
      WHERE "userId" !~ '^[0-9]+$';
    `);

    const sample = await client.query(`
      SELECT "userId", "name", "email"
      FROM "Users"
      ORDER BY "userId"
      LIMIT 20;
    `);

    console.log("Verification:");
    if (verifyDoc.rowCount) {
      const d = verifyDoc.rows[0];
      console.log(`- Doc row at 00000001: ${d.name ?? "(no name)"} <${d.email ?? "no-email"}>`);
    } else {
      console.log("- Doc row at 00000001: NOT FOUND");
    }
    console.log(`- Non-numeric Users.userId count: ${nonNumeric.rows[0].count}`);
    console.log("- Users sample:");
    for (const r of sample.rows) {
      console.log(`  ${r.userId} | ${r.name ?? "(no name)"} | ${r.email ?? "no-email"}`);
    }

    console.log("Done. No tables or columns were dropped.");
    console.log("Note: existing sessions using old IDs must sign in again.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error("Failed to normalize user IDs:", error);
  process.exit(1);
});
