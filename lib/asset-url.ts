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

const toAbsoluteUrl = (raw: string): string | null => {
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
  const cloudflareBaseUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGE_BASE_URL);
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

  const absoluteUrl = toAbsoluteUrl(raw);
  if (!absoluteUrl) {
    return raw.startsWith("/") ? raw : null;
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
  resolveAssetUrl(value, { width: 1600, fit: "cover", quality: 85 });