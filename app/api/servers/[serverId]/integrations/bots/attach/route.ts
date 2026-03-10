import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { currentProfile } from "@/lib/current-profile";
import { db, member, MemberRole, server } from "@/lib/db";
import { importOtherBotCommandsForOwner } from "@/lib/discord-bot-commands";
import { makeIntegrationBotProfileId } from "@/lib/integration-bot-profile";
import { getUserPreferences } from "@/lib/user-preferences";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { botId?: string } | null;
    const botId = String(body?.botId ?? "").trim();

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!botId) {
      return new NextResponse("botId is required", { status: 400 });
    }

    const ownerServer = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
    });

    if (!ownerServer) {
      return new NextResponse("Only server owners can attach integration bots.", { status: 403 });
    }

    const preferences = await getUserPreferences(profile.id);
    const targetBot = preferences.OtherBots.find((item) => item.id === botId);

    if (!targetBot) {
      return new NextResponse("Bot configuration not found.", { status: 404 });
    }

    if (!targetBot.enabled) {
      return new NextResponse("Bot configuration is disabled. Enable it first.", { status: 400 });
    }

    const botProfileId = makeIntegrationBotProfileId(profile.id, targetBot.id);
    const botName = targetBot.name.slice(0, 191);
    const fallbackEmail = `${botProfileId}@bots.in-accord.local`.slice(0, 191);
    const now = new Date();

    await db.execute(sql`
      insert into "Users" ("userId", "name", "email", "avatarUrl", "account.created", "lastLogin")
      values (${botProfileId}, ${botName}, ${fallbackEmail}, ${"/in-accord-steampunk-logo.png"}, ${now}, ${now})
      on conflict ("userId") do update
      set "name" = excluded."name",
          "lastLogin" = excluded."lastLogin"
    `);

    const existingMembership = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, botProfileId)),
    });

    if (!existingMembership) {
      await db.insert(member).values({
        id: uuidv4(),
        role: MemberRole.GUEST,
        profileId: botProfileId,
        serverId,
        createdAt: now,
        updatedAt: now,
      });
    }

    let importedCount: number | null = null;
    let importWarning: string | null = null;

    try {
      const imported = await importOtherBotCommandsForOwner({
        ownerProfileId: profile.id,
        botId,
      });
      importedCount = imported.importedCount;
    } catch (error) {
      importWarning = error instanceof Error ? error.message : "Command import failed.";
    }

    const attachMessage = existingMembership
      ? "Bot is already in this In-Accord server."
      : "Bot added to In-Accord server.";

    const importMessage =
      typeof importedCount === "number"
        ? ` Auto-imported ${importedCount} slash command${importedCount === 1 ? "" : "s"}.`
        : importWarning
          ? ` Bot added, but auto-import failed: ${importWarning}`
          : "";

    return NextResponse.json({
      ok: true,
      serverId,
      botId,
      botProfileId,
      alreadyMember: Boolean(existingMembership),
      importedCount,
      importWarning,
      message: `${attachMessage}${importMessage}`.trim(),
    });
  } catch (error) {
    console.error("[SERVERS_SERVER_ID_INTEGRATIONS_BOTS_ATTACH_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
