import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  CLOUDFLARE_HOST_LOCK_BYPASS_COOKIE,
  isExemptCloudflareLockPath,
  isLoopbackHostname,
  isTrustedCloudflareRequest,
} from "@/lib/cloudflare-host-lock";

export function middleware(request: NextRequest) {
  const { nextUrl, headers, cookies } = request;
  const hostname = String(nextUrl.hostname ?? "").trim().toLowerCase();

  if (isLoopbackHostname(hostname) || isExemptCloudflareLockPath(nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (cookies.get(CLOUDFLARE_HOST_LOCK_BYPASS_COOKIE)?.value === "1") {
    return NextResponse.next();
  }

  if (isTrustedCloudflareRequest(headers)) {
    return NextResponse.next();
  }

  if (nextUrl.pathname.startsWith("/api/")) {
    return new NextResponse("Cloudflare hosting required.", { status: 403 });
  }

  const redirectUrl = nextUrl.clone();
  redirectUrl.pathname = "/cloudflare-required";
  redirectUrl.searchParams.set("next", `${nextUrl.pathname}${nextUrl.search}`);
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)", "/api/:path*"],
};