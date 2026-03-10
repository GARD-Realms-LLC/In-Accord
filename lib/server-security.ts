export const IN_ACCORD_PROTECTED_SERVER_FALLBACK_NAMES = ["inaccord", "inaccordserver"] as const;

const normalizeServerProtectionName = (value: string | null | undefined) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const resolveConfiguredProtectedServerId = () =>
  String(process.env.NEXT_PUBLIC_IN_ACCORD_SERVER_ID ?? process.env.IN_ACCORD_SERVER_ID ?? "").trim();

export const isInAccordProtectedServer = ({
  serverId,
  serverName,
}: {
  serverId?: string | null;
  serverName?: string | null;
}) => {
  const configuredProtectedServerId = resolveConfiguredProtectedServerId();
  const normalizedId = String(serverId ?? "").trim();

  if (configuredProtectedServerId && normalizedId && normalizedId === configuredProtectedServerId) {
    return true;
  }

  const normalizedName = normalizeServerProtectionName(serverName);
  return IN_ACCORD_PROTECTED_SERVER_FALLBACK_NAMES.includes(
    normalizedName as (typeof IN_ACCORD_PROTECTED_SERVER_FALLBACK_NAMES)[number]
  );
};
