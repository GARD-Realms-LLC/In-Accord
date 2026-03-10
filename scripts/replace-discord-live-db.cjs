#!/usr/bin/env node

require("dotenv").config();

const { Pool } = require("pg");

const args = new Set(process.argv.slice(2));
const useDatabaseUrl = args.has("--use-database-url");
const dryRun = args.has("--dry-run");
const allowFallback = args.has("--allow-fallback");

const liveUrl = process.env.LIVE_DATABASE_URL;
const databaseUrl = process.env.DATABASE_URL;

const selectedUrl = useDatabaseUrl ? databaseUrl : liveUrl;
const normalizedSelectedUrl = (selectedUrl || "").trim();
const normalizedFallbackUrl = ((useDatabaseUrl ? liveUrl : databaseUrl) || "").trim();

if (!normalizedSelectedUrl || /^replace_/i.test(normalizedSelectedUrl)) {
  console.error(
    useDatabaseUrl
      ? "DATABASE_URL is missing or still a placeholder. Aborting."
      : "LIVE_DATABASE_URL is missing or still a placeholder. Aborting."
  );
  process.exit(1);
}

const SEARCH_REGEX = "(DISCORD|Discord|discord)";
const REPLACEMENT = "Other";

function isConnectionLikeError(error) {
  const message = String(error?.message || error || "");
  return /(ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|getaddrinfo|connect ECONN|Connection terminated unexpectedly|no pg_hba|password authentication failed)/i.test(message);
}

function qid(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

async function runForUrl(connectionString, targetLabel) {
  const pool = new Pool({
    connectionString,
    max: 2,
  });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const columnsResult = await client.query(
      `
      SELECT
        table_schema,
        table_name,
        column_name,
        data_type
      FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND data_type IN ('text', 'character varying', 'character')
      ORDER BY table_schema, table_name, ordinal_position
      `
    );

    let touchedColumns = 0;
    let touchedRows = 0;
    const changes = [];

    for (const col of columnsResult.rows) {
      const schema = qid(col.table_schema);
      const table = qid(col.table_name);
      const column = qid(col.column_name);
      const fqTable = `${schema}.${table}`;

      const countSql = `
        SELECT COUNT(*)::int AS count
        FROM ${fqTable}
        WHERE ${column} IS NOT NULL
          AND ${column} ~ $1
      `;
      const before = (await client.query(countSql, [SEARCH_REGEX])).rows[0].count;

      if (!before) {
        continue;
      }

      touchedColumns += 1;
      let rowsForThisColumn = before;
      if (!dryRun) {
        const updateSql = `
          UPDATE ${fqTable}
          SET ${column} = regexp_replace(${column}, $1, $2, 'g')
          WHERE ${column} IS NOT NULL
            AND ${column} ~ $1
        `;
        const updateResult = await client.query(updateSql, [SEARCH_REGEX, REPLACEMENT]);
        rowsForThisColumn = updateResult.rowCount || 0;
      }
      touchedRows += rowsForThisColumn;

      changes.push({
        table: `${col.table_schema}.${col.table_name}`,
        column: col.column_name,
        rows: rowsForThisColumn,
      });
    }

    if (dryRun) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }

    console.log(
      dryRun
        ? `Dry run complete on ${targetLabel}.`
        : `Replacement complete on ${targetLabel}.`
    );
    console.log(dryRun ? `Columns impacted: ${touchedColumns}` : `Columns updated: ${touchedColumns}`);
    console.log(dryRun ? `Rows impacted: ${touchedRows}` : `Rows updated: ${touchedRows}`);

    if (changes.length) {
      console.log("Details:");
      for (const item of changes) {
        console.log(`- ${item.table}.${item.column}: ${item.rows} row(s)`);
      }
    } else {
      console.log("No matching values found.");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed; transaction rolled back.");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const primaryLabel = useDatabaseUrl ? "DATABASE_URL database" : "LIVE database";

  try {
    await runForUrl(normalizedSelectedUrl, primaryLabel);
  } catch (error) {
    const canFallback =
      allowFallback &&
      !useDatabaseUrl &&
      normalizedFallbackUrl &&
      !/^replace_/i.test(normalizedFallbackUrl) &&
      isConnectionLikeError(error);

    if (!canFallback) {
      throw error;
    }

    console.warn(
      `Primary connection failed (${error?.message || error}). Retrying with DATABASE_URL due to --allow-fallback...`
    );
    await runForUrl(normalizedFallbackUrl, "DATABASE_URL database (fallback)");
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
