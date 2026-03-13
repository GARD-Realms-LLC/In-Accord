import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "inaccord_session_user_id";
const PUBLIC_PATH_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/in-aboard",
  "/our-board",
  "/api/auth",
  "/api/our-board",
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
  if (parts.length !== 4) {
    return false;
  }

  const issuedAtRaw = parts[1];
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  return issuedAt > 0 && now - issuedAt <= SESSION_TTL_SECONDS;
};

export default function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.[a-z0-9]+$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

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
    // Skip common static paths; runtime guard above also bypasses file extensions.
    "/((?!_next/static|_next/image|favicon.ico).*)",

    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
