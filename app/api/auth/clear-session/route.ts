import { NextResponse } from "next/server";

import { clearSessionUserId } from "@/lib/session";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const nextParam = searchParams.get("next");
    const safeNext = nextParam && nextParam.startsWith("/") ? nextParam : "/sign-in";

    await clearSessionUserId();
    return NextResponse.redirect(new URL(safeNext, req.url));
  } catch (error) {
    console.error("[AUTH_CLEAR_SESSION_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
