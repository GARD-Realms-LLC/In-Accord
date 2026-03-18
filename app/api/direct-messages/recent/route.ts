import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { getGlobalRecentDmsForProfile, serializeRecentDmRailItem } from "@/lib/direct-messages";

export async function GET(req: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const selectedServerId = String(searchParams.get("selectedServerId") ?? "").trim();

    const items = await getGlobalRecentDmsForProfile({
      profileId: profile.id,
      selectedServerId: selectedServerId || null,
      recentWindowDays: 30,
    });

    return NextResponse.json({
      items: items.map((item) => serializeRecentDmRailItem(item)),
    });
  } catch (error) {
    console.error("[DIRECT_MESSAGES_RECENT_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}