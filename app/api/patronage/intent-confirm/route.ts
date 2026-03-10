import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import Stripe from "stripe";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import {
  allowedPatronageDonationTypes,
  ensurePatronageSchema,
  type PatronageDonationType,
} from "@/lib/patronage";
import { getEffectivePatronageStripeConfig } from "@/lib/patronage-payment-config";

const normalizeDonationType = (value: unknown): PatronageDonationType => {
  const normalized = String(value ?? "").trim().toUpperCase() as PatronageDonationType;
  return allowedPatronageDonationTypes.has(normalized) ? normalized : "ONE_TIME";
};

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      paymentIntentId?: string;
    };

    const paymentIntentId = String(body.paymentIntentId ?? "").trim();

    if (!paymentIntentId) {
      return NextResponse.json({ error: "paymentIntentId is required" }, { status: 400 });
    }

    const paymentConfig = await getEffectivePatronageStripeConfig();
    const stripeSecretKey = String(paymentConfig.secretKey ?? "").trim();

    if (!stripeSecretKey || !stripeSecretKey.startsWith("sk_")) {
      return NextResponse.json({ error: "Stripe secret key is not configured" }, { status: 400 });
    }

    await ensurePatronageSchema();

    const stripe = new Stripe(stripeSecretKey);
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    const donorProfileId = String(intent.metadata?.donorProfileId ?? "").trim();
    if (!donorProfileId || donorProfileId !== profile.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (intent.status !== "succeeded") {
      return NextResponse.json({
        ok: true,
        status: intent.status,
      });
    }

    const donationId = String(intent.metadata?.patronageDonationId ?? "").trim() || crypto.randomUUID();
    const donationType = normalizeDonationType(intent.metadata?.donationType);
    const metadataAmount = Number(intent.metadata?.amountCents);
    const amountCents = Number.isFinite(metadataAmount) && metadataAmount > 0
      ? Math.round(metadataAmount)
      : Math.max(0, Math.round(Number(intent.amount ?? 0)));
    const currency = String(intent.metadata?.currency ?? intent.currency ?? "USD")
      .trim()
      .toUpperCase()
      .slice(0, 16) || "USD";
    const payerName = String(intent.metadata?.payerName ?? profile.name ?? "").trim().slice(0, 120) || null;
    const payerEmail = String(intent.metadata?.payerEmail ?? profile.email ?? "").trim().slice(0, 320) || null;
    const note = String(intent.metadata?.note ?? "").trim().slice(0, 500) || null;

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
        ${profile.id},
        ${payerName},
        ${payerEmail},
        ${donationType},
        ${"SUCCEEDED"},
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

    return NextResponse.json({
      ok: true,
      status: "SUCCEEDED",
      donationId,
    });
  } catch (error) {
    console.error("[PATRONAGE_INTENT_CONFIRM_POST]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
