const STALE_BUILD_ERROR_PATTERN =
  /ChunkLoadError|Loading chunk [^]+ failed|Loading CSS chunk [^]+ failed|Failed to fetch dynamically imported module|Failed to load module script/i;

const STALE_BUILD_SESSION_KEY = "inaccord:stale-build-reload-at";
const STALE_BUILD_RELOAD_COOLDOWN_MS = 15_000;
const GLOBAL_RELOAD_FLAG = "__inAccordStaleBuildReloadInFlight";

export const isStaleBuildErrorMessage = (value: unknown) =>
  STALE_BUILD_ERROR_PATTERN.test(String(value ?? "").trim());

export const shouldHardReloadForRecoverableAppError = (value: unknown) =>
  isStaleBuildErrorMessage(value);

export const hardReloadForStaleBuild = () => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    if ((window as typeof window & { [GLOBAL_RELOAD_FLAG]?: boolean })[GLOBAL_RELOAD_FLAG]) {
      return true;
    }

    const now = Date.now();
    const lastReloadAt = Number(window.sessionStorage.getItem(STALE_BUILD_SESSION_KEY) ?? "0");

    if (Number.isFinite(lastReloadAt) && now - lastReloadAt < STALE_BUILD_RELOAD_COOLDOWN_MS) {
      return false;
    }

    (window as typeof window & { [GLOBAL_RELOAD_FLAG]?: boolean })[GLOBAL_RELOAD_FLAG] = true;
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
    const reloadFlagKey = ${JSON.stringify(GLOBAL_RELOAD_FLAG)};
    const sessionKey = ${JSON.stringify(STALE_BUILD_SESSION_KEY)};
    const reloadCooldownMs = ${JSON.stringify(STALE_BUILD_RELOAD_COOLDOWN_MS)};
    const readMessage = (value) => {
      if (typeof value === "string") {
        return value;
      }
      if (value && typeof value === "object" && "message" in value) {
        return String(value.message || "");
      }
      return String(value || "");
    };
    const hardReload = () => {
      try {
        if (window[reloadFlagKey]) {
          return;
        }
        const now = Date.now();
        const lastReloadAt = Number(window.sessionStorage.getItem(sessionKey) || "0");
        if (Number.isFinite(lastReloadAt) && now - lastReloadAt < reloadCooldownMs) {
          return;
        }
        window[reloadFlagKey] = true;
        window.sessionStorage.setItem(sessionKey, String(now));
      } catch {}
      window.location.reload();
    };
    window.addEventListener("error", (event) => {
      const message = readMessage(event && (event.message || (event.error && event.error.message)));
      if (pattern.test(message)) {
        window.__inAccordStaleBuildDetected = true;
        hardReload();
      }
    });
    window.addEventListener("unhandledrejection", (event) => {
      const message = readMessage(event && event.reason);
      if (pattern.test(message)) {
        window.__inAccordStaleBuildDetected = true;
        hardReload();
      }
    });
  })();`;
