import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { isDatabaseRuntimeReady } from "@/lib/d1-runtime";
import { ensureLocalAuthSchema } from "@/lib/local-auth";
import { hashPassword } from "@/lib/password";
import { setSessionUserId } from "@/lib/session";
import { getNextIncrementalUserId } from "@/lib/user-id";
import { ensureUserProfileSchema } from "@/lib/user-profile";

export async function POST(request: Request) {
  try {
    if (!(await isDatabaseRuntimeReady())) {
      return new NextResponse(
        "Database unavailable. Configure Cloudflare D1.",
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    const name = String(body?.name || "").trim();
    const phoneNumberInput = String(body?.phoneNumber || "").trim();
    const dateOfBirthInput = String(body?.dateOfBirth || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!name || !email || !password) {
      return new NextResponse("Name, email and password are required", { status: 400 });
    }

    if (password.length < 8) {
      return new NextResponse("Password must be at least 8 characters", { status: 400 });
    }

    if (phoneNumberInput.length > 32) {
      return new NextResponse("Phone Number must be 32 characters or fewer", { status: 400 });
    }

    let normalizedDateOfBirth: string | null = null;
    if (dateOfBirthInput.length > 0) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirthInput)) {
        return new NextResponse("Date Of Birth must be in YYYY-MM-DD format", { status: 400 });
      }

      const [yearPart, monthPart, dayPart] = dateOfBirthInput.split("-");
      const year = Number(yearPart);
      const month = Number(monthPart);
      const day = Number(dayPart);
      const parsedDateOfBirth = new Date(`${dateOfBirthInput}T00:00:00.000Z`);

      if (
        Number.isNaN(parsedDateOfBirth.getTime()) ||
        parsedDateOfBirth.getUTCFullYear() !== year ||
        parsedDateOfBirth.getUTCMonth() + 1 !== month ||
        parsedDateOfBirth.getUTCDate() !== day
      ) {
        return new NextResponse("Date Of Birth is invalid", { status: 400 });
      }

      normalizedDateOfBirth = dateOfBirthInput;
    }

    const normalizedPhoneNumber = phoneNumberInput.length > 0 ? phoneNumberInput : null;

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

    const userId = await getNextIncrementalUserId();
    const now = new Date();

    await db.execute(sql`
      alter table "Users"
      add column if not exists "phone" varchar(32)
    `);

    await db.execute(sql`
      alter table "Users"
      add column if not exists "dob" date
    `);

    await db.execute(sql`
      insert into "Users" (
        "userId",
        "name",
        "email",
        "phone",
        "dob",
        "avatarUrl",
        "role",
        "account.created",
        "lastLogin"
      )
      values (
        ${userId},
        ${null},
        ${email},
        ${normalizedPhoneNumber},
        ${normalizedDateOfBirth},
        ${"/in-accord-steampunk-logo.png"},
        ${"USER"},
        ${now},
        ${now}
      )
    `);

    await ensureUserProfileSchema();
    await db.execute(sql`
      insert into "UserProfile" ("userId", "profileName", "createdAt", "updatedAt")
      values (${userId}, ${name}, ${now}, ${now})
      on conflict ("userId") do update
      set "profileName" = excluded."profileName",
          "updatedAt" = excluded."updatedAt"
    `);

    const passwordHash = await hashPassword(password);
    await db.execute(sql`
      insert into "LocalCredential" ("userId", "passwordHash", "createdAt", "updatedAt")
      values (${userId}, ${passwordHash}, ${now}, ${now})
    `);

    await setSessionUserId(userId, { request });
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
    let serialized = "";
    if (typeof error === "object" && error !== null) {
      try {
        serialized = JSON.stringify(error);
      } catch {
        serialized = "";
      }
    }

    if (
      /No D1 database binding configured|Database unavailable|Failed to execute D1 query/i.test(
        message,
      ) ||
      /SQLITE_|D1_/i.test(maybeCode) ||
      /No D1 database binding configured|Database unavailable|Failed to execute D1 query|SQLITE_/i.test(
        serialized,
      )
    ) {
      return new NextResponse(
        "Database unavailable. Check the Cloudflare D1 binding and required tables.",
        { status: 503 }
      );
    }

    return new NextResponse("Internal Error", { status: 500 });
  }
}
