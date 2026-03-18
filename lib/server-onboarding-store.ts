import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

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

declare global {
  // eslint-disable-next-line no-var
  var inAccordServerOnboardingSchemaReady: boolean | undefined;
}

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

const ensureServerOnboardingSchema = async () => {
  if (globalThis.inAccordServerOnboardingSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "ServerOnboardingConfig" (
      "serverId" varchar(191) primary key,
      "enabled" boolean not null default false,
      "welcomeMessage" text not null,
      "bannerPreset" varchar(64) not null,
      "bannerUrl" text not null default '',
      "checklistChannelIds" jsonb not null default '[]'::jsonb,
      "resourceChannelIds" jsonb not null default '[]'::jsonb,
      "prompts" jsonb not null default '[]'::jsonb,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    create table if not exists "ServerOnboardingResponse" (
      "id" varchar(191) primary key,
      "serverId" varchar(191) not null,
      "memberId" varchar(191) not null,
      "profileId" varchar(191) not null,
      "answers" jsonb not null default '[]'::jsonb,
      "reviewStatus" varchar(32) not null default 'PENDING',
      "reviewNote" varchar(500) not null default '',
      "reviewedByProfileId" varchar(191),
      "reviewedAt" timestamp,
      "submittedAt" timestamp not null,
      "updatedAt" timestamp not null
    )
  `);

  await db.execute(sql`
    create unique index if not exists "ServerOnboardingResponse_server_member_key"
    on "ServerOnboardingResponse" ("serverId", "memberId")
  `);

  globalThis.inAccordServerOnboardingSchemaReady = true;
};

export async function getServerOnboardingConfig(serverId: string): Promise<ServerOnboardingConfig> {
  const normalizedServerId = String(serverId ?? "").trim();
  if (!normalizedServerId) {
    return normalizeConfig({});
  }

  await ensureServerOnboardingSchema();

  const result = await db.execute(sql`
    select *
    from "ServerOnboardingConfig"
    where "serverId" = ${normalizedServerId}
    limit 1
  `);

  const row = ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [])[0];
  return normalizeConfig(row ?? {});
}

export async function setServerOnboardingConfig(serverId: string, input: Partial<ServerOnboardingConfig>) {
  const normalizedServerId = String(serverId ?? "").trim();
  if (!normalizedServerId) {
    throw new Error("Server ID is required.");
  }

  await ensureServerOnboardingSchema();

  const current = await getServerOnboardingConfig(normalizedServerId);
  const next = normalizeConfig({
    ...current,
    ...input,
    updatedAt: new Date().toISOString(),
  });

  await db.execute(sql`
    insert into "ServerOnboardingConfig" (
      "serverId", "enabled", "welcomeMessage", "bannerPreset", "bannerUrl", "checklistChannelIds", "resourceChannelIds", "prompts", "updatedAt"
    )
    values (
      ${normalizedServerId}, ${next.enabled}, ${next.welcomeMessage}, ${next.bannerPreset}, ${next.bannerUrl},
      ${JSON.stringify(next.checklistChannelIds)}::jsonb, ${JSON.stringify(next.resourceChannelIds)}::jsonb,
      ${JSON.stringify(next.prompts)}::jsonb, ${new Date(next.updatedAt)}
    )
    on conflict ("serverId") do update
    set "enabled" = excluded."enabled",
        "welcomeMessage" = excluded."welcomeMessage",
        "bannerPreset" = excluded."bannerPreset",
        "bannerUrl" = excluded."bannerUrl",
        "checklistChannelIds" = excluded."checklistChannelIds",
        "resourceChannelIds" = excluded."resourceChannelIds",
        "prompts" = excluded."prompts",
        "updatedAt" = excluded."updatedAt"
  `);

  return next;
}

export async function getServerOnboardingResponses(serverId: string): Promise<ServerOnboardingResponse[]> {
  const normalizedServerId = String(serverId ?? "").trim();
  if (!normalizedServerId) {
    return [];
  }

  await ensureServerOnboardingSchema();

  const result = await db.execute(sql`
    select *
    from "ServerOnboardingResponse"
    where "serverId" = ${normalizedServerId}
    order by "submittedAt" desc, "id" asc
  `);

  return (((result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? []))
    .map((row) =>
      normalizeResponse({
        ...row,
        submittedAt: row.submittedAt instanceof Date ? row.submittedAt.toISOString() : row.submittedAt,
        updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
        reviewedAt: row.reviewedAt instanceof Date ? row.reviewedAt.toISOString() : row.reviewedAt,
      })
    )
    .filter((item): item is ServerOnboardingResponse => Boolean(item));
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
  await ensureServerOnboardingSchema();

  const normalizedServerId = String(input.serverId ?? "").trim();
  const normalizedMemberId = String(input.memberId ?? "").trim();
  const normalizedProfileId = String(input.profileId ?? "").trim();
  const nowIso = new Date().toISOString();

  const normalizedAnswers = input.answers
    .map((answerItem) => normalizeResponseAnswer(answerItem))
    .filter((answerItem): answerItem is ServerOnboardingResponseAnswer => Boolean(answerItem))
    .slice(0, 8);

  const existing = await getServerOnboardingResponseByMember(normalizedServerId, normalizedMemberId);

  const nextId = existing?.id ?? `response-${normalizedMemberId}-${Date.now()}`;
  const submittedAt = existing?.submittedAt ?? nowIso;

  await db.execute(sql`
    insert into "ServerOnboardingResponse" (
      "id", "serverId", "memberId", "profileId", "answers", "reviewStatus", "reviewNote", "reviewedByProfileId", "reviewedAt", "submittedAt", "updatedAt"
    )
    values (
      ${nextId}, ${normalizedServerId}, ${normalizedMemberId}, ${normalizedProfileId}, ${JSON.stringify(normalizedAnswers)}::jsonb,
      ${"PENDING"}, ${""}, ${null}, ${null}, ${new Date(submittedAt)}, ${new Date(nowIso)}
    )
    on conflict ("serverId", "memberId") do update
    set "profileId" = excluded."profileId",
        "answers" = excluded."answers",
        "reviewStatus" = excluded."reviewStatus",
        "reviewNote" = excluded."reviewNote",
        "reviewedByProfileId" = excluded."reviewedByProfileId",
        "reviewedAt" = excluded."reviewedAt",
        "updatedAt" = excluded."updatedAt"
  `);

  const persisted = await getServerOnboardingResponseByMember(normalizedServerId, normalizedMemberId);
  if (!persisted) {
    throw new Error("Failed to persist onboarding response.");
  }

  return persisted;
}

type SetServerOnboardingResponseReviewInput = {
  serverId: string;
  responseId: string;
  reviewStatus: ServerOnboardingReviewStatus;
  reviewNote?: string;
  reviewedByProfileId: string;
};

export async function setServerOnboardingResponseReview(input: SetServerOnboardingResponseReviewInput) {
  const normalizedServerId = String(input.serverId ?? "").trim();
  const normalizedResponseId = String(input.responseId ?? "").trim();
  if (!normalizedServerId || !normalizedResponseId) {
    return null;
  }

  await ensureServerOnboardingSchema();

  const nowIso = new Date().toISOString();

  const result = await db.execute(sql`
    update "ServerOnboardingResponse"
    set "reviewStatus" = ${input.reviewStatus},
        "reviewNote" = ${typeof input.reviewNote === "string" ? input.reviewNote.trim().slice(0, 500) : ""},
        "reviewedByProfileId" = ${input.reviewedByProfileId},
        "reviewedAt" = ${new Date(nowIso)},
        "updatedAt" = ${new Date(nowIso)}
    where "serverId" = ${normalizedServerId}
      and "id" = ${normalizedResponseId}
    returning "memberId"
  `);

  const memberId = ((result as unknown as { rows?: Array<{ memberId: string | null }> }).rows ?? [])[0]?.memberId;
  if (!memberId) {
    return null;
  }

  return getServerOnboardingResponseByMember(normalizedServerId, memberId);
}
