import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { ensureTemplateMeBotConfigForUser, isTemplateMeBotName } from "@/lib/template-me-bot-config";
import { getTemplateMeBotRuntimeManager } from "@/lib/template-me-bot-runtime";
import {
  ensureUserPreferencesSchema,
  getUserPreferences,
  updateUserPreferences,
  type OtherAppConfig,
  type OtherBotConfig,
} from "@/lib/user-preferences";

const providerOrder = ["github", "google", "steam", "twitch", "xbox", "youtube"];

type PreferencesRow = {
  userId: string;
  name: string | null;
  email: string | null;
  connectedAccountsJson: string | null;
  OtherAppsJson: string | null;
  OtherBotsJson: string | null;
};

type OtherConfigSummary = {
  appsTotal: number;
  botsTotal: number;
  enabledApps: number;
  enabledBots: number;
  usersWithOtherConfigs: number;
};

type AdminOtherConfigRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  type: "APP" | "BOT";
  configName: string;
  applicationId: string;
  tokenHint?: string;
  tokenUpdatedAt?: string;
  enabled: boolean;
  createdAt: string;
};

const ensureAdmin = async () => {
  const profile = await currentProfile();

  if (!profile) {
    return { ok: false as const, response: new NextResponse("Unauthorized", { status: 401 }) };
  }

  if (!hasInAccordAdministrativeAccess(profile.role)) {
    return { ok: false as const, response: new NextResponse("Forbidden", { status: 403 }) };
  }

  return { ok: true as const, profile };
};

const normalizeHumanLabel = (value: unknown, maxLength = 80) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
};

const normalizeIdLike = (value: unknown, maxLength = 64) => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return /^[a-zA-Z0-9_\-:.]{2,}$/.test(trimmed) ? trimmed.slice(0, maxLength) : "";
};

const normalizeScopes = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0 && item.length <= 64 && /^[a-z0-9_.-]+$/.test(item))
    )
  );
};

const normalizeUrlLike = (value: unknown, maxLength = 512) => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
    return "";
  }

  return trimmed.slice(0, maxLength);
};

const getTokenHint = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return `••••••••${trimmed.slice(-4)}`;
};

const isTemplateMeBotConfigName = (value: unknown) => isTemplateMeBotName(value);

const createConfigId = () => `cfg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export async function GET() {
  try {
    const auth = await ensureAdmin();
    if (!auth.ok) {
      return auth.response;
    }

    const currentAdminUserId = String(auth.profile.userId ?? "").trim();
    if (!currentAdminUserId) {
      return new NextResponse("Unable to resolve current admin user.", { status: 400 });
    }

    await ensureTemplateMeBotConfigForUser(currentAdminUserId);

    await ensureUserPreferencesSchema();

    const result = await db.execute(sql`
      select
        up."userId" as "userId",
        u."name" as "name",
        u."email" as "email",
        up."connectedAccountsJson" as "connectedAccountsJson",
        up."OtherAppsJson" as "OtherAppsJson",
        up."OtherBotsJson" as "OtherBotsJson"
      from "UserPreference" up
      left join "Users" u on u."userId" = up."userId"
    `);

    const rows = (result as unknown as { rows?: PreferencesRow[] }).rows ?? [];

    const providerUsage = new Map<string, number>();
    const userConnectionCounts: Array<{ userId: string; providers: string[]; count: number }> = [];
    const OtherRows: AdminOtherConfigRow[] = [];
    const OtherSummary: OtherConfigSummary = {
      appsTotal: 0,
      botsTotal: 0,
      enabledApps: 0,
      enabledBots: 0,
      usersWithOtherConfigs: 0,
    };

    for (const row of rows) {
      let providers: string[] = [];

      try {
        const parsed = JSON.parse(row.connectedAccountsJson ?? "[]") as unknown;
        if (Array.isArray(parsed)) {
          providers = Array.from(
            new Set(
              parsed
                .filter((item): item is string => typeof item === "string")
                .map((item) => item.trim().toLowerCase())
                .filter((item) => providerOrder.includes(item))
            )
          );
        }
      } catch {
        providers = [];
      }

      if (providers.length > 0) {
        userConnectionCounts.push({
          userId: row.userId,
          providers,
          count: providers.length,
        });
      }

      providers.forEach((provider) => {
        providerUsage.set(provider, (providerUsage.get(provider) ?? 0) + 1);
      });

      let appsForUser = 0;
      let botsForUser = 0;

      try {
        const parsedApps = JSON.parse(row.OtherAppsJson ?? "[]") as unknown;
        if (Array.isArray(parsedApps)) {
          for (const entry of parsedApps) {
            if (!entry || typeof entry !== "object") {
              continue;
            }

            const typed = entry as {
              id?: unknown;
              name?: unknown;
              applicationId?: unknown;
              enabled?: unknown;
              createdAt?: unknown;
            };

            const id = typeof typed.id === "string" ? typed.id.trim() : "";
            const configName = typeof typed.name === "string" ? typed.name.trim() : "";
            const applicationId = typeof typed.applicationId === "string" ? typed.applicationId.trim() : "";

            if (!id || !configName || !applicationId) {
              continue;
            }

            const enabled = typed.enabled !== false;
            const createdAtRaw = typeof typed.createdAt === "string" ? typed.createdAt : "";
            const createdAt = Number.isNaN(new Date(createdAtRaw).getTime())
              ? new Date().toISOString()
              : new Date(createdAtRaw).toISOString();

            appsForUser += 1;
            OtherSummary.appsTotal += 1;
            if (enabled) {
              OtherSummary.enabledApps += 1;
            }

            OtherRows.push({
              id,
              userId: row.userId,
              name: row.name?.trim() || row.userId,
              email: row.email?.trim() || "",
              type: "APP",
              configName,
              applicationId,
              enabled,
              createdAt,
            });
          }
        }
      } catch {
        // ignore malformed json
      }

      try {
        const parsedBots = JSON.parse(row.OtherBotsJson ?? "[]") as unknown;
        if (Array.isArray(parsedBots)) {
          for (const entry of parsedBots) {
            if (!entry || typeof entry !== "object") {
              continue;
            }

            const typed = entry as {
              id?: unknown;
              name?: unknown;
              applicationId?: unknown;
              tokenHint?: unknown;
              tokenUpdatedAt?: unknown;
              enabled?: unknown;
              createdAt?: unknown;
            };

            const id = typeof typed.id === "string" ? typed.id.trim() : "";
            const configName = typeof typed.name === "string" ? typed.name.trim() : "";
            const applicationId = typeof typed.applicationId === "string" ? typed.applicationId.trim() : "";
            const tokenHint = typeof typed.tokenHint === "string" ? typed.tokenHint.trim().slice(0, 32) : "";
            const tokenUpdatedAtRaw =
              typeof typed.tokenUpdatedAt === "string" ? typed.tokenUpdatedAt.trim() : "";
            const tokenUpdatedAt =
              tokenUpdatedAtRaw && !Number.isNaN(new Date(tokenUpdatedAtRaw).getTime())
                ? new Date(tokenUpdatedAtRaw).toISOString()
                : "";

            if (!id || !configName || !applicationId) {
              continue;
            }

            const enabled = typed.enabled !== false;
            const createdAtRaw = typeof typed.createdAt === "string" ? typed.createdAt : "";
            const createdAt = Number.isNaN(new Date(createdAtRaw).getTime())
              ? new Date().toISOString()
              : new Date(createdAtRaw).toISOString();

            botsForUser += 1;
            OtherSummary.botsTotal += 1;
            if (enabled) {
              OtherSummary.enabledBots += 1;
            }

            OtherRows.push({
              id,
              userId: row.userId,
              name: row.name?.trim() || row.userId,
              email: row.email?.trim() || "",
              type: "BOT",
              configName,
              applicationId,
              ...(tokenHint ? { tokenHint } : {}),
              ...(tokenUpdatedAt ? { tokenUpdatedAt } : {}),
              enabled,
              createdAt,
            });
          }
        }
      } catch {
        // ignore malformed json
      }

      if (appsForUser + botsForUser > 0) {
        OtherSummary.usersWithOtherConfigs += 1;
      }
    }

    const providers = providerOrder.map((provider) => ({
      key: provider,
      connectedUsers: providerUsage.get(provider) ?? 0,
    }));

    const topConnectedUsers = userConnectionCounts
      .sort((a, b) => b.count - a.count || a.userId.localeCompare(b.userId))
      .slice(0, 15);

    const sortedOtherRows = OtherRows
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const recentOtherConfigs = sortedOtherRows.slice(0, 40);
    const templateMeBotRows = sortedOtherRows.filter(
      (row) =>
        row.type === "BOT" &&
        row.userId === currentAdminUserId &&
        isTemplateMeBotConfigName(row.configName)
    );

    const recentOtherConfigByKey = new Map<string, AdminOtherConfigRow>();
    for (const row of [...templateMeBotRows, ...recentOtherConfigs]) {
      const key = `${row.type}:${row.userId}:${row.id}`;
      if (!recentOtherConfigByKey.has(key)) {
        recentOtherConfigByKey.set(key, row);
      }
    }

    const mergedRecentOtherConfigs = Array.from(recentOtherConfigByKey.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      summary: {
        usersWithConnections: userConnectionCounts.length,
        totalLinkedAccounts: providers.reduce((sum, provider) => sum + provider.connectedUsers, 0),
        ...OtherSummary,
      },
      providers,
      topConnectedUsers,
      recentOtherConfigs: mergedRecentOtherConfigs,
    });
  } catch (error) {
    console.error("[ADMIN_INTEGRATIONS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await ensureAdmin();
    if (!auth.ok) {
      return auth.response;
    }

    const body = (await req.json().catch(() => ({}))) as {
      userId?: unknown;
      type?: unknown;
      configId?: unknown;
      applicationId?: unknown;
      action?: unknown;
      enabled?: unknown;
      patch?: unknown;
    };

    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const type = body.type === "APP" || body.type === "BOT" ? body.type : null;
    const configId = typeof body.configId === "string" ? body.configId.trim() : "";
    const applicationId = typeof body.applicationId === "string" ? body.applicationId.trim() : "";
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";

    if (!type || !["toggle", "update", "delete", "purge"].includes(action)) {
      return new NextResponse("Invalid payload", { status: 400 });
    }

    if (action === "purge") {
      const normalizedApplicationId = normalizeIdLike(applicationId, 64);
      if (!normalizedApplicationId) {
        return new NextResponse("applicationId is required for purge", { status: 400 });
      }

      await ensureUserPreferencesSchema();

      const result = await db.execute(sql`
        select
          up."userId" as "userId",
          up."OtherAppsJson" as "OtherAppsJson",
          up."OtherBotsJson" as "OtherBotsJson"
        from "UserPreference" up
      `);

      const rows = (result as unknown as {
        rows?: Array<{
          userId: string;
          OtherAppsJson: string | null;
          OtherBotsJson: string | null;
        }>;
      }).rows ?? [];

      let affectedUsers = 0;
      let removedCount = 0;

      for (const row of rows) {
        const userPreferences = await getUserPreferences(row.userId);

        if (type === "APP") {
          const currentApps = [...userPreferences.OtherApps];
          const nextApps = currentApps.filter(
            (entry) => normalizeIdLike(entry.applicationId, 64) !== normalizedApplicationId
          );

          const removedForUser = currentApps.length - nextApps.length;
          if (removedForUser > 0) {
            removedCount += removedForUser;
            affectedUsers += 1;
            await updateUserPreferences(row.userId, { OtherApps: nextApps });
          }
          continue;
        }

        const currentBots = [...userPreferences.OtherBots];
        const nextBots = currentBots.filter(
          (entry) => normalizeIdLike(entry.applicationId, 64) !== normalizedApplicationId
        );

        const removedForUser = currentBots.length - nextBots.length;
        if (removedForUser > 0) {
          removedCount += removedForUser;
          affectedUsers += 1;
          await updateUserPreferences(row.userId, { OtherBots: nextBots });
        }
      }

      return NextResponse.json({
        ok: true,
        removedCount,
        affectedUsers,
        type,
        applicationId: normalizedApplicationId,
      });
    }

    if (!userId || !configId) {
      return new NextResponse("Invalid payload", { status: 400 });
    }

    const preferences = await getUserPreferences(userId);

    if (type === "APP") {
      const current = [...preferences.OtherApps];
      const index = current.findIndex((item) => item.id === configId);

      if (index < 0) {
        return new NextResponse("Other app not found", { status: 404 });
      }

      if (action === "delete") {
        current.splice(index, 1);
      } else if (action === "toggle") {
        const fallbackEnabled = current[index].enabled;
        const nextEnabled = typeof body.enabled === "boolean" ? body.enabled : !fallbackEnabled;
        current[index] = {
          ...current[index],
          enabled: nextEnabled,
        };
      } else {
        const patch = (body.patch ?? {}) as Record<string, unknown>;
        const nextName = normalizeHumanLabel(patch.name, 80);
        const nextApplicationId = normalizeIdLike(patch.applicationId, 64);
        const nextClientId = normalizeIdLike(patch.clientId, 64);
        const nextRedirectUri =
          Object.prototype.hasOwnProperty.call(patch, "redirectUri")
            ? normalizeUrlLike(patch.redirectUri, 512)
            : current[index].redirectUri;
        const nextScopes =
          Object.prototype.hasOwnProperty.call(patch, "scopes")
            ? normalizeScopes(patch.scopes)
            : current[index].scopes;

        current[index] = {
          ...current[index],
          ...(nextName ? { name: nextName } : {}),
          ...(nextApplicationId ? { applicationId: nextApplicationId } : {}),
          ...(nextClientId ? { clientId: nextClientId } : {}),
          redirectUri: nextRedirectUri,
          scopes: nextScopes,
        } as OtherAppConfig;
      }

      await updateUserPreferences(userId, { OtherApps: current });
      return NextResponse.json({ ok: true });
    }

    const current = [...preferences.OtherBots];
    const index = current.findIndex((item) => item.id === configId);

    if (index < 0) {
      return new NextResponse("Other bot not found", { status: 404 });
    }

    if (action === "delete") {
      current.splice(index, 1);
    } else if (action === "toggle") {
      const fallbackEnabled = current[index].enabled;
      const nextEnabled = typeof body.enabled === "boolean" ? body.enabled : !fallbackEnabled;
      current[index] = {
        ...current[index],
        enabled: nextEnabled,
      };
    } else {
      const patch = (body.patch ?? {}) as Record<string, unknown>;
      const nextName = normalizeHumanLabel(patch.name, 80);
      const nextApplicationId = normalizeIdLike(patch.applicationId, 64);
      const nextBotUserId =
        Object.prototype.hasOwnProperty.call(patch, "botUserId")
          ? normalizeIdLike(patch.botUserId, 64)
          : current[index].botUserId;
      const nextPermissions =
        Object.prototype.hasOwnProperty.call(patch, "permissions")
          ? normalizeScopes(patch.permissions)
          : current[index].permissions;
      const nextToken =
        typeof patch.botToken === "string" ? patch.botToken.trim() : "";
      const tokenUpdatedAt = nextToken ? new Date().toISOString() : "";

      current[index] = {
        ...current[index],
        ...(nextName ? { name: nextName } : {}),
        ...(nextApplicationId ? { applicationId: nextApplicationId } : {}),
        ...(nextToken ? { tokenHint: getTokenHint(nextToken) } : {}),
        ...(tokenUpdatedAt ? { tokenUpdatedAt } : {}),
        botUserId: nextBotUserId,
        permissions: nextPermissions,
      } as OtherBotConfig;

      const updatedBot = current[index];

      await updateUserPreferences(
        userId,
        nextToken
          ? {
              OtherBots: current,
              OtherBotTokens: {
                [configId]: nextToken,
              },
            }
          : { OtherBots: current }
      );

      if (nextToken && isTemplateMeBotConfigName(updatedBot.name)) {
        const runtimeManager = getTemplateMeBotRuntimeManager();
        const runtimeState = runtimeManager.getState();

        if (
          runtimeState.status === "running" &&
          runtimeState.userId === userId &&
          runtimeState.botId === configId
        ) {
          try {
            await runtimeManager.stop("Template Me token updated from admin panel");
            await runtimeManager.start({
              userId,
              botId: configId,
              botName: updatedBot.name,
              applicationId: updatedBot.applicationId,
              token: nextToken,
            });
          } catch (runtimeError) {
            console.error("[ADMIN_INTEGRATIONS_PATCH_TEMPLATE_ME_RUNTIME_RESTART]", runtimeError);
          }
        }
      }

      return NextResponse.json({ ok: true });
    }

    await updateUserPreferences(userId, { OtherBots: current });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ADMIN_INTEGRATIONS_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await ensureAdmin();
    if (!auth.ok) {
      return auth.response;
    }

    const body = (await req.json().catch(() => ({}))) as {
      userId?: unknown;
      type?: unknown;
      configName?: unknown;
      applicationId?: unknown;
      enabled?: unknown;
    };

    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const type = body.type === "APP" || body.type === "BOT" ? body.type : null;
    const configName = normalizeHumanLabel(body.configName, 80);
    const applicationId = normalizeIdLike(body.applicationId, 64);
    const enabled = body.enabled !== false;

    if (!userId || !type || !configName || !applicationId) {
      return new NextResponse("userId, type, configName and applicationId are required", { status: 400 });
    }

    const preferences = await getUserPreferences(userId);

    if (type === "APP") {
      const nextApps = [...preferences.OtherApps];
      if (
        nextApps.some(
          (entry) => normalizeIdLike(entry.applicationId, 64) === applicationId
        )
      ) {
        return new NextResponse("App with this applicationId already exists for the user", { status: 409 });
      }

      nextApps.push({
        id: createConfigId(),
        name: configName,
        applicationId,
        clientId: "",
        redirectUri: "",
        scopes: [],
        enabled,
        createdAt: new Date().toISOString(),
      });

      await updateUserPreferences(userId, { OtherApps: nextApps });
      return NextResponse.json({ ok: true });
    }

    const nextBots = [...preferences.OtherBots];
    if (
      nextBots.some(
        (entry) => normalizeIdLike(entry.applicationId, 64) === applicationId
      )
    ) {
      return new NextResponse("Bot with this applicationId already exists for the user", { status: 409 });
    }

    nextBots.push({
      id: createConfigId(),
      name: configName,
      applicationId,
      botUserId: "",
      tokenHint: "",
      commands: [],
      permissions: [],
      enabled,
      createdAt: new Date().toISOString(),
    });

    await updateUserPreferences(userId, { OtherBots: nextBots });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ADMIN_INTEGRATIONS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
