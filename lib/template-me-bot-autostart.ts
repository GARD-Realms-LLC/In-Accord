import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { getTemplateMeBotRuntimeManager } from "@/lib/template-me-bot-runtime";

type PreferenceRow = {
  userId: string | null;
  OtherBotsJson: string | null;
  OtherBotTokenSecretsJson: string | null;
};

type TemplateMeBootCandidate = {
  userId: string;
  botId: string;
  botName: string;
  applicationId: string;
  tokenUpdatedAt: string | null;
  createdAt: string | null;
};

type CryptoModule = typeof import("crypto");

let cachedCryptoModule: CryptoModule | null = null;

const TEMPLATE_ME_BOOT_RETRY_DELAYS_MS = [0, 1500, 5000] as const;

const waitFor = async (delayMs: number) => {
  if (delayMs <= 0) {
    return;
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
};

const getCryptoModule = (): CryptoModule => {
  if (cachedCryptoModule) {
    return cachedCryptoModule;
  }

  const builtinLoader = (process as typeof process & {
    getBuiltinModule?: (moduleName: string) => CryptoModule | undefined;
  }).getBuiltinModule;

  if (typeof builtinLoader !== "function") {
    throw new Error("Builtin module 'crypto' is unavailable in this runtime.");
  }

  const loaded = builtinLoader("crypto");
  if (!loaded) {
    throw new Error("Builtin module 'crypto' is unavailable in this runtime.");
  }

  cachedCryptoModule = loaded;
  return cachedCryptoModule;
};

const normalizeTemplateBotName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/["'`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

const isTemplateMeBotName = (value: unknown) => normalizeTemplateBotName(value) === "template me bot";

const normalizeIdLike = (value: unknown, maxLength = 80): string => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return /^[a-zA-Z0-9_\-:.]{2,}$/.test(trimmed) ? trimmed.slice(0, maxLength) : "";
};

const normalizeBotTokenCipherMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const next: Record<string, string> = {};

  for (const [rawBotId, rawCipher] of Object.entries(source)) {
    const botId = normalizeIdLike(rawBotId, 80);
    if (!botId || typeof rawCipher !== "string") {
      continue;
    }

    const cipher = rawCipher.trim();
    if (!cipher) {
      continue;
    }

    next[botId] = cipher;
  }

  return next;
};

const getBotTokenEncryptionKey = () => {
  const configured = String(process.env.BOT_TOKEN_ENCRYPTION_KEY ?? process.env.SESSION_SECRET ?? "").trim();
  if (!configured) {
    return null;
  }

  const { createHash } = getCryptoModule();
  return createHash("sha256").update(configured).digest();
};

const decryptBotToken = (cipherText: string) => {
  const key = getBotTokenEncryptionKey();
  if (!key) {
    throw new Error("Missing BOT_TOKEN_ENCRYPTION_KEY or SESSION_SECRET for bot token encryption.");
  }

  const [ivRaw, tagRaw, encryptedRaw] = cipherText.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted bot token payload.");
  }

  const iv = Buffer.from(ivRaw, "base64");
  const tag = Buffer.from(tagRaw, "base64");
  const encrypted = Buffer.from(encryptedRaw, "base64");

  const { createDecipheriv } = getCryptoModule();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
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
      up."OtherBotsJson" as "OtherBotsJson",
      up."OtherBotTokenSecretsJson" as "OtherBotTokenSecretsJson"
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

    const templateBots = parsedBots
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        userId,
        botId: normalizeIdLike(item.id, 80),
        botName: String(item.name ?? "").trim() || "Template Me Bot",
        applicationId: String(item.applicationId ?? "").trim(),
        tokenUpdatedAt: String(item.tokenUpdatedAt ?? "").trim() || null,
        createdAt: String(item.createdAt ?? "").trim() || null,
        enabled: item.enabled === true,
      }))
      .filter((item) => item.botId && item.enabled && isTemplateMeBotName(item.botName));

    if (templateBots.length === 0) {
      continue;
    }

    const [canonicalBot] = [...templateBots].sort(compareTemplateMeBootCandidates);

    candidates.push({
      userId,
      botId: canonicalBot.botId,
      botName: canonicalBot.botName.trim() || "Template Me Bot",
      applicationId: canonicalBot.applicationId,
      tokenUpdatedAt: canonicalBot.tokenUpdatedAt,
      createdAt: canonicalBot.createdAt,
    });
  }

  return candidates.sort(compareTemplateMeBootCandidates);
};

const resolveTemplateMeBootSelection = async () => {
  const candidates = await readTemplateMeBootCandidates();
  if (candidates.length === 0) {
    return null;
  }

  for (const candidate of candidates) {
    const preferenceResult = await db.execute(sql`
      select up."OtherBotTokenSecretsJson" as "OtherBotTokenSecretsJson"
      from "UserPreference" up
      where up."userId" = ${candidate.userId}
      limit 1
    `);

    const row = (preferenceResult as unknown as { rows?: PreferenceRow[] }).rows?.[0];
    const secretMap = normalizeBotTokenCipherMap(parseJsonSafely(row?.OtherBotTokenSecretsJson ?? null));
    const cipher = secretMap[candidate.botId];
    if (!cipher) {
      continue;
    }

    let token: string | null = null;
    try {
      const decrypted = decryptBotToken(cipher).trim();
      token = decrypted.length > 0 ? decrypted : null;
    } catch {
      token = null;
    }

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
  let lastError: unknown = null;

  for (let attemptIndex = 0; attemptIndex < TEMPLATE_ME_BOOT_RETRY_DELAYS_MS.length; attemptIndex += 1) {
    const attemptNumber = attemptIndex + 1;
    const delayMs = TEMPLATE_ME_BOOT_RETRY_DELAYS_MS[attemptIndex];

    if (delayMs > 0) {
      console.warn(
        `[TEMPLATE_ME_AUTOSTART] Retrying startup for ${selection.botName} (${selection.botId}) in ${delayMs}ms (attempt ${attemptNumber}/${TEMPLATE_ME_BOOT_RETRY_DELAYS_MS.length}).`
      );
      await waitFor(delayMs);
    }

    try {
      await manager.stop("Server startup restart");

      const state = await manager.start({
        userId: selection.userId,
        botId: selection.botId,
        botName: selection.botName,
        applicationId: selection.applicationId,
        token: selection.token,
      });

      console.info(
        `[TEMPLATE_ME_AUTOSTART] Started ${selection.botName} (${selection.botId}) for user ${selection.userId} on attempt ${attemptNumber}.`
      );

      return state;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error ?? "Unknown Template Me startup failure");
      console.error(
        `[TEMPLATE_ME_AUTOSTART] Attempt ${attemptNumber}/${TEMPLATE_ME_BOOT_RETRY_DELAYS_MS.length} failed for ${selection.botName} (${selection.botId}): ${message}`,
        error
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Template Me bot auto-start failed after all startup attempts.");
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