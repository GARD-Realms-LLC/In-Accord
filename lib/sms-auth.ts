import "server-only";

import { createHash, randomInt } from "crypto";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

type SmsAuthRow = {
  userId: string;
  enabled: boolean;
  phoneNumber: string | null;
  pendingPhoneNumber: string | null;
  pendingCodeHash: string | null;
  pendingCodeExpiresAt: Date | string | null;
  verifiedAt: Date | string | null;
  lastUsedAt: Date | string | null;
};

export type SmsAuthStatus = {
  enabled: boolean;
  hasPendingVerification: boolean;
  maskedPhoneNumber: string | null;
  verifiedAt: string | null;
  lastUsedAt: string | null;
};

let smsAuthSchemaReady = false;

const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
const CODE_TTL_MS = 10 * 60 * 1000;

const toIsoOrNull = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const normalizePhone = (value: string) => String(value ?? "").trim();

const maskPhone = (phone: string | null) => {
  const normalized = normalizePhone(phone ?? "");
  if (!normalized) {
    return null;
  }

  if (normalized.length <= 4) {
    return `***${normalized}`;
  }

  return `${"*".repeat(Math.max(4, normalized.length - 4))}${normalized.slice(-4)}`;
};

const hashCode = (code: string) => createHash("sha256").update(String(code)).digest("hex");

const generateCode = () => String(randomInt(100000, 1000000));

const sendSmsCode = async (phoneNumber: string, code: string) => {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID ?? "").trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN ?? "").trim();
  const fromNumber = String(process.env.TWILIO_FROM_NUMBER ?? "").trim();
  const messagingServiceSid = String(process.env.TWILIO_MESSAGING_SERVICE_SID ?? "").trim();

  if (!accountSid || !authToken || (!fromNumber && !messagingServiceSid)) {
    throw new Error(
      "SMS provider is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID."
    );
  }

  const form = new URLSearchParams();
  form.set("To", phoneNumber);
  form.set("Body", `${code} is your In-Accord verification code.`);

  if (messagingServiceSid) {
    form.set("MessagingServiceSid", messagingServiceSid);
  } else {
    form.set("From", fromNumber);
  }

  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(`SMS provider request failed (${response.status}): ${responseText || response.statusText}`);
  }
};

export const ensureSmsAuthSchema = async () => {
  if (smsAuthSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "UserSmsAuth" (
      "userId" varchar(191) primary key,
      "enabled" boolean not null default false,
      "phoneNumber" text,
      "pendingPhoneNumber" text,
      "pendingCodeHash" text,
      "pendingCodeExpiresAt" timestamp,
      "verifiedAt" timestamp,
      "lastUsedAt" timestamp,
      "createdAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  smsAuthSchemaReady = true;
};

const getRow = async (userId: string): Promise<SmsAuthRow | null> => {
  await ensureSmsAuthSchema();

  const result = await db.execute(sql`
    select
      "userId",
      "enabled",
      "phoneNumber",
      "pendingPhoneNumber",
      "pendingCodeHash",
      "pendingCodeExpiresAt",
      "verifiedAt",
      "lastUsedAt"
    from "UserSmsAuth"
    where "userId" = ${userId}
    limit 1
  `);

  return ((result as unknown as { rows?: SmsAuthRow[] }).rows ?? [])[0] ?? null;
};

export const getSmsAuthStatus = async (userId: string): Promise<SmsAuthStatus> => {
  const row = await getRow(userId);

  return {
    enabled: row?.enabled === true,
    hasPendingVerification: !!row?.pendingCodeHash && !!row?.pendingPhoneNumber,
    maskedPhoneNumber: maskPhone(row?.enabled ? row?.phoneNumber ?? null : row?.pendingPhoneNumber ?? null),
    verifiedAt: toIsoOrNull(row?.verifiedAt),
    lastUsedAt: toIsoOrNull(row?.lastUsedAt),
  };
};

export const beginSmsAuthSetup = async (args: { userId: string; phoneNumber: string }) => {
  const phoneNumber = normalizePhone(args.phoneNumber);
  if (!PHONE_REGEX.test(phoneNumber)) {
    return { ok: false as const, error: "Use a valid phone number in E.164 format (example: +15551234567)." };
  }

  const code = generateCode();
  const codeHash = hashCode(code);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

  await sendSmsCode(phoneNumber, code);

  await db.execute(sql`
    insert into "UserSmsAuth" (
      "userId",
      "enabled",
      "phoneNumber",
      "pendingPhoneNumber",
      "pendingCodeHash",
      "pendingCodeExpiresAt",
      "verifiedAt",
      "lastUsedAt",
      "createdAt",
      "updatedAt"
    )
    values (
      ${args.userId},
      false,
      null,
      ${phoneNumber},
      ${codeHash},
      ${expiresAt},
      null,
      null,
      ${now},
      ${now}
    )
    on conflict ("userId") do update
    set
      "pendingPhoneNumber" = ${phoneNumber},
      "pendingCodeHash" = ${codeHash},
      "pendingCodeExpiresAt" = ${expiresAt},
      "updatedAt" = ${now}
  `);

  return { ok: true as const };
};

export const verifySmsAuthSetup = async (args: { userId: string; code: string }) => {
  const code = String(args.code ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return { ok: false as const, error: "Enter a valid 6-digit code." };
  }

  const row = await getRow(args.userId);
  if (!row?.pendingCodeHash || !row?.pendingPhoneNumber || !row?.pendingCodeExpiresAt) {
    return { ok: false as const, error: "No pending SMS verification found." };
  }

  const expiresAt = new Date(row.pendingCodeExpiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    return { ok: false as const, error: "SMS verification code expired. Request a new code." };
  }

  if (hashCode(code) !== row.pendingCodeHash) {
    return { ok: false as const, error: "Invalid verification code." };
  }

  const now = new Date();
  await db.execute(sql`
    update "UserSmsAuth"
    set
      "enabled" = true,
      "phoneNumber" = ${row.pendingPhoneNumber},
      "pendingPhoneNumber" = null,
      "pendingCodeHash" = null,
      "pendingCodeExpiresAt" = null,
      "verifiedAt" = ${now},
      "lastUsedAt" = ${now},
      "updatedAt" = ${now}
    where "userId" = ${args.userId}
  `);

  return { ok: true as const };
};

export const disableSmsAuth = async (userId: string) => {
  const now = new Date();
  await db.execute(sql`
    update "UserSmsAuth"
    set
      "enabled" = false,
      "phoneNumber" = null,
      "pendingPhoneNumber" = null,
      "pendingCodeHash" = null,
      "pendingCodeExpiresAt" = null,
      "verifiedAt" = null,
      "updatedAt" = ${now}
    where "userId" = ${userId}
  `);

  return { ok: true as const };
};
