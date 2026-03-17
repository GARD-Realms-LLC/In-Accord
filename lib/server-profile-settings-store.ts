import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type ServerInviteMode = "normal" | "approval";

export type ServerProfileSettings = {
  description: string | null;
  traits: string[];
  gamesPlayed: string[];
  bannerColor: string | null;
  inviteMode: ServerInviteMode;
  showChannelGroups: boolean;
  hideAllChannels: boolean;
  hiddenChannelIds: string[];
};

type SettingsMap = Record<string, Partial<ServerProfileSettings> | undefined>;

const dataDir = path.join(process.cwd(), ".data");
const settingsFile = path.join(dataDir, "server-profile-settings.json");

const DEFAULT_SETTINGS: ServerProfileSettings = {
  description: null,
  traits: [],
  gamesPlayed: [],
  bannerColor: null,
  inviteMode: "normal",
  showChannelGroups: true,
  hideAllChannels: false,
  hiddenChannelIds: [],
};

const normalizeStringIdList = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    const trimmed = String(item ?? "").trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
};

const normalizeHexColor = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  if (!/^#([0-9a-fA-F]{6})$/.test(raw)) {
    return null;
  }

  return raw.toLowerCase();
};

const normalizeStringList = (value: unknown, maxItems: number, maxLength: number) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    const trimmed = String(item ?? "").trim();
    if (!trimmed) {
      continue;
    }

    const compact = trimmed.slice(0, maxLength);
    const key = compact.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(compact);

    if (normalized.length >= maxItems) {
      break;
    }
  }

  return normalized;
};

const normalizeInviteMode = (value: unknown): ServerInviteMode => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "approval" ? "approval" : "normal";
};

const normalizeDescription = (value: unknown) => {
  const raw = String(value ?? "").trim();
  return raw.length > 0 ? raw.slice(0, 800) : null;
};

const normalizeShowChannelGroups = (value: unknown) => {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }

  return true;
};

const normalizeHideAllChannels = (value: unknown) => {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
};

const normalizeSettings = (value: Partial<ServerProfileSettings> | undefined): ServerProfileSettings => {
  return {
    description: normalizeDescription(value?.description),
    traits: normalizeStringList(value?.traits, 12, 36),
    gamesPlayed: normalizeStringList(value?.gamesPlayed, 24, 48),
    bannerColor: normalizeHexColor(value?.bannerColor),
    inviteMode: normalizeInviteMode(value?.inviteMode),
    showChannelGroups: normalizeShowChannelGroups(value?.showChannelGroups),
    hideAllChannels: normalizeHideAllChannels(value?.hideAllChannels),
    hiddenChannelIds: normalizeStringIdList(value?.hiddenChannelIds),
  };
};

async function readSettingsMap(): Promise<SettingsMap> {
  try {
    const raw = await readFile(settingsFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as SettingsMap;
  } catch {
    return {};
  }
}

async function writeSettingsMap(map: SettingsMap) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(settingsFile, JSON.stringify(map, null, 2), "utf8");
}

export async function getServerProfileSettings(serverId: string): Promise<ServerProfileSettings> {
  const map = await readSettingsMap();
  const raw = map[serverId];
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_SETTINGS };
  }

  return normalizeSettings(raw);
}

export async function setServerProfileSettings(
  serverId: string,
  next: Partial<ServerProfileSettings>
): Promise<ServerProfileSettings> {
  const map = await readSettingsMap();
  const current = await getServerProfileSettings(serverId);

  const merged = normalizeSettings({
    ...current,
    ...next,
  });

  map[serverId] = merged;
  await writeSettingsMap(map);

  return merged;
}

export async function isServerInviteApprovalRequired(serverId: string): Promise<boolean> {
  const settings = await getServerProfileSettings(serverId);
  return settings.inviteMode === "approval";
}
