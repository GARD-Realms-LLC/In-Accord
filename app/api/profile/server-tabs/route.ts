import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import {
  getProfileServerTabsState,
  updateProfileServerTabsState,
} from "@/lib/profile-server-tabs";

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const state = await getProfileServerTabsState(profile.id);
    return NextResponse.json(state);
  } catch (error) {
    console.error("[PROFILE_SERVER_TABS_GET]", error);
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
      tabs?: unknown;
      tabBarPreferences?: unknown;
      customTabPresets?: unknown;
    };

    const state = await updateProfileServerTabsState(profile.id, {
      tabs: body.tabs,
      tabBarPreferences: body.tabBarPreferences,
      customTabPresets: body.customTabPresets,
    });

    return NextResponse.json(state);
  } catch (error) {
    console.error("[PROFILE_SERVER_TABS_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
