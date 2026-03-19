import { randomUUID, createHmac } from "crypto";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

type InAccordWebhookRow = {
  id: string;
  endpointUrl: string;
  eventType: string;
  serverId: string | null;
  enabled: boolean | null;
  secretKey: string;
};

export type InAccordSystemEventInput = {
  eventType: string;
  scope: "server-settings" | "user-settings" | "admin-controls" | string;
  actorProfileId?: string | null;
  actorUserId?: string | null;
  serverId?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

const ensureWebhookSchema = async () => {
  await db.execute(sql`
    create table if not exists "InAccordWebhook" (
      "id" varchar(191) primary key,
      "name" varchar(120) not null,
      "endpointUrl" varchar(600) not null,
      "eventType" varchar(80) not null,
      "serverId" varchar(191),
      "enabled" boolean not null default true,
      "secretKey" varchar(120) not null,
      "createdByProfileId" varchar(191),
      "createdAt" timestamp(3) not null default now(),
      "updatedAt" timestamp(3) not null default now()
    )
  `);

  await db.execute(sql`alter table "InAccordWebhook" add column if not exists "name" varchar(120)`);
  await db.execute(sql`alter table "InAccordWebhook" add column if not exists "endpointUrl" varchar(600)`);
  await db.execute(sql`alter table "InAccordWebhook" add column if not exists "eventType" varchar(80)`);
  await db.execute(sql`alter table "InAccordWebhook" add column if not exists "serverId" varchar(191)`);
  await db.execute(sql`alter table "InAccordWebhook" add column if not exists "enabled" boolean not null default true`);
  await db.execute(sql`alter table "InAccordWebhook" add column if not exists "secretKey" varchar(120)`);
  await db.execute(sql`alter table "InAccordWebhook" add column if not exists "createdByProfileId" varchar(191)`);
  await db.execute(sql`alter table "InAccordWebhook" add column if not exists "createdAt" timestamp(3) not null default now()`);
  await db.execute(sql`alter table "InAccordWebhook" add column if not exists "updatedAt" timestamp(3) not null default now()`);
};

const normalizeEventType = (value: string) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "")
    .slice(0, 80);

const normalizeServerId = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, 191) : null;
};

const signPayload = (payload: string, secret: string) => {
  const normalizedSecret = String(secret ?? "").trim();
  if (!normalizedSecret) {
    return "";
  }

  return createHmac("sha256", normalizedSecret).update(payload).digest("hex");
};

export const emitInAccordSystemEvent = async (input: InAccordSystemEventInput) => {
  const eventType = normalizeEventType(input.eventType);
  if (!eventType) {
    return;
  }

  try {
    await ensureWebhookSchema();
  } catch (error) {
    console.warn("[IN_ACCORD_EVENT_SCHEMA]", error);
    return;
  }

  const serverId = normalizeServerId(input.serverId);

  let hooksResult: unknown;
  try {
    hooksResult = await db.execute(sql`
      select
        w."id" as "id",
        w."endpointUrl" as "endpointUrl",
        w."eventType" as "eventType",
        w."serverId" as "serverId",
        w."enabled" as "enabled",
        w."secretKey" as "secretKey"
      from "InAccordWebhook" w
      where coalesce(w."enabled", true) = true
        and (
          upper(w."eventType") = ${eventType}
          or upper(w."eventType") = 'ALL'
          or w."eventType" = '*'
        )
        and (
          w."serverId" is null
          or ${serverId} is null
          or w."serverId" = ${serverId}
        )
    `);
  } catch (error) {
    console.warn("[IN_ACCORD_EVENT_QUERY]", error);
    return;
  }

  const hooks = (hooksResult as unknown as { rows?: InAccordWebhookRow[] }).rows ?? [];
  if (hooks.length === 0) {
    return;
  }

  const eventId = randomUUID();
  const occurredAt = new Date().toISOString();

  const payload = {
    eventId,
    eventType,
    scope: input.scope,
    actorProfileId: input.actorProfileId ?? null,
    actorUserId: input.actorUserId ?? null,
    serverId,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? {},
    occurredAt,
  };

  const payloadText = JSON.stringify(payload);

  await Promise.all(
    hooks.map(async (hook) => {
      const endpoint = String(hook.endpointUrl ?? "").trim();
      if (!endpoint) {
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const signature = signPayload(payloadText, hook.secretKey);
        await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-InAccord-Event-Id": eventId,
            "X-InAccord-Event-Type": eventType,
            ...(signature ? { "X-InAccord-Signature": signature } : {}),
          },
          body: payloadText,
          cache: "no-store",
          signal: controller.signal,
        });
      } catch {
        // Best-effort dispatch; intentionally do not fail the caller.
      } finally {
        clearTimeout(timeout);
      }
    })
  );
};
