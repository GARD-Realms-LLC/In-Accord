import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { toInAboardImageUrl } from "@/lib/in-aboard-image-url";

const dataDir = path.join(process.cwd(), ".data");
const boardFile = path.join(dataDir, "our-board.json");

export const OUR_BOARD_BUMP_COOLDOWN_MS = 60 * 60 * 1000;

export type OurBoardEntry = {
  serverId: string;
  serverName: string;
  imageUrl: string | null;
  bannerUrl: string | null;
  tags: string[];
  ownerProfileId: string;
  ownerDisplayName: string;
  ownerEmail: string | null;
  listed: boolean;
  description: string;
  bumpChannelId: string | null;
  bumpCount: number;
  lastBumpedAt: string | null;
  lastBumpedByProfileId: string | null;
  bumpTimestampsByProfileId: Record<string, string>;
  manageToken: string;
  createdAt: string;
  updatedAt: string;
};

type OurBoardMap = Record<string, Partial<OurBoardEntry> | undefined>;

const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 32;

const normalizeString = (value: unknown, maxLength = 191) => String(value ?? "").trim().slice(0, maxLength);

const normalizeNullableString = (value: unknown, maxLength = 191) => {
  const normalized = normalizeString(value, maxLength);
  return normalized.length > 0 ? normalized : null;
};

const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    const tag = normalizeString(item, MAX_TAG_LENGTH);
    if (!tag) {
      continue;
    }

    const key = tag.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(tag);

    if (normalized.length >= MAX_TAGS) {
      break;
    }
  }

  return normalized;
};

const normalizeBoolean = (value: unknown, fallback = true) => {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (normalized === "false" || normalized === "0" || normalized === "off" || normalized === "no") {
    return false;
  }

  if (normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes") {
    return true;
  }

  return fallback;
};

const normalizeIsoTimestamp = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};

const normalizeBumpTimestampsByProfileId = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const normalized: Record<string, string> = {};

  for (const [rawProfileId, rawTimestamp] of Object.entries(source)) {
    const profileId = normalizeString(rawProfileId, 191);
    if (!profileId) {
      continue;
    }

    const timestamp = normalizeIsoTimestamp(rawTimestamp);
    if (!timestamp) {
      continue;
    }

    normalized[profileId] = timestamp;
  }

  return normalized;
};

const normalizeEntry = (
  value: Partial<OurBoardEntry> | undefined,
  fallback?: Partial<OurBoardEntry>
): OurBoardEntry | null => {
  const serverId = normalizeString(value?.serverId ?? fallback?.serverId, 191);
  const ownerProfileId = normalizeString(value?.ownerProfileId ?? fallback?.ownerProfileId, 191);

  if (!serverId || !ownerProfileId) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const createdAt = normalizeIsoTimestamp(value?.createdAt ?? fallback?.createdAt) ?? nowIso;
  const updatedAt = normalizeIsoTimestamp(value?.updatedAt ?? fallback?.updatedAt) ?? createdAt;

  return {
    serverId,
    serverName: normalizeString(value?.serverName ?? fallback?.serverName ?? "Untitled Server", 191) || "Untitled Server",
    imageUrl: normalizeNullableString(value?.imageUrl ?? fallback?.imageUrl, 2000),
    bannerUrl: toInAboardImageUrl(value?.bannerUrl ?? fallback?.bannerUrl),
    tags: normalizeTags(value?.tags ?? fallback?.tags),
    ownerProfileId,
    ownerDisplayName:
      normalizeString(value?.ownerDisplayName ?? fallback?.ownerDisplayName ?? "Unknown Owner", 191) ||
      "Unknown Owner",
    ownerEmail: normalizeNullableString(value?.ownerEmail ?? fallback?.ownerEmail, 320),
    listed: normalizeBoolean(value?.listed ?? fallback?.listed, true),
    description: normalizeString(value?.description ?? fallback?.description, 800),
    bumpChannelId: normalizeNullableString(value?.bumpChannelId ?? fallback?.bumpChannelId, 191),
    bumpCount: Math.max(0, Number.parseInt(String(value?.bumpCount ?? fallback?.bumpCount ?? 0), 10) || 0),
    lastBumpedAt: normalizeIsoTimestamp(value?.lastBumpedAt ?? fallback?.lastBumpedAt),
    lastBumpedByProfileId: normalizeNullableString(
      value?.lastBumpedByProfileId ?? fallback?.lastBumpedByProfileId,
      191
    ),
    bumpTimestampsByProfileId: normalizeBumpTimestampsByProfileId(
      value?.bumpTimestampsByProfileId ?? fallback?.bumpTimestampsByProfileId
    ),
    manageToken: normalizeString(value?.manageToken ?? fallback?.manageToken ?? randomUUID(), 128) || randomUUID(),
    createdAt,
    updatedAt,
  };
};

const readBoardMap = async (): Promise<OurBoardMap> => {
  try {
    const raw = await readFile(boardFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as OurBoardMap;
  } catch {
    return {};
  }
};

const writeBoardMap = async (map: OurBoardMap) => {
  await mkdir(dataDir, { recursive: true });
  await writeFile(boardFile, JSON.stringify(map, null, 2), "utf8");
};

const withSortedEntries = (entries: OurBoardEntry[]) =>
  [...entries].sort((left, right) => {
    const leftBump = left.lastBumpedAt ? new Date(left.lastBumpedAt).getTime() : 0;
    const rightBump = right.lastBumpedAt ? new Date(right.lastBumpedAt).getTime() : 0;

    if (leftBump !== rightBump) {
      return rightBump - leftBump;
    }

    if (left.bumpCount !== right.bumpCount) {
      return right.bumpCount - left.bumpCount;
    }

    return left.serverName.localeCompare(right.serverName);
  });

export const listOurBoardEntries = async (): Promise<OurBoardEntry[]> => {
  const map = await readBoardMap();

  const entries = Object.values(map)
    .map((entry) => normalizeEntry(entry))
    .filter((entry): entry is OurBoardEntry => entry !== null);

  return withSortedEntries(entries);
};

export const listPublicOurBoardEntries = async (): Promise<OurBoardEntry[]> => {
  const all = await listOurBoardEntries();
  return all.filter((entry) => entry.listed);
};

export const getOurBoardEntryByServerId = async (serverId: string) => {
  const normalizedServerId = normalizeString(serverId, 191);
  if (!normalizedServerId) {
    return null;
  }

  const map = await readBoardMap();
  return normalizeEntry(map[normalizedServerId], { serverId: normalizedServerId }) ?? null;
};

export const getOurBoardEntryByManageToken = async (manageToken: string) => {
  const normalizedToken = normalizeString(manageToken, 128);
  if (!normalizedToken) {
    return null;
  }

  const all = await listOurBoardEntries();
  return all.find((entry) => entry.manageToken === normalizedToken) ?? null;
};

export const upsertOurBoardEntry = async ({
  serverId,
  serverName,
  imageUrl,
  bannerUrl,
  ownerProfileId,
  ownerDisplayName,
  ownerEmail,
}: {
  serverId: string;
  serverName: string;
  imageUrl: string | null;
  bannerUrl?: string | null;
  ownerProfileId: string;
  ownerDisplayName: string;
  ownerEmail?: string | null;
}) => {
  const normalizedServerId = normalizeString(serverId, 191);
  const normalizedOwnerId = normalizeString(ownerProfileId, 191);

  if (!normalizedServerId || !normalizedOwnerId) {
    throw new Error("Invalid server/owner for In-Aboard entry.");
  }

  const normalizedImageUrl = toInAboardImageUrl(imageUrl);
  const normalizedBannerUrl = toInAboardImageUrl(bannerUrl);

  const map = await readBoardMap();
  const existing = normalizeEntry(map[normalizedServerId], {
    serverId: normalizedServerId,
    ownerProfileId: normalizedOwnerId,
  });

  const nowIso = new Date().toISOString();

  const next = normalizeEntry(
    {
      ...existing,
      serverId: normalizedServerId,
      serverName,
      imageUrl: normalizedImageUrl,
      bannerUrl: normalizedBannerUrl ?? existing?.bannerUrl ?? null,
      ownerProfileId: normalizedOwnerId,
      ownerDisplayName,
      ownerEmail: ownerEmail ?? existing?.ownerEmail ?? null,
      updatedAt: nowIso,
      createdAt: existing?.createdAt ?? nowIso,
      manageToken: existing?.manageToken ?? randomUUID(),
    },
    {
      serverId: normalizedServerId,
      ownerProfileId: normalizedOwnerId,
    }
  );

  if (!next) {
    throw new Error("Unable to normalize In-Aboard entry.");
  }

  map[normalizedServerId] = next;
  await writeBoardMap(map);

  return next;
};

export const updateOurBoardEntryByOwner = async ({
  serverId,
  ownerProfileId,
  patch,
}: {
  serverId: string;
  ownerProfileId: string;
  patch: Partial<
    Pick<
      OurBoardEntry,
      "listed" | "description" | "tags" | "bumpChannelId" | "serverName" | "imageUrl" | "bannerUrl" | "ownerDisplayName" | "ownerEmail"
    >
  >;
}) => {
  const normalizedServerId = normalizeString(serverId, 191);
  const normalizedOwnerId = normalizeString(ownerProfileId, 191);

  if (!normalizedServerId || !normalizedOwnerId) {
    throw new Error("Invalid In-Aboard owner update request.");
  }

  const map = await readBoardMap();
  const existing = normalizeEntry(map[normalizedServerId], {
    serverId: normalizedServerId,
    ownerProfileId: normalizedOwnerId,
  });

  if (!existing) {
    throw new Error("In-Aboard entry not found.");
  }

  if (existing.ownerProfileId !== normalizedOwnerId) {
    throw new Error("Forbidden");
  }

  const next = normalizeEntry(
    {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    },
    existing
  );

  if (!next) {
    throw new Error("Unable to normalize updated In-Aboard entry.");
  }

  map[normalizedServerId] = next;
  await writeBoardMap(map);

  return next;
};

export const updateOurBoardEntryByServerId = async ({
  serverId,
  patch,
}: {
  serverId: string;
  patch: Partial<
    Pick<
      OurBoardEntry,
      "listed" | "description" | "tags" | "bumpChannelId" | "serverName" | "imageUrl" | "bannerUrl" | "ownerDisplayName" | "ownerEmail"
    >
  >;
}) => {
  const normalizedServerId = normalizeString(serverId, 191);
  if (!normalizedServerId) {
    throw new Error("Invalid In-Aboard server update request.");
  }

  const map = await readBoardMap();
  const existing = normalizeEntry(map[normalizedServerId], {
    serverId: normalizedServerId,
  });

  if (!existing) {
    throw new Error("In-Aboard entry not found.");
  }

  const next = normalizeEntry(
    {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    },
    existing
  );

  if (!next) {
    throw new Error("Unable to normalize updated In-Aboard entry.");
  }

  map[normalizedServerId] = next;
  await writeBoardMap(map);

  return next;
};

export const updateOurBoardEntryByToken = async ({
  manageToken,
  patch,
}: {
  manageToken: string;
  patch: Partial<Pick<OurBoardEntry, "listed" | "description">>;
}) => {
  const normalizedToken = normalizeString(manageToken, 128);
  if (!normalizedToken) {
    throw new Error("Invalid manage token.");
  }

  const map = await readBoardMap();
  const match = Object.entries(map).find(([, value]) => {
    const normalized = normalizeEntry(value);
    return normalized?.manageToken === normalizedToken;
  });

  if (!match) {
    throw new Error("Invalid manage token.");
  }

  const [serverId, rawEntry] = match;
  const existing = normalizeEntry(rawEntry);
  if (!existing) {
    throw new Error("In-Aboard entry not found.");
  }

  const next = normalizeEntry(
    {
      ...existing,
      listed: typeof patch.listed === "boolean" ? patch.listed : existing.listed,
      description: typeof patch.description === "string" ? patch.description : existing.description,
      updatedAt: new Date().toISOString(),
    },
    existing
  );

  if (!next) {
    throw new Error("Unable to normalize updated In-Aboard entry.");
  }

  map[serverId] = next;
  await writeBoardMap(map);

  return next;
};

export const recordOurBoardBump = async ({
  serverId,
  channelId,
  actorProfileId,
}: {
  serverId: string;
  channelId: string;
  actorProfileId: string;
}) => {
  const normalizedServerId = normalizeString(serverId, 191);
  const normalizedChannelId = normalizeString(channelId, 191);
  const normalizedActorId = normalizeString(actorProfileId, 191);

  if (!normalizedServerId || !normalizedChannelId || !normalizedActorId) {
    throw new Error("Invalid bump request.");
  }

  const map = await readBoardMap();
  const existing = normalizeEntry(map[normalizedServerId]);

  if (!existing) {
    throw new Error("In-Aboard entry not found for this server.");
  }

  if (existing.bumpChannelId && existing.bumpChannelId !== normalizedChannelId) {
    return {
      ok: false as const,
      code: "CHANNEL_NOT_ALLOWED" as const,
      message: "This server only allows /bump in the configured bump channel.",
      entry: existing,
      cooldownMsRemaining: 0,
    };
  }

  const nowMs = Date.now();
  const actorLastBumpedAt = existing.bumpTimestampsByProfileId?.[normalizedActorId] ?? null;
  const actorLastBumpedMs = actorLastBumpedAt ? new Date(actorLastBumpedAt).getTime() : 0;
  const elapsed = actorLastBumpedMs > 0 ? nowMs - actorLastBumpedMs : Number.POSITIVE_INFINITY;

  if (elapsed < OUR_BOARD_BUMP_COOLDOWN_MS) {
    const remaining = OUR_BOARD_BUMP_COOLDOWN_MS - elapsed;
    return {
      ok: false as const,
      code: "COOLDOWN" as const,
      message: "Bump cooldown is still active.",
      entry: existing,
      cooldownMsRemaining: Math.max(0, remaining),
    };
  }

  const nowIso = new Date(nowMs).toISOString();
  const next = normalizeEntry(
    {
      ...existing,
      listed: true,
      bumpCount: existing.bumpCount + 1,
      lastBumpedAt: nowIso,
      lastBumpedByProfileId: normalizedActorId,
      bumpTimestampsByProfileId: {
        ...(existing.bumpTimestampsByProfileId ?? {}),
        [normalizedActorId]: nowIso,
      },
      updatedAt: nowIso,
    },
    existing
  );

  if (!next) {
    throw new Error("Unable to normalize bumped In-Aboard entry.");
  }

  map[normalizedServerId] = next;
  await writeBoardMap(map);

  return {
    ok: true as const,
    code: "OK" as const,
    message: "Server bumped successfully.",
    entry: next,
    cooldownMsRemaining: 0,
  };
};
