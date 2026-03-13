const DISCORD_CDN_HOSTS = new Set([
  "cdn.discordapp.com",
  "media.discordapp.net",
]);

const normalizeCloudflareBaseUrl = () => {
  const value = String(process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGE_BASE_URL ?? "").trim();
  if (!value) {
    return "";
  }

  return value.replace(/\/$/, "");
};

export const toInAboardImageUrl = (value: unknown): string | null => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith("/")) {
    return raw;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!DISCORD_CDN_HOSTS.has(hostname)) {
    return parsed.toString();
  }

  const cloudflareBaseUrl = normalizeCloudflareBaseUrl();
  if (!cloudflareBaseUrl) {
    return null;
  }

  return `${cloudflareBaseUrl}/cdn-cgi/image/fit=cover,quality=85,width=512/${encodeURIComponent(parsed.toString())}`;
};
