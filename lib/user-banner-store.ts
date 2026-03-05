import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type UserBannerMap = Record<string, string>;

const dataDir = path.join(process.cwd(), ".data");
const bannerFile = path.join(dataDir, "user-banners.json");

async function readBannerMap(): Promise<UserBannerMap> {
  try {
    const raw = await readFile(bannerFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed as UserBannerMap;
  } catch {
    return {};
  }
}

async function writeBannerMap(map: UserBannerMap) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(bannerFile, JSON.stringify(map, null, 2), "utf8");
}

export async function getUserBanner(userId: string): Promise<string | null> {
  const map = await readBannerMap();
  const value = map[userId];
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function setUserBanner(userId: string, bannerUrl?: string | null) {
  const map = await readBannerMap();
  const url = typeof bannerUrl === "string" ? bannerUrl.trim() : "";

  if (url.length > 0) {
    map[userId] = url;
  } else {
    delete map[userId];
  }

  await writeBannerMap(map);
}
