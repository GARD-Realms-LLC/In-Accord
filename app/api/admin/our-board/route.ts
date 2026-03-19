import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { listOurBoardEntries } from "@/lib/our-board-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const entries = await listOurBoardEntries();

    return NextResponse.json({
      entries,
      summary: {
        total: entries.length,
        listed: entries.filter((entry) => entry.listed).length,
        unlisted: entries.filter((entry) => !entry.listed).length,
      },
    });
  } catch (error) {
    console.error("[ADMIN_OUR_BOARD_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
