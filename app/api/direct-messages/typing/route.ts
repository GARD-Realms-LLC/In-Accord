import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";

export async function POST() {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Typing state persistence is not implemented in this codebase yet.
    // Keep endpoint available to avoid client-side 404s and allow future extension.
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DIRECT_MESSAGES_TYPING_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
