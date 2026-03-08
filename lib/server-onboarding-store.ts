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

export type ServerOnboardingResponseAnswer = {
  promptId: string;
  values: string[];
};

export type ServerOnboardingReviewStatus = "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_REVIEW";

export type ServerOnboardingResponse = {
  id: string;
  serverId: string;
  memberId: string;
  profileId: string;
  answers: ServerOnboardingResponseAnswer[];
  reviewStatus: ServerOnboardingReviewStatus;
  reviewNote: string;
  reviewedByProfileId: string | null;
  reviewedAt: string | null;
  submittedAt: string;
  updatedAt: string;
};

type ServerOnboardingMap = Record<string, ServerOnboardingConfig>;
type ServerOnboardingResponsesMap = Record<string, ServerOnboardingResponse[]>;

const dataDir = path.join(process.cwd(), ".data");
const onboardingFile = path.join(dataDir, "server-onboarding.json");
const onboardingResponsesFile = path.join(dataDir, "server-onboarding-responses.json");

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

const normalizeResponseAnswer = (value: unknown): ServerOnboardingResponseAnswer | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const typed = value as {
    promptId?: unknown;
    values?: unknown;
  };

  const promptId = typeof typed.promptId === "string" ? typed.promptId.trim() : "";
  if (!promptId) {
    return null;
  }

  const values = normalizeStringArray(typed.values).slice(0, 12);

  return {
    promptId,
    values,
  };
};

const normalizeResponse = (value: unknown): ServerOnboardingResponse | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const typed = value as {
    id?: unknown;
    serverId?: unknown;
    memberId?: unknown;
    profileId?: unknown;
    answers?: unknown;
    reviewStatus?: unknown;
    reviewNote?: unknown;
    reviewedByProfileId?: unknown;
    reviewedAt?: unknown;
    submittedAt?: unknown;
    updatedAt?: unknown;
  };

  const id = typeof typed.id === "string" ? typed.id.trim() : "";
  const serverId = typeof typed.serverId === "string" ? typed.serverId.trim() : "";
  const memberId = typeof typed.memberId === "string" ? typed.memberId.trim() : "";
  const profileId = typeof typed.profileId === "string" ? typed.profileId.trim() : "";

  if (!id || !serverId || !memberId || !profileId) {
    return null;
  }

  const answers = Array.isArray(typed.answers)
    ? typed.answers
        .map((answerItem) => normalizeResponseAnswer(answerItem))
        .filter((answerItem): answerItem is ServerOnboardingResponseAnswer => Boolean(answerItem))
        .slice(0, 8)
    : [];

  const nowIso = new Date().toISOString();
  const submittedAt =
    typeof typed.submittedAt === "string" && typed.submittedAt.trim().length > 0
      ? typed.submittedAt
      : nowIso;
  const updatedAt =
    typeof typed.updatedAt === "string" && typed.updatedAt.trim().length > 0
      ? typed.updatedAt
      : submittedAt;

  return {
    id,
    serverId,
    memberId,
    profileId,
    answers,
    reviewStatus:
      typed.reviewStatus === "APPROVED" ||
      typed.reviewStatus === "REJECTED" ||
      typed.reviewStatus === "NEEDS_REVIEW"
        ? typed.reviewStatus
        : "PENDING",
    reviewNote: typeof typed.reviewNote === "string" ? typed.reviewNote.trim().slice(0, 500) : "",
    reviewedByProfileId:
      typeof typed.reviewedByProfileId === "string" && typed.reviewedByProfileId.trim().length > 0
        ? typed.reviewedByProfileId.trim()
        : null,
    reviewedAt:
      typeof typed.reviewedAt === "string" && typed.reviewedAt.trim().length > 0
        ? typed.reviewedAt
        : null,
    submittedAt,
    updatedAt,
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

async function readOnboardingResponsesMap(): Promise<ServerOnboardingResponsesMap> {
  try {
    const raw = await readFile(onboardingResponsesFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const normalized: ServerOnboardingResponsesMap = {};
    for (const [serverId, responses] of Object.entries(parsed as Record<string, unknown>)) {
      const normalizedResponses = Array.isArray(responses)
        ? responses
            .map((responseItem) => normalizeResponse(responseItem))
            .filter((responseItem): responseItem is ServerOnboardingResponse => Boolean(responseItem))
        : [];

      normalized[serverId] = normalizedResponses;
    }

    return normalized;
  } catch {
    return {};
  }
}

async function writeOnboardingResponsesMap(map: ServerOnboardingResponsesMap) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(onboardingResponsesFile, JSON.stringify(map, null, 2), "utf8");
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

export async function getServerOnboardingResponses(serverId: string): Promise<ServerOnboardingResponse[]> {
  const map = await readOnboardingResponsesMap();
  return (map[serverId] ?? []).filter((item) => item.serverId === serverId);
}

export async function getServerOnboardingResponseByMember(serverId: string, memberId: string) {
  const responses = await getServerOnboardingResponses(serverId);
  return responses.find((item) => item.memberId === memberId) ?? null;
}

type UpsertServerOnboardingResponseInput = {
  serverId: string;
  memberId: string;
  profileId: string;
  answers: ServerOnboardingResponseAnswer[];
};

export async function upsertServerOnboardingResponse(input: UpsertServerOnboardingResponseInput) {
  const map = await readOnboardingResponsesMap();
  const existing = map[input.serverId] ?? [];
  const nowIso = new Date().toISOString();

  const normalizedAnswers = input.answers
    .map((answerItem) => normalizeResponseAnswer(answerItem))
    .filter((answerItem): answerItem is ServerOnboardingResponseAnswer => Boolean(answerItem))
    .slice(0, 8);

  const existingIndex = existing.findIndex((item) => item.memberId === input.memberId);

  if (existingIndex >= 0) {
    const previous = existing[existingIndex];
    existing[existingIndex] = {
      ...previous,
      profileId: input.profileId,
      answers: normalizedAnswers,
      reviewStatus: "PENDING",
      reviewNote: "",
      reviewedByProfileId: null,
      reviewedAt: null,
      updatedAt: nowIso,
    };

    map[input.serverId] = existing;
    await writeOnboardingResponsesMap(map);
    return existing[existingIndex];
  }

  const created: ServerOnboardingResponse = {
    id: `response-${input.memberId}-${Date.now()}`,
    serverId: input.serverId,
    memberId: input.memberId,
    profileId: input.profileId,
    answers: normalizedAnswers,
    reviewStatus: "PENDING",
    reviewNote: "",
    reviewedByProfileId: null,
    reviewedAt: null,
    submittedAt: nowIso,
    updatedAt: nowIso,
  };

  map[input.serverId] = [...existing, created];
  await writeOnboardingResponsesMap(map);
  return created;
}

type SetServerOnboardingResponseReviewInput = {
  serverId: string;
  responseId: string;
  reviewStatus: ServerOnboardingReviewStatus;
  reviewNote?: string;
  reviewedByProfileId: string;
};

export async function setServerOnboardingResponseReview(input: SetServerOnboardingResponseReviewInput) {
  const map = await readOnboardingResponsesMap();
  const responses = map[input.serverId] ?? [];
  const targetIndex = responses.findIndex((item) => item.id === input.responseId);

  if (targetIndex < 0) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const previous = responses[targetIndex];

  responses[targetIndex] = {
    ...previous,
    reviewStatus: input.reviewStatus,
    reviewNote: typeof input.reviewNote === "string" ? input.reviewNote.trim().slice(0, 500) : "",
    reviewedByProfileId: input.reviewedByProfileId,
    reviewedAt: nowIso,
    updatedAt: nowIso,
  };

  map[input.serverId] = responses;
  await writeOnboardingResponsesMap(map);
  return responses[targetIndex];
}
