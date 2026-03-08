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
      serverTags?: unknown;
      customThemeColors?: unknown;
      downloadedPlugins?: unknown;
      bannerUploads?: unknown;
      avatarUploads?: unknown;
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

    const preferences = await updateUserPreferences(profile.id, updates);
    return NextResponse.json(preferences);
  } catch (error) {
    console.error("[PROFILE_PREFERENCES_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
