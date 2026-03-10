import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import Stripe from "stripe";

import {
  ensurePatronageSchema,
  allowedPatronageDonationTypes,
  type PatronageDonationStatus,
  type PatronageDonationType,
} from "@/lib/patronage";
import { db } from "@/lib/db";
import { getEffectivePatronageStripeConfig } from "@/lib/patronage-payment-config";

const normalizeDonationType = (value: unknown): PatronageDonationType => {
  const normalized = String(value ?? "").trim().toUpperCase() as PatronageDonationType;
  return allowedPatronageDonationTypes.has(normalized) ? normalized : "ONE_TIME";
};

const upsertPatronageFromSession = async (
  session: Stripe.Checkout.Session,
  status: PatronageDonationStatus
) => {
  const donationId = String(session.metadata?.patronageDonationId ?? "").trim() || crypto.randomUUID();
  const donorProfileId = String(session.metadata?.donorProfileId ?? "").trim();
  if (!donorProfileId) {
    return;
  }

  const donationType = normalizeDonationType(session.metadata?.donationType);
  const metadataAmount = Number(session.metadata?.amountCents);
  const amountCents = Number.isFinite(metadataAmount) && metadataAmount > 0
    ? Math.round(metadataAmount)
    : Math.max(0, Math.round(Number(session.amount_total ?? 0)));
  const currency = String(session.metadata?.currency ?? session.currency ?? "USD")
    .trim()
    .toUpperCase()
    .slice(0, 16) || "USD";
  const payerName = String(session.metadata?.payerName ?? "").trim().slice(0, 120) || null;
  const payerEmail = String(session.metadata?.payerEmail ?? "").trim().slice(0, 320) || null;
  const note = String(session.metadata?.note ?? "").trim().slice(0, 500) || null;

  if (status === "SUCCEEDED") {
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
        ${donationId},
        ${donorProfileId},
        ${payerName},
        ${payerEmail},
        ${donationType},
        ${status},
        ${amountCents},
        ${currency},
        ${"STRIPE_CHECKOUT"},
        ${session.id},
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
    return;
  }

  await db.execute(sql`
    update "PatronageDonation"
    set
      "status" = ${status},
      "processedAt" = case
        when ${status} in ('FAILED', 'CANCELED', 'REFUNDED') then now()
        else "processedAt"
      end,
      "updatedAt" = now()
    where (
      "id" = ${donationId}
      or "providerReference" = ${session.id}
    )
      and "donorProfileId" = ${donorProfileId}
  `);
};

const upsertPatronageFromIntent = async (
  intent: Stripe.PaymentIntent,
  status: PatronageDonationStatus
) => {
  const donationId = String(intent.metadata?.patronageDonationId ?? "").trim() || crypto.randomUUID();
  const donorProfileId = String(intent.metadata?.donorProfileId ?? "").trim();
  if (!donorProfileId) {
    return;
  }

  const donationType = normalizeDonationType(intent.metadata?.donationType);
  const metadataAmount = Number(intent.metadata?.amountCents);
  const amountCents = Number.isFinite(metadataAmount) && metadataAmount > 0
    ? Math.round(metadataAmount)
    : Math.max(0, Math.round(Number(intent.amount ?? 0)));
  const currency = String(intent.metadata?.currency ?? intent.currency ?? "USD")
    .trim()
    .toUpperCase()
    .slice(0, 16) || "USD";
  const payerName = String(intent.metadata?.payerName ?? "").trim().slice(0, 120) || null;
  const payerEmail = String(intent.metadata?.payerEmail ?? "").trim().slice(0, 320) || null;
  const note = String(intent.metadata?.note ?? "").trim().slice(0, 500) || null;

  if (status === "SUCCEEDED") {
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
        ${donationId},
        ${donorProfileId},
        ${payerName},
        ${payerEmail},
        ${donationType},
        ${status},
        ${amountCents},
        ${currency},
        ${"STRIPE_INTENT"},
        ${intent.id},
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
    return;
  }

  await db.execute(sql`
    update "PatronageDonation"
    set
      "status" = ${status},
      "processedAt" = case
        when ${status} in ('FAILED', 'CANCELED', 'REFUNDED') then now()
        else "processedAt"
      end,
      "updatedAt" = now()
    where (
      "id" = ${donationId}
      or "providerReference" = ${intent.id}
    )
      and "donorProfileId" = ${donorProfileId}
  `);
};

const resolveCompletedSessionStatus = (session: Stripe.Checkout.Session): PatronageDonationStatus => {
  return session.payment_status === "paid" ? "SUCCEEDED" : "PENDING";
};

export async function POST(req: Request) {
  try {
    const paymentConfig = await getEffectivePatronageStripeConfig();
    const stripeSecretKey = String(paymentConfig.secretKey ?? "").trim();
    const webhookSecret = String(paymentConfig.webhookSecret ?? "").trim();

    if (!stripeSecretKey || !stripeSecretKey.startsWith("sk_") || !webhookSecret) {
      return NextResponse.json({ error: "Stripe webhook is not configured" }, { status: 400 });
    }

    await ensurePatronageSchema();

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
    }

    const stripe = new Stripe(stripeSecretKey);
    const rawBody = await req.text();

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid webhook signature";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await upsertPatronageFromSession(session, resolveCompletedSessionStatus(session));
        break;
      }
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        await upsertPatronageFromSession(session, "SUCCEEDED");
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await upsertPatronageFromSession(session, "FAILED");
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        await upsertPatronageFromSession(session, "CANCELED");
        break;
      }
      case "payment_intent.succeeded": {
        const intent = event.data.object as Stripe.PaymentIntent;
        await upsertPatronageFromIntent(intent, "SUCCEEDED");
        break;
      }
      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        await upsertPatronageFromIntent(intent, "FAILED");
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[PATRONAGE_WEBHOOK_POST]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
