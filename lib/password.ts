import {
  pbkdf2 as pbkdf2Callback,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);
const pbkdf2 = promisify(pbkdf2Callback);

const isHex = (value: string) => /^[0-9a-f]+$/i.test(value) && value.length % 2 === 0;

const decodeDigest = (digest: string) => {
  if (isHex(digest)) {
    return Buffer.from(digest, "hex");
  }

  try {
    return Buffer.from(digest, "base64");
  } catch {
    return null;
  }
};

const safeEqual = (a: Buffer, b: Buffer) => {
  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
};

const verifyScrypt = async (password: string, storedHash: string) => {
  const [salt, stored] = storedHash.split(":");
  if (!salt || !stored) {
    return false;
  }

  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const storedBuffer = Buffer.from(stored, "hex");

  return safeEqual(storedBuffer, derived);
};

const verifySha256Legacy = async (password: string, storedHash: string) => {
  const parts = storedHash.split("$");
  if (parts.length < 3) {
    return false;
  }

  const salt = parts[1] ?? "";
  const digest = parts[2] ?? "";
  if (!salt || !digest) {
    return false;
  }

  const expected = decodeDigest(digest);
  if (!expected) {
    return false;
  }

  const candidates = [
    createHash("sha256").update(`${salt}${password}`).digest(),
    createHash("sha256").update(`${password}${salt}`).digest(),
  ];

  return candidates.some((candidate) => safeEqual(expected, candidate));
};

const verifyPbkdf2Legacy = async (password: string, storedHash: string) => {
  const parts = storedHash.split("$");

  // Supported formats:
  // - pbkdf2$<iterations>$<salt>$<digest>
  // - pbkdf2_sha256$<iterations>$<salt>$<digest>
  if (parts.length < 4) {
    return false;
  }

  const algorithmToken = parts[0] ?? "";
  const iterationsRaw = parts[1] ?? "";
  const salt = parts[2] ?? "";
  const digest = parts[3] ?? "";

  if (!algorithmToken || !iterationsRaw || !salt || !digest) {
    return false;
  }

  const iterations = Number.parseInt(iterationsRaw, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false;
  }

  const expected = decodeDigest(digest);
  if (!expected) {
    return false;
  }

  const keylen = expected.length;
  const digestAlgorithm = algorithmToken.toLowerCase().includes("sha256") ? "sha256" : "sha256";
  const derived = (await pbkdf2(password, salt, iterations, keylen, digestAlgorithm)) as Buffer;

  return safeEqual(expected, derived);
};

export const hashPassword = async (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
};

export const verifyPassword = async (password: string, storedHash: string) => {
  const normalized = String(storedHash || "").trim();
  if (!normalized) {
    return false;
  }

  if (normalized.includes(":")) {
    return verifyScrypt(password, normalized);
  }

  const lowered = normalized.toLowerCase();
  if (lowered.startsWith("sha256$")) {
    return verifySha256Legacy(password, normalized);
  }

  if (lowered.startsWith("pbkdf2$") || lowered.startsWith("pbkdf2_sha256$")) {
    return verifyPbkdf2Legacy(password, normalized);
  }

  return false;
};
