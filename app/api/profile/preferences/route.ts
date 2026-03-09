import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
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
      customCss?: unknown;
      languagePreference?: unknown;
      connectedAccounts?: unknown;
      contentSocial?: unknown;
      dataPrivacy?: unknown;
      familyCenter?: unknown;
      serverTags?: unknown;
      customThemeColors?: unknown;
      downloadedPlugins?: unknown;
      bannerUploads?: unknown;
      avatarUploads?: unknown;
      discordApps?: unknown;
      discordBots?: unknown;
    };

    const updates: Parameters<typeof updateUserPreferences>[1] = {};

    if (typeof body.mentionsEnabled === "boolean") {
      updates.mentionsEnabled = body.mentionsEnabled;
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

    if (Object.prototype.hasOwnProperty.call(body, "familyCenter")) {
      updates.familyCenter = body.familyCenter as Parameters<typeof updateUserPreferences>[1]["familyCenter"];
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

    if (Array.isArray(body.discordApps)) {
      updates.discordApps = body.discordApps as Parameters<typeof updateUserPreferences>[1]["discordApps"];
    }

    if (Array.isArray(body.discordBots)) {
      updates.discordBots = body.discordBots as Parameters<typeof updateUserPreferences>[1]["discordBots"];
    }

    const preferences = await updateUserPreferences(profile.id, updates);
    return NextResponse.json(preferences);
  } catch (error) {
    console.error("[PROFILE_PREFERENCES_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
