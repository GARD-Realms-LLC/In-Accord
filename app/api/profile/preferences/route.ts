import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, server } from "@/lib/db";
import { makeIntegrationBotProfileId } from "@/lib/integration-bot-profile";
import { clearServerIntegrationBotFlags } from "@/lib/server-integration-bot-store";
import {
  type CustomThemeColors,
  getUserPreferences,
  updateUserPreferences,
} from "@/lib/user-preferences";

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const preferences = await getUserPreferences(profile.id);
    return NextResponse.json(preferences);
  } catch (error) {
    console.error("[PROFILE_PREFERENCES_GET]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      mentionsEnabled?: unknown;
      notifications?: unknown;
      textImages?: unknown;
      accessibility?: unknown;
      emoji?: unknown;
      stickers?: unknown;
      keybinds?: unknown;
      advanced?: unknown;
      streamerMode?: unknown;
      gameOverlay?: unknown;
      botGhost?: unknown;
      customCss?: unknown;
      languagePreference?: unknown;
      connectedAccounts?: unknown;
      contentSocial?: unknown;
      dataPrivacy?: unknown;
      activityPrivacy?: unknown;
      registeredGames?: unknown;
      familyCenter?: unknown;
      businessCenter?: unknown;
      schoolCenter?: unknown;
      serverTags?: unknown;
      customThemeColors?: unknown;
      downloadedPlugins?: unknown;
      bannerUploads?: unknown;
      avatarUploads?: unknown;
      OtherApps?: unknown;
      OtherBots?: unknown;
      OtherBotTokens?: unknown;
      OtherBotAutoImportOnSave?: unknown;
    };

    const updates: Parameters<typeof updateUserPreferences>[1] = {};
    let removedOtherBotIds: string[] = [];

    if (typeof body.mentionsEnabled === "boolean") {
      updates.mentionsEnabled = body.mentionsEnabled;
    }

    if (Object.prototype.hasOwnProperty.call(body, "notifications")) {
      updates.notifications = body.notifications as Parameters<typeof updateUserPreferences>[1]["notifications"];
    }

    if (Object.prototype.hasOwnProperty.call(body, "textImages")) {
      updates.textImages = body.textImages as Parameters<typeof updateUserPreferences>[1]["textImages"];
    }

    if (Object.prototype.hasOwnProperty.call(body, "accessibility")) {
      updates.accessibility = body.accessibility as Parameters<typeof updateUserPreferences>[1]["accessibility"];
    }

    if (Object.prototype.hasOwnProperty.call(body, "emoji")) {
      updates.emoji = body.emoji as Parameters<typeof updateUserPreferences>[1]["emoji"];
    }

    if (Object.prototype.hasOwnProperty.call(body, "stickers")) {
      updates.stickers = body.stickers as Parameters<typeof updateUserPreferences>[1]["stickers"];
    }

    if (Object.prototype.hasOwnProperty.call(body, "keybinds")) {
      updates.keybinds = body.keybinds as Parameters<typeof updateUserPreferences>[1]["keybinds"];
    }

    if (Object.prototype.hasOwnProperty.call(body, "advanced")) {
      updates.advanced = body.advanced as Parameters<typeof updateUserPreferences>[1]["advanced"];
    }

    if (Object.prototype.hasOwnProperty.call(body, "streamerMode")) {
      updates.streamerMode = body.streamerMode as Parameters<typeof updateUserPreferences>[1]["streamerMode"];
    }

    if (Object.prototype.hasOwnProperty.call(body, "gameOverlay")) {
      updates.gameOverlay = body.gameOverlay as Parameters<typeof updateUserPreferences>[1]["gameOverlay"];
    }

    if (Object.prototype.hasOwnProperty.call(body, "botGhost")) {
      updates.botGhost = body.botGhost as Parameters<typeof updateUserPreferences>[1]["botGhost"];
    }

    if (typeof body.customCss === "string") {
      updates.customCss = body.customCss;
    }

    if (typeof body.languagePreference === "string") {
      updates.languagePreference = body.languagePreference;
    }

    if (Array.isArray(body.connectedAccounts)) {
      updates.connectedAccounts = body.connectedAccounts
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim());
    }

    if (Object.prototype.hasOwnProperty.call(body, "contentSocial")) {
      updates.contentSocial = body.contentSocial as Parameters<typeof updateUserPreferences>[1]["contentSocial"];
    }

    if (Object.prototype.hasOwnProperty.call(body, "dataPrivacy")) {
      updates.dataPrivacy = body.dataPrivacy as Parameters<typeof updateUserPreferences>[1]["dataPrivacy"];
    }

    if (Object.prototype.hasOwnProperty.call(body, "activityPrivacy")) {
      updates.activityPrivacy = body.activityPrivacy as Parameters<typeof updateUserPreferences>[1]["activityPrivacy"];
    }

    if (Object.prototype.hasOwnProperty.call(body, "registeredGames")) {
      updates.registeredGames = body.registeredGames as Parameters<typeof updateUserPreferences>[1]["registeredGames"];
    }

    if (Object.prototype.hasOwnProperty.call(body, "familyCenter")) {
      updates.familyCenter = body.familyCenter as Parameters<typeof updateUserPreferences>[1]["familyCenter"];
    }

    if (Object.prototype.hasOwnProperty.call(body, "businessCenter")) {
      updates.businessCenter = body.businessCenter as Parameters<typeof updateUserPreferences>[1]["businessCenter"];
    }

    if (Object.prototype.hasOwnProperty.call(body, "schoolCenter")) {
      updates.schoolCenter = body.schoolCenter as Parameters<typeof updateUserPreferences>[1]["schoolCenter"];
    }

    if (Array.isArray(body.serverTags)) {
      updates.serverTags = body.serverTags
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim());
    }

    if (Object.prototype.hasOwnProperty.call(body, "customThemeColors")) {
      updates.customThemeColors = (body.customThemeColors ?? null) as CustomThemeColors | null;
    }

    if (Array.isArray(body.downloadedPlugins)) {
      updates.downloadedPlugins = body.downloadedPlugins
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
    }

    if (Array.isArray(body.bannerUploads)) {
      updates.bannerUploads = body.bannerUploads
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
    }

    if (Array.isArray(body.avatarUploads)) {
      updates.avatarUploads = body.avatarUploads
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
    }

    if (Array.isArray(body.OtherApps)) {
      updates.OtherApps = body.OtherApps as Parameters<typeof updateUserPreferences>[1]["OtherApps"];
    }

    if (Array.isArray(body.OtherBots)) {
      const currentPreferences = await getUserPreferences(profile.id);
      const nextBots = body.OtherBots as NonNullable<Parameters<typeof updateUserPreferences>[1]["OtherBots"]>;
      updates.OtherBots = nextBots;

      const previousIds = new Set(
        currentPreferences.OtherBots
          .map((bot) => String(bot.id ?? "").trim())
          .filter((id) => id.length > 0)
      );

      const nextIds = new Set(
        nextBots
          .map((bot) => String(bot.id ?? "").trim())
          .filter((id) => id.length > 0)
      );

      removedOtherBotIds = Array.from(previousIds).filter((id) => !nextIds.has(id));
    }

    if (body.OtherBotTokens && typeof body.OtherBotTokens === "object" && !Array.isArray(body.OtherBotTokens)) {
      updates.OtherBotTokens = body.OtherBotTokens as Parameters<typeof updateUserPreferences>[1]["OtherBotTokens"];
    }

    if (typeof body.OtherBotAutoImportOnSave === "boolean") {
      updates.OtherBotAutoImportOnSave = body.OtherBotAutoImportOnSave;
    }

    const preferences = await updateUserPreferences(profile.id, updates);

    if (removedOtherBotIds.length > 0) {
      const ownedServers = await db.query.server.findMany({
        where: eq(server.profileId, profile.id),
        columns: { id: true },
      });

      const ownedServerIds = ownedServers.map((item) => item.id).filter((id) => id.length > 0);
      const removedProfileIds = removedOtherBotIds.map((botId) => makeIntegrationBotProfileId(profile.id, botId));

      for (const serverId of ownedServerIds) {
        for (const removedProfileId of removedProfileIds) {
          await clearServerIntegrationBotFlags(serverId, removedProfileId);
        }
      }

      if (ownedServerIds.length > 0 && removedProfileIds.length > 0) {
        await db.execute(sql`
          delete from "Member"
          where "profileId" in (${sql.join(removedProfileIds.map((id) => sql`${id}`), sql`, `)})
            and "serverId" in (${sql.join(ownedServerIds.map((id) => sql`${id}`), sql`, `)})
        `);
      }
    }

    return NextResponse.json(preferences);
  } catch (error) {
    console.error("[PROFILE_PREFERENCES_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
