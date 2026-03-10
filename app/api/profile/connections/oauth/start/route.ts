import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { getEffectiveIntegrationProviderCredentials } from "@/lib/integration-provider-config";
import { getEffectiveSiteUrl } from "@/lib/runtime-site-url-config";

const providerKeys = ["github", "google", "steam", "twitch", "xbox", "youtube"] as const;
type OAuthProvider = (typeof providerKeys)[number];

const normalizeProvider = (value: unknown): OAuthProvider | null => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return providerKeys.includes(normalized as OAuthProvider) ? (normalized as OAuthProvider) : null;
};

const sanitizeReturnTo = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "/";
  }

  if (normalized.startsWith("/") && !normalized.startsWith("//")) {
    return normalized;
  }

  return "/";
};

const getProviderConfig = async (provider: OAuthProvider) => {
  const credentials = await getEffectiveIntegrationProviderCredentials();

  if (provider === "github") {
    const { clientId, clientSecret } = credentials.github;
    return {
      configured: Boolean(clientId && clientSecret),
      clientId,
      authBase: "https://github.com/login/oauth/authorize",
      scope: "read:user user:email",
    };
  }

  if (provider === "twitch") {
    const { clientId, clientSecret } = credentials.twitch;
    return {
      configured: Boolean(clientId && clientSecret),
      clientId,
      authBase: "https://id.twitch.tv/oauth2/authorize",
      scope: "user:read:email",
    };
  }

  if (provider === "steam") {
    return {
      configured: true,
      clientId: "",
      authBase: "https://steamcommunity.com/openid/login",
      scope: "",
    };
  }

  if (provider === "xbox") {
    const { clientId, clientSecret } = credentials.xbox;
    return {
      configured: Boolean(clientId && clientSecret),
      clientId,
      authBase: "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
      scope: "openid profile email XboxLive.signin",
    };
  }

  if (provider === "youtube") {
    const { clientId, clientSecret } = credentials.youtube;
    return {
      configured: Boolean(clientId && clientSecret),
      clientId,
      authBase: "https://accounts.google.com/o/oauth2/v2/auth",
      scope: "openid email profile https://www.googleapis.com/auth/youtube.readonly",
    };
  }

  const { clientId, clientSecret } = credentials.google;
  return {
    configured: Boolean(clientId && clientSecret),
    clientId,
    authBase: "https://accounts.google.com/o/oauth2/v2/auth",
    scope: "openid email profile",
  };
};

export async function GET(req: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return NextResponse.redirect(new URL("/?connectionError=unauthorized", req.url));
    }

    const requestUrl = new URL(req.url);
    const provider = normalizeProvider(requestUrl.searchParams.get("provider"));
    const returnTo = sanitizeReturnTo(requestUrl.searchParams.get("returnTo"));

    if (!provider) {
      return NextResponse.redirect(new URL(`${returnTo}${returnTo.includes("?") ? "&" : "?"}connectionError=invalid-provider`, req.url));
    }

    const config = await getProviderConfig(provider);
    if (!config.configured) {
      return NextResponse.redirect(new URL(`${returnTo}${returnTo.includes("?") ? "&" : "?"}connectionError=${provider}-not-configured`, req.url));
    }

    const state = randomBytes(24).toString("hex");
    const effectiveBaseUrl = await getEffectiveSiteUrl(requestUrl.origin);
    const steamCallbackUrl = `${effectiveBaseUrl}/api/profile/connections/oauth/callback?provider=steam&state=${encodeURIComponent(state)}`;
    const callbackUrl =
      provider === "steam"
        ? steamCallbackUrl
        : `${effectiveBaseUrl}/api/profile/connections/oauth/callback?provider=${encodeURIComponent(provider)}`;

    const authUrl = new URL(config.authBase);
    if (provider === "steam") {
      authUrl.searchParams.set("openid.ns", "http://specs.openid.net/auth/2.0");
      authUrl.searchParams.set("openid.mode", "checkid_setup");
      authUrl.searchParams.set("openid.identity", "http://specs.openid.net/auth/2.0/identifier_select");
      authUrl.searchParams.set("openid.claimed_id", "http://specs.openid.net/auth/2.0/identifier_select");
      authUrl.searchParams.set("openid.return_to", callbackUrl);
      authUrl.searchParams.set("openid.realm", effectiveBaseUrl);
    } else {
      authUrl.searchParams.set("client_id", config.clientId);
      authUrl.searchParams.set("redirect_uri", callbackUrl);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", config.scope);
      authUrl.searchParams.set("state", state);
    }

    if (provider === "google" || provider === "youtube" || provider === "xbox") {
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
    }

    const response = NextResponse.redirect(authUrl);
    const isSecure = process.env.NODE_ENV === "production";
    response.cookies.set(`ia_oauth_state_${provider}`, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure,
      path: "/",
      maxAge: 60 * 10,
    });
    response.cookies.set(`ia_oauth_return_${provider}`, returnTo, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure,
      path: "/",
      maxAge: 60 * 10,
    });

    return response;
  } catch (error) {
    console.error("[PROFILE_CONNECTIONS_OAUTH_START]", error);
    return NextResponse.redirect(new URL("/?connectionError=start-failed", req.url));
  }
}
