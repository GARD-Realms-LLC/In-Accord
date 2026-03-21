const STALE_BUILD_ERROR_PATTERN =
  /ChunkLoadError|Loading chunk [^]+ failed|Loading CSS chunk [^]+ failed|Failed to fetch dynamically imported module|Failed to load module script/i;

const STALE_BUILD_SESSION_KEY = "inaccord:stale-build-reload-at";
const STALE_BUILD_RELOAD_COOLDOWN_MS = 15_000;

export const isStaleBuildErrorMessage = (value: unknown) =>
  STALE_BUILD_ERROR_PATTERN.test(String(value ?? "").trim());

export const shouldHardReloadForRecoverableAppError = (value: unknown) =>
  isStaleBuildErrorMessage(value);

export const hardReloadForStaleBuild = () => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const now = Date.now();
    const lastReloadAt = Number(window.sessionStorage.getItem(STALE_BUILD_SESSION_KEY) ?? "0");

    if (Number.isFinite(lastReloadAt) && now - lastReloadAt < STALE_BUILD_RELOAD_COOLDOWN_MS) {
      return false;
    }

    window.sessionStorage.setItem(STALE_BUILD_SESSION_KEY, String(now));
    window.location.reload();
    return true;
  } catch {
    window.location.reload();
    return true;
  }
};

export const getStaleBuildBootstrapScript = () =>
  `(() => {
    const pattern = ${STALE_BUILD_ERROR_PATTERN.toString()};
    const key = ${JSON.stringify(STALE_BUILD_SESSION_KEY)};
    const cooldownMs = ${String(STALE_BUILD_RELOAD_COOLDOWN_MS)};
    const shouldReload = () => {
      try {
        const now = Date.now();
        const lastReloadAt = Number(window.sessionStorage.getItem(key) || "0");
        if (Number.isFinite(lastReloadAt) && now - lastReloadAt < cooldownMs) {
          return false;
        }
        window.sessionStorage.setItem(key, String(now));
      } catch {}
      window.location.reload();
      return true;
    };
    const readMessage = (value) => {
      if (typeof value === "string") {
        return value;
      }
      if (value && typeof value === "object" && "message" in value) {
        return String(value.message || "");
      }
      return String(value || "");
    };
    window.addEventListener("error", (event) => {
      const message = readMessage(event && (event.message || (event.error && event.error.message)));
      if (pattern.test(message)) {
        shouldReload();
      }
    });
    window.addEventListener("unhandledrejection", (event) => {
      const message = readMessage(event && event.reason);
      if (pattern.test(message)) {
        shouldReload();
      }
    });
  })();`;
