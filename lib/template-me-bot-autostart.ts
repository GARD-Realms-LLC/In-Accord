import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { isTemplateMeBotName } from "@/lib/template-me-bot-config";
import { getTemplateMeBotRuntimeManager } from "@/lib/template-me-bot-runtime";
import { getDecryptedOtherBotToken } from "@/lib/user-preferences";

type PreferenceRow = {
  userId: string | null;
  OtherBotsJson: string | null;
};

type TemplateMeBootCandidate = {
  userId: string;
  botId: string;
  botName: string;
  applicationId: string;
  tokenUpdatedAt: string | null;
  createdAt: string | null;
};

const parseJsonSafely = (raw: string | null): unknown => {
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
};

const toSortableTime = (value: string | null) => {
  const parsed = new Date(value ?? 0).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const compareTemplateMeBootCandidates = (
  left: TemplateMeBootCandidate,
  right: TemplateMeBootCandidate
) => {
  const tokenUpdatedDiff = toSortableTime(right.tokenUpdatedAt) - toSortableTime(left.tokenUpdatedAt);
  if (tokenUpdatedDiff !== 0) {
    return tokenUpdatedDiff;
  }

  const createdDiff = toSortableTime(right.createdAt) - toSortableTime(left.createdAt);
  if (createdDiff !== 0) {
    return createdDiff;
  }

  const userDiff = left.userId.localeCompare(right.userId);
  if (userDiff !== 0) {
    return userDiff;
  }

  return left.botId.localeCompare(right.botId);
};

const readTemplateMeBootCandidates = async (): Promise<TemplateMeBootCandidate[]> => {
  const preferenceResult = await db.execute(sql`
    select
      up."userId" as "userId",
      up."OtherBotsJson" as "OtherBotsJson"
    from "UserPreference" up
  `);

  const rows = (preferenceResult as unknown as { rows?: PreferenceRow[] }).rows ?? [];
  const candidates: TemplateMeBootCandidate[] = [];

  for (const row of rows) {
    const userId = String(row.userId ?? "").trim();
    if (!userId) {
      continue;
    }

    const parsedBots = parseJsonSafely(row.OtherBotsJson);
    if (!Array.isArray(parsedBots)) {
      continue;
    }

    for (const item of parsedBots) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const typed = item as {
        id?: unknown;
        name?: unknown;
        applicationId?: unknown;
        enabled?: unknown;
        tokenUpdatedAt?: unknown;
        createdAt?: unknown;
      };

      if (!isTemplateMeBotName(typed.name) || typed.enabled !== true) {
        continue;
      }

      const botId = String(typed.id ?? "").trim();
      if (!botId) {
        continue;
      }

      candidates.push({
        userId,
        botId,
        botName: String(typed.name ?? "").trim() || "Template Me Bot",
        applicationId: String(typed.applicationId ?? "").trim(),
        tokenUpdatedAt: String(typed.tokenUpdatedAt ?? "").trim() || null,
        createdAt: String(typed.createdAt ?? "").trim() || null,
      });
    }
  }

  return candidates.sort(compareTemplateMeBootCandidates);
};

const resolveTemplateMeBootSelection = async () => {
  const candidates = await readTemplateMeBootCandidates();
  if (candidates.length === 0) {
    return null;
  }

  for (const candidate of candidates) {
    const token = await getDecryptedOtherBotToken(candidate.userId, candidate.botId);
    if (!token) {
      continue;
    }

    return {
      ...candidate,
      token,
    };
  }

  throw new Error(
    "Template Me bot auto-start failed: enabled Template Me bot configuration exists, but no decryptable token was found."
  );
};

const autoStartTemplateMeBotOnBoot = async () => {
  const selection = await resolveTemplateMeBootSelection();
  if (!selection) {
    console.warn("[TEMPLATE_ME_AUTOSTART] No enabled Template Me bot configuration was found at server startup.");
    return null;
  }

  const manager = getTemplateMeBotRuntimeManager();
  await manager.stop("Server startup restart");

  const state = await manager.start({
    userId: selection.userId,
    botId: selection.botId,
    botName: selection.botName,
    applicationId: selection.applicationId,
    token: selection.token,
  });

  console.info(
    `[TEMPLATE_ME_AUTOSTART] Started ${selection.botName} (${selection.botId}) for user ${selection.userId}.`
  );

  return state;
};

declare global {
  var __templateMeBotAutoStartPromise: Promise<unknown> | undefined;
}

export const ensureTemplateMeBotAutoStartOnBoot = async () => {
  if (!globalThis.__templateMeBotAutoStartPromise) {
    globalThis.__templateMeBotAutoStartPromise = autoStartTemplateMeBotOnBoot().catch((error) => {
      globalThis.__templateMeBotAutoStartPromise = undefined;
      throw error;
    });
  }

  return globalThis.__templateMeBotAutoStartPromise;
};