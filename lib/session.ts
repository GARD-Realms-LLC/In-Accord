import { cookies, headers } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export const SESSION_COOKIE_NAME = "inaccord_session_user_id";
const PERSISTENT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 5;
const BROWSER_SESSION_TTL_SECONDS = 60 * 60 * 24;
const MAX_SIGNED_TOKEN_AGE_SECONDS = PERSISTENT_SESSION_TTL_SECONDS;
const SESSION_SECRET = process.env.SESSION_SECRET || "replace_me_session_secret";

type SessionRow = {
  sessionId: string;
  userId: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date | string;
  lastSeenAt: Date | string;
  expiresAt: Date | string;
  revokedAt: Date | string | null;
};

export type SessionDiagnostics = {
  ok: boolean;
  code:
    | "ok"
    | "no-session-cookie"
    | "database-unavailable"
    | "invalid-session-cookie"
    | "session-not-found"
    | "session-validation-failed";
  message: string;
  userId: string | null;
  sessionId: string | null;
};

export type UserSessionEntry = {
  sessionId: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

let sessionSchemaReady = false;

const resolveSessionCookieSecure = async (request?: Request) => {
  const requestUrl = String(request?.url || "").trim();

  try {
    if (requestUrl) {
      const parsed = new URL(requestUrl);
      if (parsed.protocol === "https:") {
        return true;
      }

      if (parsed.protocol === "http:") {
        return false;
      }
    }
  } catch (_error) {
    // Fall through to header detection.
  }

  try {
    const headerStore = await headers();
    const forwardedProto = String(headerStore.get("x-forwarded-proto") ?? "").trim().toLowerCase();
    const host = String(headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "")
      .trim()
      .toLowerCase();

    if (forwardedProto === "https") {
      return true;
    }

    if (forwardedProto === "http") {
      return false;
    }

    if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
      return false;
    }
  } catch (_error) {
    // Fall through to env-based default.
  }

  return process.env.NODE_ENV === "production";
};

const getSessionCookieOptions = async (request?: Request, maxAge?: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: await resolveSessionCookieSecure(request),
  path: "/",
  ...(typeof maxAge === "number" ? { maxAge } : {}),
});

const expireSessionCookie = async (request?: Request) => {
  const cookieStore = await cookies();
  const cookieOptions = await getSessionCookieOptions(request);
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    ...cookieOptions,
    maxAge: 0,
  });
};

const signPayload = (payload: string) => {
  return createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
};

const ensureSessionSchema = async () => {
  if (sessionSchemaReady) {
    return;
  }

  await db.execute(sql`
    create table if not exists "InAccordSession" (
      "sessionId" varchar(128) primary key,
      "userId" varchar(191) not null,
      "userAgent" text,
      "ipAddress" varchar(191),
      "createdAt" timestamp(3) not null default now(),
      "lastSeenAt" timestamp(3) not null default now(),
      "expiresAt" timestamp(3) not null,
      "revokedAt" timestamp(3)
    )
  `);

  await db.execute(sql`
    create index if not exists "InAccordSession_userId_idx"
    on "InAccordSession" ("userId")
  `);

  await db.execute(sql`
    create index if not exists "InAccordSession_expiresAt_idx"
    on "InAccordSession" ("expiresAt")
  `);

  sessionSchemaReady = true;
};

const createSessionToken = (userId: string, sessionId: string, issuedAt = Math.floor(Date.now() / 1000)) => {
  const payload = `${userId}.${issuedAt}.${sessionId}`;
  return `${payload}.${signPayload(payload)}`;
};

const parseSessionToken = (token: string) => {
  const parts = token.split(".");
  if (parts.length < 4) {
    return null;
  }

  const signature = parts.pop() as string;
  const sessionIdRaw = parts.pop() as string;
  const issuedAtRaw = parts.pop() as string;
  const userId = parts.join(".");
  const issuedAt = Number(issuedAtRaw);
  const sessionId = String(sessionIdRaw ?? "").trim();

  if (!userId || !sessionId || !Number.isFinite(issuedAt)) {
    return null;
  }

  const payload = `${userId}.${issuedAt}.${sessionId}`;
  const expectedSignature = signPayload(payload);
  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (issuedAt <= 0 || now - issuedAt > MAX_SIGNED_TOKEN_AGE_SECONDS) {
    return null;
  }

  return {
    userId,
    sessionId,
    issuedAt,
  };
};

const resolveRequestMetadata = (request?: Request) => {
  if (!request) {
    return {
      userAgent: null,
      ipAddress: null,
    };
  }

  const userAgent = String(request.headers.get("user-agent") ?? "").trim() || null;
  const forwarded = String(request.headers.get("x-forwarded-for") ?? "").trim();
  const ipAddress = forwarded ? forwarded.split(",")[0].trim().slice(0, 191) || null : null;

  return {
    userAgent,
    ipAddress,
  };
};

const createSessionRecord = async (
  userId: string,
  request?: Request,
  ttlSeconds: number = BROWSER_SESSION_TTL_SECONDS
) => {
  await ensureSessionSchema();

  const sessionId = randomBytes(24).toString("hex");
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = new Date((issuedAt + ttlSeconds) * 1000);
  const { userAgent, ipAddress } = resolveRequestMetadata(request);

  await db.execute(sql`
    insert into "InAccordSession" (
      "sessionId",
      "userId",
      "userAgent",
      "ipAddress",
      "expiresAt"
    )
    values (
      ${sessionId},
      ${userId},
      ${userAgent},
      ${ipAddress},
      ${expiresAt}
    )
  `);

  return { sessionId, issuedAt };
};

export const getCurrentSessionContext = async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const parsed = parseSessionToken(token);
  if (!parsed) {
    await expireSessionCookie();
    return null;
  }

  try {
    await ensureSessionSchema();

    const result = await db.execute(sql`
      select
        "sessionId" as "sessionId",
        "userId" as "userId"
      from "InAccordSession"
      where "sessionId" = ${parsed.sessionId}
        and "userId" = ${parsed.userId}
        and "revokedAt" is null
        and "expiresAt" > now()
      limit 1
    `);

    const row = ((result as unknown as { rows?: Array<{ sessionId: string; userId: string }> }).rows ?? [])[0];
    if (!row) {
      await expireSessionCookie();
      return null;
    }

    return {
      userId: row.userId,
      sessionId: row.sessionId,
    };
  } catch (error) {
    console.error("[SESSION_CONTEXT_GET]", error);
    await expireSessionCookie();
    return null;
  }
};

export const getSessionUserId = async () => {
  const session = await getCurrentSessionContext();
  return session?.userId ?? null;
};

export const getCurrentSessionId = async () => {
  const session = await getCurrentSessionContext();
  return session?.sessionId ?? null;
};

const isDatabaseUnavailableError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "");
  const maybeCode =
    typeof error === "object" && error !== null
      ? String(
          (error as { code?: unknown; cause?: { code?: unknown } }).code ??
            (error as { cause?: { code?: unknown } }).cause?.code ??
            ""
        )
      : "";

  return /No D1 database binding configured|Database unavailable|Failed to execute D1 query|no such table|no such column|SQLITE_ERROR/i.test(message) ||
    /SQLITE_|D1_|ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(maybeCode);
};

const resolveCurrentSessionState = async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return {
      ok: false,
      code: "no-session-cookie" as const,
      message: "No desktop session was found. Please sign in.",
      userId: null,
      sessionId: null,
      shouldExpireCookie: false,
    };
  }

  const parsed = parseSessionToken(token);
  if (!parsed) {
    return {
      ok: false,
      code: "invalid-session-cookie" as const,
      message: "Desktop session cookie is invalid or corrupted. Please sign in again.",
      userId: null,
      sessionId: null,
      shouldExpireCookie: true,
    };
  }

  try {
    await ensureSessionSchema();

    const result = await db.execute(sql`
      select
        "sessionId" as "sessionId",
        "userId" as "userId"
      from "InAccordSession"
      where "sessionId" = ${parsed.sessionId}
        and "userId" = ${parsed.userId}
        and "revokedAt" is null
        and "expiresAt" > now()
      limit 1
    `);

    const row = ((result as unknown as { rows?: Array<{ sessionId: string; userId: string }> }).rows ?? [])[0];
    if (!row) {
      return {
        ok: false,
        code: "session-not-found" as const,
        message: "Desktop session was not found or has expired. Please sign in again.",
        userId: parsed.userId,
        sessionId: parsed.sessionId,
        shouldExpireCookie: true,
      };
    }

    return {
      ok: true,
      code: "ok" as const,
      message: "Session is valid.",
      userId: row.userId,
      sessionId: row.sessionId,
      shouldExpireCookie: false,
    };
  } catch (error) {
    console.error("[SESSION_CONTEXT_GET]", error);

    return {
      ok: false,
      code: isDatabaseUnavailableError(error) ? "database-unavailable" as const : "session-validation-failed" as const,
      message: isDatabaseUnavailableError(error)
        ? "Desktop session validation failed because the D1 database is unavailable."
        : "Desktop session validation failed because of an internal error.",
      userId: parsed.userId,
      sessionId: parsed.sessionId,
      shouldExpireCookie: false,
    };
  }
};

export const setSessionUserId = async (
  userId: string,
  options?: {
    sessionId?: string;
    request?: Request;
    persistent?: boolean;
  }
) => {
  const ttlSeconds = options?.persistent ? PERSISTENT_SESSION_TTL_SECONDS : BROWSER_SESSION_TTL_SECONDS;
  const sessionDetails = options?.sessionId
    ? { sessionId: options.sessionId, issuedAt: Math.floor(Date.now() / 1000) }
    : await createSessionRecord(userId, options?.request, ttlSeconds);

  const cookieStore = await cookies();
  const cookieOptions = await getSessionCookieOptions(
    options?.request,
    options?.persistent ? PERSISTENT_SESSION_TTL_SECONDS : undefined
  );
  cookieStore.set(
    SESSION_COOKIE_NAME,
    createSessionToken(userId, sessionDetails.sessionId, sessionDetails.issuedAt),
    cookieOptions
  );
};

export const getCurrentSessionDiagnostics = async (): Promise<SessionDiagnostics> => {
  const state = await resolveCurrentSessionState();

  if (!state.ok && (state as { shouldExpireCookie?: boolean }).shouldExpireCookie) {
    await expireSessionCookie();
  }

  return {
    ok: state.ok,
    code: state.code,
    message: state.message,
    userId: state.userId,
    sessionId: state.sessionId,
  };
};

export const listActiveSessionsForUser = async (userId: string): Promise<UserSessionEntry[]> => {
  await ensureSessionSchema();

  const result = await db.execute(sql`
    select
      "sessionId" as "sessionId",
      "userAgent" as "userAgent",
      "ipAddress" as "ipAddress",
      "createdAt" as "createdAt",
      "lastSeenAt" as "lastSeenAt",
      "expiresAt" as "expiresAt",
      "revokedAt" as "revokedAt",
      "userId" as "userId"
    from "InAccordSession"
    where "userId" = ${userId}
      and "revokedAt" is null
      and "expiresAt" > now()
    order by "createdAt" desc
  `);

  const rows = ((result as unknown as { rows?: SessionRow[] }).rows ?? []);

  return rows.map((row) => ({
    sessionId: row.sessionId,
    userAgent: row.userAgent,
    ipAddress: row.ipAddress,
    createdAt: new Date(row.createdAt).toISOString(),
    lastSeenAt: new Date(row.lastSeenAt).toISOString(),
    expiresAt: new Date(row.expiresAt).toISOString(),
  }));
};

export const revokeSessionById = async (userId: string, sessionId: string) => {
  await ensureSessionSchema();

  await db.execute(sql`
    update "InAccordSession"
    set "revokedAt" = now()
    where "userId" = ${userId}
      and "sessionId" = ${sessionId}
      and "revokedAt" is null
  `);
};

export const revokeOtherSessionsForUser = async (userId: string, currentSessionId?: string | null) => {
  await ensureSessionSchema();

  if (currentSessionId) {
    await db.execute(sql`
      update "InAccordSession"
      set "revokedAt" = now()
      where "userId" = ${userId}
        and "sessionId" <> ${currentSessionId}
        and "revokedAt" is null
    `);
    return;
  }

  await db.execute(sql`
    update "InAccordSession"
    set "revokedAt" = now()
    where "userId" = ${userId}
      and "revokedAt" is null
  `);
};

export const clearSessionUserId = async (request?: Request) => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  const parsed = token ? parseSessionToken(token) : null;
  if (parsed) {
    try {
      await ensureSessionSchema();
      await db.execute(sql`
        update "InAccordSession"
        set "revokedAt" = now()
        where "sessionId" = ${parsed.sessionId}
          and "userId" = ${parsed.userId}
          and "revokedAt" is null
      `);
    } catch (error) {
      console.error("[SESSION_CLEAR]", error);
    }
  }

  await expireSessionCookie(request);
};
