import { NextResponse } from "next/server";
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import { currentProfile } from "@/lib/current-profile";
import { getUserPreferences } from "@/lib/user-preferences";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

type ProviderKey = "github" | "google" | "steam" | "twitch" | "xbox" | "youtube" | "epic";

type DetectedGame = {
  id: string;
  name: string;
  provider: ProviderKey;
  shortDescription: string;
  thumbnailUrl: string;
  processName?: string;
  processAliases?: string[];
};

type ProviderState = {
  source: "native-installed-scan" | "none";
  count: number;
};

const providerKeys: ProviderKey[] = ["github", "google", "steam", "twitch", "xbox", "youtube", "epic"];

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


const normalizeAlias = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.exe$/i, "")
    .replace(/[^a-z0-9]+/g, "");

const parseVdfPaths = (raw: string) => {
  const values: string[] = [];
  const pattern = /"path"\s+"([^"]+)"/gi;
  let match = pattern.exec(raw);

  while (match) {
    const value = String(match[1] || "").replace(/\\\\/g, "\\").trim();
    if (value) {
      values.push(value);
    }

    match = pattern.exec(raw);
  }

  return Array.from(new Set(values));
};

const parseSteamManifestName = (raw: string) => String(raw.match(/"name"\s+"([^"]+)"/i)?.[1] || "").trim();
const parseSteamManifestInstallDir = (raw: string) => String(raw.match(/"installdir"\s+"([^"]+)"/i)?.[1] || "").trim();
const parseSteamManifestAppId = (raw: string) => String(raw.match(/"appid"\s+"(\d+)"/i)?.[1] || "").trim();
const toSteamHeaderImage = (appId: string) =>
  String(appId || "").trim().length > 0
    ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${String(appId).trim()}/header.jpg`
    : "";

const EPIC_FALLBACK_IMAGE = "https://store.epicgames.com/images/epic-games-logo.svg";

const EXE_NAME_EXCLUDE_SET = new Set([
  "crashreporter",
  "dxsetup",
  "easyanticheat",
  "eac_launcher",
  "eac_launcher64",
  "launcher",
  "launch",
  "redistributable",
  "setup",
  "start",
  "unins000",
  "uninstall",
  "vc_redist",
]);

const findExecutableCandidates = (rootDir: string, depth = 0): Array<{ normalized: string; fullPath: string; depth: number; score: number }> => {
  if (!existsSync(rootDir) || depth > 3) {
    return [];
  }

  let dirEntries: Array<import("fs").Dirent> = [];
  try {
    dirEntries = readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const executables: Array<{ normalized: string; fullPath: string; depth: number; score: number }> = [];
  for (const entry of dirEntries) {
    const fullPath = path.join(rootDir, entry.name);

    if (entry.isFile() && /\.exe$/i.test(entry.name)) {
      const normalized = String(entry.name).trim().toLowerCase().replace(/\.exe$/i, "");
      if (normalized && !EXE_NAME_EXCLUDE_SET.has(normalized)) {
        executables.push({
          normalized,
          fullPath,
          depth,
          score: Math.max(0, 100 - depth * 20 - normalized.length),
        });
      }
      continue;
    }

    if (!entry.isDirectory()) {
      continue;
    }

    const folderName = String(entry.name || "").toLowerCase();
    if (depth >= 2 && !/(bin|binaries|win|x64|x86|game|shipping|release|client)/i.test(folderName)) {
      continue;
    }

    executables.push(...findExecutableCandidates(fullPath, depth + 1));
  }

  return executables;
};

const pickPrimaryProcessName = (installDirPath: string, gameName: string) => {
  const candidates = findExecutableCandidates(installDirPath, 0);
  if (candidates.length === 0) {
    return "";
  }

  const gameTokens = normalizeAlias(String(gameName || ""));
  const scored = candidates.map((candidate) => ({
    ...candidate,
    score:
      candidate.score +
      (gameTokens && candidate.normalized.includes(gameTokens) ? 60 : 0) +
      (candidate.fullPath.toLowerCase().includes("shipping") ? 15 : 0),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.normalized || "";
};

const listSteamRootsFromRegistryWindows = async () => {
  const queries = [
    ["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"],
    ["query", "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam", "/v", "InstallPath"],
    ["query", "HKLM\\SOFTWARE\\Valve\\Steam", "/v", "InstallPath"],
  ];

  const roots: string[] = [];

  for (const args of queries) {
    try {
      const { stdout } = await execFileAsync("reg.exe", args, {
        timeout: 2500,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });

      const lines = String(stdout || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /REG_SZ/i.test(line));

      for (const line of lines) {
        const parts = line.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
        const candidate = String(parts[parts.length - 1] || "").replace(/\\\\/g, "\\").replace(/\//g, "\\").trim();
        if (candidate) {
          roots.push(candidate);
        }
      }
    } catch {
      // best effort
    }
  }

  return Array.from(new Set(roots));
};

const listInstalledSteamGamesWindows = async (): Promise<DetectedGame[]> => {
  const registryRoots = await listSteamRootsFromRegistryWindows();
  const roots = Array.from(
    new Set(
      [
        "C:\\Program Files (x86)\\Steam",
        "C:\\Program Files\\Steam",
        path.join(process.env.PROGRAMFILES || "", "Steam"),
        path.join(process.env["PROGRAMFILES(X86)"] || "", "Steam"),
        ...registryRoots,
      ]
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  );

  const seen = new Set<string>();
  const games: DetectedGame[] = [];

  for (const root of roots) {
    const steamappsRoot = path.join(root, "steamapps");
    if (!existsSync(steamappsRoot)) {
      continue;
    }

    const libraries = new Set<string>([root]);
    const libraryFoldersPath = path.join(steamappsRoot, "libraryfolders.vdf");
    if (existsSync(libraryFoldersPath)) {
      try {
        const raw = readFileSync(libraryFoldersPath, "utf8");
        for (const libraryPath of parseVdfPaths(raw)) {
          libraries.add(libraryPath);
        }
      } catch {
        // best effort
      }
    }

    for (const libraryRoot of Array.from(libraries)) {
      const librarySteamapps = path.join(libraryRoot, "steamapps");
      if (!existsSync(librarySteamapps)) {
        continue;
      }

      let files: string[] = [];
      try {
        files = readdirSync(librarySteamapps);
      } catch {
        continue;
      }

      for (const fileName of files) {
        if (!/^appmanifest_\d+\.acf$/i.test(fileName)) {
          continue;
        }

        try {
          const raw = readFileSync(path.join(librarySteamapps, fileName), "utf8");
          const name = parseSteamManifestName(raw);
          const installDir = parseSteamManifestInstallDir(raw);
          const appId = parseSteamManifestAppId(raw);
          const installPath = installDir ? path.join(librarySteamapps, "common", installDir) : "";

          if (!name || !installPath || !existsSync(installPath)) {
            continue;
          }

          const dedupeKey = normalizeAlias(name);
          if (!dedupeKey || seen.has(dedupeKey)) {
            continue;
          }

          seen.add(dedupeKey);
          const processName = pickPrimaryProcessName(installPath, name);
          const processAliases = findExecutableCandidates(installPath, 0)
            .map((entry) => entry.normalized)
            .filter((value) => value.length > 0)
            .slice(0, 8);
          games.push({
            id: appId ? `steam:${appId}` : `steam:${dedupeKey}`,
            name,
            provider: "steam",
            shortDescription: "Installed locally via Steam.",
            thumbnailUrl: toSteamHeaderImage(appId),
            processName,
            processAliases,
          });
        } catch {
          // ignore malformed manifest
        }
      }
    }
  }

  return games;
};

const listInstalledEpicGamesWindows = (): DetectedGame[] => {
  const roots = Array.from(
    new Set(
      [
        "C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests",
        path.join(process.env.PROGRAMDATA || "", "Epic", "EpicGamesLauncher", "Data", "Manifests"),
      ]
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  );

  const games: DetectedGame[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    if (!existsSync(root)) {
      continue;
    }

    let files: string[] = [];
    try {
      files = readdirSync(root);
    } catch {
      continue;
    }

    for (const fileName of files) {
      if (!/\.item$/i.test(fileName)) {
        continue;
      }

      try {
        const payload = JSON.parse(readFileSync(path.join(root, fileName), "utf8")) as {
          DisplayName?: string;
          AppName?: string;
          InstallLocation?: string;
        };

        const name = String(payload.DisplayName || payload.AppName || "").trim();
        const installLocation = String(payload.InstallLocation || "").trim();
        if (!name || !installLocation || !existsSync(installLocation)) {
          continue;
        }

        const dedupeKey = normalizeAlias(name);
        if (!dedupeKey || seen.has(dedupeKey)) {
          continue;
        }

        seen.add(dedupeKey);
        const processName = pickPrimaryProcessName(installLocation, name);
        const processAliases = findExecutableCandidates(installLocation, 0)
          .map((entry) => entry.normalized)
          .filter((value) => value.length > 0)
          .slice(0, 8);
        games.push({
          id: `epic:${dedupeKey}`,
          name,
          provider: "epic",
          shortDescription: "Installed locally via Epic Games.",
          thumbnailUrl: EPIC_FALLBACK_IMAGE,
          processName,
          processAliases,
        });
      } catch {
        // malformed manifest
      }
    }
  }

  return games;
};

const listInstalledGamesWindows = async (): Promise<DetectedGame[]> => {
  const combined = [...(await listInstalledSteamGamesWindows()), ...listInstalledEpicGamesWindows()];
  const deduped = Array.from(
    combined.reduce((acc, game) => {
      const key = normalizeAlias(game.name);
      if (!key || acc.has(key)) {
        return acc;
      }

      acc.set(key, game);
      return acc;
    }, new Map<string, DetectedGame>()).values()
  );

  return deduped.slice(0, 800);
};

export async function GET() {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const preferences = await getUserPreferences(profile.id);
    const connectedAccounts = sanitizeConnectedAccounts(preferences.connectedAccounts);
    const detectedGames = process.platform === "win32" ? await listInstalledGamesWindows() : [];
    const providerStates: Partial<Record<ProviderKey, ProviderState>> = {
      steam: {
        source: "native-installed-scan",
        count: detectedGames.filter((game) => game.provider === "steam").length,
      },
      epic: {
        source: "native-installed-scan",
        count: detectedGames.filter((game) => game.provider === "epic").length,
      },
    };

    for (const provider of connectedAccounts) {
      if (!providerStates[provider]) {
        providerStates[provider] = {
          source: "none",
          count: 0,
        };
      }
    }

    return NextResponse.json({
      connectedAccounts,
      detectedGames,
      providerStates,
      detectionMode: "native-only",
      note: "Only locally installed games are returned. Discovery feeds are disabled.",
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[PROFILE_REGISTERED_GAMES_GET]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
