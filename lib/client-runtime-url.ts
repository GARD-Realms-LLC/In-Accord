export type RuntimeMeta = {
  appUrl?: string;
};

export const normalizeHttpOrigin = (value: unknown) => {
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

export const resolveAbsoluteAppUrl = (origin: string, relativeOrAbsoluteUrl: string) => {
  const normalizedUrl = String(relativeOrAbsoluteUrl ?? "").trim();
  if (!normalizedUrl) {
    return normalizedUrl;
  }

  if (/^https?:\/\//i.test(normalizedUrl)) {
    return normalizedUrl;
  }

  if (!origin) {
    return normalizedUrl;
  }

  try {
    return new URL(normalizedUrl, origin).toString();
  } catch {
    return normalizedUrl;
  }
};

export const resolveRuntimeAppOrigin = async () => {
  const electronApi =
    typeof window !== "undefined"
      ? ((window as typeof window & {
          electronAPI?: {
            getRuntimeMeta?: () => Promise<RuntimeMeta | null>;
          };
        }).electronAPI ?? null)
      : null;

  const runtimeMeta =
    electronApi && typeof electronApi.getRuntimeMeta === "function"
      ? await electronApi.getRuntimeMeta().catch(() => null)
      : null;

  return (
    normalizeHttpOrigin(runtimeMeta?.appUrl) ||
    (typeof window !== "undefined" ? normalizeHttpOrigin(window.location.href) : "") ||
    normalizeHttpOrigin(process.env.NEXT_PUBLIC_SITE_URL)
  );
};