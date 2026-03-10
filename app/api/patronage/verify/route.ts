import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import Stripe from "stripe";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import {
  ensurePatronageSchema,
  allowedPatronageDonationTypes,
  type PatronageDonationStatus,
  type PatronageDonationType,
} from "@/lib/patronage";
import { getEffectivePatronageStripeConfig } from "@/lib/patronage-payment-config";

const resolveStatusFromCheckoutSession = (
  session: Stripe.Checkout.Session
): PatronageDonationStatus => {
  if (session.payment_status === "paid") {
    return "SUCCEEDED";
  }

  if (session.status === "expired") {
    return "CANCELED";
  }

  return "PENDING";
};

const normalizeDonationType = (value: unknown): PatronageDonationType => {
  const normalized = String(value ?? "").trim().toUpperCase() as PatronageDonationType;
  return allowedPatronageDonationTypes.has(normalized) ? normalized : "ONE_TIME";
};

export async function GET(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const paymentConfig = await getEffectivePatronageStripeConfig();
    const stripeSecretKey = String(paymentConfig.secretKey ?? "").trim();

    if (!stripeSecretKey || !stripeSecretKey.startsWith("sk_")) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = String(searchParams.get("sessionId") ?? "").trim();

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    await ensurePatronageSchema();

    const stripe = new Stripe(stripeSecretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const metadataDonationId = String(session.metadata?.patronageDonationId ?? "").trim();
    const metadataDonorProfileId = String(session.metadata?.donorProfileId ?? "").trim();

    if (metadataDonorProfileId && metadataDonorProfileId !== profile.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const nextStatus = resolveStatusFromCheckoutSession(session);
    const donationType = normalizeDonationType(session.metadata?.donationType);
    const metadataAmount = Number(session.metadata?.amountCents);
    const amountCents = Number.isFinite(metadataAmount) && metadataAmount > 0
      ? Math.round(metadataAmount)
      : Math.max(0, Math.round(Number(session.amount_total ?? 0)));
    const currency = String(session.metadata?.currency ?? session.currency ?? "USD")
      .trim()
      .toUpperCase()
      .slice(0, 16) || "USD";
    const payerName = String(session.metadata?.payerName ?? profile.name ?? "").trim().slice(0, 120) || null;
    const payerEmail = String(session.metadata?.payerEmail ?? profile.email ?? "").trim().slice(0, 320) || null;
    const note = String(session.metadata?.note ?? "").trim().slice(0, 500) || null;

    const updateByIdResult = metadataDonationId
      ? await db.execute(sql`
          update "PatronageDonation"
          set
            "status" = ${nextStatus},
            "processedAt" = case
              when ${nextStatus} in ('SUCCEEDED', 'FAILED', 'CANCELED', 'REFUNDED') then now()
              else "processedAt"
            end,
            "updatedAt" = now()
          where "id" = ${metadataDonationId}
            and "donorProfileId" = ${profile.id}
          returning "id"
        `)
      : null;

    const updatedById = Boolean(
      (updateByIdResult as unknown as { rows?: Array<{ id: string }> } | null)?.rows?.[0]
    );

    if (!updatedById) {
      if (nextStatus === "SUCCEEDED") {
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
            ${metadataDonationId || crypto.randomUUID()},
            ${profile.id},
            ${payerName},
            ${payerEmail},
            ${donationType},
            ${nextStatus},
            ${amountCents},
            ${currency},
            ${"STRIPE_CHECKOUT"},
            ${sessionId},
            ${note},
            now(),
            now(),
            now()
          )
          on conflict ("id") do update
          set
            "status" = excluded."status",
            "providerReference" = excluded."providerReference",
            "processedAt" = now(),
            "updatedAt" = now()
        `);
      } else {
        await db.execute(sql`
          update "PatronageDonation"
          set
            "status" = ${nextStatus},
            "processedAt" = case
              when ${nextStatus} in ('FAILED', 'CANCELED', 'REFUNDED') then now()
              else "processedAt"
            end,
            "updatedAt" = now()
          where "providerReference" = ${sessionId}
            and "donorProfileId" = ${profile.id}
        `);
      }
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      status: nextStatus,
      donationId: metadataDonationId || null,
    });
  } catch (error) {
    console.error("[PATRONAGE_VERIFY_GET]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
