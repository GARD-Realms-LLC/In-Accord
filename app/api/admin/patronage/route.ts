import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import {
  allowedPatronageDonationStatuses,
  allowedPatronageDonationTypes,
  ensurePatronageSchema,
  type PatronageDonationStatus,
  type PatronageDonationType,
} from "@/lib/patronage";

type PatronageDonationRow = {
  id: string;
  donorProfileId: string | null;
  donorName: string | null;
  donorEmail: string | null;
  donationType: string;
  status: string;
  amountCents: number | string;
  currency: string | null;
  provider: string | null;
  providerReference: string | null;
  note: string | null;
  processedAt: Date | string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
};

const normalizeStatus = (value: unknown): PatronageDonationStatus | null => {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!allowedPatronageDonationStatuses.has(normalized as PatronageDonationStatus)) {
    return null;
  }

  return normalized as PatronageDonationStatus;
};

const normalizeType = (value: unknown): PatronageDonationType | null => {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!allowedPatronageDonationTypes.has(normalized as PatronageDonationType)) {
    return null;
  }

  return normalized as PatronageDonationType;
};

const normalizeCurrency = (value: unknown) => {
  const normalized = String(value ?? "USD").trim().toUpperCase();
  if (!/^[A-Z]{3,8}$/.test(normalized)) {
    return null;
  }

  return normalized;
};

export async function GET(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    await ensurePatronageSchema();

    const { searchParams } = new URL(req.url);
    const typeFilter = String(searchParams.get("type") ?? "ALL").trim().toUpperCase();
    const statusFilter = String(searchParams.get("status") ?? "ALL").trim().toUpperCase();
    const searchQuery = String(searchParams.get("search") ?? "").trim().toLowerCase();

    const typeSql =
      typeFilter !== "ALL" && allowedPatronageDonationTypes.has(typeFilter as PatronageDonationType)
        ? sql`and p."donationType" = ${typeFilter}`
        : sql``;

    const statusSql =
      statusFilter !== "ALL" && allowedPatronageDonationStatuses.has(statusFilter as PatronageDonationStatus)
        ? sql`and p."status" = ${statusFilter}`
        : sql``;

    const searchSql = searchQuery
      ? sql`
          and (
            lower(coalesce(p."donorName", '')) like ${`%${searchQuery}%`}
            or lower(coalesce(p."donorEmail", '')) like ${`%${searchQuery}%`}
            or lower(coalesce(p."provider", '')) like ${`%${searchQuery}%`}
            or lower(coalesce(p."providerReference", '')) like ${`%${searchQuery}%`}
            or lower(coalesce(p."note", '')) like ${`%${searchQuery}%`}
            or lower(p."id") like ${`%${searchQuery}%`}
          )
        `
      : sql``;

    const result = await db.execute(sql`
      select
        p."id" as "id",
        p."donorProfileId" as "donorProfileId",
        p."donorName" as "donorName",
        p."donorEmail" as "donorEmail",
        p."donationType" as "donationType",
        p."status" as "status",
        p."amountCents" as "amountCents",
        p."currency" as "currency",
        p."provider" as "provider",
        p."providerReference" as "providerReference",
        p."note" as "note",
        p."processedAt" as "processedAt",
        p."createdAt" as "createdAt",
        p."updatedAt" as "updatedAt"
      from "PatronageDonation" p
      where 1=1
      ${typeSql}
      ${statusSql}
      ${searchSql}
      order by p."createdAt" desc
      limit 500
    `);

    const entries = ((result as unknown as { rows?: PatronageDonationRow[] }).rows ?? []).map((row) => ({
      id: row.id,
      donorProfileId: row.donorProfileId,
      donorName: row.donorName,
      donorEmail: row.donorEmail,
      donationType: normalizeType(row.donationType) ?? "ONE_TIME",
      status: normalizeStatus(row.status) ?? "PENDING",
      amountCents: Number(row.amountCents ?? 0),
      currency: normalizeCurrency(row.currency) ?? "USD",
      provider: row.provider,
      providerReference: row.providerReference,
      note: row.note,
      processedAt: row.processedAt ? new Date(row.processedAt).toISOString() : null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    }));

    const summary = {
      totalRecords: entries.length,
      oneTimeCount: entries.filter((entry) => entry.donationType === "ONE_TIME").length,
      monthlyCount: entries.filter((entry) => entry.donationType === "MONTHLY").length,
      successfulAmountCents: entries
        .filter((entry) => entry.status === "SUCCEEDED")
        .reduce((sum, entry) => sum + entry.amountCents, 0),
      monthlyRecurringAmountCents: entries
        .filter((entry) => entry.donationType === "MONTHLY" && entry.status === "SUCCEEDED")
        .reduce((sum, entry) => sum + entry.amountCents, 0),
    };

    return NextResponse.json({ entries, summary });
  } catch (error) {
    console.error("[ADMIN_PATRONAGE_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    await ensurePatronageSchema();

    const body = (await req.json().catch(() => ({}))) as {
      donorProfileId?: unknown;
      donorName?: unknown;
      donorEmail?: unknown;
      donationType?: unknown;
      status?: unknown;
      amountCents?: unknown;
      currency?: unknown;
      provider?: unknown;
      providerReference?: unknown;
      note?: unknown;
    };

    const donorProfileId = String(body.donorProfileId ?? "").trim() || null;
    const donorName = String(body.donorName ?? "").trim().slice(0, 191) || null;
    const donorEmail = String(body.donorEmail ?? "").trim().toLowerCase().slice(0, 191) || null;
    const donationType = normalizeType(body.donationType);
    const status = normalizeStatus(body.status) ?? "SUCCEEDED";
    const amountCents = Number(body.amountCents ?? 0);
    const currency = normalizeCurrency(body.currency) ?? "USD";
    const provider = String(body.provider ?? "").trim().slice(0, 64) || null;
    const providerReference = String(body.providerReference ?? "").trim().slice(0, 191) || null;
    const note = String(body.note ?? "").trim().slice(0, 4000) || null;

    if (!donationType) {
      return new NextResponse("donationType must be ONE_TIME or MONTHLY", { status: 400 });
    }

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return new NextResponse("amountCents must be a positive number", { status: 400 });
    }

    if (amountCents > 100_000_000) {
      return new NextResponse("amountCents is too large", { status: 400 });
    }

    const id = `pat_${crypto.randomUUID()}`;
    const now = new Date();

    await db.execute(sql`
      insert into "PatronageDonation" (
        "id",
        "donorProfileId",
        "donorName",
        "donorEmail",
        "donationType",
        "status",
        "amountCents",
        "currency",
        "provider",
        "providerReference",
        "note",
        "processedAt",
        "createdAt",
        "updatedAt"
      )
      values (
        ${id},
        ${donorProfileId},
        ${donorName},
        ${donorEmail},
        ${donationType},
        ${status},
        ${Math.round(amountCents)},
        ${currency},
        ${provider},
        ${providerReference},
        ${note},
        ${status === "SUCCEEDED" ? now : null},
        ${now},
        ${now}
      )
    `);

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("[ADMIN_PATRONAGE_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    await ensurePatronageSchema();

    const body = (await req.json().catch(() => ({}))) as {
      id?: unknown;
      status?: unknown;
      note?: unknown;
      providerReference?: unknown;
    };

    const id = String(body.id ?? "").trim();
    const status = normalizeStatus(body.status);
    const hasNote = Object.prototype.hasOwnProperty.call(body, "note");
    const hasProviderReference = Object.prototype.hasOwnProperty.call(body, "providerReference");
    const note = hasNote ? String(body.note ?? "").trim().slice(0, 4000) : null;
    const providerReference = hasProviderReference
      ? String(body.providerReference ?? "").trim().slice(0, 191)
      : null;

    if (!id) {
      return new NextResponse("id is required", { status: 400 });
    }

    if (!status && !hasNote && !hasProviderReference) {
      return new NextResponse("No updates supplied", { status: 400 });
    }

    const updateClauses = [sql`"updatedAt" = now()`];

    if (status) {
      updateClauses.push(sql`"status" = ${status}`);
      updateClauses.push(sql`"processedAt" = ${status === "SUCCEEDED" ? sql`now()` : null}`);
    }

    if (hasNote) {
      updateClauses.push(sql`"note" = ${note || null}`);
    }

    if (hasProviderReference) {
      updateClauses.push(sql`"providerReference" = ${providerReference || null}`);
    }

    await db.execute(sql`
      update "PatronageDonation"
      set ${sql.join(updateClauses, sql`, `)}
      where "id" = ${id}
    `);

    return NextResponse.json({ ok: true, id, status: status ?? null });
  } catch (error) {
    console.error("[ADMIN_PATRONAGE_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
