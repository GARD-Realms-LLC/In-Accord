import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import {
  getEffectivePatronageStripeConfig,
  updatePatronagePaymentConfig,
} from "@/lib/patronage-payment-config";

const maskSecret = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= 8) {
    return "••••••••";
  }

  return `${normalized.slice(0, 4)}••••••••${normalized.slice(-4)}`;
};

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const config = await getEffectivePatronageStripeConfig();

    return NextResponse.json({
      setup: {
        hasStripeSecretKey: Boolean(config.secretKey && config.secretKey.startsWith("sk_")),
        hasStripePublishableKey: Boolean(config.publishableKey && config.publishableKey.startsWith("pk_")),
        hasStripeWebhookSecret: Boolean(config.webhookSecret),
        stripeSecretKeyPreview: maskSecret(config.secretKey),
        stripePublishableKeyPreview: maskSecret(config.publishableKey),
        stripeWebhookSecretPreview: maskSecret(config.webhookSecret),
        payoutAccountLabel: config.payoutAccountLabel,
        payoutContactEmail: config.payoutContactEmail,
        payoutNotice: config.payoutNotice,
        updatedAt: config.updatedAt,
      },
    });
  } catch (error) {
    console.error("[ADMIN_PATRONAGE_SETTINGS_GET]", error);
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

    const body = (await req.json().catch(() => ({}))) as {
      stripeSecretKey?: unknown;
      stripePublishableKey?: unknown;
      stripeWebhookSecret?: unknown;
      payoutAccountLabel?: unknown;
      payoutContactEmail?: unknown;
      payoutNotice?: unknown;
    };

    const toOptionalValue = (value: unknown) => {
      if (value === undefined) {
        return undefined;
      }

      return String(value ?? "").trim() || null;
    };

    const next = await updatePatronagePaymentConfig({
      stripeSecretKey: toOptionalValue(body.stripeSecretKey),
      stripePublishableKey: toOptionalValue(body.stripePublishableKey),
      stripeWebhookSecret: toOptionalValue(body.stripeWebhookSecret),
      payoutAccountLabel: toOptionalValue(body.payoutAccountLabel),
      payoutContactEmail: toOptionalValue(body.payoutContactEmail),
      payoutNotice: toOptionalValue(body.payoutNotice),
    });

    return NextResponse.json({
      ok: true,
      setup: {
        hasStripeSecretKey: Boolean(next.stripeSecretKey && next.stripeSecretKey.startsWith("sk_")),
        hasStripePublishableKey: Boolean(next.stripePublishableKey && next.stripePublishableKey.startsWith("pk_")),
        hasStripeWebhookSecret: Boolean(next.stripeWebhookSecret),
        stripeSecretKeyPreview: maskSecret(next.stripeSecretKey),
        stripePublishableKeyPreview: maskSecret(next.stripePublishableKey),
        stripeWebhookSecretPreview: maskSecret(next.stripeWebhookSecret),
        payoutAccountLabel: next.payoutAccountLabel,
        payoutContactEmail: next.payoutContactEmail,
        payoutNotice: next.payoutNotice,
        updatedAt: next.updatedAt,
      },
    });
  } catch (error) {
    console.error("[ADMIN_PATRONAGE_SETTINGS_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
