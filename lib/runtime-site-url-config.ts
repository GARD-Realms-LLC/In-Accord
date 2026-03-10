import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

type RuntimeSiteUrlConfigRow = {
  appBaseUrl: string | null;
  hostingServiceName: string | null;
  hostingHostName: string | null;
  hostingHostUrl: string | null;
  hostingLogin: string | null;
  hostingPassword: string | null;
  hostingCost: string | null;
  databaseServiceName: string | null;
  databaseHostName: string | null;
  databaseHostUrl: string | null;
  databaseLogin: string | null;
  databasePassword: string | null;
  databaseCost: string | null;
  updatedAt: Date | string | null;
};

export type RuntimeSiteUrlConfig = {
  appBaseUrl: string | null;
  hostingServiceName: string | null;
  hostingHostName: string | null;
  hostingHostUrl: string | null;
  hostingLogin: string | null;
  hostingPassword: string | null;
  hostingCost: string | null;
  databaseServiceName: string | null;
  databaseHostName: string | null;
  databaseHostUrl: string | null;
  databaseLogin: string | null;
  databasePassword: string | null;
  databaseCost: string | null;
  updatedAt: string | null;
};

let runtimeSiteUrlSchemaReady = false;

const normalizeSiteUrl = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  const origin = parsed.origin.trim();
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
};

const normalizeOriginFallback = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    return parsed.origin;
  } catch {
    return null;
  }
};

const normalizeText = (value: unknown, max = 255): string | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, max);
};

export const ensureRuntimeSiteUrlConfigSchema = async () => {
  if (runtimeSiteUrlSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "InAccordRuntimeConfig" (
      "id" varchar(32) primary key,
      "appBaseUrl" varchar(2048),
      "hostingServiceName" varchar(191),
      "hostingHostName" varchar(191),
      "hostingHostUrl" varchar(2048),
      "hostingLogin" varchar(191),
      "hostingPassword" text,
      "hostingCost" varchar(191),
      "databaseServiceName" varchar(191),
      "databaseHostName" varchar(191),
      "databaseHostUrl" varchar(2048),
      "databaseLogin" varchar(191),
      "databasePassword" text,
      "databaseCost" varchar(191),
      "updatedAt" timestamp(3) not null default now()
    )
  `);

  await db.execute(sql`alter table "InAccordRuntimeConfig" add column if not exists "hostingServiceName" varchar(191)`);
  await db.execute(sql`alter table "InAccordRuntimeConfig" add column if not exists "hostingHostName" varchar(191)`);
  await db.execute(sql`alter table "InAccordRuntimeConfig" add column if not exists "hostingHostUrl" varchar(2048)`);
  await db.execute(sql`alter table "InAccordRuntimeConfig" add column if not exists "hostingLogin" varchar(191)`);
  await db.execute(sql`alter table "InAccordRuntimeConfig" add column if not exists "hostingPassword" text`);
  await db.execute(sql`alter table "InAccordRuntimeConfig" add column if not exists "hostingCost" varchar(191)`);
  await db.execute(sql`alter table "InAccordRuntimeConfig" add column if not exists "databaseServiceName" varchar(191)`);
  await db.execute(sql`alter table "InAccordRuntimeConfig" add column if not exists "databaseHostName" varchar(191)`);
  await db.execute(sql`alter table "InAccordRuntimeConfig" add column if not exists "databaseHostUrl" varchar(2048)`);
  await db.execute(sql`alter table "InAccordRuntimeConfig" add column if not exists "databaseLogin" varchar(191)`);
  await db.execute(sql`alter table "InAccordRuntimeConfig" add column if not exists "databasePassword" text`);
  await db.execute(sql`alter table "InAccordRuntimeConfig" add column if not exists "databaseCost" varchar(191)`);

  await db.execute(sql`
    insert into "InAccordRuntimeConfig" ("id")
    values ('default')
    on conflict ("id") do nothing
  `);

  runtimeSiteUrlSchemaReady = true;
};

export const getRuntimeSiteUrlConfig = async (): Promise<RuntimeSiteUrlConfig> => {
  await ensureRuntimeSiteUrlConfigSchema();

  const result = await db.execute(sql`
    select
      "appBaseUrl" as "appBaseUrl",
      "hostingServiceName" as "hostingServiceName",
      "hostingHostName" as "hostingHostName",
      "hostingHostUrl" as "hostingHostUrl",
      "hostingLogin" as "hostingLogin",
      "hostingPassword" as "hostingPassword",
      "hostingCost" as "hostingCost",
      "databaseServiceName" as "databaseServiceName",
      "databaseHostName" as "databaseHostName",
      "databaseHostUrl" as "databaseHostUrl",
      "databaseLogin" as "databaseLogin",
      "databasePassword" as "databasePassword",
      "databaseCost" as "databaseCost",
      "updatedAt" as "updatedAt"
    from "InAccordRuntimeConfig"
    where "id" = 'default'
    limit 1
  `);

  const row = ((result as unknown as { rows?: RuntimeSiteUrlConfigRow[] }).rows ?? [])[0];

  return {
    appBaseUrl: normalizeSiteUrl(row?.appBaseUrl),
    hostingServiceName: normalizeText(row?.hostingServiceName, 191),
    hostingHostName: normalizeText(row?.hostingHostName, 191),
    hostingHostUrl: normalizeSiteUrl(row?.hostingHostUrl),
    hostingLogin: normalizeText(row?.hostingLogin, 191),
    hostingPassword: normalizeText(row?.hostingPassword, 1024),
    hostingCost: normalizeText(row?.hostingCost, 191),
    databaseServiceName: normalizeText(row?.databaseServiceName, 191),
    databaseHostName: normalizeText(row?.databaseHostName, 191),
    databaseHostUrl: normalizeSiteUrl(row?.databaseHostUrl),
    databaseLogin: normalizeText(row?.databaseLogin, 191),
    databasePassword: normalizeText(row?.databasePassword, 1024),
    databaseCost: normalizeText(row?.databaseCost, 191),
    updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
};

export const getEffectiveSiteUrl = async (requestOrigin?: string | null): Promise<string> => {
  const runtimeConfig = await getRuntimeSiteUrlConfig();
  const envSiteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  const normalizedRequestOrigin = normalizeOriginFallback(requestOrigin);

  return runtimeConfig.appBaseUrl ?? envSiteUrl ?? normalizedRequestOrigin ?? "http://localhost:3000";
};

export const updateRuntimeSiteUrlConfig = async (updates: {
  appBaseUrl?: string | null;
  hostingServiceName?: string | null;
  hostingHostName?: string | null;
  hostingHostUrl?: string | null;
  hostingLogin?: string | null;
  hostingPassword?: string | null;
  hostingCost?: string | null;
  databaseServiceName?: string | null;
  databaseHostName?: string | null;
  databaseHostUrl?: string | null;
  databaseLogin?: string | null;
  databasePassword?: string | null;
  databaseCost?: string | null;
}) => {
  await ensureRuntimeSiteUrlConfigSchema();

  const clauses = [sql`"updatedAt" = now()`];

  if (Object.prototype.hasOwnProperty.call(updates, "appBaseUrl")) {
    const normalized = updates.appBaseUrl === null ? null : normalizeSiteUrl(updates.appBaseUrl);

    if (updates.appBaseUrl !== null && !normalized) {
      throw new Error("Invalid URL. Enter a full URL like https://app.example.com");
    }

    clauses.push(sql`"appBaseUrl" = ${normalized}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "hostingServiceName")) {
    clauses.push(sql`"hostingServiceName" = ${normalizeText(updates.hostingServiceName, 191)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "hostingHostName")) {
    clauses.push(sql`"hostingHostName" = ${normalizeText(updates.hostingHostName, 191)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "hostingHostUrl")) {
    const normalizedHostUrl = updates.hostingHostUrl === null ? null : normalizeSiteUrl(updates.hostingHostUrl);
    if (updates.hostingHostUrl !== null && !normalizedHostUrl) {
      throw new Error("Invalid Host URL. Enter a full URL like https://host.example.com");
    }

    clauses.push(sql`"hostingHostUrl" = ${normalizedHostUrl}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "hostingLogin")) {
    clauses.push(sql`"hostingLogin" = ${normalizeText(updates.hostingLogin, 191)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "hostingPassword")) {
    clauses.push(sql`"hostingPassword" = ${normalizeText(updates.hostingPassword, 1024)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "hostingCost")) {
    clauses.push(sql`"hostingCost" = ${normalizeText(updates.hostingCost, 191)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "databaseServiceName")) {
    clauses.push(sql`"databaseServiceName" = ${normalizeText(updates.databaseServiceName, 191)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "databaseHostName")) {
    clauses.push(sql`"databaseHostName" = ${normalizeText(updates.databaseHostName, 191)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "databaseHostUrl")) {
    const normalizedDatabaseHostUrl = updates.databaseHostUrl === null ? null : normalizeSiteUrl(updates.databaseHostUrl);
    if (updates.databaseHostUrl !== null && !normalizedDatabaseHostUrl) {
      throw new Error("Invalid Database Host URL. Enter a full URL like https://db.example.com");
    }

    clauses.push(sql`"databaseHostUrl" = ${normalizedDatabaseHostUrl}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "databaseLogin")) {
    clauses.push(sql`"databaseLogin" = ${normalizeText(updates.databaseLogin, 191)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "databasePassword")) {
    clauses.push(sql`"databasePassword" = ${normalizeText(updates.databasePassword, 1024)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "databaseCost")) {
    clauses.push(sql`"databaseCost" = ${normalizeText(updates.databaseCost, 191)}`);
  }

  await db.execute(sql`
    update "InAccordRuntimeConfig"
    set ${sql.join(clauses, sql`, `)}
    where "id" = 'default'
  `);

  return getRuntimeSiteUrlConfig();
};
