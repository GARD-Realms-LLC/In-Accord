import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export const SESSION_COOKIE_NAME = "inaccord_session_user_id";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
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

export type UserSessionEntry = {
  sessionId: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

let sessionSchemaReady = false;

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
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
  if (issuedAt <= 0 || now - issuedAt > SESSION_TTL_SECONDS) {
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

const createSessionRecord = async (userId: string, request?: Request) => {
  await ensureSessionSchema();

  const sessionId = randomBytes(24).toString("hex");
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = new Date((issuedAt + SESSION_TTL_SECONDS) * 1000);
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
      return null;
    }

    return {
      userId: row.userId,
      sessionId: row.sessionId,
    };
  } catch (error) {
    console.error("[SESSION_CONTEXT_GET]", error);
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

export const setSessionUserId = async (
  userId: string,
  options?: {
    sessionId?: string;
    request?: Request;
  }
) => {
  const sessionDetails = options?.sessionId
    ? { sessionId: options.sessionId, issuedAt: Math.floor(Date.now() / 1000) }
    : await createSessionRecord(userId, options?.request);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, createSessionToken(userId, sessionDetails.sessionId, sessionDetails.issuedAt), cookieOptions);
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

export const clearSessionUserId = async () => {
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

  cookieStore.set(SESSION_COOKIE_NAME, "", {
    ...cookieOptions,
    maxAge: 0,
  });
};
