const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { app, BrowserWindow, ipcMain, shell } = require("electron");

const {
  DEFAULT_DEV_URL,
  waitForUrl,
  normalizeInAppPath,
} = require("./shared.cjs");
const PACKAGED_UPDATE_CONFIG_PATH = path.join(__dirname, "update-config.json");
const PACKAGED_APP_CONFIG_PATH = path.join(__dirname, "app-config.json");
const DESKTOP_RUNTIME_STATE_FILE = "runtime-state.json";
const TRANSIENT_DESKTOP_CACHE_PATHS = [
  "Cache",
  "Code Cache",
  "GPUCache",
  "DawnGraphiteCache",
  "DawnWebGPUCache",
  "GrShaderCache",
  path.join("Network", "Cache"),
  path.join("Service Worker", "CacheStorage"),
];
const APP_CONNECT_CHECK_TIMEOUT_MS = 10_000;
const APP_CONNECT_RETRY_DELAY_MS = 3_000;
const DESKTOP_RETRY_URL = "inaccord-retry://reload";
const DESKTOP_LOADING_LOGO_PATH = path.join(
  __dirname,
  "assets",
  "installer-loading.gif",
);

const readAssetDataUrl = (assetPath, mimeType) => {
  try {
    return `data:${mimeType};base64,${fs.readFileSync(assetPath).toString("base64")}`;
  } catch {
    return null;
  }
};

const DESKTOP_LOADING_LOGO_URL = readAssetDataUrl(
  DESKTOP_LOADING_LOGO_PATH,
  "image/gif",
);

const spawnDetached = (command, args) => {
  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  } catch {
    // Ignore Squirrel helper launch failures and continue quitting.
  }
};

const handleSquirrelEvent = () => {
  if (process.platform !== "win32" || process.argv.length < 2) {
    return false;
  }

  const squirrelEvent = process.argv[1];
  const updateExePath = path.resolve(
    path.dirname(process.execPath),
    "..",
    "Update.exe",
  );
  const executableName = path.basename(process.execPath);

  switch (squirrelEvent) {
    case "--squirrel-install":
    case "--squirrel-updated":
      spawnDetached(updateExePath, ["--createShortcut", executableName]);
      setTimeout(() => {
        app.quit();
      }, 1_000);
      return true;
    case "--squirrel-uninstall":
      spawnDetached(updateExePath, ["--removeShortcut", executableName]);
      setTimeout(() => {
        app.quit();
      }, 1_000);
      return true;
    case "--squirrel-obsolete":
      app.quit();
      return true;
    default:
      return false;
  }
};

const isHandlingSquirrelEvent = handleSquirrelEvent();
const isSquirrelFirstRun = process.argv.includes("--squirrel-firstrun");

app.commandLine.appendSwitch("disable-http-cache");
app.commandLine.appendSwitch("disable-features", "BackForwardCache");
app.setAppUserModelId("com.inaccord.desktop");

const isDevDesktop =
  !app.isPackaged || process.env.INACCORD_DESKTOP_DEV === "1";
const devServerOrigin = String(
  process.env.INACCORD_DESKTOP_START_URL || DEFAULT_DEV_URL,
)
  .trim()
  .replace(/\/$/, "");

const normalizeHttpOrigin = (value) => {
  const rawValue = String(value || "").trim().replace(/\/$/, "");
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = new URL(rawValue);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
};

const readPackagedUpdateConfig = () => {
  const rawConfig = fs.readFileSync(PACKAGED_UPDATE_CONFIG_PATH, "utf8");
  const parsedConfig = JSON.parse(rawConfig);
  const feedUrl = String(parsedConfig.feedUrl || "").trim();
  const initialDelayMs = Number.parseInt(
    String(parsedConfig.initialDelayMs || ""),
    10,
  );
  const firstRunDelayMs = Number.parseInt(
    String(parsedConfig.firstRunDelayMs || ""),
    10,
  );
  const intervalMs = Number.parseInt(String(parsedConfig.intervalMs || ""), 10);

  if (!feedUrl) {
    throw new Error("Packaged desktop update config is missing feedUrl.");
  }

  if (!Number.isFinite(initialDelayMs) || initialDelayMs <= 0) {
    throw new Error(
      "Packaged desktop update config is missing a valid initialDelayMs.",
    );
  }

  if (!Number.isFinite(firstRunDelayMs) || firstRunDelayMs <= 0) {
    throw new Error(
      "Packaged desktop update config is missing a valid firstRunDelayMs.",
    );
  }

  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error(
      "Packaged desktop update config is missing a valid intervalMs.",
    );
  }

  return {
    feedUrl,
    initialDelayMs,
    firstRunDelayMs,
    intervalMs,
  };
};

const readPackagedAppConfig = () => {
  const rawConfig = fs.readFileSync(PACKAGED_APP_CONFIG_PATH, "utf8");
  const parsedConfig = JSON.parse(rawConfig);
  const appOrigin = normalizeHttpOrigin(parsedConfig.appOrigin);

  if (!appOrigin) {
    throw new Error("Packaged desktop app config is missing a valid appOrigin.");
  }

  return {
    appOrigin,
  };
};

const packagedUpdateConfig =
  !isHandlingSquirrelEvent && !isDevDesktop ? readPackagedUpdateConfig() : null;
const packagedAppConfig =
  !isHandlingSquirrelEvent && !isDevDesktop ? readPackagedAppConfig() : null;
const packagedAppOrigin = packagedAppConfig?.appOrigin ?? null;

let appOriginPromise = null;
let mainWindow = null;
const meetingWindows = new Set();
const windowConnectRetryHandles = new Map();
let updateTask = null;
let hasDownloadedUpdate = false;
let shouldApplyDownloadedUpdateOnQuit = false;
let updaterStatus = packagedUpdateConfig ? "idle" : "unsupported";
let nextUpdateVersion = null;
let lastUpdateCheckedAt = null;
let updaterErrorMessage = null;
const windowTargetPaths = new Map();

const readJsonFileSafe = (targetPath) => {
  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch {
    return null;
  }
};

const writeJsonFileSafe = (targetPath, value) => {
  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  } catch {
    // Ignore runtime state persistence failures.
  }
};

const purgeTransientDesktopCachesForVersionChange = () => {
  try {
    const userDataPath = app.getPath("userData");
    const runtimeStatePath = path.join(
      userDataPath,
      DESKTOP_RUNTIME_STATE_FILE,
    );
    const currentVersion = String(app.getVersion() || "").trim();
    const runtimeState = readJsonFileSafe(runtimeStatePath);
    const previousVersion = String(
      runtimeState?.lastLaunchedVersion || "",
    ).trim();

    if (!currentVersion || previousVersion === currentVersion) {
      return false;
    }

    for (const relativeCachePath of TRANSIENT_DESKTOP_CACHE_PATHS) {
      try {
        fs.rmSync(path.join(userDataPath, relativeCachePath), {
          recursive: true,
          force: true,
        });
      } catch {
        // Ignore individual cache deletion failures and continue.
      }
    }

    writeJsonFileSafe(runtimeStatePath, {
      lastLaunchedVersion: currentVersion,
      lastCacheResetAt: new Date().toISOString(),
    });
    return true;
  } catch {
    return false;
  }
};

const getUpdateExePath = () =>
  path.resolve(path.dirname(process.execPath), "..", "Update.exe");

const getExecutableName = () => path.basename(process.execPath);

const getInstallRoot = () => path.resolve(path.dirname(process.execPath), "..");

const parseVersionParts = (value) =>
  String(value || "")
    .trim()
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));

const compareVersions = (left, right) => {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart > rightPart) {
      return 1;
    }

    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
};

const getNewestInstalledAppVersion = () => {
  try {
    const installRoot = getInstallRoot();
    const entries = fs.readdirSync(installRoot, { withFileTypes: true });
    const installedVersions = entries
      .filter((entry) => entry.isDirectory() && /^app-\d/i.test(entry.name))
      .map((entry) => entry.name.replace(/^app-/i, "").trim())
      .filter(Boolean);

    if (!installedVersions.length) {
      return null;
    }

    return (
      installedVersions
        .sort((left, right) => compareVersions(left, right))
        .at(-1) ?? null
    );
  } catch {
    return null;
  }
};

const syncInstalledUpdateAvailability = () => {
  const currentVersion = String(app.getVersion() || "").trim();
  const newestInstalledVersion = getNewestInstalledAppVersion();

  if (
    newestInstalledVersion &&
    currentVersion &&
    compareVersions(newestInstalledVersion, currentVersion) > 0
  ) {
    hasDownloadedUpdate = true;
    nextUpdateVersion = newestInstalledVersion;
    updaterStatus = "ready";
    updaterErrorMessage = null;
    return true;
  }

  return false;
};

const getDesktopUpdaterState = () => {
  syncInstalledUpdateAvailability();

  return {
    supported: Boolean(packagedUpdateConfig),
    status: hasDownloadedUpdate ? "ready" : updaterStatus,
    currentVersion: app.getVersion(),
    nextVersion: nextUpdateVersion,
    lastCheckedAt: lastUpdateCheckedAt,
    error: updaterErrorMessage,
  };
};

const broadcastDesktopUpdaterState = () => {
  const updaterState = getDesktopUpdaterState();

  for (const targetWindow of BrowserWindow.getAllWindows()) {
    if (targetWindow.isDestroyed()) {
      continue;
    }

    targetWindow.webContents.send(
      "inaccord:desktop-updater-state",
      updaterState,
    );
  }
};

const updateDesktopUpdaterState = (nextState) => {
  if (Object.prototype.hasOwnProperty.call(nextState, "status")) {
    updaterStatus = nextState.status;
  }

  if (Object.prototype.hasOwnProperty.call(nextState, "nextVersion")) {
    nextUpdateVersion = nextState.nextVersion;
  }

  if (Object.prototype.hasOwnProperty.call(nextState, "lastCheckedAt")) {
    lastUpdateCheckedAt = nextState.lastCheckedAt;
  }

  if (Object.prototype.hasOwnProperty.call(nextState, "error")) {
    updaterErrorMessage = nextState.error;
  }

  broadcastDesktopUpdaterState();
  return getDesktopUpdaterState();
};

const spawnSquirrelUpdateCommand = async (args) => {
  const updateExePath = getUpdateExePath();
  if (!fs.existsSync(updateExePath)) {
    throw new Error(`Squirrel Update.exe not found at ${updateExePath}`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(updateExePath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(
        new Error(
          stderr ||
            `Update.exe ${args.join(" ")} exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
};

const checkForAvailableUpdate = async (updateFeed) => {
  const rawOutput = await spawnSquirrelUpdateCommand([
    "--checkForUpdate",
    updateFeed,
  ]);
  const lastOutputLine = rawOutput.trim().split(/\r?\n/).filter(Boolean).pop();

  if (!lastOutputLine) {
    throw new Error("Update.exe returned no update metadata.");
  }

  const updateResult = JSON.parse(lastOutputLine);
  if (
    !Array.isArray(updateResult?.releasesToApply) ||
    updateResult.releasesToApply.length === 0
  ) {
    return null;
  }

  return (
    updateResult.releasesToApply[updateResult.releasesToApply.length - 1] ??
    null
  );
};

const downloadAvailableUpdate = async (updateFeed) => {
  await spawnSquirrelUpdateCommand(["--update", updateFeed]);
};

const runSquirrelUpdateCycle = async () => {
  if (!packagedUpdateConfig || syncInstalledUpdateAvailability()) {
    return getDesktopUpdaterState();
  }

  if (hasDownloadedUpdate) {
    return getDesktopUpdaterState();
  }

  if (updateTask) {
    await updateTask;
    return getDesktopUpdaterState();
  }

  updateTask = (async () => {
    const updateFeed = packagedUpdateConfig.feedUrl;
    updateDesktopUpdaterState({
      status: "checking",
      error: null,
    });
    console.log(`[INACCORD_DESKTOP_UPDATE] Checking ${updateFeed}`);

    const availableRelease = await checkForAvailableUpdate(updateFeed);
    if (!availableRelease) {
      updateDesktopUpdaterState({
        status: "idle",
        nextVersion: null,
        lastCheckedAt: new Date().toISOString(),
        error: null,
      });
      console.log("[INACCORD_DESKTOP_UPDATE] No update available");
      return;
    }

    const releaseVersion =
      String(availableRelease.version ?? "").trim() || null;
    const nextVersionLabel = releaseVersion ? ` ${releaseVersion}` : "";
    updateDesktopUpdaterState({
      status: "downloading",
      nextVersion: releaseVersion,
      error: null,
    });
    console.log(`[INACCORD_DESKTOP_UPDATE] Downloading${nextVersionLabel}`);
    await downloadAvailableUpdate(updateFeed);
    hasDownloadedUpdate = true;
    updateDesktopUpdaterState({
      status: "ready",
      nextVersion: releaseVersion,
      lastCheckedAt: new Date().toISOString(),
      error: null,
    });
    console.log(
      "[INACCORD_DESKTOP_UPDATE] Update downloaded and ready for relaunch",
    );
  })()
    .catch((error) => {
      updateDesktopUpdaterState({
        status: "error",
        lastCheckedAt: new Date().toISOString(),
        error:
          error instanceof Error ? error.message : "Desktop update failed.",
      });
      console.error("[INACCORD_DESKTOP_UPDATE]", error);
    })
    .finally(() => {
      updateTask = null;
    });

  await updateTask;
  return getDesktopUpdaterState();
};

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildDesktopStatusPageUrl = ({
  title,
  status,
  detail,
  retryEnabled = false,
  loading = false,
}) => {
  const loadingMarkup = `
      <section class="card card-loading" aria-live="polite" aria-busy="true">
        <div class="logo-stage">
          ${
            DESKTOP_LOADING_LOGO_URL
              ? `<img class="logo-image" src="${DESKTOP_LOADING_LOGO_URL}" alt="In-Accord logo" />`
              : `<div class="logo-fallback" aria-hidden="true">IA</div>`
          }
        </div>
        <div class="loading-text">Loading...</div>
      </section>`;
  const statusMarkup = `
      <section class="card">
        <div class="eyebrow">In-Accord Desktop</div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(status)}</p>
        <div class="status">Live app mode</div>
        <pre>${escapeHtml(detail)}</pre>
        ${
          retryEnabled
            ? `<div class="actions"><button class="button" type="button" onclick="window.location.href='${DESKTOP_RETRY_URL}'">Retry now</button></div>`
            : ""
        }
      </section>`;
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #090b10;
        --panel: #11161f;
        --panel-2: #161d29;
        --border: rgba(255, 255, 255, 0.12);
        --text: #f8fafc;
        --muted: #cbd5e1;
        --accent: #38bdf8;
        --warn: #facc15;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: "Segoe UI", Inter, system-ui, sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top, rgba(56, 189, 248, 0.18), transparent 35%),
          linear-gradient(180deg, #090b10, #0d1118);
      }
      .card {
        width: min(760px, 100%);
        border-radius: 22px;
        border: 1px solid var(--border);
        background: linear-gradient(180deg, var(--panel), var(--panel-2));
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
        padding: 22px;
      }
      .card-loading {
        width: min(460px, 100%);
        padding: 48px 28px 40px;
        display: grid;
        justify-items: center;
        gap: 18px;
        background:
          radial-gradient(circle at top, rgba(250, 204, 21, 0.15), transparent 48%),
          linear-gradient(180deg, rgba(17, 22, 31, 0.98), rgba(22, 29, 41, 0.98));
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid rgba(56, 189, 248, 0.32);
        background: rgba(56, 189, 248, 0.14);
        color: #bae6fd;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h1 {
        margin: 16px 0 10px;
        font-size: 30px;
        line-height: 1.1;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }
      .status {
        margin-top: 14px;
        color: var(--warn);
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      pre {
        margin: 18px 0 0;
        padding: 16px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(3, 7, 18, 0.82);
        color: #dbeafe;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: Consolas, "SFMono-Regular", monospace;
        font-size: 12px;
        line-height: 1.55;
      }
      .actions {
        margin-top: 18px;
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .button {
        appearance: none;
        border: 1px solid rgba(56, 189, 248, 0.35);
        background: rgba(56, 189, 248, 0.16);
        color: #e0f2fe;
        border-radius: 12px;
        padding: 10px 14px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .button:hover {
        background: rgba(56, 189, 248, 0.24);
      }
      .logo-stage {
        position: relative;
        display: grid;
        place-items: center;
        width: 220px;
        height: 220px;
        border-radius: 50%;
        background:
          radial-gradient(circle, rgba(250, 204, 21, 0.16), rgba(250, 204, 21, 0.03) 56%, transparent 72%);
        animation: logoFloat 3.8s ease-in-out infinite;
      }
      .logo-stage::after {
        content: "";
        position: absolute;
        inset: 24px;
        border-radius: 50%;
        border: 1px solid rgba(250, 204, 21, 0.2);
        box-shadow: 0 0 40px rgba(250, 204, 21, 0.14);
      }
      .logo-image {
        position: relative;
        z-index: 1;
        width: 182px;
        height: 182px;
        object-fit: contain;
        filter: drop-shadow(0 14px 32px rgba(0, 0, 0, 0.45));
      }
      .logo-fallback {
        position: relative;
        z-index: 1;
        display: grid;
        place-items: center;
        width: 148px;
        height: 148px;
        border-radius: 50%;
        border: 1px solid rgba(250, 204, 21, 0.28);
        background: radial-gradient(circle at top, rgba(250, 204, 21, 0.22), rgba(17, 22, 31, 0.96));
        color: #fde68a;
        font-size: 42px;
        font-weight: 800;
        letter-spacing: 0.06em;
      }
      .loading-text {
        color: #f8fafc;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        animation: loadingPulse 1.5s ease-in-out infinite;
      }
      @keyframes logoFloat {
        0%, 100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-10px);
        }
      }
      @keyframes loadingPulse {
        0%, 100% {
          opacity: 0.72;
        }
        50% {
          opacity: 1;
        }
      }
    </style>
  </head>
  <body>
    ${loading ? loadingMarkup : statusMarkup}
  </body>
</html>`;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
};

const loadDesktopStatusPage = async (targetWindow, options) => {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  await targetWindow.loadURL(buildDesktopStatusPageUrl(options));
};

const clearWindowConnectRetry = (targetWindow) => {
  const targetContentsId =
    typeof targetWindow === "number"
      ? targetWindow
      : (() => {
          if (!targetWindow || targetWindow.isDestroyed()) {
            return null;
          }

          try {
            return targetWindow.webContents.id;
          } catch {
            return null;
          }
        })();

  if (!targetContentsId) {
    return;
  }

  const retryHandle = windowConnectRetryHandles.get(targetContentsId);
  if (!retryHandle) {
    return;
  }

  clearTimeout(retryHandle);
  windowConnectRetryHandles.delete(targetContentsId);
};

const setWindowTargetPath = (targetWindow, targetPath) => {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  windowTargetPaths.set(
    targetWindow.webContents.id,
    normalizeInAppPath(targetPath, "/"),
  );
};

const getWindowTargetPath = (targetWindow) => {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return "/";
  }

  return (
    windowTargetPaths.get(targetWindow.webContents.id) ??
    "/"
  );
};

const registerSessionPolicy = (targetWindow) => {
  const currentSession = targetWindow.webContents.session;

  currentSession.clearCache().catch(() => {
    // Ignore cache clear failures and continue loading the app.
  });

  currentSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(
        permission === "media" ||
          permission === "notifications" ||
          permission === "fullscreen" ||
          permission === "clipboard-sanitized-write",
      );
    },
  );
};

const attachWindowOpenPolicy = (targetWindow) => {
  targetWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const activeOrigin = isDevDesktop
        ? devServerOrigin
        : packagedAppOrigin;
      const nextUrl = new URL(url);
      if (activeOrigin && nextUrl.origin === new URL(activeOrigin).origin) {
        void targetWindow.loadURL(url);
        return { action: "deny" };
      }
    } catch {
      // Fall through to opening the target externally.
    }

    void shell.openExternal(url).catch(() => {
      // Ignore shell open failures.
    });

    return { action: "deny" };
  });
};

const attachRetryNavigationPolicy = (targetWindow) => {
  targetWindow.webContents.on("will-navigate", (event, url) => {
    if (String(url || "").trim() !== DESKTOP_RETRY_URL) {
      return;
    }

    event.preventDefault();
    void connectWindowToInAccord(targetWindow, getWindowTargetPath(targetWindow));
  });
};

const createWebPreferences = () => ({
  preload: path.join(__dirname, "preload.cjs"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false,
  spellcheck: true,
  devTools: isDevDesktop,
  webSecurity: true,
});

const ensureAppOrigin = async () => {
  if (!appOriginPromise) {
    appOriginPromise = (async () => {
      const activeOrigin = isDevDesktop ? devServerOrigin : packagedAppOrigin;
      if (!activeOrigin) {
        throw new Error("Desktop app origin is not configured.");
      }

      await waitForUrl(`${activeOrigin}/api/auth/session?diagnostics=1`, {
        timeoutMs: APP_CONNECT_CHECK_TIMEOUT_MS,
      });
      return activeOrigin;
    })().catch((error) => {
      appOriginPromise = null;
      throw error;
    });
  }

  return appOriginPromise;
};

const loadInAccordPath = async (targetWindow, targetPath) => {
  const appOrigin = await ensureAppOrigin();
  const nextUrl = new URL(
    normalizeInAppPath(targetPath, "/"),
    appOrigin,
  ).toString();
  await targetWindow.loadURL(nextUrl);
};

const connectWindowToInAccord = async (
  targetWindow,
  targetPath,
  attempt = 1,
) => {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  clearWindowConnectRetry(targetWindow);

  try {
    await loadInAccordPath(targetWindow, targetPath);
  } catch (error) {
    const activeOrigin = isDevDesktop ? devServerOrigin : packagedAppOrigin;
    const detailLines = [
      `Target: ${activeOrigin || "Unavailable"}`,
      `Attempt: ${attempt}`,
      "Retry: manual only",
      "",
      error instanceof Error ? error.message : "Desktop app could not reach the live app.",
    ];

    await loadDesktopStatusPage(targetWindow, {
      title: "Connecting to In-Accord",
      status:
        "The desktop shell could not reach the live app server. Automatic retry is off.",
      detail: detailLines.join("\n"),
      retryEnabled: true,
    });
  }
};

const attachCloseProtectionBypass = (targetWindow) => {
  targetWindow.webContents.on("will-prevent-unload", (event) => {
    // Desktop close/restart should not be blocked by page unload prompts.
    event.preventDefault();
  });
};

const createMainWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: "#0f1013",
    title: "In-Accord",
    autoHideMenuBar: true,
    webPreferences: createWebPreferences(),
  });

  registerSessionPolicy(mainWindow);
  attachWindowOpenPolicy(mainWindow);
  attachRetryNavigationPolicy(mainWindow);
  attachCloseProtectionBypass(mainWindow);
  setWindowTargetPath(mainWindow, "/");
  const mainWindowContentsId = mainWindow.webContents.id;

  await loadDesktopStatusPage(mainWindow, {
    title: "Opening In-Accord",
    status: "Connecting to the live app server now.",
    detail: `Target: ${isDevDesktop ? devServerOrigin : packagedAppOrigin || "Unavailable"}`,
    loading: true,
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    broadcastDesktopUpdaterState();
  });

  mainWindow.on("closed", () => {
    clearWindowConnectRetry(mainWindowContentsId);
    windowTargetPaths.delete(mainWindowContentsId);
    mainWindow = null;
  });

  void connectWindowToInAccord(mainWindow, "/");
  return mainWindow;
};

const createMeetingPopoutWindow = async (meetingPath) => {
  const popoutWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: "#0f1013",
    title: "In-Accord Meeting",
    autoHideMenuBar: true,
    parent: mainWindow ?? undefined,
    webPreferences: createWebPreferences(),
  });

  registerSessionPolicy(popoutWindow);
  attachWindowOpenPolicy(popoutWindow);
  attachRetryNavigationPolicy(popoutWindow);
  attachCloseProtectionBypass(popoutWindow);
  setWindowTargetPath(popoutWindow, meetingPath);
  const popoutWindowContentsId = popoutWindow.webContents.id;

  meetingWindows.add(popoutWindow);
  await loadDesktopStatusPage(popoutWindow, {
    title: "Opening meeting",
    status: "Connecting this window to the live app server now.",
    detail: `Target: ${isDevDesktop ? devServerOrigin : packagedAppOrigin || "Unavailable"}`,
    loading: true,
  });
  popoutWindow.once("ready-to-show", () => {
    popoutWindow.show();
  });
  popoutWindow.webContents.on("did-finish-load", () => {
    broadcastDesktopUpdaterState();
  });
  popoutWindow.on("closed", () => {
    clearWindowConnectRetry(popoutWindowContentsId);
    windowTargetPaths.delete(popoutWindowContentsId);
    meetingWindows.delete(popoutWindow);
  });

  void connectWindowToInAccord(popoutWindow, meetingPath);
  return true;
};

ipcMain.handle("inaccord:open-meeting-popout", async (_event, meetingPath) => {
  return createMeetingPopoutWindow(meetingPath);
});

ipcMain.handle("inaccord:minimize-current-window", async (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.minimize();
  }

  return true;
});

ipcMain.handle("inaccord:close-current-window", async (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.close();
  }

  return true;
});

ipcMain.handle("inaccord:get-desktop-updater-state", async () => {
  return getDesktopUpdaterState();
});

ipcMain.handle("inaccord:check-for-updates-now", async () => {
  return runSquirrelUpdateCycle();
});

ipcMain.handle("inaccord:relaunch-to-apply-update", async () => {
  if (!hasDownloadedUpdate) {
    return false;
  }

  shouldApplyDownloadedUpdateOnQuit = true;

  setImmediate(() => {
    for (const targetWindow of BrowserWindow.getAllWindows()) {
      if (!targetWindow.isDestroyed()) {
        targetWindow.close();
      }
    }

    app.quit();
  });

  return true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (hasDownloadedUpdate && shouldApplyDownloadedUpdateOnQuit) {
    spawnDetached(getUpdateExePath(), [
      "--processStartAndWait",
      getExecutableName(),
    ]);
  }
  clearWindowConnectRetry(mainWindow);
  for (const targetWindow of meetingWindows) {
    clearWindowConnectRetry(targetWindow);
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

if (!isHandlingSquirrelEvent) {
  app
    .whenReady()
    .then(async () => {
      purgeTransientDesktopCachesForVersionChange();
      await createMainWindow();
    })
    .catch((error) => {
      console.error("[INACCORD_DESKTOP_BOOT]", error);
      app.exit(1);
    });
}
