import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { isDatabaseRuntimeReady } from "@/lib/d1-runtime";
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
  let serialized = "";
  if (typeof error === "object" && error !== null) {
    try {
      serialized = JSON.stringify(error);
    } catch {
      serialized = "";
    }
  }

  return (
    /No D1 database binding configured|Database unavailable|Failed to execute D1 query/i.test(
      message,
    ) ||
    /SQLITE_|D1_/i.test(maybeCode) ||
    /No D1 database binding configured|Database unavailable|Failed to execute D1 query|SQLITE_/i.test(
      serialized,
    )
  );
};

export async function POST(request: Request) {
  try {
    if (!(await isDatabaseRuntimeReady())) {
      return new NextResponse(
        "Database unavailable. Configure Cloudflare D1.",
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
              u."userId" as "userId",
              lc."passwordHash" as "localPasswordHash",
              u."password_hash" as "legacyPasswordHash"
            from "Users" u
            left join "LocalCredential" lc on lc."userId" = u."userId"
            where lower(coalesce(u."email", '')) = ${email}
            order by u."userId" asc
          `)
        : await db.execute(sql`
            select
              u."userId" as "userId",
              lc."passwordHash" as "localPasswordHash",
              null as "legacyPasswordHash"
            from "Users" u
            left join "LocalCredential" lc on lc."userId" = u."userId"
            where lower(coalesce(u."email", '')) = ${email}
            order by u."userId" asc
          `)
      : legacyPasswordHashColumnAvailable
        ? await db.execute(sql`
            select
              u."userId" as "userId",
              null as "localPasswordHash",
              u."password_hash" as "legacyPasswordHash"
            from "Users" u
            where lower(coalesce(u."email", '')) = ${email}
            order by u."userId" asc
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
        "Database unavailable. Check the Cloudflare D1 binding and required tables.",
        { status: 503 }
      );
    }

    if (String(process.env.INACCORD_AUTH_DEBUG ?? "").trim() === "1") {
      const nestedCause =
        typeof error === "object" && error !== null
          ? (error as { cause?: unknown }).cause
          : undefined;

      return NextResponse.json(
        {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
          cause:
            nestedCause instanceof Error
              ? {
                  message: nestedCause.message,
                  stack: nestedCause.stack?.split("\n").slice(0, 12) ?? [],
                }
              : nestedCause ?? null,
          stack:
            error instanceof Error
              ? error.stack?.split("\n").slice(0, 12) ?? []
              : [],
        },
        { status: 500 },
      );
    }

    return new NextResponse("Internal Error", { status: 500 });
  }
}
