import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { getOtherApiOrigin } from "@/lib/other-upstream-identifiers";
import { ensureTemplateMeBotConfigForUser } from "@/lib/template-me-bot-config";
import { getTemplateMeBotRuntimeManager } from "@/lib/template-me-bot-runtime";
import { getDecryptedOtherBotToken, getUserPreferences } from "@/lib/user-preferences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isTemplateMeBotName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/["'`]+/g, "")
    .replace(/\s+/g, " ") === "template me bot";

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

const toInviteUrl = (applicationId: string) => {
  const normalized = String(applicationId ?? "").trim();
  if (!normalized) {
    return null;
  }

  const isSnowflake = /^\d{17,20}$/.test(normalized);
  const isAllZeros = /^0+$/.test(normalized);
  if (!isSnowflake || isAllZeros) {
    return null;
  }

  return `${getOtherApiOrigin()}/oauth2/authorize?client_id=${encodeURIComponent(normalized)}&scope=bot%20applications.commands&permissions=8`;
};

export async function GET() {
  try {
    const auth = await ensureAdmin();
    if (!auth.ok) {
      return auth.response;
    }

    const manager = getTemplateMeBotRuntimeManager();
    const state = manager.getState();

    return NextResponse.json({
      state,
      inviteUrl: state.applicationId ? toInviteUrl(state.applicationId) : null,
    });
  } catch (error) {
    console.error("[ADMIN_TEMPLATE_ME_RUNTIME_GET]", error);
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
      action?: unknown;
      userId?: unknown;
      botId?: unknown;
    };

    const action = String(body.action ?? "").trim().toLowerCase();
    const manager = getTemplateMeBotRuntimeManager();

    if (action === "stop") {
      const state = await manager.stop("Stopped by admin");
      return NextResponse.json({
        ok: true,
        state,
        inviteUrl: state.applicationId ? toInviteUrl(state.applicationId) : null,
      });
    }

    if (action !== "start" && action !== "restart") {
      return new NextResponse("Invalid action", { status: 400 });
    }

    const userId = String(auth.profile.userId ?? "").trim();
    if (!userId) {
      return new NextResponse("Unable to resolve current admin user.", { status: 400 });
    }

    const expectedBot = await ensureTemplateMeBotConfigForUser(userId);
    const requestedBotId = String(body.botId ?? "").trim();
    const botId = requestedBotId || expectedBot.id;

    const preferences = await getUserPreferences(userId);
    const bot = preferences.OtherBots.find((item) => item.id === botId && isTemplateMeBotName(item.name));

    if (!bot || !bot.enabled || bot.id !== expectedBot.id) {
      return new NextResponse("Template Me bot not found or disabled.", { status: 404 });
    }

    const token = await getDecryptedOtherBotToken(userId, botId);
    if (!token) {
      return new NextResponse("Template Me bot token is missing. Update token and retry.", { status: 400 });
    }

    const inviteUrl = toInviteUrl(bot.applicationId);
    if (!inviteUrl) {
      return new NextResponse("Template Me bot Application ID is invalid. Update Application ID, then retry.", {
        status: 400,
      });
    }

    if (action === "restart") {
      await manager.stop("Restarted by admin");
    }

    const state = await manager.start({
      userId,
      botId,
      botName: bot.name,
      applicationId: bot.applicationId,
      token,
    });

    return NextResponse.json({
      ok: true,
      state,
      inviteUrl,
    });
  } catch (error) {
    console.error("[ADMIN_TEMPLATE_ME_RUNTIME_POST]", error);
    const message = error instanceof Error ? error.message : "Failed to control Template Me runtime.";
    return new NextResponse(message, { status: 500 });
  }
}
