import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { getOptionalEffectiveDatabaseConnectionString } from "@/lib/database-runtime-control";
import {
  ensureLocalAuthSchema,
  hasLegacyUserPasswordHashColumn,
  hasLocalAuthSchema,
} from "@/lib/local-auth";
import { setSessionUserId } from "@/lib/session";
import { verifyPassword } from "@/lib/password";

const isDatabaseUnavailableError = (error: unknown) => {
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

  return (
    /DATABASE_URL.*(postgres|postgresql)/i.test(message) ||
    /relation .* does not exist|42P01/i.test(message) ||
    /ETIMEDOUT|ECONNREFUSED|ENOTFOUND|57P01|08006|08001|proxy request failed|cannot connect to the specified address/i.test(
      message,
    ) ||
    /ETIMEDOUT|ECONNREFUSED|ENOTFOUND|57P01|08006|08001/i.test(maybeCode) ||
    /ETIMEDOUT|ECONNREFUSED|ENOTFOUND|57P01|08006|08001|proxy request failed|cannot connect to the specified address/i.test(
      serialized,
    )
  );
};

export async function POST(request: Request) {
  try {
    const connectionUrl = getOptionalEffectiveDatabaseConnectionString();

    if (!connectionUrl) {
      return new NextResponse(
        "Database unavailable. Configure LIVE_DATABASE_URL or DATABASE_URL with a PostgreSQL connection string.",
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const stayLoggedIn = body?.stayLoggedIn === true;

    if (!email || !password) {
      return new NextResponse("Email and password are required", { status: 400 });
    }

    let localAuthSchemaAvailable = false;

    try {
      await ensureLocalAuthSchema();
      localAuthSchemaAvailable = true;
    } catch (error) {
      if (isDatabaseUnavailableError(error)) {
        throw error;
      }

      console.warn("[AUTH_SIGN_IN_LOCAL_AUTH_SCHEMA]", error);

      try {
        localAuthSchemaAvailable = await hasLocalAuthSchema();
      } catch (probeError) {
        if (isDatabaseUnavailableError(probeError)) {
          throw probeError;
        }

        localAuthSchemaAvailable = false;
      }
    }

    let legacyPasswordHashColumnAvailable = false;
    try {
      legacyPasswordHashColumnAvailable =
        await hasLegacyUserPasswordHashColumn();
    } catch (error) {
      if (isDatabaseUnavailableError(error)) {
        throw error;
      }
    }

    const userRowsResult = localAuthSchemaAvailable
      ? legacyPasswordHashColumnAvailable
        ? await db.execute(sql`
            select
              u."userId",
              lc."passwordHash" as "localPasswordHash",
              u."password_hash" as "legacyPasswordHash",
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
          `)
        : await db.execute(sql`
            select
              u."userId",
              lc."passwordHash" as "localPasswordHash",
              null::text as "legacyPasswordHash",
              case
                when lc."passwordHash" is not null then 0
                else 2
              end as "priority"
            from "Users"
            u
            left join "LocalCredential" lc on lc."userId" = u."userId"
            where lower(coalesce("email", '')) = ${email}
            order by "priority" asc, u."userId" asc
          `)
      : legacyPasswordHashColumnAvailable
        ? await db.execute(sql`
            select
              u."userId",
              null::text as "localPasswordHash",
              u."password_hash" as "legacyPasswordHash",
              case
                when coalesce(u."password_hash", '') <> '' then 1
                else 2
              end as "priority"
            from "Users" u
            where lower(coalesce("email", '')) = ${email}
            order by "priority" asc, u."userId" asc
          `)
        : { rows: [] };

    const candidates = (userRowsResult as unknown as {
      rows: Array<{
        userId: string;
        localPasswordHash: string | null;
        legacyPasswordHash: string | null;
      }>;
    }).rows;

    if (!candidates?.length) {
      return new NextResponse("Invalid credentials", { status: 401 });
    }

    let authenticatedUserId: string | null = null;
    for (const candidate of candidates) {
      const hashes = [candidate.localPasswordHash, candidate.legacyPasswordHash].filter(
        (hash, index, values): hash is string =>
          Boolean(hash) && values.findIndex((value) => value === hash) === index
      );

      for (const hash of hashes) {
        const ok = await verifyPassword(password, hash);
        if (ok) {
          authenticatedUserId = candidate.userId;
          break;
        }
      }

      if (authenticatedUserId) {
        break;
      }
    }

    if (!authenticatedUserId) {
      return new NextResponse("Invalid credentials", { status: 401 });
    }

    await setSessionUserId(authenticatedUserId, { request, persistent: stayLoggedIn });
    return NextResponse.json({ ok: true, redirectTo: "/users" });
  } catch (error) {
    console.error("[AUTH_SIGN_IN_POST]", error);

    if (isDatabaseUnavailableError(error)) {
      return new NextResponse(
        "Database unavailable. Check LIVE_DATABASE_URL or DATABASE_URL and required tables.",
        { status: 503 }
      );
    }

    return new NextResponse("Internal Error", { status: 500 });
  }
}
