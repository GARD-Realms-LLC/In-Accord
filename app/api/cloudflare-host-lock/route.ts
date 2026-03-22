import { NextResponse } from "next/server";

import {
  CLOUDFLARE_HOST_LOCK_BYPASS_COOKIE,
  CLOUDFLARE_HOST_LOCK_PIN,
} from "@/lib/cloudflare-host-lock";

const buildCookieOptions = (request: Request) => {
  const protocol = new URL(request.url).protocol;

  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 12,
  };
};

export async function GET(request: Request) {
  const response = NextResponse.json({ ok: true });
  const hasBypass = Boolean(
    request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${CLOUDFLARE_HOST_LOCK_BYPASS_COOKIE}=`))
  );

  return NextResponse.json({ ok: true, unlocked: hasBypass });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { pin?: unknown };
  const submittedPin = String(body.pin ?? "").trim();

  if (submittedPin !== CLOUDFLARE_HOST_LOCK_PIN) {
    return new NextResponse("Invalid PIN", { status: 403 });
  }

  const response = NextResponse.json({ ok: true, unlocked: true });
  response.cookies.set(
    CLOUDFLARE_HOST_LOCK_BYPASS_COOKIE,
    "1",
    buildCookieOptions(request)
  );
  return response;
}

export async function DELETE(request: Request) {
  const response = NextResponse.json({ ok: true, unlocked: false });
  response.cookies.set(CLOUDFLARE_HOST_LOCK_BYPASS_COOKIE, "", {
    ...buildCookieOptions(request),
    maxAge: 0,
  });
  return response;
}