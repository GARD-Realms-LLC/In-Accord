import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { currentProfile } from "@/lib/current-profile";
import { getUserPreferences } from "@/lib/user-preferences";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

const GAME_ALIASES: Array<{ label: string; aliases: string[] }> = [
  { label: "Counter-Strike 2", aliases: ["cs2"] },
  { label: "ELDEN RING", aliases: ["eldenring"] },
  { label: "Dota 2", aliases: ["dota2"] },
  { label: "VALORANT", aliases: ["valorant", "valorant-win64-shipping"] },
  { label: "League of Legends", aliases: ["leagueoflegends", "leagueclient", "leagueclientux"] },
  { label: "Fortnite", aliases: ["fortniteclient-win64-shipping"] },
  { label: "Apex Legends", aliases: ["r5apex"] },
  { label: "Minecraft", aliases: ["minecraft", "minecraftlauncher", "minecraft.windows"] },
  { label: "Overwatch", aliases: ["overwatch", "overwatch2"] },
  { label: "Rocket League", aliases: ["rocketleague"] },
  { label: "Grand Theft Auto V", aliases: ["gta5", "gtavlauncher"] },
  { label: "Sekiro: Shadows Die Twice", aliases: ["sekiro"] },
  { label: "Starfield", aliases: ["starfield"] },
  { label: "Cyberpunk 2077", aliases: ["cyberpunk2077"] },
  { label: "PUBG: Battlegrounds", aliases: ["pubg", "tslgame"] },
  { label: "THE FINALS", aliases: ["discovery", "thefinals"] },
  { label: "Halo Infinite", aliases: ["haloinfinite"] },
  { label: "Forza Horizon 5", aliases: ["forzahorizon5"] },
];

const GAME_TITLE_HINTS = [
  "counter-strike",
  "elden ring",
  "dota 2",
  "valorant",
  "league of legends",
  "fortnite",
  "apex legends",
  "minecraft",
  "overwatch",
  "rocket league",
  "grand theft auto v",
  "gta v",
  "cyberpunk 2077",
  "pubg",
  "the finals",
  "halo infinite",
  "forza horizon 5",
  "starfield",
  "sekiro",
];

const normalizeProcess = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.exe$/i, "");

const normalizeAlias = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.exe$/i, "")
    .replace(/[^a-z0-9]+/g, "");

const findCatalogMatch = (runningAliases: Set<string>, catalog: Array<{ label: string; aliases: string[] }>) => {
  for (const entry of catalog) {
    for (const alias of entry.aliases) {
      const normalized = normalizeAlias(alias);
      if (normalized && runningAliases.has(normalized)) {
        return entry.label;
      }
    }
  }

  return null;
};

const detectRuntimeActivityServerSide = async (customCatalog: Array<{ label: string; aliases: string[] }>) => {
  if (process.platform !== "win32") {
    return null;
  }

  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "Get-Process | Select-Object ProcessName,MainWindowTitle | ConvertTo-Json -Compress",
    ],
    {
      timeout: 2500,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    }
  );

  const payload = JSON.parse(String(stdout || "[]")) as
    | Array<{ ProcessName?: string; MainWindowTitle?: string }>
    | { ProcessName?: string; MainWindowTitle?: string }
    | null;

  const rows = Array.isArray(payload) ? payload : payload ? [payload] : [];
  const runningProcesses = rows
    .map((row) => normalizeProcess(String(row?.ProcessName ?? "")))
    .filter((value) => value.length > 0);
  const runningAliasSet = new Set(runningProcesses.map((value) => normalizeAlias(value)).filter((value) => value.length > 0));

  const knownCatalogMatch =
    findCatalogMatch(runningAliasSet, customCatalog) ||
    findCatalogMatch(runningAliasSet, GAME_ALIASES);

  if (knownCatalogMatch) {
    return {
      type: "game",
      title: knownCatalogMatch,
      source: "server-process",
      detectedAt: new Date().toISOString(),
    };
  }

  const windowTitles = rows
    .map((row) => String(row?.MainWindowTitle ?? "").trim())
    .filter((value) => value.length > 0)
    .map((value) => value.toLowerCase());

  const hinted = GAME_TITLE_HINTS.find((hint) => windowTitles.some((title) => title.includes(hint)));
  if (hinted) {
    return {
      type: "game",
      title: rows.find((row) => String(row?.MainWindowTitle ?? "").toLowerCase().includes(hinted))?.MainWindowTitle ?? hinted,
      source: "server-window-title",
      detectedAt: new Date().toISOString(),
    };
  }

  return null;
};

export async function GET() {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const preferences = await getUserPreferences(profile.id);
    const hidden = new Set((preferences.registeredGames.hiddenGameIds ?? []).map((value) => String(value || "").trim()));
    const manualCatalog = (preferences.registeredGames.manualGames ?? [])
      .filter((entry) => !hidden.has(String(entry.id || "").trim()))
      .map((entry) => {
        const name = String(entry.name || entry.id || "").trim();
        const id = String(entry.id || "").trim();
        const provider = String(entry.provider || "").trim();
        const aliases = [name, id, `${provider} ${name}`]
          .map((value) => normalizeAlias(value))
          .filter((value) => value.length > 0);

        return {
          label: name || id,
          aliases: Array.from(new Set(aliases)),
        };
      })
      .filter((entry) => entry.label.length > 0 && entry.aliases.length > 0);

    const activity = await detectRuntimeActivityServerSide(manualCatalog);
    return NextResponse.json(activity);
  } catch (error) {
    console.error("[PROFILE_RUNTIME_ACTIVITY_GET]", error);
    return NextResponse.json(null);
  }
}
