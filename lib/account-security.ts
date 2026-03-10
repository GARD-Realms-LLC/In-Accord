import "server-only";

import { verifyPassword } from "@/lib/password";
import { IMMUTABLE_ACCOUNT_USER_ID } from "@/lib/account-security-constants";

const DEFAULT_CREDENTIAL_CHANGE_PIN_HASH =
  "6d4f2a9b3c1e7f08a5d2c4b6e8f1039a:0af2102fdec441db56b71ebf08e0bcb301f380165c530e1afab7afd2fa295e74f452cccb0abb8a228280540d0f544e66c200c2b1a35e9106ba6eeb2472897319";

const resolveCredentialChangePinHash = () => {
  const override = process.env.CREDENTIAL_CHANGE_PIN_HASH?.trim();
  return override || DEFAULT_CREDENTIAL_CHANGE_PIN_HASH;
};

export const isImmutableAccountUserId = (userId: string | null | undefined) =>
  String(userId ?? "").trim() === IMMUTABLE_ACCOUNT_USER_ID;

export const verifyCredentialChangePin = async (pin: string) => {
  const normalizedPin = String(pin ?? "").trim();
  if (!normalizedPin) {
    return false;
  }

  return verifyPassword(normalizedPin, resolveCredentialChangePinHash());
};
