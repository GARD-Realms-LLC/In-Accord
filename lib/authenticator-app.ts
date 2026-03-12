import "server-only";

import { createHmac, randomBytes } from "crypto";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

const ISSUER = "In-Accord";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

type AuthenticatorAppRow = {
  userId: string;
  enabled: boolean;
  secretCipher: string | null;
  pendingSecretCipher: string | null;
  pendingCreatedAt: Date | string | null;
  verifiedAt: Date | string | null;
  lastUsedAt: Date | string | null;
};

export type AuthenticatorAppStatus = {
  enabled: boolean;
  hasPendingSetup: boolean;
  verifiedAt: string | null;
  lastUsedAt: string | null;
};

let authenticatorSchemaReady = false;

const toIsoOrNull = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const encodeBase32 = (buffer: Uint8Array) => {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let index = 0; index < buffer.length; index += 1) {
    const byte = buffer[index];
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += base32Alphabet[(value << (5 - bits)) & 31];
  }

  return output;
};

const decodeBase32 = (input: string) => {
  const normalized = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  if (!/^[A-Z2-7]+$/.test(normalized)) {
    throw new Error("Invalid base32 secret.");
  }

  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of normalized) {
    const index = base32Alphabet.indexOf(char);
    if (index < 0) {
      throw new Error("Invalid base32 character.");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Uint8Array.from(output);
};

const generateBase32Secret = () => encodeBase32(Uint8Array.from(randomBytes(20)));

const formatOtpCode = (code: number) => code.toString().padStart(TOTP_DIGITS, "0");

const computeTotpAtCounter = (secretBase32: string, counter: number) => {
  const key = decodeBase32(secretBase32);
  const counterBuffer = new Uint8Array(8);
  const counterView = new DataView(counterBuffer.buffer, counterBuffer.byteOffset, counterBuffer.byteLength);
  counterView.setBigUint64(0, BigInt(counter));

  const digest = Uint8Array.from(createHmac("sha1", key).update(counterBuffer).digest());
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return formatOtpCode(binary % 10 ** TOTP_DIGITS);
};

const verifyTotpCode = (secretBase32: string, code: string, now = Date.now()) => {
  if (!/^\d{6}$/.test(code)) {
    return false;
  }

  const currentCounter = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
  for (const offset of [-1, 0, 1]) {
    const candidate = computeTotpAtCounter(secretBase32, currentCounter + offset);
    if (candidate === code) {
      return true;
    }
  }

  return false;
};

const formatAccountLabel = (accountName: string) => {
  const trimmed = accountName.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : "user";
};

export const buildOtpAuthUri = (secret: string, accountName: string) => {
  const label = `${ISSUER}:${formatAccountLabel(accountName)}`;
  const params = new URLSearchParams({
    secret,
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });

  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
};

export const ensureAuthenticatorAppSchema = async () => {
  if (authenticatorSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "UserAuthenticatorApp" (
      "userId" varchar(191) primary key,
      "enabled" boolean not null default false,
      "secretCipher" text,
      "pendingSecretCipher" text,
      "pendingCreatedAt" timestamp,
      "verifiedAt" timestamp,
      "lastUsedAt" timestamp,
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    create index if not exists "UserAuthenticatorApp_enabled_idx"
    on "UserAuthenticatorApp" ("enabled")
  `);

  authenticatorSchemaReady = true;
};

const getRow = async (userId: string): Promise<AuthenticatorAppRow | null> => {
  await ensureAuthenticatorAppSchema();

  const result = await db.execute(sql`
    select
      "userId",
      "enabled",
      "secretCipher",
      "pendingSecretCipher",
      "pendingCreatedAt",
      "verifiedAt",
      "lastUsedAt"
    from "UserAuthenticatorApp"
    where "userId" = ${userId}
    limit 1
  `);

  const row = (result as unknown as { rows?: AuthenticatorAppRow[] }).rows?.[0] ?? null;
  return row;
};

const upsertPendingSecret = async (userId: string, pendingSecret: string) => {
  await ensureAuthenticatorAppSchema();

  const pendingSecretCipher = pendingSecret;
  const now = new Date();

  await db.execute(sql`
    insert into "UserAuthenticatorApp" (
      "userId",
      "enabled",
      "secretCipher",
      "pendingSecretCipher",
      "pendingCreatedAt",
      "verifiedAt",
      "lastUsedAt",
      "createdAt",
      "updatedAt"
    )
    values (
      ${userId},
      false,
      null,
      ${pendingSecretCipher},
      ${now},
      null,
      null,
      ${now},
      ${now}
    )
    on conflict ("userId") do update
    set
      "enabled" = false,
      "secretCipher" = null,
      "pendingSecretCipher" = ${pendingSecretCipher},
      "pendingCreatedAt" = ${now},
      "verifiedAt" = null,
      "lastUsedAt" = null,
      "updatedAt" = ${now}
  `);
};

const updateLastUsedAt = async (userId: string) => {
  const now = new Date();
  await db.execute(sql`
    update "UserAuthenticatorApp"
    set "lastUsedAt" = ${now}, "updatedAt" = ${now}
    where "userId" = ${userId}
  `);
};

export const getAuthenticatorAppStatus = async (userId: string): Promise<AuthenticatorAppStatus> => {
  const row = await getRow(userId);

  return {
    enabled: row?.enabled === true,
    hasPendingSetup: !!row?.pendingSecretCipher,
    verifiedAt: toIsoOrNull(row?.verifiedAt),
    lastUsedAt: toIsoOrNull(row?.lastUsedAt),
  };
};

export const beginAuthenticatorAppSetup = async (userId: string, accountName: string) => {
  const secret = generateBase32Secret();
  await upsertPendingSecret(userId, secret);

  return {
    secret,
    otpauthUri: buildOtpAuthUri(secret, accountName),
    issuer: ISSUER,
    periodSeconds: TOTP_PERIOD_SECONDS,
    digits: TOTP_DIGITS,
  };
};

export const verifyAuthenticatorAppSetup = async (userId: string, code: string) => {
  const normalizedCode = String(code ?? "").trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    return { ok: false as const, error: "Enter a valid 6-digit code." };
  }

  const row = await getRow(userId);
  if (!row?.pendingSecretCipher) {
    return { ok: false as const, error: "No pending authenticator setup was found." };
  }

  const pendingSecret = row.pendingSecretCipher;

  const valid = verifyTotpCode(pendingSecret, normalizedCode);
  if (!valid) {
    return { ok: false as const, error: "Invalid code. Check your authenticator app and try again." };
  }

  const now = new Date();
  const secretCipher = pendingSecret;

  await db.execute(sql`
    update "UserAuthenticatorApp"
    set
      "enabled" = true,
      "secretCipher" = ${secretCipher},
      "pendingSecretCipher" = null,
      "pendingCreatedAt" = null,
      "verifiedAt" = ${now},
      "lastUsedAt" = ${now},
      "updatedAt" = ${now}
    where "userId" = ${userId}
  `);

  return { ok: true as const };
};

export const disableAuthenticatorApp = async (userId: string, code: string) => {
  const normalizedCode = String(code ?? "").trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    return { ok: false as const, error: "Enter a valid 6-digit code." };
  }

  const row = await getRow(userId);
  if (!row?.enabled || !row.secretCipher) {
    return { ok: false as const, error: "Authenticator app is not enabled." };
  }

  const activeSecret = row.secretCipher;

  const valid = verifyTotpCode(activeSecret, normalizedCode);
  if (!valid) {
    return { ok: false as const, error: "Invalid code. Could not disable authenticator app." };
  }

  const now = new Date();
  await db.execute(sql`
    update "UserAuthenticatorApp"
    set
      "enabled" = false,
      "secretCipher" = null,
      "pendingSecretCipher" = null,
      "pendingCreatedAt" = null,
      "verifiedAt" = null,
      "lastUsedAt" = ${now},
      "updatedAt" = ${now}
    where "userId" = ${userId}
  `);

  return { ok: true as const };
};

export const validateAuthenticatorAppCodeForSignIn = async (userId: string, code: string) => {
  const normalizedCode = String(code ?? "").trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    return false;
  }

  const row = await getRow(userId);
  if (!row?.enabled || !row.secretCipher) {
    return false;
  }

  const activeSecret = row.secretCipher;

  const valid = verifyTotpCode(activeSecret, normalizedCode);
  if (valid) {
    await updateLastUsedAt(userId);
  }

  return valid;
};
