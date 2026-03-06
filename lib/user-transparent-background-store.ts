import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type TransparentBackgroundSettings = {
  selectedBackground: string | null;
  uploadedBackgrounds: string[];
};

type TransparentBackgroundMap = Record<string, TransparentBackgroundSettings>;

const dataDir = path.join(process.cwd(), ".data");
const settingsFile = path.join(dataDir, "user-transparent-backgrounds.json");

const normalizeUrlList = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }

  const unique = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    unique.add(trimmed);
    if (unique.size >= 40) {
      break;
    }
  }

  return Array.from(unique);
};

const normalizeSelectedBackground = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeSettings = (value: unknown): TransparentBackgroundSettings => {
  if (!value || typeof value !== "object") {
    return {
      selectedBackground: null,
      uploadedBackgrounds: [],
    };
  }

  const source = value as {
    selectedBackground?: unknown;
    uploadedBackgrounds?: unknown;
  };

  return {
    selectedBackground: normalizeSelectedBackground(source.selectedBackground),
    uploadedBackgrounds: normalizeUrlList(source.uploadedBackgrounds),
  };
};

async function readSettingsMap(): Promise<TransparentBackgroundMap> {
  try {
    const raw = await readFile(settingsFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const result: TransparentBackgroundMap = {};
    for (const [userId, value] of Object.entries(parsed as Record<string, unknown>)) {
      result[userId] = normalizeSettings(value);
    }

    return result;
  } catch {
    return {};
  }
}

async function writeSettingsMap(map: TransparentBackgroundMap) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(settingsFile, JSON.stringify(map, null, 2), "utf8");
}

export async function getUserTransparentBackgroundSettings(
  userId: string
): Promise<TransparentBackgroundSettings> {
  const map = await readSettingsMap();
  const value = map[userId];

  if (!value) {
    return {
      selectedBackground: null,
      uploadedBackgrounds: [],
    };
  }

  return normalizeSettings(value);
}

export async function setUserTransparentBackgroundSettings(
  userId: string,
  settings: {
    selectedBackground?: string | null;
    uploadedBackgrounds?: string[];
  }
) {
  const map = await readSettingsMap();

  const normalized = normalizeSettings({
    selectedBackground: settings.selectedBackground,
    uploadedBackgrounds: settings.uploadedBackgrounds,
  });

  map[userId] = normalized;
  await writeSettingsMap(map);

  return normalized;
}
