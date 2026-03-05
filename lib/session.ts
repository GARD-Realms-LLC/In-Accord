import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE_NAME = "inaccord_session_user_id";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const SESSION_SECRET = process.env.SESSION_SECRET || "replace_me_session_secret";

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

const createSessionToken = (userId: string) => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `${userId}.${issuedAt}`;
  return `${payload}.${signPayload(payload)}`;
};

const parseSessionToken = (token: string) => {
  const parts = token.split(".");
  if (parts.length < 3) {
    return null;
  }

  const signature = parts.pop() as string;
  const issuedAtRaw = parts.pop() as string;
  const userId = parts.join(".");
  const issuedAt = Number(issuedAtRaw);

  if (!userId || !Number.isFinite(issuedAt)) {
    return null;
  }

  const payload = `${userId}.${issuedAt}`;
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

  return userId;
};

export const getSessionUserId = async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return parseSessionToken(token);
};

export const setSessionUserId = async (userId: string) => {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, createSessionToken(userId), cookieOptions);
};

export const clearSessionUserId = async () => {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    ...cookieOptions,
    maxAge: 0,
  });
};
