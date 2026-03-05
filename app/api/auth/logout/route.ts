import { NextResponse } from "next/server";

import { clearSessionUserId } from "@/lib/session";

export async function POST() {
  try {
    await clearSessionUserId();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[AUTH_LOGOUT_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
