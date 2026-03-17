import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "inaccord_session_user_id";
const PUBLIC_PATH_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/in-aboard",
  "/our-board",
  "/api/auth",
  "/api/our-board",
  "/api/debug/rebind-socket-io",
  "/api/socket/panel-probe-report",
  "/api/socket/probe-report",
  "/api/socket/rebind",
  "/api/uploadthing",
  "/api/r2/object",
];

const isPublicPath = (pathname: string) => {
  return PUBLIC_PATH_PREFIXES.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
};

const isLiveProfilePopupPath = (pathname: string) => {
  return /^\/api\/profile\/[^/]+\/(card|mutuals)$/i.test(pathname);
};

const shouldUseSecureCookie = (req: NextRequest) => {
  const forwardedProto = String(req.headers.get("x-forwarded-proto") ?? "").trim().toLowerCase();
  if (forwardedProto === "https") {
    return true;
  }

  if (forwardedProto === "http") {
    return false;
  }

  const protocol = String(req.nextUrl.protocol || "").trim().toLowerCase();
  if (protocol === "https:") {
    return true;
  }

  if (protocol === "http:") {
    return false;
  }

  const host = String(req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "")
    .trim()
    .toLowerCase();

  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
    return false;
  }

  return process.env.NODE_ENV === "production";
};

const expireSessionCookie = (req: NextRequest, response: NextResponse) => {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(req),
    path: "/",
    maxAge: 0,
  });
};

const withValidationCookie = (req: NextRequest, response: NextResponse, validationResponse?: Response | null) => {
  const setCookieHeader = validationResponse?.headers.get("set-cookie");

  if (setCookieHeader) {
    response.headers.set("set-cookie", setCookieHeader);
    return response;
  }

  expireSessionCookie(req, response);
  return response;
};

const buildUnauthorizedResponse = (
  req: NextRequest,
  validationResponse?: Response | null
) => {
  return withValidationCookie(req, new NextResponse("Unauthorized", { status: 401 }), validationResponse);
};

export default async function proxy(req: NextRequest) {
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

  if (isLiveProfilePopupPath(pathname)) {
    return NextResponse.next();
  }

  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return buildUnauthorizedResponse(req, null);
  }

  try {
    const validationHeaders = new Headers();
    const cookieHeader = req.headers.get("cookie");

    if (cookieHeader) {
      validationHeaders.set("cookie", cookieHeader);
    }

    const validationResponse = await fetch(new URL("/api/auth/session", req.url), {
      method: "GET",
      headers: validationHeaders,
      cache: "no-store",
    });

    if (validationResponse.ok) {
      return NextResponse.next();
    }

    return buildUnauthorizedResponse(req, validationResponse);
  } catch (_error) {
    return buildUnauthorizedResponse(req, null);
  }
}

export const config = {
  matcher: [
    // Skip common static paths; runtime guard above also bypasses file extensions.
    "/((?!_next/static|_next/image|favicon.ico).*)",

    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
