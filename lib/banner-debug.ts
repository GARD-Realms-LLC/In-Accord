import "server-only";

import { mkdir, readFile, stat, writeFile, appendFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type BannerDebugEvent = {
  source: string;
  stage: string;
  rawValue?: unknown;
  resolvedValue?: unknown;
  requestUrl?: string | null;
  key?: string | null;
  status?: number | null;
  detail?: string | null;
  metadata?: Record<string, unknown>;
};

const BANNER_DEBUG_ENABLED = process.env.INACCORD_BANNER_DEBUG === "1";
const dataDir = path.join(os.tmpdir(), "in-accord", "debug");
const bannerDebugPath = path.join(dataDir, "banner-debug.jsonl");
const MAX_BANNER_DEBUG_BYTES = Math.max(
  256 * 1024,
  Number(process.env.INACCORD_BANNER_DEBUG_MAX_BYTES || 2 * 1024 * 1024)
);
const MAX_BANNER_DEBUG_LINES = Math.max(50, Number(process.env.INACCORD_BANNER_DEBUG_MAX_LINES || 300));

let bannerDebugWriteQueue: Promise<void> = Promise.resolve();

const sanitizeValue = (value: unknown): unknown => {
  if (value == null) {
    return value;
  }

  if (typeof value === "string") {
    return value.slice(0, 4096);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 25)
        .map(([key, entryValue]) => [key, sanitizeValue(entryValue)])
    );
  }

  return value;
};

const trimBannerDebugFileIfNeeded = async () => {
  try {
    const fileStat = await stat(bannerDebugPath).catch(() => null);
    if (!fileStat || fileStat.size <= MAX_BANNER_DEBUG_BYTES) {
      return;
    }

    const content = await readFile(bannerDebugPath, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);
    const trimmed = lines.slice(-MAX_BANNER_DEBUG_LINES).join("\n");
    await writeFile(bannerDebugPath, trimmed ? `${trimmed}\n` : "", "utf8");
  } catch {
    // Debug logging must never break the app.
  }
};

export const appendBannerDebugEvent = async (event: BannerDebugEvent) => {
  if (!BANNER_DEBUG_ENABLED) {
    return;
  }

  bannerDebugWriteQueue = bannerDebugWriteQueue.then(async () => {
    try {
      await mkdir(dataDir, { recursive: true });
      const payload = JSON.stringify({
        timestamp: new Date().toISOString(),
        source: event.source,
        stage: event.stage,
        rawValue: sanitizeValue(event.rawValue),
        resolvedValue: sanitizeValue(event.resolvedValue),
        requestUrl: event.requestUrl ?? null,
        key: event.key ?? null,
        status: event.status ?? null,
        detail: event.detail ?? null,
        metadata: sanitizeValue(event.metadata ?? {}),
      });
      await appendFile(bannerDebugPath, `${payload}\n`, "utf8");
      await trimBannerDebugFileIfNeeded();
    } catch {
      // Debug logging must never break the app.
    }
  });

  return bannerDebugWriteQueue;
};

export const readRecentBannerDebugEvents = async (limit = 100) => {
  if (!BANNER_DEBUG_ENABLED) {
    return [];
  }

  try {
    const content = await readFile(bannerDebugPath, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);
    return lines
      .slice(-Math.max(1, Math.min(limit, MAX_BANNER_DEBUG_LINES)))
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return { timestamp: new Date().toISOString(), source: "banner-debug", stage: "parse-error", detail: line };
        }
      });
  } catch {
    return [];
  }
};

export const getBannerDebugLogPath = () => bannerDebugPath;