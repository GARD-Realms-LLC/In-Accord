const R2_OBJECT_PATH = "/api/r2/object";

const normalizeKey = (value: string | null) => {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : "";
};

const buildPointerFromUrl = (url: URL) => {
  if (url.pathname !== R2_OBJECT_PATH) {
    return null;
  }

  const key = normalizeKey(url.searchParams.get("key"));
  if (!key) {
    return null;
  }

  return `${R2_OBJECT_PATH}?key=${encodeURIComponent(key)}`;
};

export const normalizeCloudflareObjectPointer = (value: unknown): string | null => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith("/")) {
    try {
      return buildPointerFromUrl(new URL(raw, "http://in-accord.local"));
    } catch {
      return null;
    }
  }

  try {
    return buildPointerFromUrl(new URL(raw));
  } catch {
    return null;
  }
};

export const normalizeOptionalCloudflareObjectPointer = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeCloudflareObjectPointer(value);
};