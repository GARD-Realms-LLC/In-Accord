import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { getEffectiveIntegrationProviderCredentials } from "@/lib/integration-provider-config";
import { getEffectiveSiteUrl } from "@/lib/runtime-site-url-config";
import { getUserPreferences, updateUserPreferences } from "@/lib/user-preferences";

type OAuthProvider = "github" | "google" | "steam" | "twitch" | "xbox" | "youtube";

const normalizeProvider = (value: unknown): OAuthProvider | null => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "github" ||
    normalized === "google" ||
    normalized === "steam" ||
    normalized === "twitch" ||
    normalized === "xbox" ||
    normalized === "youtube"
    ? normalized
    : null;
};

const appendConnectionQuery = (returnTo: string, params: Record<string, string>) => {
  const delimiter = returnTo.includes("?") ? "&" : "?";
  const encoded = new URLSearchParams(params).toString();
  return `${returnTo}${delimiter}${encoded}`;
};

const getProviderSecrets = async (provider: OAuthProvider) => {
  const credentials = await getEffectiveIntegrationProviderCredentials();

  if (provider === "github") {
    return {
      clientId: credentials.github.clientId,
      clientSecret: credentials.github.clientSecret,
      tokenUrl: "https://github.com/login/oauth/access_token",
      userUrl: "https://api.github.com/user",
    };
  }

  if (provider === "twitch") {
    return {
      clientId: credentials.twitch.clientId,
      clientSecret: credentials.twitch.clientSecret,
      tokenUrl: "https://id.twitch.tv/oauth2/token",
      userUrl: "https://api.twitch.tv/helix/users",
    };
  }

  if (provider === "xbox") {
    return {
      clientId: credentials.xbox.clientId,
      clientSecret: credentials.xbox.clientSecret,
      tokenUrl: "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
      userUrl: "https://graph.microsoft.com/oidc/userinfo",
    };
  }

  if (provider === "steam") {
    return {
      clientId: "",
      clientSecret: "",
      tokenUrl: "",
      userUrl: "",
    };
  }

  if (provider === "youtube") {
    return {
      clientId: credentials.youtube.clientId,
      clientSecret: credentials.youtube.clientSecret,
      tokenUrl: "https://oauth2.googleapis.com/token",
      userUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    };
  }

  return {
    clientId: credentials.google.clientId,
    clientSecret: credentials.google.clientSecret,
    tokenUrl: "https://oauth2.googleapis.com/token",
    userUrl: "https://openidconnect.googleapis.com/v1/userinfo",
  };
};

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const provider = normalizeProvider(requestUrl.searchParams.get("provider"));

  const fallbackReturn = "/";
  const callbackError = requestUrl.searchParams.get("error") || "";

  if (!provider) {
    return NextResponse.redirect(new URL(appendConnectionQuery(fallbackReturn, { connectionError: "invalid-provider" }), req.url));
  }

  const oauthStateCookieKey = `ia_oauth_state_${provider}`;
  const oauthReturnCookieKey = `ia_oauth_return_${provider}`;

  try {
    const profile = await currentProfile();
    if (!profile) {
      const response = NextResponse.redirect(new URL(appendConnectionQuery(fallbackReturn, { connectionError: "unauthorized" }), req.url));
      response.cookies.delete(oauthStateCookieKey);
      response.cookies.delete(oauthReturnCookieKey);
      return response;
    }

    const state = requestUrl.searchParams.get("state") || "";
    const code = requestUrl.searchParams.get("code") || "";

    const cookies = req.headers.get("cookie") || "";
    const stateCookieMatch = cookies.match(new RegExp(`${oauthStateCookieKey}=([^;]+)`));
    const returnCookieMatch = cookies.match(new RegExp(`${oauthReturnCookieKey}=([^;]+)`));
    const expectedState = stateCookieMatch ? decodeURIComponent(stateCookieMatch[1]) : "";
    const returnTo = returnCookieMatch ? decodeURIComponent(returnCookieMatch[1]) : fallbackReturn;

    if (callbackError) {
      const response = NextResponse.redirect(new URL(appendConnectionQuery(returnTo, { connectionError: callbackError, provider }), req.url));
      response.cookies.delete(oauthStateCookieKey);
      response.cookies.delete(oauthReturnCookieKey);
      return response;
    }

    const requiresCodeFlow = provider !== "steam";

    if (requiresCodeFlow && (!code || !state || !expectedState || state !== expectedState)) {
      const response = NextResponse.redirect(new URL(appendConnectionQuery(returnTo, { connectionError: "invalid-state", provider }), req.url));
      response.cookies.delete(oauthStateCookieKey);
      response.cookies.delete(oauthReturnCookieKey);
      return response;
    }

    if (!requiresCodeFlow && (!state || !expectedState || state !== expectedState)) {
      const response = NextResponse.redirect(new URL(appendConnectionQuery(returnTo, { connectionError: "invalid-state", provider }), req.url));
      response.cookies.delete(oauthStateCookieKey);
      response.cookies.delete(oauthReturnCookieKey);
      return response;
    }

    const secrets = await getProviderSecrets(provider);
    if (requiresCodeFlow && (!secrets.clientId || !secrets.clientSecret)) {
      const response = NextResponse.redirect(new URL(appendConnectionQuery(returnTo, { connectionError: `${provider}-not-configured`, provider }), req.url));
      response.cookies.delete(oauthStateCookieKey);
      response.cookies.delete(oauthReturnCookieKey);
      return response;
    }

    if (provider === "steam") {
      const verificationPayload = new URLSearchParams();
      requestUrl.searchParams.forEach((value, key) => {
        if (key.startsWith("openid.")) {
          verificationPayload.set(key, value);
        }
      });
      verificationPayload.set("openid.mode", "check_authentication");

      const verificationResponse = await fetch("https://steamcommunity.com/openid/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "text/plain",
        },
        body: verificationPayload.toString(),
        cache: "no-store",
      });

      const verificationText = await verificationResponse.text().catch(() => "");
      const claimedId = requestUrl.searchParams.get("openid.claimed_id") || "";
      const steamIdMatch = claimedId.match(/https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)/i);
      const hasIdentity = Boolean(steamIdMatch?.[1]);
      const isValid = verificationResponse.ok && /is_valid\s*:\s*true/i.test(verificationText);

      if (!isValid || !hasIdentity) {
        const response = NextResponse.redirect(new URL(appendConnectionQuery(returnTo, { connectionError: "profile-fetch-failed", provider }), req.url));
        response.cookies.delete(oauthStateCookieKey);
        response.cookies.delete(oauthReturnCookieKey);
        return response;
      }
    } else {
      const effectiveBaseUrl = await getEffectiveSiteUrl(requestUrl.origin);
      const redirectUri = `${effectiveBaseUrl}/api/profile/connections/oauth/callback?provider=${encodeURIComponent(provider)}`;

      const tokenResponse = await fetch(secrets.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          client_id: secrets.clientId,
          client_secret: secrets.clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
        cache: "no-store",
      });

      const tokenPayload = (await tokenResponse.json().catch(() => ({}))) as {
        access_token?: string;
        token_type?: string;
        error?: string;
      };

      const accessToken = String(tokenPayload.access_token ?? "").trim();
      if (!tokenResponse.ok || !accessToken) {
        const response = NextResponse.redirect(new URL(appendConnectionQuery(returnTo, { connectionError: "token-exchange-failed", provider }), req.url));
        response.cookies.delete(oauthStateCookieKey);
        response.cookies.delete(oauthReturnCookieKey);
        return response;
      }

      const userResponse = await fetch(secrets.userUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(provider === "twitch" ? { "Client-Id": secrets.clientId } : {}),
          Accept: "application/json",
        },
        cache: "no-store",
      });

      const userPayload = (await userResponse.json().catch(() => ({}))) as {
        id?: unknown;
        login?: unknown;
        sub?: unknown;
        email?: unknown;
        data?: Array<{ id?: unknown; login?: unknown; email?: unknown }>;
      };

      const hasIdentity =
        (provider === "github" && (Boolean(userPayload.id) || Boolean(userPayload.login))) ||
        (provider === "google" && (Boolean(userPayload.sub) || Boolean(userPayload.email))) ||
        (provider === "youtube" && (Boolean(userPayload.sub) || Boolean(userPayload.email))) ||
        (provider === "xbox" && (Boolean(userPayload.sub) || Boolean(userPayload.email))) ||
        (provider === "twitch" &&
          (Boolean(userPayload.data?.[0]?.id) || Boolean(userPayload.data?.[0]?.login) || Boolean(userPayload.data?.[0]?.email)));

      if (!userResponse.ok || !hasIdentity) {
        const response = NextResponse.redirect(new URL(appendConnectionQuery(returnTo, { connectionError: "profile-fetch-failed", provider }), req.url));
        response.cookies.delete(oauthStateCookieKey);
        response.cookies.delete(oauthReturnCookieKey);
        return response;
      }
    }

    const preferences = await getUserPreferences(profile.id);
    const connectedAccounts = Array.isArray(preferences.connectedAccounts)
      ? preferences.connectedAccounts.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim().toLowerCase())
      : [];

    if (!connectedAccounts.includes(provider)) {
      connectedAccounts.push(provider);
    }

    await updateUserPreferences(profile.id, {
      connectedAccounts,
    });

    const response = NextResponse.redirect(new URL(appendConnectionQuery(returnTo, { connectionStatus: "connected", provider }), req.url));
    response.cookies.delete(oauthStateCookieKey);
    response.cookies.delete(oauthReturnCookieKey);
    return response;
  } catch (error) {
    console.error("[PROFILE_CONNECTIONS_OAUTH_CALLBACK]", error);
    const response = NextResponse.redirect(new URL(appendConnectionQuery(fallbackReturn, { connectionError: "callback-failed", provider: provider ?? "unknown" }), req.url));
    response.cookies.delete(oauthStateCookieKey);
    response.cookies.delete(oauthReturnCookieKey);
    return response;
  }
}
