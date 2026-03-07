import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { ensureUserPreferencesSchema } from "@/lib/user-preferences";

const providerOrder = ["github", "google", "steam", "twitch", "xbox", "youtube"];

type PreferencesRow = {
  userId: string;
  connectedAccountsJson: string | null;
};

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    await ensureUserPreferencesSchema();

    const result = await db.execute(sql`
      select
        up."userId" as "userId",
        up."connectedAccountsJson" as "connectedAccountsJson"
      from "UserPreference" up
    `);

    const rows = (result as unknown as { rows?: PreferencesRow[] }).rows ?? [];

    const providerUsage = new Map<string, number>();
    const userConnectionCounts: Array<{ userId: string; providers: string[]; count: number }> = [];

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
    }

    const providers = providerOrder.map((provider) => ({
      key: provider,
      connectedUsers: providerUsage.get(provider) ?? 0,
    }));

    const topConnectedUsers = userConnectionCounts
      .sort((a, b) => b.count - a.count || a.userId.localeCompare(b.userId))
      .slice(0, 15);

    return NextResponse.json({
      summary: {
        usersWithConnections: userConnectionCounts.length,
        totalLinkedAccounts: providers.reduce((sum, provider) => sum + provider.connectedUsers, 0),
      },
      providers,
      topConnectedUsers,
    });
  } catch (error) {
    console.error("[ADMIN_INTEGRATIONS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
