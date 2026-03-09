import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import {
  ensureUserPreferencesSchema,
  getUserPreferences,
  updateUserPreferences,
  type DiscordAppConfig,
  type DiscordBotConfig,
} from "@/lib/user-preferences";

const providerOrder = ["github", "google", "steam", "twitch", "xbox", "youtube"];

type PreferencesRow = {
  userId: string;
  name: string | null;
  email: string | null;
  connectedAccountsJson: string | null;
  discordAppsJson: string | null;
  discordBotsJson: string | null;
};

type DiscordConfigSummary = {
  appsTotal: number;
  botsTotal: number;
  enabledApps: number;
  enabledBots: number;
  usersWithDiscordConfigs: number;
};

type AdminDiscordConfigRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  type: "APP" | "BOT";
  configName: string;
  applicationId: string;
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

  return { ok: true as const };
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

export async function GET() {
  try {
    const auth = await ensureAdmin();
    if (!auth.ok) {
      return auth.response;
    }

    await ensureUserPreferencesSchema();

    const result = await db.execute(sql`
      select
        up."userId" as "userId",
        u."name" as "name",
        u."email" as "email",
        up."connectedAccountsJson" as "connectedAccountsJson",
        up."discordAppsJson" as "discordAppsJson",
        up."discordBotsJson" as "discordBotsJson"
      from "UserPreference" up
      left join "Users" u on u."userId" = up."userId"
    `);

    const rows = (result as unknown as { rows?: PreferencesRow[] }).rows ?? [];

    const providerUsage = new Map<string, number>();
    const userConnectionCounts: Array<{ userId: string; providers: string[]; count: number }> = [];
    const discordRows: AdminDiscordConfigRow[] = [];
    const discordSummary: DiscordConfigSummary = {
      appsTotal: 0,
      botsTotal: 0,
      enabledApps: 0,
      enabledBots: 0,
      usersWithDiscordConfigs: 0,
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
        const parsedApps = JSON.parse(row.discordAppsJson ?? "[]") as unknown;
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
            discordSummary.appsTotal += 1;
            if (enabled) {
              discordSummary.enabledApps += 1;
            }

            discordRows.push({
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
        const parsedBots = JSON.parse(row.discordBotsJson ?? "[]") as unknown;
        if (Array.isArray(parsedBots)) {
          for (const entry of parsedBots) {
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

            botsForUser += 1;
            discordSummary.botsTotal += 1;
            if (enabled) {
              discordSummary.enabledBots += 1;
            }

            discordRows.push({
              id,
              userId: row.userId,
              name: row.name?.trim() || row.userId,
              email: row.email?.trim() || "",
              type: "BOT",
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

      if (appsForUser + botsForUser > 0) {
        discordSummary.usersWithDiscordConfigs += 1;
      }
    }

    const providers = providerOrder.map((provider) => ({
      key: provider,
      connectedUsers: providerUsage.get(provider) ?? 0,
    }));

    const topConnectedUsers = userConnectionCounts
      .sort((a, b) => b.count - a.count || a.userId.localeCompare(b.userId))
      .slice(0, 15);

    const recentDiscordConfigs = discordRows
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 40);

    return NextResponse.json({
      summary: {
        usersWithConnections: userConnectionCounts.length,
        totalLinkedAccounts: providers.reduce((sum, provider) => sum + provider.connectedUsers, 0),
        ...discordSummary,
      },
      providers,
      topConnectedUsers,
      recentDiscordConfigs,
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
      action?: unknown;
      enabled?: unknown;
      patch?: unknown;
    };

    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const type = body.type === "APP" || body.type === "BOT" ? body.type : null;
    const configId = typeof body.configId === "string" ? body.configId.trim() : "";
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";

    if (!userId || !type || !configId || !["toggle", "update", "delete"].includes(action)) {
      return new NextResponse("Invalid payload", { status: 400 });
    }

    const preferences = await getUserPreferences(userId);

    if (type === "APP") {
      const current = [...preferences.discordApps];
      const index = current.findIndex((item) => item.id === configId);

      if (index < 0) {
        return new NextResponse("Discord app not found", { status: 404 });
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
        } as DiscordAppConfig;
      }

      await updateUserPreferences(userId, { discordApps: current });
      return NextResponse.json({ ok: true });
    }

    const current = [...preferences.discordBots];
    const index = current.findIndex((item) => item.id === configId);

    if (index < 0) {
      return new NextResponse("Discord bot not found", { status: 404 });
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

      current[index] = {
        ...current[index],
        ...(nextName ? { name: nextName } : {}),
        ...(nextApplicationId ? { applicationId: nextApplicationId } : {}),
        botUserId: nextBotUserId,
        permissions: nextPermissions,
      } as DiscordBotConfig;
    }

    await updateUserPreferences(userId, { discordBots: current });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ADMIN_INTEGRATIONS_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
