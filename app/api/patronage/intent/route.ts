import { NextResponse } from "next/server";
import Stripe from "stripe";

import { currentProfile } from "@/lib/current-profile";
import { allowedPatronageDonationTypes, type PatronageDonationType } from "@/lib/patronage";
import { getEffectivePatronageStripeConfig } from "@/lib/patronage-payment-config";

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      donationType?: string;
      amountCents?: number | string;
      currency?: string;
      note?: string;
      payerName?: string;
      payerEmail?: string;
    };

    const donationType = String(body.donationType ?? "").trim().toUpperCase() as PatronageDonationType;
    const amountCents = Math.round(Number(body.amountCents));
    const currency = String(body.currency ?? "USD").trim().toUpperCase().slice(0, 16) || "USD";
    const payerName = String(body.payerName ?? "").trim().slice(0, 120);
    const payerEmail = String(body.payerEmail ?? "").trim().slice(0, 320);
    const note = String(body.note ?? "").trim().slice(0, 500);

    if (!allowedPatronageDonationTypes.has(donationType)) {
      return NextResponse.json({ error: "Invalid donationType" }, { status: 400 });
    }

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: "Invalid amountCents" }, { status: 400 });
    }

    if (!payerName) {
      return NextResponse.json({ error: "payerName is required" }, { status: 400 });
    }

    if (!payerEmail || !/^\S+@\S+\.\S+$/.test(payerEmail)) {
      return NextResponse.json({ error: "payerEmail is invalid" }, { status: 400 });
    }

    const paymentConfig = await getEffectivePatronageStripeConfig();
    const stripeSecretKey = String(paymentConfig.secretKey ?? "").trim();
    const stripePublishableKey = String(paymentConfig.publishableKey ?? "").trim();

    if (!stripeSecretKey || !stripeSecretKey.startsWith("sk_")) {
      return NextResponse.json({ error: "Stripe secret key is not configured" }, { status: 400 });
    }

    if (!stripePublishableKey || !stripePublishableKey.startsWith("pk_")) {
      return NextResponse.json({ error: "Stripe publishable key is not configured" }, { status: 400 });
    }

    const donationId = crypto.randomUUID();
    const stripe = new Stripe(stripeSecretKey);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: currency.toLowerCase(),
      receipt_email: payerEmail,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        patronageDonationId: donationId,
        donorProfileId: profile.id,
        donationType,
        payerName,
        payerEmail,
        amountCents: String(amountCents),
        currency,
        note,
      },
      description: donationType === "MONTHLY"
        ? "In-Accord Monthly Patronage"
        : "In-Accord One-Time Patronage",
    });

    if (!paymentIntent.client_secret) {
      return NextResponse.json({ error: "Could not initialize payment form" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      publishableKey: stripePublishableKey,
      donationId,
    });
  } catch (error) {
    console.error("[PATRONAGE_INTENT_POST]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
