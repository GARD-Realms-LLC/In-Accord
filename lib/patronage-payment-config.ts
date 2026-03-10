import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

type PatronagePaymentConfigRow = {
  stripeSecretKey: string | null;
  stripePublishableKey: string | null;
  stripeWebhookSecret: string | null;
  payoutAccountLabel: string | null;
  payoutContactEmail: string | null;
  payoutNotice: string | null;
  updatedAt: Date | string | null;
};

export type PatronagePaymentConfig = {
  stripeSecretKey: string | null;
  stripePublishableKey: string | null;
  stripeWebhookSecret: string | null;
  payoutAccountLabel: string | null;
  payoutContactEmail: string | null;
  payoutNotice: string | null;
  updatedAt: string | null;
};

let paymentConfigSchemaReady = false;

const normalizeSecret = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  if (!normalized || /replace_me/i.test(normalized)) {
    return null;
  }

  return normalized;
};

const normalizeEmail = (value: unknown) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (!/^\S+@\S+\.\S+$/.test(normalized)) {
    return null;
  }

  return normalized.slice(0, 191);
};

export const ensurePatronagePaymentConfigSchema = async () => {
  if (paymentConfigSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "InAccordPaymentConfig" (
      "id" varchar(32) primary key,
      "stripeSecretKey" text,
      "stripePublishableKey" text,
      "stripeWebhookSecret" text,
      "payoutAccountLabel" varchar(191),
      "payoutContactEmail" varchar(191),
      "payoutNotice" text,
      "updatedAt" timestamp(3) not null default now()
    )
  `);

  await db.execute(sql`
    insert into "InAccordPaymentConfig" ("id")
    values ('default')
    on conflict ("id") do nothing
  `);

  paymentConfigSchemaReady = true;
};

export const getPatronagePaymentConfig = async (): Promise<PatronagePaymentConfig> => {
  await ensurePatronagePaymentConfigSchema();

  const result = await db.execute(sql`
    select
      "stripeSecretKey" as "stripeSecretKey",
      "stripePublishableKey" as "stripePublishableKey",
      "stripeWebhookSecret" as "stripeWebhookSecret",
      "payoutAccountLabel" as "payoutAccountLabel",
      "payoutContactEmail" as "payoutContactEmail",
      "payoutNotice" as "payoutNotice",
      "updatedAt" as "updatedAt"
    from "InAccordPaymentConfig"
    where "id" = 'default'
    limit 1
  `);

  const row = ((result as unknown as { rows?: PatronagePaymentConfigRow[] }).rows ?? [])[0];

  return {
    stripeSecretKey: normalizeSecret(row?.stripeSecretKey),
    stripePublishableKey: normalizeSecret(row?.stripePublishableKey),
    stripeWebhookSecret: normalizeSecret(row?.stripeWebhookSecret),
    payoutAccountLabel: String(row?.payoutAccountLabel ?? "").trim().slice(0, 191) || null,
    payoutContactEmail: normalizeEmail(row?.payoutContactEmail),
    payoutNotice: String(row?.payoutNotice ?? "").trim().slice(0, 1200) || null,
    updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
};

export const getEffectivePatronageStripeConfig = async () => {
  const dbConfig = await getPatronagePaymentConfig();

  const envSecret = normalizeSecret(process.env.STRIPE_SECRET_KEY);
  const envPublishable = normalizeSecret(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const envWebhook = normalizeSecret(process.env.STRIPE_WEBHOOK_SECRET);

  return {
    secretKey: dbConfig.stripeSecretKey ?? envSecret,
    publishableKey: dbConfig.stripePublishableKey ?? envPublishable,
    webhookSecret: dbConfig.stripeWebhookSecret ?? envWebhook,
    payoutAccountLabel: dbConfig.payoutAccountLabel,
    payoutContactEmail: dbConfig.payoutContactEmail,
    payoutNotice: dbConfig.payoutNotice,
    updatedAt: dbConfig.updatedAt,
  };
};

export const updatePatronagePaymentConfig = async (updates: {
  stripeSecretKey?: string | null;
  stripePublishableKey?: string | null;
  stripeWebhookSecret?: string | null;
  payoutAccountLabel?: string | null;
  payoutContactEmail?: string | null;
  payoutNotice?: string | null;
}) => {
  await ensurePatronagePaymentConfigSchema();

  const clauses = [sql`"updatedAt" = now()`];

  if (Object.prototype.hasOwnProperty.call(updates, "stripeSecretKey")) {
    clauses.push(sql`"stripeSecretKey" = ${normalizeSecret(updates.stripeSecretKey)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "stripePublishableKey")) {
    clauses.push(sql`"stripePublishableKey" = ${normalizeSecret(updates.stripePublishableKey)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "stripeWebhookSecret")) {
    clauses.push(sql`"stripeWebhookSecret" = ${normalizeSecret(updates.stripeWebhookSecret)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "payoutAccountLabel")) {
    const payoutAccountLabel = String(updates.payoutAccountLabel ?? "").trim().slice(0, 191) || null;
    clauses.push(sql`"payoutAccountLabel" = ${payoutAccountLabel}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "payoutContactEmail")) {
    clauses.push(sql`"payoutContactEmail" = ${normalizeEmail(updates.payoutContactEmail)}`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "payoutNotice")) {
    const payoutNotice = String(updates.payoutNotice ?? "").trim().slice(0, 1200) || null;
    clauses.push(sql`"payoutNotice" = ${payoutNotice}`);
  }

  await db.execute(sql`
    update "InAccordPaymentConfig"
    set ${sql.join(clauses, sql`, `)}
    where "id" = 'default'
  `);

  return getPatronagePaymentConfig();
};
