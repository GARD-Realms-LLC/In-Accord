import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export const integrationProviderKeys = ["github", "google", "steam", "twitch", "xbox", "youtube"] as const;
export type IntegrationProviderKey = (typeof integrationProviderKeys)[number];

type IntegrationProviderConfigRow = {
  githubClientId: string | null;
  githubClientSecret: string | null;
  googleClientId: string | null;
  googleClientSecret: string | null;
  twitchClientId: string | null;
  twitchClientSecret: string | null;
  xboxClientId: string | null;
  xboxClientSecret: string | null;
  youtubeClientId: string | null;
  youtubeClientSecret: string | null;
  updatedAt: Date | string | null;
};

export type IntegrationProviderRuntimeConfig = {
  githubClientId: string | null;
  githubClientSecret: string | null;
  googleClientId: string | null;
  googleClientSecret: string | null;
  twitchClientId: string | null;
  twitchClientSecret: string | null;
  xboxClientId: string | null;
  xboxClientSecret: string | null;
  youtubeClientId: string | null;
  youtubeClientSecret: string | null;
  updatedAt: string | null;
};

type IntegrationProviderCredentialPair = {
  clientId: string;
  clientSecret: string;
};

export type EffectiveIntegrationProviderCredentials = Record<IntegrationProviderKey, IntegrationProviderCredentialPair>;

let integrationProviderConfigSchemaReady = false;

const normalizeCredential = (value: unknown, max = 4096): string | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, max);
};

const toEffectiveValue = (...candidates: Array<string | null | undefined>) => {
  for (const candidate of candidates) {
    const normalized = normalizeCredential(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return "";
};

export const ensureIntegrationProviderConfigSchema = async () => {
  if (integrationProviderConfigSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "InAccordIntegrationProviderConfig" (
      "id" varchar(32) primary key,
      "githubClientId" text,
      "githubClientSecret" text,
      "googleClientId" text,
      "googleClientSecret" text,
      "twitchClientId" text,
      "twitchClientSecret" text,
      "xboxClientId" text,
      "xboxClientSecret" text,
      "youtubeClientId" text,
      "youtubeClientSecret" text,
      "updatedAt" timestamp(3) not null default now()
    )
  `);

  await db.execute(sql`
    insert into "InAccordIntegrationProviderConfig" ("id")
    values ('default')
    on conflict ("id") do nothing
  `);

  integrationProviderConfigSchemaReady = true;
};

export const getIntegrationProviderRuntimeConfig = async (): Promise<IntegrationProviderRuntimeConfig> => {
  await ensureIntegrationProviderConfigSchema();

  const result = await db.execute(sql`
    select
      "githubClientId" as "githubClientId",
      "githubClientSecret" as "githubClientSecret",
      "googleClientId" as "googleClientId",
      "googleClientSecret" as "googleClientSecret",
      "twitchClientId" as "twitchClientId",
      "twitchClientSecret" as "twitchClientSecret",
      "xboxClientId" as "xboxClientId",
      "xboxClientSecret" as "xboxClientSecret",
      "youtubeClientId" as "youtubeClientId",
      "youtubeClientSecret" as "youtubeClientSecret",
      "updatedAt" as "updatedAt"
    from "InAccordIntegrationProviderConfig"
    where "id" = 'default'
    limit 1
  `);

  const row = ((result as unknown as { rows?: IntegrationProviderConfigRow[] }).rows ?? [])[0];

  return {
    githubClientId: normalizeCredential(row?.githubClientId),
    githubClientSecret: normalizeCredential(row?.githubClientSecret),
    googleClientId: normalizeCredential(row?.googleClientId),
    googleClientSecret: normalizeCredential(row?.googleClientSecret),
    twitchClientId: normalizeCredential(row?.twitchClientId),
    twitchClientSecret: normalizeCredential(row?.twitchClientSecret),
    xboxClientId: normalizeCredential(row?.xboxClientId),
    xboxClientSecret: normalizeCredential(row?.xboxClientSecret),
    youtubeClientId: normalizeCredential(row?.youtubeClientId),
    youtubeClientSecret: normalizeCredential(row?.youtubeClientSecret),
    updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
};

export const updateIntegrationProviderRuntimeConfig = async (updates: {
  githubClientId?: string | null;
  githubClientSecret?: string | null;
  googleClientId?: string | null;
  googleClientSecret?: string | null;
  twitchClientId?: string | null;
  twitchClientSecret?: string | null;
  xboxClientId?: string | null;
  xboxClientSecret?: string | null;
  youtubeClientId?: string | null;
  youtubeClientSecret?: string | null;
}) => {
  await ensureIntegrationProviderConfigSchema();

  const clauses = [sql`"updatedAt" = now()`];

  if (Object.prototype.hasOwnProperty.call(updates, "githubClientId")) {
    clauses.push(sql`"githubClientId" = ${normalizeCredential(updates.githubClientId)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "githubClientSecret")) {
    clauses.push(sql`"githubClientSecret" = ${normalizeCredential(updates.githubClientSecret)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "googleClientId")) {
    clauses.push(sql`"googleClientId" = ${normalizeCredential(updates.googleClientId)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "googleClientSecret")) {
    clauses.push(sql`"googleClientSecret" = ${normalizeCredential(updates.googleClientSecret)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "twitchClientId")) {
    clauses.push(sql`"twitchClientId" = ${normalizeCredential(updates.twitchClientId)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "twitchClientSecret")) {
    clauses.push(sql`"twitchClientSecret" = ${normalizeCredential(updates.twitchClientSecret)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "xboxClientId")) {
    clauses.push(sql`"xboxClientId" = ${normalizeCredential(updates.xboxClientId)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "xboxClientSecret")) {
    clauses.push(sql`"xboxClientSecret" = ${normalizeCredential(updates.xboxClientSecret)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "youtubeClientId")) {
    clauses.push(sql`"youtubeClientId" = ${normalizeCredential(updates.youtubeClientId)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "youtubeClientSecret")) {
    clauses.push(sql`"youtubeClientSecret" = ${normalizeCredential(updates.youtubeClientSecret)}`);
  }

  await db.execute(sql`
    update "InAccordIntegrationProviderConfig"
    set ${sql.join(clauses, sql`, `)}
    where "id" = 'default'
  `);

  return getIntegrationProviderRuntimeConfig();
};

export const getEffectiveIntegrationProviderCredentials = async (): Promise<EffectiveIntegrationProviderCredentials> => {
  const runtimeConfig = await getIntegrationProviderRuntimeConfig();

  return {
    github: {
      clientId: toEffectiveValue(runtimeConfig.githubClientId, process.env.GITHUB_CLIENT_ID, process.env.INACCORD_GITHUB_CLIENT_ID),
      clientSecret: toEffectiveValue(runtimeConfig.githubClientSecret, process.env.GITHUB_CLIENT_SECRET, process.env.INACCORD_GITHUB_CLIENT_SECRET),
    },
    google: {
      clientId: toEffectiveValue(runtimeConfig.googleClientId, process.env.GOOGLE_CLIENT_ID),
      clientSecret: toEffectiveValue(runtimeConfig.googleClientSecret, process.env.GOOGLE_CLIENT_SECRET),
    },
    steam: {
      clientId: "",
      clientSecret: "",
    },
    twitch: {
      clientId: toEffectiveValue(runtimeConfig.twitchClientId, process.env.TWITCH_CLIENT_ID),
      clientSecret: toEffectiveValue(runtimeConfig.twitchClientSecret, process.env.TWITCH_CLIENT_SECRET),
    },
    xbox: {
      clientId: toEffectiveValue(runtimeConfig.xboxClientId, process.env.XBOX_CLIENT_ID),
      clientSecret: toEffectiveValue(runtimeConfig.xboxClientSecret, process.env.XBOX_CLIENT_SECRET),
    },
    youtube: {
      clientId: toEffectiveValue(runtimeConfig.youtubeClientId, process.env.YOUTUBE_CLIENT_ID, runtimeConfig.googleClientId, process.env.GOOGLE_CLIENT_ID),
      clientSecret: toEffectiveValue(runtimeConfig.youtubeClientSecret, process.env.YOUTUBE_CLIENT_SECRET, runtimeConfig.googleClientSecret, process.env.GOOGLE_CLIENT_SECRET),
    },
  };
};
