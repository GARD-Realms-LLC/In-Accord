const normalizeBaseUrl = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }

    return parsed.origin.replace(/\/$/, "");
  } catch {
    return "";
  }
};

const isLocalHostname = (hostname: string): boolean => {
  const normalized = String(hostname ?? "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
  ) {
    return true;
  }

  return normalized.endsWith(".local");
};

const getCloudflareImageBaseUrl = (): string => {
  const siteBaseUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_SITE_URL);
  if (!siteBaseUrl) {
    return "";
  }

  try {
    const parsed = new URL(siteBaseUrl);
    if (isLocalHostname(parsed.hostname)) {
      return "";
    }

    return parsed.origin.replace(/\/$/, "");
  } catch {
    return "";
  }
};

const isAppObjectPath = (pathname: string): boolean => {
  const normalizedPath = String(pathname ?? "").trim();
  return normalizedPath === "/api/r2/object" || normalizedPath.startsWith("/api/r2/object/");
};

const toAppRelativeUrl = (value: URL): string => `${value.pathname}${value.search}${value.hash}`;

const toAbsoluteUrl = (raw: string): string | null => {
  if (raw.startsWith("/")) {
    return raw;
  }

  if (raw.startsWith("/")) {
    const siteBaseUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_SITE_URL);
    if (!siteBaseUrl) {
      return null;
    }

    try {
      return new URL(raw, siteBaseUrl).toString();
    } catch {
      return null;
    }
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
};

const buildCloudflareImageUrl = (absoluteUrl: string, width: number, fit: "cover" | "contain", quality: number) => {
  const cloudflareBaseUrl = getCloudflareImageBaseUrl();
  if (!cloudflareBaseUrl) {
    return absoluteUrl;
  }

  const params = `fit=${fit},quality=${quality},width=${width}`;
  return `${cloudflareBaseUrl}/cdn-cgi/image/${params}/${encodeURIComponent(absoluteUrl)}`;
};

export const resolveAssetUrl = (
  value: unknown,
  options?: {
    width?: number;
    fit?: "cover" | "contain";
    quality?: number;
  }
): string | null => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith("/")) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    if (isAppObjectPath(parsed.pathname)) {
      return toAppRelativeUrl(parsed);
    }

    return buildCloudflareImageUrl(
      parsed.toString(),
      Math.max(32, options?.width ?? 512),
      options?.fit === "contain" ? "contain" : "cover",
      Math.max(30, options?.quality ?? 85)
    );
  } catch {
    // Fall through to legacy normalization path below.
  }

  const absoluteUrl = toAbsoluteUrl(raw);
  if (!absoluteUrl) {
    return raw.startsWith("/") ? raw : null;
  }

  if (absoluteUrl.startsWith("/")) {
    return absoluteUrl;
  }

  return buildCloudflareImageUrl(
    absoluteUrl,
    Math.max(32, options?.width ?? 512),
    options?.fit === "contain" ? "contain" : "cover",
    Math.max(30, options?.quality ?? 85)
  );
};

export const resolveAvatarUrl = (value: unknown) =>
  resolveAssetUrl(value, { width: 256, fit: "cover", quality: 85 });

export const resolveBannerUrl = (value: unknown) =>
  resolveAssetUrl(value, { width: 1280, fit: "cover", quality: 80 });
