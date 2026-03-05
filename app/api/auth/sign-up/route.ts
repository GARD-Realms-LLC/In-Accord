import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { db } from "@/lib/db";
import { ensureLocalAuthSchema } from "@/lib/local-auth";
import { hashPassword } from "@/lib/password";
import { setSessionUserId } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const liveConnectionUrl = process.env.LIVE_DATABASE_URL?.trim() ?? "";
    const fallbackConnectionUrl = process.env.DATABASE_URL?.trim() ?? "";
    const connectionUrl =
      liveConnectionUrl && !/^replace_/i.test(liveConnectionUrl)
        ? liveConnectionUrl
        : fallbackConnectionUrl;

    if (!/^postgres(ql)?:\/\//i.test(connectionUrl)) {
      return new NextResponse(
        "Database unavailable. Configure LIVE_DATABASE_URL (preferred) or DATABASE_URL with a PostgreSQL connection string.",
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!name || !email || !password) {
      return new NextResponse("Name, email and password are required", { status: 400 });
    }

    if (password.length < 8) {
      return new NextResponse("Password must be at least 8 characters", { status: 400 });
    }

    await ensureLocalAuthSchema();

    const existingResult = await db.execute(sql`
      select "userId"
      from "Users"
      where lower(coalesce("email", '')) = ${email}
      limit 1
    `);
    const existingRows = (existingResult as unknown as { rows: Array<{ userId: string }> }).rows;
    const existing = existingRows?.[0];

    if (existing) {
      return new NextResponse("Email already in use", { status: 409 });
    }

    const userId = uuidv4();
    const now = new Date();

    await db.execute(sql`
      insert into "Users" (
        "userId",
        "name",
        "email",
        "avatarUrl",
        "role",
        "account.created",
        "lastLogin"
      )
      values (
        ${userId},
        ${name},
        ${email},
        ${"/in-accord-steampunk-logo.png"},
        ${"USER"},
        ${now},
        ${now}
      )
    `);

    const passwordHash = await hashPassword(password);
    await db.execute(sql`
      insert into "LocalCredential" ("userId", "passwordHash", "createdAt", "updatedAt")
      values (${userId}, ${passwordHash}, ${now}, ${now})
    `);

    await setSessionUserId(userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[AUTH_SIGN_UP_POST]", error);

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
