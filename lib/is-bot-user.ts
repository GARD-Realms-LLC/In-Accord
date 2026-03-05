type BotIdentityInput = {
  role?: string | null;
  name?: string | null;
  email?: string | null;
};

const botRoleValues = new Set([
  "BOT",
  "APPLICATION",
  "APP",
  "INTEGRATION",
  "SERVICE_BOT",
]);

export const isBotUser = ({ role, name, email }: BotIdentityInput) => {
  const normalizedRole = (role ?? "").trim().toUpperCase();
  if (botRoleValues.has(normalizedRole)) {
    return true;
  }

  const normalizedName = (name ?? "").trim();
  if (/\[bot\]/i.test(normalizedName) || /(?:^|\s)bot(?:$|\s)/i.test(normalizedName) || /bot$/i.test(normalizedName)) {
    return true;
  }

  const normalizedEmail = (email ?? "").trim();
  if (normalizedEmail) {
    const localPart = normalizedEmail.split("@")[0] ?? "";
    if (/bot/i.test(localPart)) {
      return true;
    }
  }

  return false;
};
