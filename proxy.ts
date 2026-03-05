import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "inaccord_session_user_id";
const PUBLIC_PATH_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/api/auth",
  "/api/uploadthing",
  "/api/r2/object",
];
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const isPublicPath = (pathname: string) => {
  return PUBLIC_PATH_PREFIXES.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
};

const hasPlausibleSessionToken = (token?: string) => {
  if (!token) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length < 3) {
    return false;
  }

  const issuedAtRaw = parts[parts.length - 2];
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  return issuedAt > 0 && now - issuedAt <= SESSION_TTL_SECONDS;
};

export default function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (hasPlausibleSessionToken(token)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const signInUrl = new URL("/sign-in", req.url);
  signInUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",

    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
