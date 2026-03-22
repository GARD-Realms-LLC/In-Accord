import { NextRequest, NextResponse } from "next/server";

import {
  CLOUDFLARE_HOST_LOCK_BYPASS_COOKIE,
  isExemptCloudflareLockPath,
  isLoopbackHostname,
  isTrustedCloudflareRequest,
} from "@/lib/cloudflare-host-lock";

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

const isPublicPath = (pathname: string) => {
  return PUBLIC_PATH_PREFIXES.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
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

const enforceCloudflareHostLock = (req: NextRequest) => {
  const { nextUrl, headers, cookies } = req;
  const hostname = String(nextUrl.hostname ?? "").trim().toLowerCase();

  if (isLoopbackHostname(hostname) || isExemptCloudflareLockPath(nextUrl.pathname)) {
    return null;
  }

  if (cookies.get(CLOUDFLARE_HOST_LOCK_BYPASS_COOKIE)?.value === "1") {
    return null;
  }

  if (isTrustedCloudflareRequest(headers)) {
    return null;
  }

  if (nextUrl.pathname.startsWith("/api/")) {
    return new NextResponse("Cloudflare hosting required.", { status: 403 });
  }

  const redirectUrl = nextUrl.clone();
  redirectUrl.pathname = "/cloudflare-required";
  redirectUrl.searchParams.set("next", `${nextUrl.pathname}${nextUrl.search}`);
  return NextResponse.redirect(redirectUrl);
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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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

  const hostLockResponse = enforceCloudflareHostLock(req);
  if (hostLockResponse) {
    return hostLockResponse;
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
    "/((?!_next/static|_next/image|favicon.ico).*)",
    "/(api|trpc)(.*)",
  ],
};