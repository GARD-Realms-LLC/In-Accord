import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { getEffectiveIntegrationProviderCredentials } from "@/lib/integration-provider-config";
import { getUserPreferences, updateUserPreferences } from "@/lib/user-preferences";

const providerKeys = ["github", "google", "steam", "twitch", "xbox", "youtube"] as const;
type ProviderKey = (typeof providerKeys)[number];

const normalizeProvider = (value: unknown): ProviderKey | null => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return providerKeys.includes(normalized as ProviderKey) ? (normalized as ProviderKey) : null;
};

const providerConfiguredMap = async (): Promise<Record<ProviderKey, boolean>> => {
  const credentials = await getEffectiveIntegrationProviderCredentials();

  return {
    github: Boolean(credentials.github.clientId && credentials.github.clientSecret),
    google: Boolean(credentials.google.clientId && credentials.google.clientSecret),
    steam: true,
    twitch: Boolean(credentials.twitch.clientId && credentials.twitch.clientSecret),
    xbox: Boolean(credentials.xbox.clientId && credentials.xbox.clientSecret),
    youtube: Boolean(credentials.youtube.clientId && credentials.youtube.clientSecret),
  };
};

const providerOauthSupportMap = (): Record<ProviderKey, boolean> => ({
  github: true,
  google: true,
  steam: true,
  twitch: true,
  xbox: true,
  youtube: true,
});

const sanitizeConnectedAccounts = (value: unknown): ProviderKey[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<ProviderKey>();
  for (const item of value) {
    const provider = normalizeProvider(item);
    if (provider) {
      unique.add(provider);
    }
  }

  return Array.from(unique);
};

export async function GET() {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const preferences = await getUserPreferences(profile.id);
    const connectedAccounts = sanitizeConnectedAccounts(preferences.connectedAccounts);

    return NextResponse.json({
      connectedAccounts,
      providerAvailability: await providerConfiguredMap(),
      providerOAuthSupport: providerOauthSupportMap(),
    });
  } catch (error) {
    console.error("[PROFILE_CONNECTIONS_GET]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      provider?: unknown;
      action?: unknown;
    };

    const provider = normalizeProvider(body.provider);
    const action = String(body.action ?? "toggle").trim().toLowerCase();

    if (!provider || !["connect", "disconnect", "toggle"].includes(action)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const availability = await providerConfiguredMap();
    const oauthSupport = providerOauthSupportMap();
    const preferences = await getUserPreferences(profile.id);
    const current = sanitizeConnectedAccounts(preferences.connectedAccounts);
    const isConnected = current.includes(provider);

    const shouldConnect = action === "connect" ? true : action === "disconnect" ? false : !isConnected;

    if (shouldConnect && !oauthSupport[provider]) {
      return NextResponse.json(
        {
          error: `${provider.toUpperCase()} connect flow is not implemented yet.`,
          connectedAccounts: current,
          providerAvailability: availability,
          providerOAuthSupport: oauthSupport,
        },
        { status: 400 }
      );
    }

    if (shouldConnect && !availability[provider]) {
      return NextResponse.json(
        {
          error: `${provider.toUpperCase()} is not configured on this server yet. Add provider credentials first.`,
          connectedAccounts: current,
          providerAvailability: availability,
          providerOAuthSupport: oauthSupport,
        },
        { status: 400 }
      );
    }

    const next = shouldConnect
      ? Array.from(new Set([...current, provider]))
      : current.filter((item) => item !== provider);

    await updateUserPreferences(profile.id, {
      connectedAccounts: next,
    });

    return NextResponse.json({
      ok: true,
      connectedAccounts: next,
      providerAvailability: availability,
      providerOAuthSupport: oauthSupport,
      provider,
      connected: shouldConnect,
    });
  } catch (error) {
    console.error("[PROFILE_CONNECTIONS_POST]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
