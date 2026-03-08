import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type BannerFitMode = "cover" | "contain" | "scale";

export interface ServerBannerConfig {
  url: string;
  fit: BannerFitMode;
  scale: number;
}

type BannerMap = Record<string, string | ServerBannerConfig>;

const dataDir = path.join(process.cwd(), ".data");
const bannerFile = path.join(dataDir, "server-banners.json");

async function readBannerMap(): Promise<BannerMap> {
  try {
    const raw = await readFile(bannerFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed as BannerMap;
  } catch {
    return {};
  }
}

async function writeBannerMap(map: BannerMap) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(bannerFile, JSON.stringify(map, null, 2), "utf8");
}

const normalizeScale = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 1;
  }
  return Math.min(2, Math.max(0.25, value));
};

const normalizeFit = (value?: string): BannerFitMode => {
  if (value === "contain" || value === "scale") {
    return value;
  }
  return "cover";
};

export async function getServerBannerConfig(serverId: string): Promise<ServerBannerConfig | null> {
  const map = await readBannerMap();
  const value = map[serverId];

  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return {
      url: trimmed,
      fit: "cover",
      scale: 1,
    };
  }

  const trimmed = typeof value.url === "string" ? value.url.trim() : "";
  if (!trimmed) {
    return null;
  }

  return {
    url: trimmed,
    fit: normalizeFit(value.fit),
    scale: normalizeScale(value.scale),
  };
}

export async function getServerBanner(serverId: string): Promise<string | null> {
  const config = await getServerBannerConfig(serverId);
  return config?.url ?? null;
}

export async function setServerBanner(serverId: string, bannerUrl?: string | null) {
  await setServerBannerConfig(serverId, {
    url: bannerUrl ?? "",
    fit: "cover",
    scale: 1,
  });
}

export async function setServerBannerConfig(
  serverId: string,
  config?: { url?: string | null; fit?: BannerFitMode | string; scale?: number }
) {
  const map = await readBannerMap();
  const url = typeof config?.url === "string" ? config.url.trim() : "";

  if (url.length > 0) {
    map[serverId] = {
      url,
      fit: normalizeFit(config?.fit),
      scale: normalizeScale(config?.scale),
    };
  } else {
    delete map[serverId];
  }

  await writeBannerMap(map);
}
