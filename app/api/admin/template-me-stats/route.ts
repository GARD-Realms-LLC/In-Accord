import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, server } from "@/lib/db";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { ensureTemplateMeBotConfigForUser } from "@/lib/template-me-bot-config";
import { getUserPreferences } from "@/lib/user-preferences";

type ServerUsageRow = {
  id: string;
  name: string;
};

const normalizeTemplateBotName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/["'`]+/g, "")
    .replace(/\s+/g, " ");

const isTemplateMeBotName = (value: unknown) => normalizeTemplateBotName(value) === "template me bot";

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

export async function GET(req: Request) {
  try {
    const auth = await ensureAdmin();
    if (!auth.ok) {
      return auth.response;
    }

    const url = new URL(req.url);
    const fallbackUserId = String(auth.profile.userId ?? "").trim();
    const userId = String(url.searchParams.get("userId") ?? fallbackUserId).trim();
    const botIdFromQuery = String(url.searchParams.get("botId") ?? "").trim();

    if (!userId) {
      return new NextResponse("Unable to resolve current admin user.", { status: 400 });
    }

    const ensuredTemplateBot = await ensureTemplateMeBotConfigForUser(userId);
    const botId = botIdFromQuery || ensuredTemplateBot.id;

    const preferences = await getUserPreferences(userId);
    const bot = preferences.OtherBots.find((item) => item.id === botId);

    if (!bot) {
      return new NextResponse("Bot not found.", { status: 404 });
    }

    if (!isTemplateMeBotName(bot.name)) {
      return new NextResponse('Only "Template Me Bot" is allowed in this section.', { status: 409 });
    }

    const serverIds = Array.isArray(bot.templateServerIds)
      ? Array.from(new Set(bot.templateServerIds.map((entry) => String(entry ?? "").trim()).filter((entry) => entry.length > 0)))
      : [];

    let serversUsingTemplates: ServerUsageRow[] = [];

    if (serverIds.length > 0) {
      const rows = await db
        .select({ id: server.id, name: server.name })
        .from(server)
        .where(inArray(server.id, serverIds));

      serversUsingTemplates = rows
        .map((row) => ({
          id: String(row.id ?? "").trim(),
          name: String(row.name ?? "").trim() || String(row.id ?? "").trim(),
        }))
        .filter((row) => row.id.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    return NextResponse.json({
      importsMadeCount:
        typeof bot.templateImportsMade === "number" && Number.isFinite(bot.templateImportsMade)
          ? Math.max(0, Math.floor(bot.templateImportsMade))
          : 0,
      templatesImportedCount:
        typeof bot.templatesImportedCount === "number" && Number.isFinite(bot.templatesImportedCount)
          ? Math.max(0, Math.floor(bot.templatesImportedCount))
          : 0,
      serversUsingTemplatesCount: serversUsingTemplates.length,
      serversUsingTemplates,
      statsUpdatedAt: bot.templateStatsUpdatedAt ?? null,
    });
  } catch (error) {
    console.error("[ADMIN_TEMPLATE_ME_STATS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
