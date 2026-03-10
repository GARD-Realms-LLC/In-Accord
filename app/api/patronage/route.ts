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
import { getEffectiveSiteUrl } from "@/lib/runtime-site-url-config";

type PatronageRow = {
  id: string;
  donationType: PatronageDonationType;
  status: string;
  amountCents: number;
  currency: string;
  note: string | null;
  createdAt: string | null;
};

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensurePatronageSchema();

    const result = await db.execute(sql`
      select
        p."id" as "id",
        p."donationType" as "donationType",
        p."status" as "status",
        p."amountCents" as "amountCents",
        p."currency" as "currency",
        p."note" as "note",
        p."createdAt" as "createdAt"
      from "PatronageDonation" p
      where p."donorProfileId" = ${profile.id}
      order by p."createdAt" desc
      limit 50
    `);

    const rows = (result as unknown as { rows?: PatronageRow[] }).rows ?? [];

    return NextResponse.json({
      entries: rows,
    });
  } catch (error) {
    console.error("[PATRONAGE_GET]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensurePatronageSchema();

    const body = (await req.json().catch(() => ({}))) as {
      donationType?: string;
      amountCents?: number | string;
      currency?: string;
      note?: string;
      payerName?: string;
      payerEmail?: string;
    };

    const donationType = String(body.donationType ?? "").trim().toUpperCase() as PatronageDonationType;
    const parsedAmount = Number(body.amountCents);
    const amountCents = Number.isFinite(parsedAmount) ? Math.round(parsedAmount) : NaN;
    const currency = String(body.currency ?? "USD").trim().toUpperCase().slice(0, 16) || "USD";
    const note = String(body.note ?? "").trim().slice(0, 500);
    const payerName = String(body.payerName ?? "").trim().slice(0, 120);
    const payerEmail = String(body.payerEmail ?? "").trim().slice(0, 320);

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

    if (amountCents > 100_000_000) {
      return NextResponse.json({ error: "Amount is too large" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const paymentConfig = await getEffectivePatronageStripeConfig();
    const stripeSecretKey = String(paymentConfig.secretKey ?? "").trim();
    const stripeEnabled = Boolean(stripeSecretKey && stripeSecretKey.startsWith("sk_"));

    let provider = "IN_APP";
    let providerReference: string | null = null;
    let checkoutUrl: string | null = null;

    if (stripeEnabled) {
      const stripe = new Stripe(stripeSecretKey);
      const requestUrl = new URL(req.url);
      const appOrigin = await getEffectiveSiteUrl(requestUrl.origin);

      const session = await stripe.checkout.sessions.create({
        mode: donationType === "MONTHLY" ? "subscription" : "payment",
        customer_email: payerEmail || profile.email || undefined,
        success_url: `${appOrigin}/?patronage=success&patronageSessionId={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appOrigin}/?patronage=cancel`,
        metadata: {
          patronageDonationId: id,
          donorProfileId: profile.id,
          donationType,
          payerName,
          payerEmail,
          amountCents: String(amountCents),
          currency,
          note,
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: currency.toLowerCase(),
              unit_amount: amountCents,
              product_data: {
                name: donationType === "MONTHLY" ? "In-Accord Monthly Patronage" : "In-Accord One-Time Patronage",
                description: note || "Support In-Accord",
              },
              ...(donationType === "MONTHLY" ? { recurring: { interval: "month" as const } } : {}),
            },
          },
        ],
      });

      provider = "STRIPE_CHECKOUT";
      providerReference = session.id;
      checkoutUrl = session.url ?? null;
    } else {
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
          ${profile.id},
          ${payerName || profile.name || null},
          ${payerEmail || profile.email || null},
          ${donationType},
          ${"SUCCEEDED"},
          ${amountCents},
          ${currency},
          ${provider},
          ${providerReference},
          ${note || null},
          now(),
          now(),
          now()
        )
      `);
    }

    return NextResponse.json({
      ok: true,
      entry: {
        id,
        donationType,
        status: stripeEnabled ? "PENDING" : "SUCCEEDED",
        amountCents,
        currency,
        note: note || null,
      },
      requiresRedirect: Boolean(checkoutUrl),
      checkoutUrl,
      checkoutSessionId: providerReference,
      provider,
    });
  } catch (error) {
    console.error("[PATRONAGE_POST]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensurePatronageSchema();

    const body = (await req.json().catch(() => ({}))) as {
      id?: string;
    };

    const id = String(body.id ?? "").trim();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const existingResult = await db.execute(sql`
      select
        p."id" as "id",
        p."status" as "status",
        p."provider" as "provider",
        p."providerReference" as "providerReference"
      from "PatronageDonation" p
      where p."id" = ${id}
        and p."donorProfileId" = ${profile.id}
      limit 1
    `);

    const existing = (existingResult as unknown as {
      rows?: Array<{
        id: string;
        status: string;
        provider: string | null;
        providerReference: string | null;
      }>;
    }).rows?.[0];

    if (!existing) {
      return NextResponse.json({ error: "Patronage record not found" }, { status: 404 });
    }

    const currentStatus = String(existing.status ?? "").trim().toUpperCase();
    if (currentStatus !== "PENDING") {
      return NextResponse.json({ error: "Only pending patronage can be canceled" }, { status: 400 });
    }

    const provider = String(existing.provider ?? "").trim().toUpperCase();
    const providerReference = String(existing.providerReference ?? "").trim();

    if (provider === "STRIPE_CHECKOUT" && providerReference) {
      try {
        const paymentConfig = await getEffectivePatronageStripeConfig();
        const stripeSecretKey = String(paymentConfig.secretKey ?? "").trim();
        if (stripeSecretKey && stripeSecretKey.startsWith("sk_")) {
          const stripe = new Stripe(stripeSecretKey);
          await stripe.checkout.sessions.expire(providerReference);
        }
      } catch (error) {
        console.error("[PATRONAGE_PATCH_STRIPE_EXPIRE]", error);
      }
    }

    await db.execute(sql`
      update "PatronageDonation"
      set
        "status" = ${"CANCELED"},
        "processedAt" = now(),
        "updatedAt" = now()
      where "id" = ${id}
        and "donorProfileId" = ${profile.id}
    `);

    return NextResponse.json({
      ok: true,
      id,
      status: "CANCELED",
    });
  } catch (error) {
    console.error("[PATRONAGE_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
