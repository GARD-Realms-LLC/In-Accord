import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { getEffectiveIntegrationProviderCredentials } from "@/lib/integration-provider-config";
import { getUserPreferences } from "@/lib/user-preferences";

type ProviderKey = "github" | "google" | "steam" | "twitch" | "xbox" | "youtube";

type DetectedGame = {
  id: string;
  name: string;
  provider: ProviderKey;
  shortDescription: string;
  thumbnailUrl: string;
};

type ProviderState = {
  source: "live" | "fallback";
  count: number;
};

const MAX_STEAM_DISCOVERY_GAMES = 200;
const TWITCH_TOP_GAMES_LIMIT = 100;

const providerKeys: ProviderKey[] = ["github", "google", "steam", "twitch", "xbox", "youtube"];

const sanitizeConnectedAccounts = (value: unknown): ProviderKey[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<ProviderKey>();
  for (const item of value) {
    const normalized = String(item ?? "").trim().toLowerCase();
    if (providerKeys.includes(normalized as ProviderKey)) {
      unique.add(normalized as ProviderKey);
    }
  }

  return Array.from(unique);
};

const fallbackGamesByProvider: Record<ProviderKey, DetectedGame[]> = {
  steam: [
    {
      id: "steam:counter-strike-2",
      name: "Counter-Strike 2",
      provider: "steam",
      shortDescription: "Competitive tactical FPS with ranked and premier playlists.",
      thumbnailUrl: "https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg",
    },
    {
      id: "steam:elden-ring",
      name: "ELDEN RING",
      provider: "steam",
      shortDescription: "Open-world action RPG adventure through the Lands Between.",
      thumbnailUrl: "https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/header.jpg",
    },
  ],
  xbox: [
    {
      id: "xbox:forza-horizon-5",
      name: "Forza Horizon 5",
      provider: "xbox",
      shortDescription: "Arcade racing across dynamic Mexico seasons and events.",
      thumbnailUrl: "https://cdn.cloudflare.steamstatic.com/steam/apps/1551360/header.jpg",
    },
    {
      id: "xbox:halo-infinite",
      name: "Halo Infinite",
      provider: "xbox",
      shortDescription: "Arena and big-team multiplayer combat in the Halo universe.",
      thumbnailUrl: "https://cdn.cloudflare.steamstatic.com/steam/apps/1240440/header.jpg",
    },
  ],
  twitch: [
    {
      id: "twitch:valorant",
      name: "VALORANT",
      provider: "twitch",
      shortDescription: "Popular tactical shooter frequently streamed live.",
      thumbnailUrl: "https://cdn.cloudflare.steamstatic.com/steam/apps/1172470/header.jpg",
    },
    {
      id: "twitch:apex-legends",
      name: "Apex Legends",
      provider: "twitch",
      shortDescription: "Hero-based battle royale with trios and ranked modes.",
      thumbnailUrl: "https://cdn.cloudflare.steamstatic.com/steam/apps/1172470/header.jpg",
    },
  ],
  youtube: [
    {
      id: "youtube:minecraft",
      name: "Minecraft",
      provider: "youtube",
      shortDescription: "Sandbox building and survival gameplay with huge creator ecosystem.",
      thumbnailUrl: "https://cdn.cloudflare.steamstatic.com/steam/apps/1672970/header.jpg",
    },
    {
      id: "youtube:grand-theft-auto-v",
      name: "Grand Theft Auto V",
      provider: "youtube",
      shortDescription: "Open-world action title with high creator and clip activity.",
      thumbnailUrl: "https://cdn.cloudflare.steamstatic.com/steam/apps/271590/header.jpg",
    },
  ],
  github: [
    {
      id: "github:open-source-godot-showcase",
      name: "Open Source Game Showcase",
      provider: "github",
      shortDescription: "Community-maintained showcase of active open-source game projects.",
      thumbnailUrl: "https://cdn.cloudflare.steamstatic.com/steam/apps/1454400/header.jpg",
    },
  ],
  google: [
    {
      id: "google:play-games-sync",
      name: "Google Play Games Sync",
      provider: "google",
      shortDescription: "Cross-device play sessions and cloud-synced progress highlights.",
      thumbnailUrl: "https://cdn.cloudflare.steamstatic.com/steam/apps/1086940/header.jpg",
    },
  ],
};

const fetchLiveSteamGames = async (): Promise<DetectedGame[]> => {
  const response = await fetch("https://store.steampowered.com/api/featuredcategories?cc=us&l=en", {
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        top_sellers?: { items?: Array<{ id?: number; name?: string; header_image?: string }> };
        specials?: { items?: Array<{ id?: number; name?: string; header_image?: string }> };
      }
    | null;

  const topSellerItems = payload?.top_sellers?.items;
  const specialItems = payload?.specials?.items;
  const topSellers = Array.isArray(topSellerItems) ? topSellerItems : [];
  const specials = Array.isArray(specialItems) ? specialItems : [];

  const seen = new Set<number>();
  const combined = [...topSellers, ...specials]
    .filter((entry) => {
      const id = Number(entry?.id ?? 0);
      if (!Number.isFinite(id) || id <= 0 || seen.has(id)) {
        return false;
      }

      seen.add(id);
      return true;
    })
    .slice(0, MAX_STEAM_DISCOVERY_GAMES);

  return combined.map((entry) => {
    const appId = Number(entry?.id ?? 0);
    const name = String(entry?.name ?? "").trim() || `Steam Game ${appId}`;
    const thumbnailUrl = String(entry?.header_image ?? "").trim();

    return {
      id: `steam:${appId}`,
      name,
      provider: "steam",
      shortDescription: "Live from Steam top sellers and specials.",
      thumbnailUrl,
    } satisfies DetectedGame;
  });
};

const fetchLiveTwitchGames = async (clientId: string, clientSecret: string): Promise<DetectedGame[]> => {
  const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });

  const tokenPayload = (await tokenResponse.json().catch(() => ({}))) as {
    access_token?: string;
  };

  const accessToken = String(tokenPayload.access_token ?? "").trim();
  if (!tokenResponse.ok || !accessToken) {
    return [];
  }

  const gamesResponse = await fetch(`https://api.twitch.tv/helix/games/top?first=${TWITCH_TOP_GAMES_LIMIT}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!gamesResponse.ok) {
    return [];
  }

  const gamesPayload = (await gamesResponse.json().catch(() => ({}))) as {
    data?: Array<{ id?: string; name?: string; box_art_url?: string }>;
  };

  const rows = Array.isArray(gamesPayload.data) ? gamesPayload.data : [];

  return rows
    .filter((entry) => String(entry.id ?? "").trim().length > 0)
    .map((entry) => {
      const id = String(entry.id ?? "").trim();
      const name = String(entry.name ?? "").trim() || "Twitch Game";
      const thumbnailUrl = String(entry.box_art_url ?? "")
        .replace("{width}", "285")
        .replace("{height}", "380")
        .trim();

      return {
        id: `twitch:${id}`,
        name,
        provider: "twitch",
        shortDescription: "Live from Twitch top streamed games.",
        thumbnailUrl,
      } satisfies DetectedGame;
    });
};

export async function GET() {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const preferences = await getUserPreferences(profile.id);
    const connectedAccounts = sanitizeConnectedAccounts(preferences.connectedAccounts);
    const credentials = await getEffectiveIntegrationProviderCredentials();

    const providerStates: Partial<Record<ProviderKey, ProviderState>> = {};
    const detectedGames: DetectedGame[] = [];

    for (const provider of connectedAccounts) {
      let liveGames: DetectedGame[] = [];

      if (provider === "steam") {
        liveGames = await fetchLiveSteamGames();
      }

      if (provider === "twitch" && credentials.twitch.clientId && credentials.twitch.clientSecret) {
        liveGames = await fetchLiveTwitchGames(credentials.twitch.clientId, credentials.twitch.clientSecret);
      }

      if (liveGames.length > 0) {
        providerStates[provider] = {
          source: "live",
          count: liveGames.length,
        };
        detectedGames.push(...liveGames);
        continue;
      }

      const fallbackGames = fallbackGamesByProvider[provider] ?? [];
      providerStates[provider] = {
        source: "fallback",
        count: fallbackGames.length,
      };
      detectedGames.push(...fallbackGames);
    }

    const deduped = Array.from(
      detectedGames.reduce((acc, item) => {
        if (!acc.has(item.id)) {
          acc.set(item.id, item);
        }

        return acc;
      }, new Map<string, DetectedGame>()).values()
    );

    return NextResponse.json({
      connectedAccounts,
      detectedGames: deduped,
      providerStates,
      detectionMode: "discovery-feed",
      note:
        "Detected games are sourced from provider discovery endpoints/fallback catalogs and may not equal your full owned game library.",
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[PROFILE_REGISTERED_GAMES_GET]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
