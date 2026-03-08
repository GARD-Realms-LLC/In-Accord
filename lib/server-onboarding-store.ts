import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type ServerOnboardingPrompt = {
  id: string;
  question: string;
  options: string[];
  required: boolean;
  multiple: boolean;
};

export type ServerOnboardingConfig = {
  enabled: boolean;
  welcomeMessage: string;
  bannerPreset: string;
  bannerUrl: string;
  checklistChannelIds: string[];
  resourceChannelIds: string[];
  prompts: ServerOnboardingPrompt[];
  updatedAt: string;
};

type ServerOnboardingMap = Record<string, ServerOnboardingConfig>;

const dataDir = path.join(process.cwd(), ".data");
const onboardingFile = path.join(dataDir, "server-onboarding.json");

const normalizeStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
        )
      )
    : [];

const normalizePrompt = (value: unknown, index: number): ServerOnboardingPrompt | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const typed = value as {
    id?: unknown;
    question?: unknown;
    options?: unknown;
    required?: unknown;
    multiple?: unknown;
  };

  const id = typeof typed.id === "string" && typed.id.trim().length > 0 ? typed.id.trim() : `prompt-${index + 1}`;
  const question = typeof typed.question === "string" ? typed.question.trim() : "";

  if (!question) {
    return null;
  }

  const options = normalizeStringArray(typed.options).slice(0, 12);

  return {
    id,
    question,
    options,
    required: Boolean(typed.required),
    multiple: Boolean(typed.multiple),
  };
};

const normalizeConfig = (value: unknown): ServerOnboardingConfig => {
  const typed = (value ?? {}) as {
    enabled?: unknown;
    welcomeMessage?: unknown;
    bannerPreset?: unknown;
    bannerUrl?: unknown;
    checklistChannelIds?: unknown;
    resourceChannelIds?: unknown;
    prompts?: unknown;
    updatedAt?: unknown;
  };

  return {
    enabled: Boolean(typed.enabled),
    welcomeMessage:
      typeof typed.welcomeMessage === "string"
        ? typed.welcomeMessage.trim().slice(0, 500)
        : "Welcome to the server! Complete onboarding to unlock your best channels.",
    bannerPreset:
      typeof typed.bannerPreset === "string"
        ? typed.bannerPreset.trim().slice(0, 64)
        : "aurora",
    bannerUrl:
      typeof typed.bannerUrl === "string"
        ? typed.bannerUrl.trim().slice(0, 2000)
        : "",
    checklistChannelIds: normalizeStringArray(typed.checklistChannelIds).slice(0, 8),
    resourceChannelIds: normalizeStringArray(typed.resourceChannelIds).slice(0, 12),
    prompts: Array.isArray(typed.prompts)
      ? typed.prompts
          .map((promptItem, index) => normalizePrompt(promptItem, index))
          .filter((promptItem): promptItem is ServerOnboardingPrompt => Boolean(promptItem))
          .slice(0, 8)
      : [],
    updatedAt:
      typeof typed.updatedAt === "string" && typed.updatedAt.trim().length > 0
        ? typed.updatedAt
        : new Date().toISOString(),
  };
};

async function readOnboardingMap(): Promise<ServerOnboardingMap> {
  try {
    const raw = await readFile(onboardingFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const normalized: ServerOnboardingMap = {};
    for (const [serverId, config] of Object.entries(parsed as Record<string, unknown>)) {
      normalized[serverId] = normalizeConfig(config);
    }

    return normalized;
  } catch {
    return {};
  }
}

async function writeOnboardingMap(map: ServerOnboardingMap) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(onboardingFile, JSON.stringify(map, null, 2), "utf8");
}

export async function getServerOnboardingConfig(serverId: string): Promise<ServerOnboardingConfig> {
  const map = await readOnboardingMap();
  return normalizeConfig(map[serverId]);
}

export async function setServerOnboardingConfig(serverId: string, input: Partial<ServerOnboardingConfig>) {
  const map = await readOnboardingMap();
  const current = normalizeConfig(map[serverId]);

  map[serverId] = normalizeConfig({
    ...current,
    ...input,
    updatedAt: new Date().toISOString(),
  });

  await writeOnboardingMap(map);

  return map[serverId];
}
