import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ensureLocalAuthSchema } from "@/lib/local-auth";
import { setSessionUserId } from "@/lib/session";
import { verifyPassword } from "@/lib/password";

export async function POST(request: Request) {
  try {
    const connectionUrl = process.env.LIVE_DATABASE_URL?.trim() ?? "";

    if (!connectionUrl || /^replace_/i.test(connectionUrl) || !/^postgres(ql)?:\/\//i.test(connectionUrl)) {
      return new NextResponse(
        "Database unavailable. Configure LIVE_DATABASE_URL with a PostgreSQL connection string.",
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

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
      return new NextResponse("Invalid credentials", { status: 401 });
    }

    await setSessionUserId(authenticatedUserId);
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
      /DATABASE_URL.*(postgres|postgresql)/i.test(message) ||
      /relation .* does not exist|42P01/i.test(message) ||
      /ETIMEDOUT|ECONNREFUSED|ENOTFOUND|57P01|08006|08001/i.test(message) ||
      /ETIMEDOUT|ECONNREFUSED|ENOTFOUND|57P01|08006|08001/i.test(maybeCode) ||
      /ETIMEDOUT|ECONNREFUSED|ENOTFOUND|57P01|08006|08001/i.test(serialized)
    ) {
      return new NextResponse(
        "Database unavailable. Check LIVE_DATABASE_URL and required tables.",
        { status: 503 }
      );
    }

    return new NextResponse("Internal Error", { status: 500 });
  }
}
