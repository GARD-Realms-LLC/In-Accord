import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type ServerInviteHistoryItem = {
  code: string;
  createdAt: string;
  source: "created" | "regenerated";
  createdByProfileId?: string;
  usedCount?: number;
  usedByProfileIds?: string[];
};

type ServerInviteMap = Record<string, ServerInviteHistoryItem[]>;

const dataDir = path.join(process.cwd(), ".data");
const inviteFile = path.join(dataDir, "server-invite-history.json");

async function readInviteMap(): Promise<ServerInviteMap> {
  try {
    const raw = await readFile(inviteFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed as ServerInviteMap;
  } catch {
    return {};
  }
}

async function writeInviteMap(map: ServerInviteMap) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(inviteFile, JSON.stringify(map, null, 2), "utf8");
}

export async function getServerInviteHistory(serverId: string): Promise<ServerInviteHistoryItem[]> {
  const map = await readInviteMap();
  const entries = (map[serverId] ?? []).map((entry) => ({
    ...entry,
    usedCount:
      typeof entry.usedCount === "number"
        ? entry.usedCount
        : Array.isArray(entry.usedByProfileIds)
          ? entry.usedByProfileIds.length
          : 0,
    usedByProfileIds: Array.isArray(entry.usedByProfileIds)
      ? Array.from(new Set(entry.usedByProfileIds.filter((id) => typeof id === "string" && id.trim().length > 0)))
      : [],
  }));

  return entries.sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime() || 0;
    const bTime = new Date(b.createdAt).getTime() || 0;
    return bTime - aTime;
  });
}

export async function appendServerInviteHistory(
  serverId: string,
  input: {
    code: string;
    source: "created" | "regenerated";
    createdByProfileId?: string;
    createdAt?: string;
  }
) {
  const code = (input.code ?? "").trim();
  if (!code) {
    return;
  }

  const map = await readInviteMap();
  const current = map[serverId] ?? [];

  if (!current.some((item) => item.code === code)) {
    current.push({
      code,
      source: input.source,
      createdByProfileId: input.createdByProfileId,
      createdAt: input.createdAt ?? new Date().toISOString(),
      usedCount: 0,
      usedByProfileIds: [],
    });
  }

  map[serverId] = current;
  await writeInviteMap(map);
}

export async function recordServerInviteUse(serverId: string, codeInput: string, profileIdInput: string) {
  const code = (codeInput ?? "").trim();
  const profileId = (profileIdInput ?? "").trim();

  if (!code || !profileId) {
    return;
  }

  const map = await readInviteMap();
  const current = map[serverId] ?? [];

  let entry = current.find((item) => item.code === code);

  if (!entry) {
    entry = {
      code,
      source: "created",
      createdAt: new Date().toISOString(),
      usedCount: 0,
      usedByProfileIds: [],
    };
    current.push(entry);
  }

  const usedBy = new Set(
    Array.isArray(entry.usedByProfileIds)
      ? entry.usedByProfileIds.filter((id) => typeof id === "string" && id.trim().length > 0)
      : []
  );

  const sizeBefore = usedBy.size;
  usedBy.add(profileId);

  if (usedBy.size !== sizeBefore) {
    entry.usedByProfileIds = Array.from(usedBy);
    entry.usedCount = entry.usedByProfileIds.length;
    map[serverId] = current;
    await writeInviteMap(map);
  }
}

export async function removeServerInviteHistory(serverId: string, codeInput: string) {
  const code = (codeInput ?? "").trim();
  if (!code) {
    return;
  }

  const map = await readInviteMap();
  const current = map[serverId] ?? [];
  const next = current.filter((item) => item.code !== code);

  map[serverId] = next;
  await writeInviteMap(map);
}
