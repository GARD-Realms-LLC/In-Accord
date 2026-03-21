import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { getAuthIntegrityStatus } from "@/lib/auth-integrity";
import { ensureLocalAuthSchema } from "@/lib/local-auth";
import { setSessionUserId } from "@/lib/session";
import { verifyPassword } from "@/lib/password";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const stayLoggedIn = body?.stayLoggedIn === true;

    if (!email || !password) {
      return new NextResponse("Email and password are required", { status: 400 });
    }

    await ensureLocalAuthSchema();

    const userRowsResult = await db.execute(sql`
      select
        u."userId",
        coalesce(lc."passwordHash", u."password_hash") as "passwordHash",
        case
          when lc."passwordHash" is not null then 0
          when coalesce(u."password_hash", '') <> '' then 1
          else 2
        end as "priority"
      from "Users"
      u
      left join "LocalCredential" lc on lc."userId" = u."userId"
      where lower(coalesce("email", '')) = ${email}
      order by "priority" asc, u."userId" asc
    `);

    const candidates = (userRowsResult as unknown as {
      rows: Array<{ userId: string; passwordHash: string | null }>;
    }).rows;

    if (!candidates?.length) {
      const authIntegrity = await getAuthIntegrityStatus();
      if (!authIntegrity.ok) {
        console.error("[AUTH_SIGN_IN_INTEGRITY]", authIntegrity);
        return new NextResponse(authIntegrity.message, { status: 503 });
      }

      return new NextResponse("Invalid credentials", { status: 401 });
    }

    let authenticatedUserId: string | null = null;
    for (const candidate of candidates) {
      if (!candidate.passwordHash) {
        continue;
      }

      const ok = await verifyPassword(password, candidate.passwordHash);
      if (ok) {
        authenticatedUserId = candidate.userId;
        break;
      }
    }

    if (!authenticatedUserId) {
      const authIntegrity = await getAuthIntegrityStatus();
      if (!authIntegrity.ok) {
        console.error("[AUTH_SIGN_IN_INTEGRITY]", authIntegrity);
        return new NextResponse(authIntegrity.message, { status: 503 });
      }

      return new NextResponse("Invalid credentials", { status: 401 });
    }

    await setSessionUserId(authenticatedUserId, { request, persistent: stayLoggedIn });
    return NextResponse.json({ ok: true, redirectTo: "/users" });
  } catch (error) {
    console.error("[AUTH_SIGN_IN_POST]", error);

    const message = error instanceof Error ? error.message : String(error);
    const maybeCode =
      typeof error === "object" && error !== null
        ? String(
            (error as { code?: unknown; cause?: { code?: unknown } }).code ??
              (error as { cause?: { code?: unknown } }).cause?.code ??
              ""
          )
        : "";
    const serialized =
      typeof error === "object" && error !== null ? JSON.stringify(error) : "";

    if (
      /LIVE_DATABASE_URL|DATABASE_URL|Cloudflare D1|wrangler|binding "?DB"?/i.test(message) ||
      /no such table|no such column|SQLITE_ERROR/i.test(message) ||
      /ETIMEDOUT|ECONNREFUSED|ENOTFOUND|SQLITE_ERROR/i.test(message) ||
      /ETIMEDOUT|ECONNREFUSED|ENOTFOUND|SQLITE_ERROR/i.test(maybeCode) ||
      /ETIMEDOUT|ECONNREFUSED|ENOTFOUND|SQLITE_ERROR/i.test(serialized)
    ) {
      return new NextResponse(
        "Database unavailable. Check the D1 runtime connection and required tables.",
        { status: 503 }
      );
    }

    return new NextResponse("Internal Error", { status: 500 });
  }
}
