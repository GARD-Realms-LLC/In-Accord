import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { randomBytes, randomUUID } from "crypto";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WebhookRow = {
  id: string;
  name: string;
  endpointUrl: string;
  eventType: string;
  serverId: string | null;
  serverName: string | null;
  enabled: boolean | null;
  secretKey: string;
  createdByProfileId: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
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

const normalizeName = (value: unknown) => String(value ?? "").trim().slice(0, 120);
const normalizeEventType = (value: unknown) =>
  String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 80);

const normalizeServerId = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "GLOBAL") {
    return null;
  }

  return raw.slice(0, 191);
};

const normalizeEndpointUrl = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) {
    return "";
  }

  return raw.slice(0, 600);
};

const makeSecret = () => `whsec_${randomBytes(24).toString("hex")}`;

const toIso = (value: Date | string | null) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const toWebhookDto = (row: WebhookRow) => ({
  id: row.id,
  name: row.name,
  endpointUrl: row.endpointUrl,
  eventType: row.eventType,
  serverId: row.serverId,
  serverName: row.serverName,
  enabled: row.enabled !== false,
  secretPreview: row.secretKey ? `${row.secretKey.slice(0, 10)}...${row.secretKey.slice(-6)}` : "N/A",
  createdByProfileId: row.createdByProfileId,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

const ensureAdmin = async () => {
  const profile = await currentProfile();

  if (!profile) {
    return { ok: false as const, response: new NextResponse("Unauthorized", { status: 401 }) };
  }

  if (!hasInAccordAdministrativeAccess(profile.role)) {
    return { ok: false as const, response: new NextResponse("Forbidden", { status: 403 }) };
  }

  return { ok: true as const, profile };
};

export async function GET() {
  try {
    const auth = await ensureAdmin();
    if (!auth.ok) {
      return auth.response;
    }

    await ensureWebhookSchema();

    const result = await db.execute(sql`
      select
        w."id" as "id",
        w."name" as "name",
        w."endpointUrl" as "endpointUrl",
        w."eventType" as "eventType",
        w."serverId" as "serverId",
        s."name" as "serverName",
        w."enabled" as "enabled",
        w."secretKey" as "secretKey",
        w."createdByProfileId" as "createdByProfileId",
        w."createdAt" as "createdAt",
        w."updatedAt" as "updatedAt"
      from "InAccordWebhook" w
      left join "Server" s on s."id" = w."serverId"
      order by coalesce(w."updatedAt", w."createdAt") desc
    `);

    const rows = (result as unknown as { rows?: WebhookRow[] }).rows ?? [];

    return NextResponse.json({
      webhooks: rows.map(toWebhookDto),
    });
  } catch (error) {
    console.error("[ADMIN_WEBHOOKS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await ensureAdmin();
    if (!auth.ok) {
      return auth.response;
    }

    await ensureWebhookSchema();

    const body = (await request.json().catch(() => null)) as {
      name?: string;
      endpointUrl?: string;
      eventType?: string;
      serverId?: string | null;
    } | null;

    const name = normalizeName(body?.name);
    const endpointUrl = normalizeEndpointUrl(body?.endpointUrl);
    const eventType = normalizeEventType(body?.eventType) || "MESSAGE_CREATE";
    const serverId = normalizeServerId(body?.serverId);

    if (!name) {
      return new NextResponse("Webhook name is required.", { status: 400 });
    }

    if (!endpointUrl) {
      return new NextResponse("Webhook endpoint URL must start with http:// or https://", { status: 400 });
    }

    if (serverId) {
      const serverResult = await db.execute(sql`
        select "id"
        from "Server"
        where "id" = ${serverId}
        limit 1
      `);
      const serverExists = Boolean((serverResult as unknown as { rows?: Array<{ id: string }> }).rows?.[0]);
      if (!serverExists) {
        return new NextResponse("Selected server was not found.", { status: 404 });
      }
    }

    const id = randomUUID();
    const secretKey = makeSecret();

    await db.execute(sql`
      insert into "InAccordWebhook" (
        "id",
        "name",
        "endpointUrl",
        "eventType",
        "serverId",
        "enabled",
        "secretKey",
        "createdByProfileId",
        "createdAt",
        "updatedAt"
      )
      values (
        ${id},
        ${name},
        ${endpointUrl},
        ${eventType},
        ${serverId},
        ${true},
        ${secretKey},
        ${auth.profile.id},
        ${new Date()},
        ${new Date()}
      )
    `);

    return NextResponse.json({
      ok: true,
      webhook: {
        id,
        name,
        endpointUrl,
        eventType,
        serverId,
        enabled: true,
      },
      secretKey,
    });
  } catch (error) {
    console.error("[ADMIN_WEBHOOKS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await ensureAdmin();
    if (!auth.ok) {
      return auth.response;
    }

    await ensureWebhookSchema();

    const body = (await request.json().catch(() => null)) as {
      webhookId?: string;
      action?: "toggle" | "rotate-secret";
      enabled?: boolean;
    } | null;

    const webhookId = String(body?.webhookId ?? "").trim();
    const action = body?.action;

    if (!webhookId || !action) {
      return new NextResponse("webhookId and action are required.", { status: 400 });
    }

    if (action === "toggle") {
      const enabled = body?.enabled !== false;

      await db.execute(sql`
        update "InAccordWebhook"
        set "enabled" = ${enabled},
            "updatedAt" = now()
        where "id" = ${webhookId}
      `);

      return NextResponse.json({ ok: true, enabled });
    }

    if (action === "rotate-secret") {
      const secretKey = makeSecret();

      await db.execute(sql`
        update "InAccordWebhook"
        set "secretKey" = ${secretKey},
            "updatedAt" = now()
        where "id" = ${webhookId}
      `);

      return NextResponse.json({ ok: true, secretKey });
    }

    return new NextResponse("Unsupported action.", { status: 400 });
  } catch (error) {
    console.error("[ADMIN_WEBHOOKS_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await ensureAdmin();
    if (!auth.ok) {
      return auth.response;
    }

    await ensureWebhookSchema();

    const { searchParams } = new URL(request.url);
    const webhookId = String(searchParams.get("webhookId") ?? "").trim();

    if (!webhookId) {
      return new NextResponse("webhookId is required.", { status: 400 });
    }

    await db.execute(sql`
      delete from "InAccordWebhook"
      where "id" = ${webhookId}
    `);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ADMIN_WEBHOOKS_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
