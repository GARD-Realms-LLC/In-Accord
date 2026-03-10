import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { getUserPreferences } from "@/lib/user-preferences";

const parseBotProfileId = (profileId: string) => {
  const normalized = String(profileId ?? "").trim();
  if (!normalized.startsWith("botcfg_")) {
    return null;
  }

  const rest = normalized.slice("botcfg_".length);
  const separatorIndex = rest.lastIndexOf("_");
  if (separatorIndex <= 0 || separatorIndex >= rest.length - 1) {
    return null;
  }

  const ownerProfileId = rest.slice(0, separatorIndex).trim();
  const botConfigId = rest.slice(separatorIndex + 1).trim();

  if (!ownerProfileId || !botConfigId) {
    return null;
  }

  return {
    ownerProfileId,
    botConfigId,
  };
};

const normalizeCommands = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  const unique = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const normalized = item
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .replace(/[_\s]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (!normalized) {
      continue;
    }

    unique.add(normalized);
    if (unique.size >= 1000) {
      break;
    }
  }

  return Array.from(unique);
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ profileId: string }> }
) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { profileId: rawProfileId } = await params;
    const profileId = String(rawProfileId ?? "").trim();

    const parsed = parseBotProfileId(profileId);
    if (!parsed) {
      return NextResponse.json({ error: "Not a bot profile." }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const memberId = String(searchParams.get("memberId") ?? "").trim();
    if (!memberId) {
      return new NextResponse("memberId is required", { status: 400 });
    }

    const membershipResult = await db.execute(sql`
      select m."id" as "id"
      from "Member" m
      where m."id" = ${memberId}
        and m."profileId" = ${profileId}
      limit 1
    `);

    const membership = (membershipResult as unknown as {
      rows?: Array<{ id: string }>;
    }).rows?.[0];

    if (!membership) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const preferences = await getUserPreferences(parsed.ownerProfileId);
    const bot = preferences.OtherBots.find((item) => item.id === parsed.botConfigId);

    if (!bot) {
      return NextResponse.json({ error: "Bot configuration not found." }, { status: 404 });
    }

    const commands = normalizeCommands(bot.commands);

    return NextResponse.json({
      profileId,
      botId: bot.id,
      botName: bot.name,
      commandCount: commands.length,
      commands,
    });
  } catch (error) {
    console.error("[PROFILE_BOT_COMMANDS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
