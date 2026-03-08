import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type IntegrationBotControl = {
  bootedProfileIds: string[];
  bannedProfileIds: string[];
};

type IntegrationBotControlMap = Record<string, IntegrationBotControl>;

const dataDir = path.join(process.cwd(), ".data");
const controlsFile = path.join(dataDir, "server-integration-bot-controls.json");

const normalizeList = (value: unknown): string[] =>
  Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)))
    : [];

async function readControlMap(): Promise<IntegrationBotControlMap> {
  try {
    const raw = await readFile(controlsFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const normalized: IntegrationBotControlMap = {};
    for (const [serverId, control] of Object.entries(parsed as Record<string, unknown>)) {
      const typed = control as { bootedProfileIds?: unknown; bannedProfileIds?: unknown };
      normalized[serverId] = {
        bootedProfileIds: normalizeList(typed?.bootedProfileIds),
        bannedProfileIds: normalizeList(typed?.bannedProfileIds),
      };
    }

    return normalized;
  } catch {
    return {};
  }
}

async function writeControlMap(map: IntegrationBotControlMap) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(controlsFile, JSON.stringify(map, null, 2), "utf8");
}

export async function getServerIntegrationBotControl(serverId: string): Promise<IntegrationBotControl> {
  const map = await readControlMap();
  const current = map[serverId];
  if (!current) {
    return { bootedProfileIds: [], bannedProfileIds: [] };
  }

  return {
    bootedProfileIds: normalizeList(current.bootedProfileIds),
    bannedProfileIds: normalizeList(current.bannedProfileIds),
  };
}

export async function setServerIntegrationBotBooted(serverId: string, profileId: string, booted: boolean) {
  if (!profileId.trim()) {
    return;
  }

  const map = await readControlMap();
  const current = await getServerIntegrationBotControl(serverId);
  const next = new Set(current.bootedProfileIds);

  if (booted) {
    next.add(profileId);
  } else {
    next.delete(profileId);
  }

  map[serverId] = {
    ...current,
    bootedProfileIds: Array.from(next),
  };

  await writeControlMap(map);
}

export async function setServerIntegrationBotBanned(serverId: string, profileId: string, banned: boolean) {
  if (!profileId.trim()) {
    return;
  }

  const map = await readControlMap();
  const current = await getServerIntegrationBotControl(serverId);
  const next = new Set(current.bannedProfileIds);

  if (banned) {
    next.add(profileId);
  } else {
    next.delete(profileId);
  }

  map[serverId] = {
    ...current,
    bannedProfileIds: Array.from(next),
  };

  await writeControlMap(map);
}

export async function isServerIntegrationBotBanned(serverId: string, profileId: string): Promise<boolean> {
  const current = await getServerIntegrationBotControl(serverId);
  return current.bannedProfileIds.includes(profileId);
}

export async function clearServerIntegrationBotFlags(serverId: string, profileId: string) {
  const map = await readControlMap();
  const current = await getServerIntegrationBotControl(serverId);

  map[serverId] = {
    bootedProfileIds: current.bootedProfileIds.filter((id) => id !== profileId),
    bannedProfileIds: current.bannedProfileIds.filter((id) => id !== profileId),
  };

  await writeControlMap(map);
}
