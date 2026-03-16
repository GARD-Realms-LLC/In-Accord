import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { getBannerDebugLogPath, readRecentBannerDebugEvents } from "@/lib/banner-debug";

export async function GET(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.max(1, Math.min(500, Number(searchParams.get("limit") || 100) || 100));

    return NextResponse.json({
      ok: true,
      logPath: getBannerDebugLogPath(),
      events: await readRecentBannerDebugEvents(limit),
    });
  } catch (error) {
    console.error("[DEBUG_BANNER_TRACE_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}