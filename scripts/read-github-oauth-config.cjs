const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const ROOT_DIR = process.cwd();
const ROOT_ENV_FILENAMES = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
  ".env.test",
  ".env.test.local",
];
const SETTINGS_URL = "https://github.com/settings/developers";
const DOCS_URL = "https://docs.github.com/en/developers/apps/creating-an-oauth-app";

const normalizeValue = (value) => {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : "";
};

const stripWrappingQuotes = (value) => {
  const normalized = normalizeValue(value);
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    return normalized.slice(1, -1);
  }

  return normalized;
};

const readEnvFileMap = (filename) => {
  const filePath = path.join(ROOT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return new Map();
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const entries = new Map();

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = stripWrappingQuotes(trimmed.slice(separatorIndex + 1));
    entries.set(key, value);
  }

  return entries;
};

const pickFirstPresent = (candidates) => {
  for (const candidate of candidates) {
    const value = normalizeValue(candidate?.value);
    if (value) {
      return {
        value,
        source: candidate?.source ?? "unknown",
      };
    }
  }

  return {
    value: "",
    source: "missing",
  };
};

const findEnvValue = (key) => {
  const processValue = normalizeValue(process.env[key]);
  if (processValue) {
    return {
      value: processValue,
      source: `process.env.${key}`,
    };
  }

  for (const filename of ROOT_ENV_FILENAMES) {
    const entries = readEnvFileMap(filename);
    const value = normalizeValue(entries.get(key));
    if (value) {
      return {
        value,
        source: `${filename}:${key}`,
      };
    }
  }

  return {
    value: "",
    source: "missing",
  };
};

const readDatabaseUrl = () => {
  const live = findEnvValue("LIVE_DATABASE_URL");
  if (live.value && !/^replace_/i.test(live.value)) {
    return live.value;
  }

  const database = findEnvValue("DATABASE_URL");
  return database.value;
};

const readRuntimeConfig = async () => {
  const connectionString = readDatabaseUrl();
  if (!connectionString) {
    return {
      githubClientId: "",
      githubClientSecret: "",
      source: "database-unavailable",
      error: "No LIVE_DATABASE_URL or DATABASE_URL was available.",
    };
  }

  const client = new Client({
    connectionString,
    max: 1,
  });

  try {
    await client.connect();

    const result = await client.query(
      'select "githubClientId", "githubClientSecret" from "InAccordIntegrationProviderConfig" where "id" = $1 limit 1',
      ["default"]
    );
    const row = result.rows?.[0] ?? {};

    return {
      githubClientId: normalizeValue(row.githubClientId),
      githubClientSecret: normalizeValue(row.githubClientSecret),
      source: 'db."InAccordIntegrationProviderConfig"',
      error: "",
    };
  } catch (error) {
    return {
      githubClientId: "",
      githubClientSecret: "",
      source: "database-query-failed",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await client.end().catch(() => {});
  }
};

const printLine = (key, value) => {
  console.log(`${key}=${value}`);
};

(async () => {
  const runtimeConfig = await readRuntimeConfig();

  const githubClientId = pickFirstPresent([
    {
      value: runtimeConfig.githubClientId,
      source: `${runtimeConfig.source}.githubClientId`,
    },
    findEnvValue("GITHUB_CLIENT_ID"),
    findEnvValue("INACCORD_GITHUB_CLIENT_ID"),
  ]);

  const githubClientSecret = pickFirstPresent([
    {
      value: runtimeConfig.githubClientSecret,
      source: `${runtimeConfig.source}.githubClientSecret`,
    },
    findEnvValue("GITHUB_CLIENT_SECRET"),
    findEnvValue("INACCORD_GITHUB_CLIENT_SECRET"),
  ]);

  printLine("githubClientId", githubClientId.value || "MISSING");
  printLine("githubClientIdSource", githubClientId.source);
  printLine("githubClientSecret", githubClientSecret.value || "MISSING");
  printLine("githubClientSecretSource", githubClientSecret.source);

  if (runtimeConfig.error) {
    printLine("databaseStatus", runtimeConfig.error);
  }

  if (!githubClientId.value || !githubClientSecret.value) {
    printLine("status", "Local project config does not contain the full GitHub OAuth credentials.");
    printLine(
      "nextStep",
      "Open your GitHub OAuth app settings. The client ID is shown there. GitHub lets you generate a new client secret there."
    );
    printLine("settingsUrl", SETTINGS_URL);
    printLine("docsUrl", DOCS_URL);
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
