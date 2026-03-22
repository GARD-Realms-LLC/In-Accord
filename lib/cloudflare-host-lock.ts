export const CLOUDFLARE_HOST_LOCK_BYPASS_COOKIE = "inaccord_cf_host_unlock";
export const CLOUDFLARE_HOST_LOCK_PIN = "19628354";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export const isLoopbackHostname = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return LOOPBACK_HOSTS.has(normalized) || normalized.startsWith("127.");
};

export const isTrustedCloudflareRequest = (headers: Headers) => {
  const cfRay = String(headers.get("cf-ray") ?? "").trim();
  const cfConnectingIp = String(headers.get("cf-connecting-ip") ?? "").trim();
  const cfVisitor = String(headers.get("cf-visitor") ?? "").trim();
  const cfIpCountry = String(headers.get("cf-ipcountry") ?? "").trim();

  return Boolean(cfRay || cfConnectingIp || cfVisitor || cfIpCountry);
};

export const isExemptCloudflareLockPath = (pathname: string) => {
  const normalized = String(pathname ?? "").trim();
  if (!normalized) {
    return true;
  }

  return (
    normalized === "/cloudflare-required" ||
    normalized.startsWith("/api/cloudflare-host-lock") ||
    normalized.startsWith("/_next/") ||
    normalized.startsWith("/favicon") ||
    normalized.startsWith("/Images/") ||
    normalized.startsWith("/public/") ||
    normalized.startsWith("/Desktop/") ||
    /\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml|woff|woff2|ttf|eot)$/i.test(normalized)
  );
};
