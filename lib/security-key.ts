import "server-only";

import { randomBytes, randomUUID } from "crypto";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

type SecurityKeyRow = {
  id: string;
  userId: string;
  credentialId: string;
  nickname: string | null;
  transportsJson: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  lastUsedAt: Date | string | null;
};

type SecurityKeyChallengeRow = {
  userId: string;
  challenge: string;
  expectedOrigin: string;
  rpId: string;
  purpose: string;
  expiresAt: Date | string;
};

export type SecurityKeySummary = {
  id: string;
  credentialId: string;
  nickname: string;
  transports: string[];
  createdAt: string;
  lastUsedAt: string | null;
};

export type BeginSecurityKeyRegistrationResult = {
  challenge: string;
  rp: {
    name: string;
    id: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{ type: "public-key"; alg: number }>;
  timeout: number;
  attestation: "none";
  excludeCredentials: Array<{ type: "public-key"; id: string; transports: string[] }>;
};

let securityKeySchemaReady = false;

const APP_NAME = "In-Accord";
const REGISTRATION_CHALLENGE_PURPOSE = "register";
const REGISTRATION_CHALLENGE_TTL_MS = 10 * 60 * 1000;

const normalizeCredentialId = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 2048);

const normalizeTransportList = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  const allowed = new Set(["usb", "nfc", "ble", "hybrid", "internal"]);
  const unique = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const normalized = item.trim().toLowerCase();
    if (!allowed.has(normalized)) {
      continue;
    }

    unique.add(normalized);
  }

  return Array.from(unique);
};

const toIso = (value: Date | string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const toIsoOrNull = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const encodeBase64Url = (value: Uint8Array) => {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const decodeBase64UrlToUtf8 = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
};

const makeChallenge = () => encodeBase64Url(Uint8Array.from(randomBytes(32)));

const ensureOrigin = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.origin;
  } catch {
    return "";
  }
};

const getRpIdFromOrigin = (origin: string) => {
  try {
    const parsed = new URL(origin);
    return parsed.hostname;
  } catch {
    return "";
  }
};

const parseTransports = (raw: string | null) => {
  if (!raw) {
    return [] as string[];
  }

  try {
    return normalizeTransportList(JSON.parse(raw));
  } catch {
    return [];
  }
};

export const ensureSecurityKeySchema = async () => {
  if (securityKeySchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "UserSecurityKey" (
      "id" varchar(191) primary key,
      "userId" varchar(191) not null,
      "credentialId" text not null,
      "nickname" text,
      "transportsJson" text not null default '[]',
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null,
      "lastUsedAt" timestamp
    )
  `);

  await db.execute(sql`
    create unique index if not exists "UserSecurityKey_credentialId_unique"
    on "UserSecurityKey" ("credentialId")
  `);

  await db.execute(sql`
    create index if not exists "UserSecurityKey_userId_idx"
    on "UserSecurityKey" ("userId")
  `);

  await db.execute(sql`
    create table if not exists "UserSecurityKeyChallenge" (
      "userId" varchar(191) primary key,
      "challenge" text not null,
      "expectedOrigin" text not null,
      "rpId" text not null,
      "purpose" text not null,
      "expiresAt" timestamp not null,
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  securityKeySchemaReady = true;
};

const listRows = async (userId: string): Promise<SecurityKeyRow[]> => {
  await ensureSecurityKeySchema();

  const result = await db.execute(sql`
    select
      "id",
      "userId",
      "credentialId",
      "nickname",
      "transportsJson",
      "createdAt",
      "updatedAt",
      "lastUsedAt"
    from "UserSecurityKey"
    where "userId" = ${userId}
    order by "createdAt" asc
  `);

  return ((result as unknown as { rows?: SecurityKeyRow[] }).rows ?? []).map((row) => ({
    ...row,
    credentialId: normalizeCredentialId(row.credentialId),
  }));
};

export const listSecurityKeysForUser = async (userId: string): Promise<SecurityKeySummary[]> => {
  const rows = await listRows(userId);

  return rows.map((row, index) => ({
    id: row.id,
    credentialId: row.credentialId,
    nickname: String(row.nickname ?? "").trim() || `Security Key ${index + 1}`,
    transports: parseTransports(row.transportsJson),
    createdAt: toIso(row.createdAt),
    lastUsedAt: toIsoOrNull(row.lastUsedAt),
  }));
};

export const beginSecurityKeyRegistration = async (args: {
  userId: string;
  origin: string;
  userName: string;
  userDisplayName: string;
}): Promise<BeginSecurityKeyRegistrationResult> => {
  await ensureSecurityKeySchema();

  const expectedOrigin = ensureOrigin(args.origin);
  if (!expectedOrigin) {
    throw new Error("Invalid origin.");
  }

  const rpId = getRpIdFromOrigin(expectedOrigin);
  if (!rpId) {
    throw new Error("Invalid RP ID.");
  }

  const challenge = makeChallenge();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REGISTRATION_CHALLENGE_TTL_MS);

  await db.execute(sql`
    insert into "UserSecurityKeyChallenge" (
      "userId",
      "challenge",
      "expectedOrigin",
      "rpId",
      "purpose",
      "expiresAt",
      "createdAt",
      "updatedAt"
    )
    values (
      ${args.userId},
      ${challenge},
      ${expectedOrigin},
      ${rpId},
      ${REGISTRATION_CHALLENGE_PURPOSE},
      ${expiresAt},
      ${now},
      ${now}
    )
    on conflict ("userId") do update
    set
      "challenge" = ${challenge},
      "expectedOrigin" = ${expectedOrigin},
      "rpId" = ${rpId},
      "purpose" = ${REGISTRATION_CHALLENGE_PURPOSE},
      "expiresAt" = ${expiresAt},
      "updatedAt" = ${now}
  `);

  const existing = await listRows(args.userId);

  return {
    challenge,
    rp: {
      name: APP_NAME,
      id: rpId,
    },
    user: {
      id: encodeBase64Url(new TextEncoder().encode(args.userId)),
      name: String(args.userName || args.userDisplayName || "user").slice(0, 120),
      displayName: String(args.userDisplayName || args.userName || "user").slice(0, 120),
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    timeout: 60000,
    attestation: "none",
    excludeCredentials: existing
      .filter((item) => item.credentialId.length > 0)
      .map((item) => ({
        type: "public-key" as const,
        id: item.credentialId,
        transports: parseTransports(item.transportsJson),
      })),
  };
};

export const finishSecurityKeyRegistration = async (args: {
  userId: string;
  credentialId: string;
  clientDataJSON: string;
  transports: string[];
}) => {
  await ensureSecurityKeySchema();

  const normalizedCredentialId = normalizeCredentialId(args.credentialId);
  if (!normalizedCredentialId) {
    return { ok: false as const, error: "Invalid credential id." };
  }

  const challengeResult = await db.execute(sql`
    select
      "userId",
      "challenge",
      "expectedOrigin",
      "rpId",
      "purpose",
      "expiresAt"
    from "UserSecurityKeyChallenge"
    where "userId" = ${args.userId}
    limit 1
  `);

  const challengeRow = (challengeResult as unknown as { rows?: SecurityKeyChallengeRow[] }).rows?.[0] ?? null;
  if (!challengeRow) {
    return { ok: false as const, error: "No security key setup session was found." };
  }

  if (challengeRow.purpose !== REGISTRATION_CHALLENGE_PURPOSE) {
    return { ok: false as const, error: "Invalid security key setup session." };
  }

  const expiresAt = new Date(challengeRow.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    return { ok: false as const, error: "Security key setup session expired. Start again." };
  }

  let clientData: { type?: string; challenge?: string; origin?: string } | null = null;
  try {
    clientData = JSON.parse(decodeBase64UrlToUtf8(args.clientDataJSON)) as {
      type?: string;
      challenge?: string;
      origin?: string;
    };
  } catch {
    return { ok: false as const, error: "Invalid client data." };
  }

  if (!clientData || clientData.type !== "webauthn.create") {
    return { ok: false as const, error: "Invalid registration response type." };
  }

  if (String(clientData.challenge ?? "") !== String(challengeRow.challenge ?? "")) {
    return { ok: false as const, error: "Challenge mismatch. Please retry setup." };
  }

  if (String(clientData.origin ?? "") !== String(challengeRow.expectedOrigin ?? "")) {
    return { ok: false as const, error: "Origin mismatch. Please retry setup." };
  }

  const now = new Date();
  const nicknameCount = (await listRows(args.userId)).length + 1;

  await db.execute(sql`
    insert into "UserSecurityKey" (
      "id",
      "userId",
      "credentialId",
      "nickname",
      "transportsJson",
      "createdAt",
      "updatedAt",
      "lastUsedAt"
    )
    values (
      ${randomUUID()},
      ${args.userId},
      ${normalizedCredentialId},
      ${`Security Key ${nicknameCount}`},
      ${JSON.stringify(normalizeTransportList(args.transports))},
      ${now},
      ${now},
      null
    )
    on conflict ("credentialId") do nothing
  `);

  await db.execute(sql`
    delete from "UserSecurityKeyChallenge"
    where "userId" = ${args.userId}
  `);

  return { ok: true as const };
};

export const deleteSecurityKeyForUser = async (args: { userId: string; securityKeyId: string }) => {
  await ensureSecurityKeySchema();

  const keyId = String(args.securityKeyId ?? "").trim();
  if (!keyId) {
    return { ok: false as const, error: "Missing security key id." };
  }

  await db.execute(sql`
    delete from "UserSecurityKey"
    where "id" = ${keyId}
      and "userId" = ${args.userId}
  `);

  return { ok: true as const };
};
