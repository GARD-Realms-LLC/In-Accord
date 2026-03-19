import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import {
  getEffectiveIntegrationProviderCredentials,
  getIntegrationProviderRuntimeConfig,
  integrationProviderKeys,
  updateIntegrationProviderRuntimeConfig,
  type IntegrationProviderKey,
} from "@/lib/integration-provider-config";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const normalizeProvider = (value: unknown): IntegrationProviderKey | null => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return integrationProviderKeys.includes(normalized as IntegrationProviderKey)
    ? (normalized as IntegrationProviderKey)
    : null;
};

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

const toOptional = (value: unknown) => {
  if (value === undefined) {
    return undefined;
  }

  const normalized = String(value ?? "").trim();
  return normalized || null;
};

const buildSetupPayload = async () => {
  const runtime = await getIntegrationProviderRuntimeConfig();
  const effective = await getEffectiveIntegrationProviderCredentials();

  return {
    updatedAt: runtime.updatedAt,
    providers: {
      github: {
        key: "github",
        hasClientId: Boolean(effective.github.clientId),
        hasClientSecret: Boolean(effective.github.clientSecret),
        clientIdPreview: maskSecret(effective.github.clientId),
        clientSecretPreview: maskSecret(effective.github.clientSecret),
      },
      google: {
        key: "google",
        hasClientId: Boolean(effective.google.clientId),
        hasClientSecret: Boolean(effective.google.clientSecret),
        clientIdPreview: maskSecret(effective.google.clientId),
        clientSecretPreview: maskSecret(effective.google.clientSecret),
      },
      steam: {
        key: "steam",
        hasClientId: true,
        hasClientSecret: true,
        clientIdPreview: "Not required",
        clientSecretPreview: "Not required",
      },
      twitch: {
        key: "twitch",
        hasClientId: Boolean(effective.twitch.clientId),
        hasClientSecret: Boolean(effective.twitch.clientSecret),
        clientIdPreview: maskSecret(effective.twitch.clientId),
        clientSecretPreview: maskSecret(effective.twitch.clientSecret),
      },
      xbox: {
        key: "xbox",
        hasClientId: Boolean(effective.xbox.clientId),
        hasClientSecret: Boolean(effective.xbox.clientSecret),
        clientIdPreview: maskSecret(effective.xbox.clientId),
        clientSecretPreview: maskSecret(effective.xbox.clientSecret),
      },
      youtube: {
        key: "youtube",
        hasClientId: Boolean(effective.youtube.clientId),
        hasClientSecret: Boolean(effective.youtube.clientSecret),
        clientIdPreview: maskSecret(effective.youtube.clientId),
        clientSecretPreview: maskSecret(effective.youtube.clientSecret),
      },
    },
  };
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

    return NextResponse.json({
      setup: await buildSetupPayload(),
    });
  } catch (error) {
    console.error("[ADMIN_INTEGRATION_PROVIDER_SETTINGS_GET]", error);
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
      provider?: unknown;
      clientId?: unknown;
      clientSecret?: unknown;
    };

    const provider = normalizeProvider(body.provider);
    if (!provider || provider === "steam") {
      return new NextResponse("Invalid provider", { status: 400 });
    }

    const clientId = toOptional(body.clientId);
    const clientSecret = toOptional(body.clientSecret);

    if (provider === "github") {
      await updateIntegrationProviderRuntimeConfig({
        ...(clientId !== undefined ? { githubClientId: clientId } : {}),
        ...(clientSecret !== undefined ? { githubClientSecret: clientSecret } : {}),
      });
    } else if (provider === "google") {
      await updateIntegrationProviderRuntimeConfig({
        ...(clientId !== undefined ? { googleClientId: clientId } : {}),
        ...(clientSecret !== undefined ? { googleClientSecret: clientSecret } : {}),
      });
    } else if (provider === "twitch") {
      await updateIntegrationProviderRuntimeConfig({
        ...(clientId !== undefined ? { twitchClientId: clientId } : {}),
        ...(clientSecret !== undefined ? { twitchClientSecret: clientSecret } : {}),
      });
    } else if (provider === "xbox") {
      await updateIntegrationProviderRuntimeConfig({
        ...(clientId !== undefined ? { xboxClientId: clientId } : {}),
        ...(clientSecret !== undefined ? { xboxClientSecret: clientSecret } : {}),
      });
    } else if (provider === "youtube") {
      await updateIntegrationProviderRuntimeConfig({
        ...(clientId !== undefined ? { youtubeClientId: clientId } : {}),
        ...(clientSecret !== undefined ? { youtubeClientSecret: clientSecret } : {}),
      });
    }

    return NextResponse.json({
      ok: true,
      setup: await buildSetupPayload(),
    });
  } catch (error) {
    console.error("[ADMIN_INTEGRATION_PROVIDER_SETTINGS_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
