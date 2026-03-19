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
let updateDelayHandle = null;
let updateIntervalHandle = null;
let updateTask = null;
let hasDownloadedUpdate = false;
let shouldApplyDownloadedUpdateOnQuit = false;
const UPDATE_FOCUS_RECHECK_MIN_MS = 60_000;
let updaterStatus = packagedUpdateConfig ? "idle" : "unsupported";
let nextUpdateVersion = null;
let lastUpdateCheckedAt = null;
let updaterErrorMessage = null;

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

const stopSquirrelUpdater = () => {
  if (updateDelayHandle) {
    clearTimeout(updateDelayHandle);
    updateDelayHandle = null;
  }

  if (updateIntervalHandle) {
    clearInterval(updateIntervalHandle);
    updateIntervalHandle = null;
  }
};

const startSquirrelUpdater = () => {
  if (!packagedUpdateConfig || updateDelayHandle || updateIntervalHandle) {
    return;
  }

  const startupDelayMs = isSquirrelFirstRun
    ? packagedUpdateConfig.firstRunDelayMs
    : 0;

  updateDelayHandle = setTimeout(() => {
    updateDelayHandle = null;
    void runSquirrelUpdateCycle();
    updateIntervalHandle = setInterval(() => {
      void runSquirrelUpdateCycle();
    }, packagedUpdateConfig.intervalMs);
  }, startupDelayMs);
};

const relaunchIntoNewestInstalledVersion = () => {
  if (!syncInstalledUpdateAvailability()) {
    return false;
  }

  spawnDetached(getUpdateExePath(), [
    "--processStartAndWait",
    getExecutableName(),
  ]);
  app.exit(0);
  return true;
};

const shouldRunFocusedUpdateCheck = () => {
  if (!packagedUpdateConfig || hasDownloadedUpdate || updateTask) {
    return false;
  }

  if (!lastUpdateCheckedAt) {
    return true;
  }

  const lastCheckMs = Date.parse(lastUpdateCheckedAt);
  if (!Number.isFinite(lastCheckMs)) {
    return true;
  }

  return Date.now() - lastCheckMs >= UPDATE_FOCUS_RECHECK_MIN_MS;
};

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildDesktopStatusPageUrl = ({ title, status, detail }) => {
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
    </style>
  </head>
  <body>
    <section class="card">
      <div class="eyebrow">In-Accord Desktop</div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(status)}</p>
      <div class="status">Live app mode</div>
      <pre>${escapeHtml(detail)}</pre>
    </section>
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
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  const retryHandle = windowConnectRetryHandles.get(targetWindow.webContents.id);
  if (!retryHandle) {
    return;
  }

  clearTimeout(retryHandle);
  windowConnectRetryHandles.delete(targetWindow.webContents.id);
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
      `Retry: every ${Math.round(APP_CONNECT_RETRY_DELAY_MS / 1000)} seconds`,
      "",
      error instanceof Error ? error.message : "Desktop app could not reach the live app.",
    ];

    await loadDesktopStatusPage(targetWindow, {
      title: "Connecting to In-Accord",
      status:
        "The desktop shell is waiting for the live app server. It will keep retrying automatically.",
      detail: detailLines.join("\n"),
    });

    if (targetWindow.isDestroyed()) {
      return;
    }

    const retryHandle = setTimeout(() => {
      void connectWindowToInAccord(targetWindow, targetPath, attempt + 1);
    }, APP_CONNECT_RETRY_DELAY_MS);
    windowConnectRetryHandles.set(targetWindow.webContents.id, retryHandle);
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
  attachCloseProtectionBypass(mainWindow);

  await loadDesktopStatusPage(mainWindow, {
    title: "Opening In-Accord",
    status: "Connecting to the live app server now.",
    detail: `Target: ${isDevDesktop ? devServerOrigin : packagedAppOrigin || "Unavailable"}`,
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    broadcastDesktopUpdaterState();
  });
  mainWindow.on("focus", () => {
    if (shouldRunFocusedUpdateCheck()) {
      void runSquirrelUpdateCycle();
    }
  });

  mainWindow.on("closed", () => {
    clearWindowConnectRetry(mainWindow);
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
  attachCloseProtectionBypass(popoutWindow);

  meetingWindows.add(popoutWindow);
  await loadDesktopStatusPage(popoutWindow, {
    title: "Opening meeting",
    status: "Connecting this window to the live app server now.",
    detail: `Target: ${isDevDesktop ? devServerOrigin : packagedAppOrigin || "Unavailable"}`,
  });
  popoutWindow.once("ready-to-show", () => {
    popoutWindow.show();
  });
  popoutWindow.webContents.on("did-finish-load", () => {
    broadcastDesktopUpdaterState();
  });
  popoutWindow.on("closed", () => {
    clearWindowConnectRetry(popoutWindow);
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
  stopSquirrelUpdater();
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
      if (relaunchIntoNewestInstalledVersion()) {
        return;
      }
      await createMainWindow();
      startSquirrelUpdater();
    })
    .catch((error) => {
      console.error("[INACCORD_DESKTOP_BOOT]", error);
      app.exit(1);
    });
}
