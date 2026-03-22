const { app, BrowserWindow, Notification, ipcMain, shell } = require("electron");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

app.commandLine.appendSwitch("no-sandbox");
app.disableHardwareAcceleration();

const parseEnvLine = (line) => {
  const eqIndex = line.indexOf("=");
  if (eqIndex <= 0) {
    return null;
  }

  const key = line.slice(0, eqIndex).trim();
  if (!key || key.startsWith("#")) {
    return null;
  }

  let value = line.slice(eqIndex + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return { key, value };
};

const loadEnvFile = (envFilePath) => {
  try {
    if (!fs.existsSync(envFilePath)) {
      return false;
    }

    const raw = fs.readFileSync(envFilePath, "utf8");
    const lines = raw.split(/\r?\n/);

    for (const line of lines) {
      const parsed = parseEnvLine(line);
      if (!parsed) {
        continue;
      }

      if (typeof process.env[parsed.key] === "undefined") {
        process.env[parsed.key] = parsed.value;
      }
    }

    return true;
  } catch (_error) {
    return false;
  }
};

const initializeEnvironment = () => {
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(app.getAppPath(), ".env"),
    path.join(process.resourcesPath || "", ".env"),
    path.join(process.resourcesPath || "", "app.asar.unpacked", ".env"),
  ];

  for (const envPath of candidates) {
    if (envPath && loadEnvFile(envPath)) {
      break;
    }
  }
};

initializeEnvironment();

const STARTUP_TRACE_PATH = path.join(os.tmpdir(), "inaccord-startup-trace.log");

const appendStartupTrace = (source, detail = "") => {
  try {
    const payload = JSON.stringify({
      timestamp: new Date().toISOString(),
      source: String(source || "startup-trace"),
      detail: String(detail || "").slice(0, 4000),
      pid: process.pid,
      isPackaged: app.isPackaged,
    });
    fs.appendFileSync(STARTUP_TRACE_PATH, `${payload}\n`, "utf8");
  } catch (_error) {
    // Never throw from startup tracing.
  }
};

appendStartupTrace("process:bootstrap", `cwd=${process.cwd()} resourcesPath=${process.resourcesPath || ""}`);

const formatAppDisplayVersion = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d+)\.(\d+)\.(\d+)$/);

  if (!match) {
    return raw || "0.0.00";
  }

  return `${match[1]}.${match[2]}.${String(match[3]).padStart(2, "0")}`;
};

const readRuntimePackageManifest = () => {
  const candidates = app.isPackaged
    ? [path.join(app.getAppPath(), "package.json"), path.join(process.cwd(), "package.json")]
    : [path.join(process.cwd(), "package.json"), path.join(app.getAppPath(), "package.json")];

  for (const candidate of candidates) {
    try {
      if (!candidate || !fs.existsSync(candidate)) {
        continue;
      }

      return JSON.parse(fs.readFileSync(candidate, "utf8"));
    } catch (_error) {
      // Try the next manifest candidate.
    }
  }

  return null;
};

const getAppDisplayVersion = () => {
  const manifest = readRuntimePackageManifest();
  const version = manifest?.inaccordDisplayVersion || manifest?.version || app.getVersion();
  return formatAppDisplayVersion(version);
};

const {
  consumeUpdaterNotificationSignal,
  getUpdaterState,
  checkForUpdatesNow,
  downloadAndPrepareUpdate,
  restartAndInstallUpdate,
  startUpdateLoop,
} = require("./updater/updater.cjs");

const DEFAULT_URL = "http://localhost:3000";
let stopUpdateLoop = null;
let nextServer = null;
let activeAppUrl = DEFAULT_URL;
let activeAppUrlSource = "default-localhost";
let crashHandlingInProgress = false;
let mainWindow = null;
let internalErrorWindow = null;
let crashHandlersWired = false;
const pendingInternalErrors = [];

const RUNTIME_SCAN_TIMEOUT_MS = 2_500;

const GAME_PROCESS_CATALOG = [
  { label: "Counter-Strike 2", aliases: ["cs2"] },
  { label: "ELDEN RING", aliases: ["eldenring"] },
  { label: "Dota 2", aliases: ["dota2"] },
  { label: "VALORANT", aliases: ["valorant", "valorant-win64-shipping"] },
  { label: "League of Legends", aliases: ["leagueoflegends", "leagueclient", "leagueclientux"] },
  { label: "Fortnite", aliases: ["fortniteclient-win64-shipping"] },
  { label: "Apex Legends", aliases: ["r5apex"] },
  { label: "Minecraft", aliases: ["minecraft", "minecraftlauncher", "minecraft.windows"] },
  { label: "Overwatch", aliases: ["overwatch", "overwatch2"] },
  { label: "Rocket League", aliases: ["rocketleague"] },
  { label: "Grand Theft Auto V", aliases: ["gta5", "gtavlauncher"] },
  { label: "Sekiro: Shadows Die Twice", aliases: ["sekiro"] },
  { label: "Starfield", aliases: ["starfield"] },
  { label: "Cyberpunk 2077", aliases: ["cyberpunk2077"] },
  { label: "PUBG: Battlegrounds", aliases: ["pubg", "tslgame"] },
  { label: "THE FINALS", aliases: ["discovery", "thefinals"] },
  { label: "Halo Infinite", aliases: ["haloinfinite"] },
  { label: "Forza Horizon 5", aliases: ["forzahorizon5"] },
];

const VIDEO_PROCESS_CATALOG = [
  { label: "VLC", aliases: ["vlc"] },
  { label: "Media Player Classic", aliases: ["mpc-hc64", "mpc-hc"] },
  { label: "PotPlayer", aliases: ["potplayer64", "potplayer"] },
  { label: "OBS Studio", aliases: ["obs64", "obs32"] },
];

const MUSIC_PROCESS_CATALOG = [
  { label: "Spotify", aliases: ["spotify"] },
  { label: "iTunes", aliases: ["itunes"] },
  { label: "MusicBee", aliases: ["musicbee"] },
  { label: "foobar2000", aliases: ["foobar2000"] },
  { label: "Audacious", aliases: ["audacious"] },
];

const GAME_WINDOW_TITLE_HINTS = [
  { hint: "counter-strike", label: "Counter-Strike 2" },
  { hint: "cs2", label: "Counter-Strike 2" },
  { hint: "elden ring", label: "ELDEN RING" },
  { hint: "dota 2", label: "Dota 2" },
  { hint: "valorant", label: "VALORANT" },
  { hint: "league of legends", label: "League of Legends" },
  { hint: "fortnite", label: "Fortnite" },
  { hint: "apex legends", label: "Apex Legends" },
  { hint: "minecraft", label: "Minecraft" },
  { hint: "overwatch", label: "Overwatch" },
  { hint: "rocket league", label: "Rocket League" },
  { hint: "grand theft auto v", label: "Grand Theft Auto V" },
  { hint: "gta v", label: "Grand Theft Auto V" },
  { hint: "cyberpunk 2077", label: "Cyberpunk 2077" },
  { hint: "pubg", label: "PUBG: Battlegrounds" },
  { hint: "the finals", label: "THE FINALS" },
  { hint: "halo infinite", label: "Halo Infinite" },
  { hint: "forza horizon 5", label: "Forza Horizon 5" },
  { hint: "starfield", label: "Starfield" },
  { hint: "sekiro", label: "Sekiro: Shadows Die Twice" },
];

const VIDEO_WINDOW_TITLE_HINTS = [
  { hint: "youtube", label: "YouTube" },
  { hint: "twitch", label: "Twitch" },
  { hint: "netflix", label: "Netflix" },
  { hint: "hulu", label: "Hulu" },
  { hint: "prime video", label: "Prime Video" },
  { hint: "disney+", label: "Disney+" },
];

const MUSIC_WINDOW_TITLE_HINTS = [
  { hint: "spotify", label: "Spotify" },
  { hint: "itunes", label: "iTunes" },
  { hint: "musicbee", label: "MusicBee" },
  { hint: "foobar2000", label: "foobar2000" },
  { hint: "audacious", label: "Audacious" },
];

const NON_GAME_PROCESS_NAMES = new Set([
  "applicationframehost",
  "audiodg",
  "browser_broker",
  "cmd",
  "code",
  "conhost",
  "csrss",
  "ctfmon",
  "otherchat",
  "dllhost",
  "dwm",
  "electron",
  "epicgameslauncher",
  "explorer",
  "firefox",
  "git",
  "in-accord",
  "msedge",
  "node",
  "notepad",
  "opera",
  "powershell",
  "pwsh",
  "registry",
  "searchhost",
  "shellexperiencehost",
  "spotifyhelper",
  "startmenuexperiencehost",
  "steam",
  "steamwebhelper",
  "epicgameslauncher",
  "battle.net",
  "battle net",
  "riotclientservices",
  "riotclientux",
  "ubisoftconnect",
  "origin",
  "eadesktop",
  "svchost",
  "systemsettings",
  "taskhostw",
  "taskmgr",
  "textinputhost",
  "windowsterminal",
  "winlogon",
]);

const NON_GAME_WINDOW_TITLES = new Set([
  "program manager",
  "settings",
  "task manager",
]);

const learnedGameProcessMap = new Map();
let runtimeCustomGameCatalog = [];
let runtimeRichPresence = null;
let runtimeLastActivitySignature = "";
let runtimeLastActivityStartedAt = null;
let runtimeInstalledCatalogCache = [];
let runtimeInstalledCatalogLastSync = 0;
const INSTALLED_CATALOG_REFRESH_MS = 90_000;
const LEARNED_GAME_PROCESS_LIMIT = Number(process.env.INACCORD_LEARNED_GAME_PROCESS_LIMIT || 2_048);
const MEMORY_WATCH_INTERVAL_MS = Math.max(15_000, Number(process.env.INACCORD_MEMORY_WATCH_INTERVAL_MS || 60_000));
const MEMORY_WARN_THRESHOLD_MB = Math.max(128, Number(process.env.INACCORD_MEMORY_WARN_THRESHOLD_MB || 768));
const MEMORY_TRIM_THRESHOLD_MB = Math.max(MEMORY_WARN_THRESHOLD_MB, Number(process.env.INACCORD_MEMORY_TRIM_THRESHOLD_MB || 1024));
const MEMORY_EVENT_COOLDOWN_MS = 5 * 60 * 1000;
const WINDOW_RECOVERY_COOLDOWN_MS = Math.max(15_000, Number(process.env.INACCORD_WINDOW_RECOVERY_COOLDOWN_MS || 45_000));
let memoryWatchTimer = null;
let memoryWatchInFlight = false;
let lastMemoryWarnAt = 0;
let lastMemoryTrimAt = 0;
let lastWindowRecoveryAt = 0;

const LOCALHOST_HOSTNAME_SET = new Set(["localhost", "127.0.0.1", "::1"]);
const LIVE_DESKTOP_CACHE_CONTROL = "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
const configuredDesktopSessions = new WeakSet();

const normalizeHttpOrigin = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const origin = parsed.origin.trim();
    return origin.endsWith("/") ? origin.slice(0, -1) : origin;
  } catch (_error) {
    return null;
  }
};

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildInternalErrorHtml = ({ title, source, detail, fatal }) => {
  const safeTitle = escapeHtml(title || "In-Accord error");
  const safeSource = escapeHtml(source || "unknown-source");
  const safeDetail = escapeHtml(detail || "Unknown error");
  const safeFatal = fatal ? "Fatal error" : "Recoverable error";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0b0d12;
        --panel: #141821;
        --panel-2: #1b2230;
        --border: rgba(255,255,255,0.12);
        --text: #f8fafc;
        --muted: #cbd5e1;
        --accent: #5865f2;
        --danger: #f87171;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Segoe UI", Inter, system-ui, sans-serif;
        background: radial-gradient(circle at top, rgba(88,101,242,0.22), transparent 35%), var(--bg);
        color: var(--text);
        padding: 24px;
      }
      .wrap {
        max-width: 980px;
        margin: 0 auto;
        display: grid;
        gap: 16px;
      }
      .card {
        background: linear-gradient(180deg, var(--panel), var(--panel-2));
        border: 1px solid var(--border);
        border-radius: 20px;
        padding: 20px;
        box-shadow: 0 18px 60px rgba(0,0,0,0.35);
      }
      .eyebrow {
        display: inline-flex;
        gap: 8px;
        align-items: center;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(248,113,113,0.14);
        border: 1px solid rgba(248,113,113,0.28);
        color: #fecaca;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }
      h1 { margin: 14px 0 10px; font-size: 28px; }
      p { margin: 0; color: var(--muted); line-height: 1.6; }
      .meta {
        display: grid;
        gap: 10px;
        margin-top: 18px;
      }
      .meta-row {
        display: grid;
        gap: 6px;
        padding: 12px 14px;
        border-radius: 14px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
      }
      .label {
        color: #94a3b8;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .value code { color: var(--text); font-family: Consolas, "SFMono-Regular", monospace; }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 18px;
      }
      button {
        appearance: none;
        border: 0;
        border-radius: 14px;
        padding: 12px 16px;
        font-weight: 700;
        cursor: pointer;
      }
      .primary { background: var(--accent); color: white; }
      .secondary { background: rgba(255,255,255,0.08); color: white; border: 1px solid rgba(255,255,255,0.1); }
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        user-select: text;
        background: #0a0f18;
        color: #e2e8f0;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.08);
        padding: 16px;
        max-height: 52vh;
        overflow: auto;
      }
      .status { color: ${fatal ? "#fecaca" : "#fde68a"}; font-weight: 700; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="card">
        <div class="eyebrow">In-Accord internal error system</div>
        <h1>${safeTitle}</h1>
        <p class="status">${escapeHtml(safeFatal)}</p>
        <p>This error was captured by the desktop app instead of a native system popup so you can copy the full details.</p>
        <div class="meta">
          <div class="meta-row">
            <div class="label">Source</div>
            <div class="value"><code>${safeSource}</code></div>
          </div>
        </div>
        <div class="actions">
          <button class="primary" type="button" id="copyBtn">Copy full error</button>
          <button class="secondary" type="button" id="selectBtn">Select error text</button>
        </div>
      </section>
      <section class="card">
        <div class="label" style="margin-bottom:10px;">Full error detail</div>
        <pre id="detailBlock">${safeDetail}</pre>
      </section>
    </div>
    <script>
      const detail = document.getElementById("detailBlock");
      const copyText = async () => {
        const text = detail?.innerText || "";
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(detail);
          selection.removeAllRanges();
          selection.addRange(range);
          document.execCommand("copy");
          selection.removeAllRanges();
        }
      };
      document.getElementById("copyBtn")?.addEventListener("click", copyText);
      document.getElementById("selectBtn")?.addEventListener("click", () => {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(detail);
        selection.removeAllRanges();
        selection.addRange(range);
      });
    </script>
  </body>
</html>`;
};

const showInternalErrorWindow = async ({ title, source, detail, fatal = false }) => {
  appendCrashLog({
    source: "internal-error-window:show",
    detail: JSON.stringify({ title, source, fatal, detail: String(detail || "").slice(0, 2000) }),
    fatal: false,
  });

  if (!app.isReady()) {
    pendingInternalErrors.push({ title, source, detail, fatal });
    return;
  }

  if (internalErrorWindow && !internalErrorWindow.isDestroyed()) {
    internalErrorWindow.focus();
    await internalErrorWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(buildInternalErrorHtml({ title, source, detail, fatal }))}`
    );
    return;
  }

  internalErrorWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 820,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: "#0b0d12",
    title: title || "In-Accord error",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  internalErrorWindow.on("closed", () => {
    if (internalErrorWindow && internalErrorWindow.isDestroyed()) {
      internalErrorWindow = null;
    }
  });

  await internalErrorWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(buildInternalErrorHtml({ title, source, detail, fatal }))}`
  );
};

const flushPendingInternalErrors = async () => {
  while (pendingInternalErrors.length > 0) {
    const nextError = pendingInternalErrors.shift();
    if (!nextError) {
      continue;
    }

    await showInternalErrorWindow(nextError);
  }
};

const safelySendToWindow = (windowInstance, channel, payload, source = "window:send") => {
  if (!windowInstance || windowInstance.isDestroyed()) {
    return false;
  }

  const targetContents = windowInstance.webContents;
  if (!targetContents || targetContents.isDestroyed()) {
    return false;
  }

  try {
    targetContents.send(channel, payload);
    return true;
  } catch (error) {
    appendCrashLog({
      source: `${source}:${channel}`,
      detail: error instanceof Error ? error.stack || error.message : String(error || "Unknown window send error"),
      fatal: false,
    });
    return false;
  }
};

const clearStartupRetryTimer = () => {
  if (!startupRetryTimer) {
    return;
  }

  clearTimeout(startupRetryTimer);
  startupRetryTimer = null;
};

const normalizeNavigationUrl = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  try {
    return new URL(normalized).toString();
  } catch (_error) {
    return normalized;
  }
};

const isSameNavigationUrl = (left, right) => normalizeNavigationUrl(left) === normalizeNavigationUrl(right);

const isSameOriginUrl = (candidateUrl, referenceUrl) => {
  try {
    return new URL(String(candidateUrl || "")).origin === new URL(String(referenceUrl || "")).origin;
  } catch (_error) {
    return false;
  }
};

const isLocalHttpOrigin = (value) => {
  const normalized = normalizeHttpOrigin(value);
  if (!normalized) {
    return false;
  }

  try {
    const parsed = new URL(normalized);
    return LOCALHOST_HOSTNAME_SET.has(String(parsed.hostname || "").trim().toLowerCase());
  } catch (_error) {
    return false;
  }
};

const isPackagedRemoteLiveOrigin = (value) => app.isPackaged && !isLocalHttpOrigin(value);

const isMatchingHttpOrigin = (candidateUrl, origin) => {
  const normalizedOrigin = normalizeHttpOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  try {
    return new URL(String(candidateUrl || "")).origin === normalizedOrigin;
  } catch (_error) {
    return false;
  }
};

const toArrayHeaderValue = (value) => (Array.isArray(value) ? value : [String(value || "")]);

const clearDesktopResourceCaches = async () => {
  const targetSessions = BrowserWindow.getAllWindows()
    .map((windowInstance) => windowInstance?.webContents?.session)
    .filter(Boolean);

  await Promise.allSettled(
    targetSessions.map(async (targetSession) => {
      try {
        await targetSession.clearCache();
      } catch (_error) {
        // Cache cleanup is best-effort only.
      }
    })
  );
};

const configureDesktopLiveSession = async (targetSession, appUrl) => {
  if (!targetSession || !isPackagedRemoteLiveOrigin(appUrl) || configuredDesktopSessions.has(targetSession)) {
    return;
  }

  configuredDesktopSessions.add(targetSession);

  try {
    await targetSession.clearCache();
  } catch (_error) {
    // Cache cleanup is best-effort only.
  }

  try {
    await targetSession.clearStorageData({ storages: ["serviceworkers", "cachestorage"] });
  } catch (_error) {
    // Storage cleanup is best-effort only.
  }

  targetSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (!isMatchingHttpOrigin(details.url, appUrl)) {
      callback({ requestHeaders: details.requestHeaders });
      return;
    }

    callback({
      requestHeaders: {
        ...details.requestHeaders,
        "Cache-Control": LIVE_DESKTOP_CACHE_CONTROL,
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  });

  targetSession.webRequest.onHeadersReceived((details, callback) => {
    if (!isMatchingHttpOrigin(details.url, appUrl)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Cache-Control": [LIVE_DESKTOP_CACHE_CONTROL],
        Pragma: ["no-cache"],
        Expires: ["0"],
        Vary: Array.from(new Set([...toArrayHeaderValue(details.responseHeaders?.Vary), "Origin"])).filter(Boolean),
      },
    });
  });
};

const resolveConfiguredLiveOrigin = () => {
  const candidates = [
    process.env.INACCORD_DESKTOP_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeHttpOrigin(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const resolveRuntimeSiteUrlFromDatabase = async () => {
  const connectionString = String(process.env.LIVE_DATABASE_URL || "").trim();
  if (!connectionString) {
    return null;
  }

  let client = null;
  try {
    const { Client } = require("pg");
    client = new Client({ connectionString });
    await client.connect();

    const result = await client.query(
      'select "appBaseUrl" from "InAccordRuntimeConfig" where "id" = $1 limit 1',
      ["default"]
    );

    const candidate = normalizeHttpOrigin(result?.rows?.[0]?.appBaseUrl);
    if (!candidate) {
      return null;
    }

    return candidate;
  } catch (_error) {
    return null;
  } finally {
    if (client) {
      try {
        await client.end();
      } catch (_error) {
        // Ignore client shutdown issues.
      }
    }
  }
};

const resolveLiveAppUrl = async () => {
  const configuredOrigin = resolveConfiguredLiveOrigin();
  if (configuredOrigin) {
    return {
      appUrl: configuredOrigin,
      source: isLocalHttpOrigin(configuredOrigin) ? "env-web-origin-localhost" : "env-web-origin-remote",
    };
  }

  const databaseOrigin = await resolveRuntimeSiteUrlFromDatabase();
  if (databaseOrigin) {
    return {
      appUrl: databaseOrigin,
      source: isLocalHttpOrigin(databaseOrigin) ? "database-web-origin-localhost" : "database-web-origin-remote",
    };
  }

  throw new Error(
    "Packaged desktop web runtime URL is not configured. Set Admin > I-A Information > App Base URL, or set NEXT_PUBLIC_SITE_URL / INACCORD_DESKTOP_APP_URL to the web origin the desktop shell should load."
  );
};

const setBoundedMapValue = (map, key, value, limit) => {
  if (map.has(key)) {
    map.delete(key);
  }

  map.set(key, value);

  while (map.size > limit) {
    const oldestKey = map.keys().next().value;
    if (typeof oldestKey === "undefined") {
      break;
    }
    map.delete(oldestKey);
  }
};

const sanitizeRichPresencePayload = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const title = String(value.title || "").trim().slice(0, 120);
  if (!title) {
    return null;
  }

  const details = String(value.details || "").trim().slice(0, 160);
  const state = String(value.state || "").trim().slice(0, 160);
  const processName = normalizeProcessName(value.processName || "");
  const startedAtCandidate = String(value.startedAt || "").trim();
  const startedAt = Number.isNaN(new Date(startedAtCandidate).getTime())
    ? new Date().toISOString()
    : new Date(startedAtCandidate).toISOString();

  return {
    title,
    details,
    state,
    processName,
    startedAt,
  };
};

const resolveActivityTimeline = (signature) => {
  const normalizedSignature = String(signature || "").trim();
  const now = new Date().toISOString();

  if (!normalizedSignature) {
    runtimeLastActivitySignature = "";
    runtimeLastActivityStartedAt = null;
    return { startedAt: null, detectedAt: now };
  }

  if (runtimeLastActivitySignature !== normalizedSignature || !runtimeLastActivityStartedAt) {
    runtimeLastActivitySignature = normalizedSignature;
    runtimeLastActivityStartedAt = now;
  }

  return {
    startedAt: runtimeLastActivityStartedAt,
    detectedAt: now,
  };
};

const parseJsonFile = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
};

const parseVdfPaths = (rawContent) => {
  const text = String(rawContent || "");
  const paths = [];
  const pathRegex = /"path"\s+"([^"]+)"/gi;
  let match = pathRegex.exec(text);

  while (match) {
    const normalized = String(match[1] || "").replace(/\\\\/g, "\\").trim();
    if (normalized) {
      paths.push(normalized);
    }

    match = pathRegex.exec(text);
  }

  return Array.from(new Set(paths));
};

const parseSteamManifestName = (rawContent) => {
  const text = String(rawContent || "");
  const nameMatch = text.match(/"name"\s+"([^"]+)"/i);
  return String(nameMatch?.[1] || "").trim();
};

const parseSteamManifestInstallDir = (rawContent) => {
  const text = String(rawContent || "");
  const installDirMatch = text.match(/"installdir"\s+"([^"]+)"/i);
  return String(installDirMatch?.[1] || "").trim();
};

const parseSteamManifestAppId = (rawContent) => {
  const text = String(rawContent || "");
  const appIdMatch = text.match(/"appid"\s+"(\d+)"/i);
  return String(appIdMatch?.[1] || "").trim();
};

const toSteamHeaderImage = (appId) => {
  const normalized = String(appId || "").trim();
  if (!normalized) {
    return "";
  }

  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${normalized}/header.jpg`;
};

const EPIC_FALLBACK_IMAGE = "https://store.epicgames.com/images/epic-games-logo.svg";

const EXE_NAME_EXCLUDE_SET = new Set([
  "crashreporter",
  "dxsetup",
  "easyanticheat",
  "eac_launcher",
  "eac_launcher64",
  "launcher",
  "launch",
  "redistributable",
  "setup",
  "start",
  "unins000",
  "uninstall",
  "vc_redist",
]);

const findExecutableCandidates = (rootDir, depth = 0) => {
  if (!fileExists(rootDir) || depth > 3) {
    return [];
  }

  let dirEntries = [];
  try {
    dirEntries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch (_error) {
    return [];
  }

  const executables = [];
  for (const entry of dirEntries) {
    const fullPath = path.join(rootDir, entry.name);

    if (entry.isFile() && /\.exe$/i.test(entry.name)) {
      const normalized = normalizeProcessName(entry.name);
      if (normalized && !EXE_NAME_EXCLUDE_SET.has(normalized)) {
        executables.push({
          normalized,
          fullPath,
          depth,
          score: Math.max(0, 100 - depth * 20 - normalized.length),
        });
      }
      continue;
    }

    if (!entry.isDirectory()) {
      continue;
    }

    const folderName = String(entry.name || "").toLowerCase();
    if (depth >= 2 && !/(bin|binaries|win|x64|x86|game|shipping|release|client)/i.test(folderName)) {
      continue;
    }

    executables.push(...findExecutableCandidates(fullPath, depth + 1));
  }

  return executables;
};

const pickPrimaryProcessName = (installDirPath, gameName) => {
  const candidates = findExecutableCandidates(installDirPath, 0);
  if (candidates.length === 0) {
    return "";
  }

  const gameTokens = normalizeAlias(String(gameName || ""));
  const scored = candidates.map((candidate) => ({
    ...candidate,
    score:
      candidate.score +
      (gameTokens && candidate.normalized.includes(gameTokens) ? 60 : 0) +
      (candidate.fullPath.toLowerCase().includes("shipping") ? 15 : 0),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.normalized || "";
};

const pickProcessAliases = (installDirPath, gameName) => {
  const candidates = findExecutableCandidates(installDirPath, 0);
  if (candidates.length === 0) {
    return [];
  }

  const gameTokens = normalizeAlias(String(gameName || ""));
  const scored = candidates.map((candidate) => ({
    ...candidate,
    score:
      candidate.score +
      (gameTokens && candidate.normalized.includes(gameTokens) ? 60 : 0) +
      (candidate.fullPath.toLowerCase().includes("shipping") ? 15 : 0),
  }));

  scored.sort((a, b) => b.score - a.score);
  return Array.from(new Set(scored.map((entry) => entry.normalized).filter((entry) => entry.length > 0))).slice(0, 8);
};

const fileExists = (candidatePath) => {
  try {
    return fs.existsSync(candidatePath);
  } catch (_error) {
    return false;
  }
};

const listSteamRootsFromRegistryWindows = async () => {
  const registryQueries = [
    ["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"],
    ["query", "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam", "/v", "InstallPath"],
    ["query", "HKLM\\SOFTWARE\\Valve\\Steam", "/v", "InstallPath"],
  ];

  const roots = [];

  for (const args of registryQueries) {
    try {
      const { stdout } = await execFileAsync("reg.exe", args, {
        timeout: RUNTIME_SCAN_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });

      const lines = String(stdout || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      for (const line of lines) {
        if (!/REG_SZ/i.test(line)) {
          continue;
        }

        const parts = line.split(/\s{2,}/).map((part) => part.trim()).filter((part) => part.length > 0);
        const value = parts[parts.length - 1];
        const normalized = String(value || "").replace(/\\\\/g, "\\").replace(/\//g, "\\").trim();
        if (normalized) {
          roots.push(normalized);
        }
      }
    } catch (_error) {
      // best-effort only
    }
  }

  return Array.from(new Set(roots));
};

const listInstalledSteamGamesWindows = async () => {
  const steamRootsFromRegistry = await listSteamRootsFromRegistryWindows();
  const steamRoots = [
    "C:\\Program Files (x86)\\Steam",
    "C:\\Program Files\\Steam",
    path.join(process.env.PROGRAMFILES || "", "Steam"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Steam"),
    ...steamRootsFromRegistry,
  ].filter((entry) => String(entry || "").trim().length > 0);

  const installed = [];
  const seen = new Set();

  for (const steamRoot of steamRoots) {
    if (!fileExists(steamRoot)) {
      continue;
    }

    const steamAppsPath = path.join(steamRoot, "steamapps");
    if (!fileExists(steamAppsPath)) {
      continue;
    }

    const libraryFoldersPath = path.join(steamAppsPath, "libraryfolders.vdf");
    let libraries = [steamRoot];

    if (fileExists(libraryFoldersPath)) {
      try {
        const libraryRaw = fs.readFileSync(libraryFoldersPath, "utf8");
        const parsedLibraries = parseVdfPaths(libraryRaw);
        if (parsedLibraries.length > 0) {
          libraries = Array.from(new Set([steamRoot, ...parsedLibraries]));
        }
      } catch (_error) {
        // best-effort only
      }
    }

    for (const libraryRoot of libraries) {
      const librarySteamApps = path.join(libraryRoot, "steamapps");
      if (!fileExists(librarySteamApps)) {
        continue;
      }

      let files = [];
      try {
        files = fs.readdirSync(librarySteamApps);
      } catch (_error) {
        continue;
      }

      for (const fileName of files) {
        if (!/^appmanifest_\d+\.acf$/i.test(String(fileName || ""))) {
          continue;
        }

        const manifestPath = path.join(librarySteamApps, fileName);
        try {
          const manifestRaw = fs.readFileSync(manifestPath, "utf8");
          const gameName = parseSteamManifestName(manifestRaw);
          const appId = parseSteamManifestAppId(manifestRaw);
          const installDir = parseSteamManifestInstallDir(manifestRaw);

          const hasCommonInstall =
            installDir.length > 0 && fileExists(path.join(librarySteamApps, "common", installDir));
          const installPath = installDir.length > 0 ? path.join(librarySteamApps, "common", installDir) : "";

          if (!hasCommonInstall) {
            continue;
          }

          if (!gameName) {
            continue;
          }

          const normalizedKey = normalizeAlias(gameName);
          if (!normalizedKey || seen.has(normalizedKey)) {
            continue;
          }

          seen.add(normalizedKey);
          const processName = pickPrimaryProcessName(installPath, gameName);
          const processAliases = pickProcessAliases(installPath, gameName);
          installed.push({
            id: appId ? `steam:${appId}` : `steam:${normalizedKey}`,
            name: gameName,
            provider: "steam",
            shortDescription: "Installed via Steam on this device.",
            thumbnailUrl: toSteamHeaderImage(appId),
            processName,
            processAliases,
          });
        } catch (_error) {
          // ignore malformed manifest
        }
      }
    }
  }

  return installed;
};

const listInstalledEpicGamesWindows = () => {
  const manifestRoots = [
    "C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests",
    path.join(process.env.PROGRAMDATA || "", "Epic", "EpicGamesLauncher", "Data", "Manifests"),
  ].filter((entry) => String(entry || "").trim().length > 0);

  const installed = [];
  const seen = new Set();

  for (const manifestRoot of manifestRoots) {
    if (!fileExists(manifestRoot)) {
      continue;
    }

    let files = [];
    try {
      files = fs.readdirSync(manifestRoot);
    } catch (_error) {
      continue;
    }

    for (const fileName of files) {
      if (!/\.item$/i.test(String(fileName || ""))) {
        continue;
      }

      const itemPath = path.join(manifestRoot, fileName);
      const payload = parseJsonFile(itemPath);
      if (!payload || typeof payload !== "object") {
        continue;
      }

      const gameName = String(payload.DisplayName || payload.AppName || "").trim();
      const installLocation = String(payload.InstallLocation || "").trim();

      if (!gameName || !installLocation || !fileExists(installLocation)) {
        continue;
      }

      const normalizedKey = normalizeAlias(gameName);
      if (!normalizedKey || seen.has(normalizedKey)) {
        continue;
      }

      seen.add(normalizedKey);
      const processName = pickPrimaryProcessName(installLocation, gameName);
      const processAliases = pickProcessAliases(installLocation, gameName);
      installed.push({
        id: `epic:${normalizedKey}`,
        name: gameName,
        provider: "epic",
        shortDescription: "Installed via Epic Games on this device.",
        thumbnailUrl: EPIC_FALLBACK_IMAGE,
        processName,
        processAliases,
      });
    }
  }

  return installed;
};

const listInstalledGamesWindows = async () => {
  const steamGames = await listInstalledSteamGamesWindows();
  const epicGames = listInstalledEpicGamesWindows();
  const all = [...steamGames, ...epicGames];
  const deduped = Array.from(
    all.reduce((acc, entry) => {
      const key = normalizeAlias(entry.name);
      if (!key || acc.has(key)) {
        return acc;
      }

      acc.set(key, entry);
      return acc;
    }, new Map()).values()
  );

  return deduped.slice(0, 800);
};

const normalizeProcessName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.exe$/i, "");

const normalizeWindowTitle = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const normalizeExecutablePath = (value) =>
  String(value || "")
    .trim()
    .replace(/\//g, "\\")
    .toLowerCase();

const cleanWindowTitle = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);

const toDisplayNameFromProcess = (processName) => {
  const normalized = String(processName || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (!normalized) {
    return "Game";
  }

  return normalized
    .split(" ")
    .map((token) => token.slice(0, 1).toUpperCase() + token.slice(1))
    .join(" ")
    .slice(0, 80);
};

const parseCsvLine = (line) => {
  const text = String(line || "");
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result.map((value) => String(value || "").trim());
};

const normalizeAlias = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.exe$/i, "")
    .replace(/[^a-z0-9]+/g, "");

const sanitizeRuntimeGameCatalog = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const label = String(entry.label || "").trim().slice(0, 120);
    if (!label) {
      continue;
    }

    const aliases = Array.isArray(entry.aliases)
      ? entry.aliases.map((alias) => normalizeAlias(alias)).filter((alias) => alias.length > 0)
      : [];

    if (aliases.length === 0) {
      continue;
    }

    normalized.push({ label, aliases: Array.from(new Set(aliases)) });
  }

  return normalized.slice(0, 600);
};

const buildInstalledCatalogEntries = (games) => {
  if (!Array.isArray(games)) {
    return [];
  }

  const entries = [];
  for (const game of games) {
    if (!game || typeof game !== "object") {
      continue;
    }

    const label = String(game.name || game.id || "").trim().slice(0, 120);
    if (!label) {
      continue;
    }

    const aliases = [
      normalizeAlias(String(game.processName || "")),
      ...((Array.isArray(game.processAliases) ? game.processAliases : [])
        .map((alias) => normalizeAlias(alias))
        .filter((alias) => alias.length > 0)),
      normalizeAlias(String(game.name || "")),
      normalizeAlias(String(game.id || "")),
      normalizeAlias(`${String(game.provider || "")} ${String(game.name || "")}`),
    ].filter((alias) => alias.length > 0);

    if (aliases.length === 0) {
      continue;
    }

    entries.push({
      label,
      aliases: Array.from(new Set(aliases)),
    });
  }

  return entries.slice(0, 1200);
};

const ensureRuntimeInstalledCatalog = async () => {
  const now = Date.now();
  if (runtimeInstalledCatalogCache.length > 0 && now - runtimeInstalledCatalogLastSync < INSTALLED_CATALOG_REFRESH_MS) {
    return runtimeInstalledCatalogCache;
  }

  try {
    const installedGames = await listInstalledGamesWindows();
    runtimeInstalledCatalogCache = buildInstalledCatalogEntries(installedGames);
    runtimeInstalledCatalogLastSync = now;
  } catch (_error) {
    runtimeInstalledCatalogLastSync = now;
  }

  return runtimeInstalledCatalogCache;
};

const listRunningProcessEntriesWindows = async () => {
  const psArgs = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "$sig='[DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();[DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);'; Add-Type -MemberDefinition $sig -Name Win32User -Namespace InAccord -PassThru | Out-Null; $h=[InAccord.Win32User]::GetForegroundWindow(); $pid=0; [InAccord.Win32User]::GetWindowThreadProcessId($h,[ref]$pid) | Out-Null; Get-Process | ForEach-Object { $p=$_; $pp=''; try { $pp=$p.Path } catch {} [pscustomobject]@{ ProcessName=$p.ProcessName; Id=$p.Id; MainWindowTitle=$p.MainWindowTitle; Path=$pp; IsForeground=($p.Id -eq [int]$pid) } } | ConvertTo-Json -Compress",
  ];

  try {
    const { stdout } = await execFileAsync("powershell.exe", psArgs, {
      timeout: RUNTIME_SCAN_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });

    const parsed = JSON.parse(String(stdout || "[]"));
    const entries = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? [parsed] : [];

    return entries
      .map((entry) => ({
        processName: normalizeProcessName(entry?.ProcessName),
        windowTitle: normalizeWindowTitle(entry?.MainWindowTitle),
        executablePath: normalizeExecutablePath(entry?.Path),
        isForeground: Boolean(entry?.IsForeground),
      }))
      .filter((entry) => entry.processName.length > 0);
  } catch (_powershellError) {
    try {
      const { stdout } = await execFileAsync("tasklist", ["/v", "/fo", "csv", "/nh"], {
        timeout: RUNTIME_SCAN_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });

      return String(stdout || "")
        .split(/\r?\n/)
        .map((line) => parseCsvLine(line))
        .map((cells) => ({
          processName: normalizeProcessName(cells[0]),
          windowTitle: normalizeWindowTitle(cells[cells.length - 1]),
          executablePath: "",
          isForeground: false,
        }))
        .filter((entry) => entry.processName.length > 0);
    } catch (_tasklistError) {
      return [];
    }
  }
};

const listRunningAppsForManualRegistration = async () => {
  const entries = await listRunningProcessEntriesWindows();
  const filtered = entries.filter((entry) => {
    const processName = normalizeProcessName(entry.processName);
    if (!processName || NON_GAME_PROCESS_NAMES.has(processName)) {
      return false;
    }

    const title = cleanWindowTitle(entry.windowTitle);
    return title.length > 0 || processName.length > 0;
  });

  const deduped = Array.from(
    filtered.reduce((acc, entry) => {
      const processName = normalizeProcessName(entry.processName);
      const cleanTitle = cleanWindowTitle(entry.windowTitle);
      const key = `${processName}:${cleanTitle.toLowerCase()}`;
      if (acc.has(key)) {
        return acc;
      }

      acc.set(key, {
        id: key,
        processName,
        windowTitle: cleanTitle,
        executablePath: normalizeExecutablePath(entry.executablePath),
        label: cleanTitle || toDisplayNameFromProcess(processName),
      });

      return acc;
    }, new Map()).values()
  );

  return deduped.slice(0, 120);
};

const findFirstCatalogMatch = (runningSet, catalog) => {
  for (const entry of catalog) {
    const aliases = Array.isArray(entry.aliases)
      ? entry.aliases
          .map((alias) => normalizeProcessName(alias))
          .filter((alias) => alias.length > 0)
      : [];

    if (aliases.length === 0) {
      continue;
    }

    for (const alias of aliases) {
      if (runningSet.has(alias)) {
        return entry.label;
      }
    }
  }

  return null;
};

const findFirstTitleHintMatch = (titles, hints) => {
  for (const entry of hints) {
    const hint = String(entry?.hint || "").trim().toLowerCase();
    if (!hint) {
      continue;
    }

    if (titles.some((title) => title.includes(hint))) {
      return entry.label;
    }
  }

  return null;
};

const resolveForegroundActivity = (entries) => {
  const foregroundEntry = entries.find(
    (entry) => entry && entry.isForeground && String(entry.windowTitle || "").trim().length > 0
  );

  if (!foregroundEntry) {
    return null;
  }

  const processName = normalizeProcessName(foregroundEntry.processName);
  const windowTitle = normalizeWindowTitle(foregroundEntry.windowTitle);
  const cleanTitle = cleanWindowTitle(foregroundEntry.windowTitle);

  if (!processName || !windowTitle || !cleanTitle) {
    return null;
  }

  if (NON_GAME_PROCESS_NAMES.has(processName) || NON_GAME_WINDOW_TITLES.has(windowTitle)) {
    return null;
  }

  const musicByProcess = findFirstCatalogMatch(new Set([processName]), MUSIC_PROCESS_CATALOG);
  if (musicByProcess) {
    return { type: "music", title: musicByProcess };
  }

  const videoByProcess = findFirstCatalogMatch(new Set([processName]), VIDEO_PROCESS_CATALOG);
  if (videoByProcess) {
    return { type: "video", title: videoByProcess };
  }

  const musicByTitle = findFirstTitleHintMatch([windowTitle], MUSIC_WINDOW_TITLE_HINTS);
  if (musicByTitle) {
    return { type: "music", title: cleanTitle };
  }

  const videoByTitle = findFirstTitleHintMatch([windowTitle], VIDEO_WINDOW_TITLE_HINTS);
  if (videoByTitle) {
    return { type: "video", title: cleanTitle };
  }

  const gameByProcess = findFirstCatalogMatch(new Set([processName]), GAME_PROCESS_CATALOG);
  if (gameByProcess) {
    return { type: "game", title: gameByProcess, processName };
  }

  const gameByTitle = findFirstTitleHintMatch([windowTitle], GAME_WINDOW_TITLE_HINTS);
  if (gameByTitle) {
    return { type: "game", title: cleanTitle || gameByTitle, processName };
  }

  const hasLikelyGamePath = /\\steamapps\\common\\|\\epic games\\|\\riot games\\|\\battle.net\\|\\ubisoft\\|\\xboxgames\\|\\games\\/i.test(
    String(foregroundEntry.executablePath || "")
  );
  const hasLikelyGameProcessToken = /(shipping|game|client|win64|x64)/i.test(processName);

  if ((cleanTitle.length >= 4 && hasLikelyGameProcessToken) || hasLikelyGamePath || cleanTitle.length >= 12) {
    return { type: "game", title: cleanTitle || toDisplayNameFromProcess(processName), processName };
  }

  return null;
};

const resolveLearnedRunningGame = (runningSet) => {
  for (const [processName, learnedTitle] of learnedGameProcessMap.entries()) {
    if (runningSet.has(processName)) {
      return learnedTitle;
    }
  }

  return null;
};

const resolveCustomCatalogRunningGame = (runningAliasSet) => {
  for (const entry of runtimeCustomGameCatalog) {
    const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
    for (const alias of aliases) {
      const normalizedAlias = normalizeAlias(alias);
      if (normalizedAlias && runningAliasSet.has(normalizedAlias)) {
        return entry.label;
      }
    }
  }

  return null;
};

const GAME_INSTALL_PATH_HINTS = [
  "\\steamapps\\common\\",
  "\\epic games\\",
  "\\riot games\\",
  "\\battle.net\\",
  "\\ubisoft\\",
  "\\gog games\\",
  "\\xboxgames\\",
  "\\games\\",
];

const LIKELY_NON_GAME_EXE_TOKENS = [
  "launcher",
  "updater",
  "helper",
  "service",
  "bootstrap",
  "crash",
  "report",
  "overlay",
  "anti",
  "easyanticheat",
  "eac",
  "battl",
  "redistributable",
  "vc_redist",
];

const resolveLikelyRunningGame = (entries) => {
  const scoredCandidates = [];

  for (const entry of entries) {
    if (!entry) {
      continue;
    }

    const processName = normalizeProcessName(entry.processName);
    const windowTitle = normalizeWindowTitle(entry.windowTitle);
    const cleanTitle = cleanWindowTitle(entry.windowTitle);
    const executablePath = normalizeExecutablePath(entry.executablePath);

    if (!processName || NON_GAME_PROCESS_NAMES.has(processName) || NON_GAME_WINDOW_TITLES.has(windowTitle)) {
      continue;
    }

    let score = 0;

    if (entry.isForeground) {
      score += 80;
    }

    if (cleanTitle.length >= 4) {
      score += 55;
    }

    if (GAME_INSTALL_PATH_HINTS.some((hint) => executablePath.includes(hint))) {
      score += 140;
    }

    if (GAME_WINDOW_TITLE_HINTS.some((item) => windowTitle.includes(String(item.hint || "").toLowerCase()))) {
      score += 120;
    }

    if (/(shipping|game|client|win64|x64)/i.test(processName)) {
      score += 35;
    }

    if (LIKELY_NON_GAME_EXE_TOKENS.some((token) => processName.includes(token))) {
      score -= 120;
    }

    if (/(chrome|edge|firefox|opera|otherchat|electron|code|terminal|powershell)/i.test(processName)) {
      score -= 200;
    }

    const label = cleanTitle.length > 0 ? cleanTitle : toDisplayNameFromProcess(processName);
    scoredCandidates.push({ processName, label, score });
  }

  if (scoredCandidates.length === 0) {
    return null;
  }

  scoredCandidates.sort((a, b) => b.score - a.score);
  const best = scoredCandidates[0];
  if (!best || best.score < 75) {
    return null;
  }

  return {
    processName: best.processName,
    title: best.label,
  };
};

const resolveCatalogRunningGameByAliasSet = (runningAliasSet, catalog) => {
  for (const entry of Array.isArray(catalog) ? catalog : []) {
    const aliases = Array.isArray(entry?.aliases) ? entry.aliases : [];
    for (const alias of aliases) {
      const normalizedAlias = normalizeAlias(alias);
      if (normalizedAlias && runningAliasSet.has(normalizedAlias)) {
        return String(entry.label || "").trim() || null;
      }
    }
  }

  return null;
};

const detectRuntimeActivity = async () => {
  if (process.platform !== "win32") {
    return null;
  }

  const runningEntries = await listRunningProcessEntriesWindows();
  const runningSet = new Set(runningEntries.map((entry) => entry.processName));
  const runningAliasSet = new Set(
    runningEntries
      .map((entry) => normalizeAlias(entry.processName))
      .filter((value) => value.length > 0)
  );
  const windowTitles = runningEntries
    .map((entry) => entry.windowTitle)
    .filter((title) => title.length > 0);

  if (runningSet.size === 0) {
    runtimeLastActivitySignature = "";
    runtimeLastActivityStartedAt = null;
    return null;
  }

  if (runtimeRichPresence) {
    const richPresenceProcess = normalizeProcessName(runtimeRichPresence.processName);
    const processMatches = !richPresenceProcess || runningSet.has(richPresenceProcess);

    if (processMatches) {
      const timeline = resolveActivityTimeline(`rich:${runtimeRichPresence.title}:${richPresenceProcess}`);
      return {
        type: "game",
        title: runtimeRichPresence.title,
        details: runtimeRichPresence.details || null,
        state: runtimeRichPresence.state || null,
        source: "native-rich-presence",
        startedAt: runtimeRichPresence.startedAt || timeline.startedAt,
        detectedAt: timeline.detectedAt,
      };
    }
  }

  const installedCatalog = await ensureRuntimeInstalledCatalog();

  const gameLabelByKnownCatalog =
    resolveCatalogRunningGameByAliasSet(runningAliasSet, runtimeCustomGameCatalog) ||
    resolveCatalogRunningGameByAliasSet(runningAliasSet, installedCatalog) ||
    findFirstCatalogMatch(runningSet, GAME_PROCESS_CATALOG) ||
    findFirstTitleHintMatch(windowTitles, GAME_WINDOW_TITLE_HINTS);

  if (gameLabelByKnownCatalog) {
    const timeline = resolveActivityTimeline(`game:${gameLabelByKnownCatalog}:native-process`);
    return {
      type: "game",
      title: gameLabelByKnownCatalog,
      details: null,
      state: null,
      source: "native-process",
      startedAt: timeline.startedAt,
      detectedAt: timeline.detectedAt,
    };
  }

  const learnedRunningGame = resolveLearnedRunningGame(runningSet);
  if (learnedRunningGame) {
    const timeline = resolveActivityTimeline(`game:${learnedRunningGame}:native-learned-process`);
    return {
      type: "game",
      title: learnedRunningGame,
      details: null,
      state: null,
      source: "native-learned-process",
      startedAt: timeline.startedAt,
      detectedAt: timeline.detectedAt,
    };
  }

  const likelyRunningGame = resolveLikelyRunningGame(runningEntries);
  if (likelyRunningGame) {
    const timeline = resolveActivityTimeline(`game:${likelyRunningGame.title}:native-likely-process`);
    setBoundedMapValue(
      learnedGameProcessMap,
      likelyRunningGame.processName,
      likelyRunningGame.title,
      LEARNED_GAME_PROCESS_LIMIT
    );
    return {
      type: "game",
      title: likelyRunningGame.title,
      details: null,
      state: null,
      source: "native-likely-process",
      startedAt: timeline.startedAt,
      detectedAt: timeline.detectedAt,
    };
  }

  const foregroundActivity = resolveForegroundActivity(runningEntries);
  if (foregroundActivity?.type === "game") {
    if (foregroundActivity.processName && foregroundActivity.title) {
      setBoundedMapValue(
        learnedGameProcessMap,
        foregroundActivity.processName,
        foregroundActivity.title,
        LEARNED_GAME_PROCESS_LIMIT
      );
    }

    const timeline = resolveActivityTimeline(`game:${foregroundActivity.title}:native-foreground`);
    return {
      type: "game",
      title: foregroundActivity.title,
      details: null,
      state: null,
      source: "native-foreground",
      startedAt: timeline.startedAt,
      detectedAt: timeline.detectedAt,
    };
  }

  if (foregroundActivity?.type === "video") {
    const timeline = resolveActivityTimeline(`video:${foregroundActivity.title}:native-foreground`);
    return {
      type: "video",
      title: foregroundActivity.title,
      details: null,
      state: null,
      source: "native-foreground",
      startedAt: timeline.startedAt,
      detectedAt: timeline.detectedAt,
    };
  }

  if (foregroundActivity?.type === "music") {
    const timeline = resolveActivityTimeline(`music:${foregroundActivity.title}:native-foreground`);
    return {
      type: "music",
      title: foregroundActivity.title,
      details: null,
      state: null,
      source: "native-foreground",
      startedAt: timeline.startedAt,
      detectedAt: timeline.detectedAt,
    };
  }

  const videoLabel =
    findFirstCatalogMatch(runningSet, VIDEO_PROCESS_CATALOG) ||
    findFirstTitleHintMatch(windowTitles, VIDEO_WINDOW_TITLE_HINTS);
  if (videoLabel) {
    const timeline = resolveActivityTimeline(`video:${videoLabel}:native-process`);
    return {
      type: "video",
      title: videoLabel,
      details: null,
      state: null,
      source: "native-process",
      startedAt: timeline.startedAt,
      detectedAt: timeline.detectedAt,
    };
  }

  const musicLabel =
    findFirstCatalogMatch(runningSet, MUSIC_PROCESS_CATALOG) ||
    findFirstTitleHintMatch(windowTitles, MUSIC_WINDOW_TITLE_HINTS);
  if (musicLabel) {
    const timeline = resolveActivityTimeline(`music:${musicLabel}:native-process`);
    return {
      type: "music",
      title: musicLabel,
      details: null,
      state: null,
      source: "native-process",
      startedAt: timeline.startedAt,
      detectedAt: timeline.detectedAt,
    };
  }

  runtimeLastActivitySignature = "";
  runtimeLastActivityStartedAt = null;

  return null;
};

const getCrashLogPath = () => {
  try {
    const userDataPath = app.getPath("userData");
    return path.join(userDataPath, "crash-log.jsonl");
  } catch (_error) {
    return path.join(process.cwd(), "in-accord-crash-log.jsonl");
  }
};

const appendCrashLog = (entry) => {
  try {
    const memory = process.memoryUsage();
    const payload = JSON.stringify({
      ...entry,
      timestamp: new Date().toISOString(),
      appVersion: getAppDisplayVersion(),
      internalVersion: app.getVersion(),
      isPackaged: app.isPackaged,
      platform: process.platform,
      pid: process.pid,
      memory: {
        rssMb: Number((memory.rss / (1024 * 1024)).toFixed(1)),
        heapUsedMb: Number((memory.heapUsed / (1024 * 1024)).toFixed(1)),
        heapTotalMb: Number((memory.heapTotal / (1024 * 1024)).toFixed(1)),
        externalMb: Number((memory.external / (1024 * 1024)).toFixed(1)),
      },
    });
    fs.appendFileSync(getCrashLogPath(), `${payload}\n`, "utf8");
  } catch (_error) {
    // Never throw from crash logging.
  }
};

const startMemoryWatch = () => {
  if (memoryWatchTimer) {
    return;
  }

  memoryWatchTimer = setInterval(() => {
    if (memoryWatchInFlight) {
      return;
    }

    memoryWatchInFlight = true;

    void (async () => {
      let highestRendererResidentMb = 0;
      let shouldTrimRendererCaches = false;

      try {
        const windowMemoryResults = await Promise.allSettled(
          BrowserWindow.getAllWindows().map(async (windowInstance) => {
            if (!windowInstance || windowInstance.isDestroyed()) {
              return null;
            }

            try {
              const memoryInfo = await windowInstance.webContents.getProcessMemoryInfo();
              return Number(((memoryInfo?.residentSet ?? 0) / 1024).toFixed(1));
            } catch {
              return null;
            }
          })
        );

        highestRendererResidentMb = windowMemoryResults.reduce((highest, result) => {
          if (result.status !== "fulfilled" || typeof result.value !== "number") {
            return highest;
          }

          return Math.max(highest, result.value);
        }, 0);

        shouldTrimRendererCaches = highestRendererResidentMb >= MEMORY_TRIM_THRESHOLD_MB;
      } catch {
        // Renderer memory probes are best-effort only.
      }

      try {
        const usage = process.memoryUsage();
        const heapUsedMb = usage.heapUsed / (1024 * 1024);
        const now = Date.now();

        if (heapUsedMb >= MEMORY_WARN_THRESHOLD_MB && now - lastMemoryWarnAt >= MEMORY_EVENT_COOLDOWN_MS) {
          lastMemoryWarnAt = now;
          appendCrashLog({
            source: "main-process:memory-warning",
            detail: `High heap usage detected (${heapUsedMb.toFixed(1)} MB). Highest renderer RSS ${highestRendererResidentMb.toFixed(1)} MB.`,
            fatal: false,
          });
        }

        if ((heapUsedMb >= MEMORY_TRIM_THRESHOLD_MB || shouldTrimRendererCaches) && now - lastMemoryTrimAt >= MEMORY_EVENT_COOLDOWN_MS) {
          lastMemoryTrimAt = now;
          learnedGameProcessMap.clear();
          runtimeInstalledCatalogCache = [];
          runtimeInstalledCatalogLastSync = 0;
          await clearDesktopResourceCaches();

          appendCrashLog({
            source: shouldTrimRendererCaches ? "main-process:memory-trim:renderer" : "main-process:memory-trim",
            detail: `Trimmed runtime caches after heap reached ${heapUsedMb.toFixed(1)} MB and renderer RSS reached ${highestRendererResidentMb.toFixed(1)} MB.`,
            fatal: false,
          });
        }
      } catch (_error) {
        // Never throw from memory watch loop.
      } finally {
        memoryWatchInFlight = false;
      }
    })();
  }, MEMORY_WATCH_INTERVAL_MS);

  if (typeof memoryWatchTimer.unref === "function") {
    memoryWatchTimer.unref();
  }
};

const stopMemoryWatch = () => {
  if (!memoryWatchTimer) {
    return;
  }

  clearInterval(memoryWatchTimer);
  memoryWatchTimer = null;
};

const recoverDesktopWindow = (win, appUrl, reason) => {
  const now = Date.now();
  if (!win || win.isDestroyed() || !appUrl || now - lastWindowRecoveryAt < WINDOW_RECOVERY_COOLDOWN_MS) {
    return;
  }

  lastWindowRecoveryAt = now;
  appendCrashLog({
    source: "window:recovery:scheduled",
    detail: JSON.stringify({ reason, appUrl, windowId: win.id }),
    fatal: false,
  });

  setTimeout(() => {
    if (!win || win.isDestroyed()) {
      return;
    }

    appendStartupTrace("window:recovery:reload", JSON.stringify({ reason, windowId: win.id }));
    void win.loadURL(appUrl).catch((error) => {
      appendCrashLog({
        source: "window:recovery:reload-failed",
        detail: error instanceof Error ? error.stack || error.message : String(error || "Unknown window recovery error"),
        fatal: false,
      });
    });
  }, 1500);
};

const toCrashDetail = (reason) => {
  if (reason instanceof Error) {
    return reason.stack || reason.message;
  }
  return String(reason || "Unknown crash reason");
};

const STARTUP_BENIGN_ERROR_MARKERS = [
  "ERR_CONNECTION_REFUSED",
  "ECONNREFUSED",
  "ERR_FAILED",
  "ERR_ABORTED",
  "CONNECTION_ERROR",
  "LOAD_FAILED",
  "SHELL_LOAD_FAILED",
  "Local server still starting",
  "Waiting for the local app service",
];

const getStartupRelatedUrls = () => {
  const values = [activeAppUrl, DEFAULT_URL]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set(values));
};

const isBenignStartupFailure = ({ source, detail }) => {
  const normalizedSource = String(source || "").trim().toLowerCase();
  const normalizedDetail = String(detail || "").trim().toLowerCase();

  if (!normalizedDetail) {
    return false;
  }

  const hasStartupMarker = STARTUP_BENIGN_ERROR_MARKERS.some((marker) =>
    normalizedDetail.includes(String(marker).toLowerCase())
  );
  const mentionsStartupUrl = getStartupRelatedUrls().some((url) => normalizedDetail.includes(url));
  const mentionsStartupShell = normalizedDetail.includes("data:text/html") && normalizedDetail.includes("in-accord");
  const isCrashHookSource =
    normalizedSource.includes("uncaughtexception") || normalizedSource.includes("unhandledrejection");

  if (!isCrashHookSource) {
    return false;
  }

  return (hasStartupMarker && mentionsStartupUrl) || mentionsStartupShell;
};

const reportCrash = async ({ source, reason, fatal = false }) => {
  const detail = toCrashDetail(reason);
  appendCrashLog({ source, detail, fatal });

  if (isBenignStartupFailure({ source, detail })) {
    return;
  }

  if (!app.isReady() || crashHandlingInProgress) {
    pendingInternalErrors.push({
      title: fatal ? "In-Accord crash detected" : "In-Accord error detected",
      source,
      detail,
      fatal,
    });
    return;
  }

  crashHandlingInProgress = true;
  try {
    await showInternalErrorWindow({
      title: fatal ? "In-Accord crash detected" : "In-Accord error detected",
      source,
      detail,
      fatal,
    });
  } catch (_windowError) {
    pendingInternalErrors.push({
      title: fatal ? "In-Accord crash detected" : "In-Accord error detected",
      source,
      detail,
      fatal,
    });
  } finally {
    crashHandlingInProgress = false;
  }

};

const wireCrashHandlers = () => {
  if (crashHandlersWired) {
    return;
  }

  crashHandlersWired = true;

  process.on("uncaughtException", (error) => {
    if (isBenignStartupFailure({ source: "main-process:uncaughtException", detail: toCrashDetail(error) })) {
      appendCrashLog({
        source: "main-process:uncaughtException:suppressed-startup-failure",
        detail: toCrashDetail(error),
        fatal: false,
      });
      return;
    }

    void reportCrash({ source: "main-process:uncaughtException", reason: error, fatal: true });
  });

  process.on("unhandledRejection", (reason) => {
    if (isBenignStartupFailure({ source: "main-process:unhandledRejection", detail: toCrashDetail(reason) })) {
      appendCrashLog({
        source: "main-process:unhandledRejection:suppressed-startup-failure",
        detail: toCrashDetail(reason),
        fatal: false,
      });
      return;
    }

    void reportCrash({ source: "main-process:unhandledRejection", reason });
  });

  app.on("render-process-gone", (_event, _webContents, details) => {
    void reportCrash({
      source: `renderer-process:${details?.reason || "gone"}`,
      reason: details,
    });
  });

  app.on("child-process-gone", (_event, details) => {
    void reportCrash({
      source: `child-process:${details?.type || "unknown"}:${details?.reason || "gone"}`,
      reason: details,
    });
  });
};

wireCrashHandlers();

const broadcastUpdaterState = (state) => {
  const payload = state || getUpdaterState();

  try {
    const notification = consumeUpdaterNotificationSignal();
    if (notification && Notification.isSupported()) {
      new Notification({
        title: notification.title || "In-Accord update",
        body: notification.body || `Updater status: ${notification.status}`,
        silent: false,
      }).show();
    }
  } catch (error) {
    appendCrashLog({
      source: "updater:notification",
      detail: error instanceof Error ? error.stack || error.message : String(error || "Unknown updater notification error"),
      fatal: false,
    });
  }

  for (const windowInstance of BrowserWindow.getAllWindows()) {
    safelySendToWindow(windowInstance, "inaccord:updater-state", payload, "updater-state:broadcast");
  }
};

async function startInternalServer() {
  if (nextServer) {
    const address = nextServer.address();
    if (address && typeof address === "object" && typeof address.port === "number") {
      return `http://localhost:${address.port}`;
    }
  }

  const next = require("next");
  const appDir = app.getAppPath();
  const buildIdPath = path.join(appDir, ".next", "BUILD_ID");

  if (!fs.existsSync(buildIdPath)) {
    throw new Error(
      `Missing Next production build output at ${buildIdPath}. Rebuild the desktop package and ensure .next is bundled inside app.asar.`
    );
  }

  const nextApp = next({ dev: false, dir: appDir });
  const handle = nextApp.getRequestHandler();

  await nextApp.prepare();

  const server = http.createServer((req, res) => handle(req, res));

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "localhost", resolve);
  });

  nextServer = server;
  const address = server.address();

  if (!address || typeof address !== "object" || typeof address.port !== "number") {
    throw new Error("Could not determine internal server port");
  }

  return `http://localhost:${address.port}`;
}

const requireRemotePackagedLiveTarget = (resolvedTarget) => {
  if (!resolvedTarget || typeof resolvedTarget !== "object") {
    throw new Error("Could not resolve the packaged desktop live runtime target.");
  }

  if (isLocalHttpOrigin(resolvedTarget.appUrl)) {
    throw new Error(
      "Packaged desktop live mode cannot target localhost. Set Admin > I-A Information > App Base URL, NEXT_PUBLIC_SITE_URL, or INACCORD_DESKTOP_APP_URL to a real remote web origin, or leave INACCORD_DESKTOP_RUNTIME_MODE unset / localhost to boot the bundled internal server."
    );
  }

  return resolvedTarget;
};

const resolveReportedRuntimeMode = () => {
  if (activeAppUrlSource === "packaged-internal-server" || activeAppUrlSource.includes("localhost")) {
    return "localhost";
  }

  return "web-thin-client";
};

async function resolveAppUrl() {
  const runtimeMode = String(process.env.INACCORD_DESKTOP_RUNTIME_MODE || "").trim().toLowerCase();
  const localOverride = normalizeHttpOrigin(process.env.ELECTRON_START_URL) || DEFAULT_URL;

  if (!app.isPackaged) {
    if (runtimeMode === "live") {
      return resolveLiveAppUrl();
    }

    return {
      appUrl: localOverride.replace("http://127.0.0.1", "http://localhost"),
      source: "development-localhost",
    };
  }

  if (runtimeMode === "live") {
    return requireRemotePackagedLiveTarget(await resolveLiveAppUrl());
  }

  if (runtimeMode === "localhost" || !runtimeMode) {
    const internalServerUrl = await startInternalServer();
    return {
      appUrl: internalServerUrl,
      source: "packaged-internal-server",
    };
  }

  throw new Error(
    `Unsupported INACCORD_DESKTOP_RUNTIME_MODE "${runtimeMode}". Use "localhost" (or leave it unset) for the bundled internal server, or "live" for a remote web origin.`
  );
}

function createWindow(appUrl) {
  const appIcon = path.join(__dirname, "..", "Images", "fav.ico");

  appendStartupTrace("window:create:start", JSON.stringify({ appUrl, appUrlSource: activeAppUrlSource }));
  appendCrashLog({
    source: "window:create",
    detail: JSON.stringify({ appUrl, appUrlSource: activeAppUrlSource }),
    fatal: false,
  });

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    icon: appIcon,
    autoHideMenuBar: true,
    backgroundColor: "#0f1013",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  appendStartupTrace("window:create:constructed", `id=${win.id}`);

  const loadWindow = async () => {
    appendStartupTrace("window:load:start", JSON.stringify({ appUrl, appUrlSource: activeAppUrlSource }));
    await configureDesktopLiveSession(win.webContents.session, appUrl);
    await win.loadURL(appUrl);
  };

  void loadWindow().catch(async (error) => {
    const detail = error instanceof Error ? error.message : String(error || "Unknown startup error");
    appendStartupTrace("window:load:error", detail);
    appendCrashLog({ source: "window:loadURL", detail, fatal: false });

    await win
      .loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          buildInternalErrorHtml({
            title: "In-Accord failed to start",
            source: "window:loadURL",
            detail,
            fatal: false,
          })
        )}`
      )
      .catch(() => undefined);
  });

  win.webContents.on("did-fail-load", (_event, code, description, validatedURL, isMainFrame) => {
    appendStartupTrace(
      "window:did-fail-load",
      JSON.stringify({ code, description, validatedURL, isMainFrame, currentURL: win.webContents.getURL() })
    );
    appendCrashLog({
      source: "window:did-fail-load",
      detail: `${description} (code ${code}) @ ${validatedURL}`,
      fatal: false,
    });
  });

  win.webContents.on("did-finish-load", () => {
    appendStartupTrace(
      "window:did-finish-load",
      JSON.stringify({ currentUrl: win.webContents.getURL(), appUrl })
    );
    appendCrashLog({
      source: "window:did-finish-load",
      detail: JSON.stringify({
        currentUrl: win.webContents.getURL(),
        appUrl,
      }),
      fatal: false,
    });

    safelySendToWindow(win, "inaccord:updater-state", getUpdaterState(), "updater-state:window-ready");
  });

  win.webContents.on("context-menu", (event) => {
    event.preventDefault();
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    appendStartupTrace("window:render-process-gone", JSON.stringify(details || {}));
    appendCrashLog({
      source: `window:render-process-gone:${details?.reason || "unknown"}`,
      detail: JSON.stringify(details || {}),
      fatal: false,
    });
    recoverDesktopWindow(win, appUrl, `render-process-gone:${details?.reason || "unknown"}`);
  });

  win.on("unresponsive", () => {
    appendStartupTrace("window:unresponsive", JSON.stringify({ windowId: win.id, url: win.webContents.getURL() }));
    appendCrashLog({
      source: "window:unresponsive",
      detail: JSON.stringify({ windowId: win.id, url: win.webContents.getURL() }),
      fatal: false,
    });
    recoverDesktopWindow(win, appUrl, "unresponsive");
  });

  win.webContents.on("did-start-loading", () => {
    appendStartupTrace("window:did-start-loading", win.webContents.getURL());
  });

  win.webContents.on("dom-ready", () => {
    appendStartupTrace("window:dom-ready", win.webContents.getURL());
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    const normalizedUrl = String(url || "");
    const isMeetingPopout = /\/meeting-popout\//i.test(normalizedUrl);

    if (isMeetingPopout) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 1280,
          height: 820,
          minWidth: 960,
          minHeight: 600,
          autoHideMenuBar: true,
          frame: false,
          titleBarStyle: "hidden",
          backgroundColor: "#0f1013",
          webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
          },
        },
      };
    }

    shell.openExternal(normalizedUrl);
    return { action: "deny" };
  });

  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  return win;
}

function createMeetingPopoutWindow(appUrl, meetingPath) {
  const normalizedPath = String(meetingPath || "").trim();
  if (!normalizedPath.startsWith("/meeting-popout/")) {
    throw new Error("Invalid meeting popout path");
  }

  const popoutWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0f1013",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const targetUrl = new URL(normalizedPath, appUrl).toString();
  void configureDesktopLiveSession(popoutWindow.webContents.session, appUrl)
    .then(() => popoutWindow.loadURL(targetUrl))
    .catch((error) => {
      appendCrashLog({
        source: "meeting-popout:loadURL",
        detail: error instanceof Error ? error.message : String(error || "Unknown startup error"),
        fatal: false,
      });
    });

  popoutWindow.on("closed", () => {
    const match = normalizedPath.match(/^\/meeting-popout\/([^/]+)\/([^/?#]+)/i);
    const payload = {
      serverId: match?.[1] || null,
      channelId: match?.[2] || null,
    };

    if (mainWindow && !mainWindow.isDestroyed()) {
      safelySendToWindow(mainWindow, "inaccord:meeting-popout-closed", payload, "meeting-popout:closed");
    } else {
      for (const windowInstance of BrowserWindow.getAllWindows()) {
        safelySendToWindow(windowInstance, "inaccord:meeting-popout-closed", payload, "meeting-popout:closed");
      }
    }
  });

  return popoutWindow;
}

app
  .whenReady()
  .then(async () => {
    appendStartupTrace("app:whenReady:start");
    app.setAppUserModelId("com.gardrealms.inaccord");
    startMemoryWatch();
    appendStartupTrace("app:whenReady:memory-watch-started");
    await flushPendingInternalErrors();
    appendStartupTrace("app:whenReady:pending-errors-flushed", `count=${pendingInternalErrors.length}`);
    const resolvedAppTarget = await resolveAppUrl();
    appendStartupTrace("app:whenReady:resolved-app-url", JSON.stringify(resolvedAppTarget));
    activeAppUrl = resolvedAppTarget.appUrl;
    activeAppUrlSource = resolvedAppTarget.source;

    ipcMain.handle("inaccord:updater-check-now", async () => {
      return checkForUpdatesNow({ onStateChange: broadcastUpdaterState });
    });

    ipcMain.handle("inaccord:updater-status-get", async () => {
      return getUpdaterState();
    });

    ipcMain.handle("inaccord:updater-upgrade-now", async () => {
      return downloadAndPrepareUpdate({ onStateChange: broadcastUpdaterState });
    });

    ipcMain.handle("inaccord:updater-restart-now", async () => {
      return restartAndInstallUpdate({ onStateChange: broadcastUpdaterState });
    });

    ipcMain.handle("inaccord:runtime-meta-get", async () => {
      return {
        isPackaged: app.isPackaged,
        runtimeMode: resolveReportedRuntimeMode(),
        appUrl: activeAppUrl,
        appUrlSource: activeAppUrlSource,
        appVersion: getAppDisplayVersion(),
        internalVersion: app.getVersion(),
      };
    });

    ipcMain.handle("inaccord:runtime-activity-get", async () => {
      return detectRuntimeActivity();
    });

    ipcMain.handle("inaccord:runtime-game-catalog-set", async (_event, payload) => {
      runtimeCustomGameCatalog = sanitizeRuntimeGameCatalog(payload?.games);
      return { ok: true, count: runtimeCustomGameCatalog.length };
    });

    ipcMain.handle("inaccord:runtime-rich-presence-set", async (_event, payload) => {
      const next = sanitizeRichPresencePayload(payload?.activity);
      runtimeRichPresence = next;
      return { ok: true, hasActivity: Boolean(next) };
    });

    ipcMain.handle("inaccord:runtime-running-apps-get", async () => {
      if (process.platform !== "win32") {
        return { apps: [], source: "unsupported-platform" };
      }

      const apps = await listRunningAppsForManualRegistration();
      return {
        apps,
        source: "native-process-scan",
        fetchedAt: new Date().toISOString(),
      };
    });

    ipcMain.handle("inaccord:runtime-installed-games-get", async () => {
      if (process.platform !== "win32") {
        return { games: [], source: "unsupported-platform" };
      }

      const games = await listInstalledGamesWindows();
      return {
        games,
        source: "native-installed-scan",
        fetchedAt: new Date().toISOString(),
      };
    });

    ipcMain.handle("inaccord:window-minimize", async (event) => {
      const targetWindow = BrowserWindow.fromWebContents(event.sender);
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.minimize();
      }
      return { ok: true };
    });

    ipcMain.handle("inaccord:window-close", async (event) => {
      const targetWindow = BrowserWindow.fromWebContents(event.sender);
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.close();
      }
      return { ok: true };
    });

    ipcMain.handle("inaccord:meeting-popout-open", async (_event, payload) => {
      const meetingPath = String(payload?.meetingPath || "");
      createMeetingPopoutWindow(activeAppUrl, meetingPath);
      return { ok: true };
    });

    appendStartupTrace("app:whenReady:create-window", activeAppUrl);
    createWindow(activeAppUrl);

    appendStartupTrace("app:whenReady:start-update-loop");
    stopUpdateLoop = startUpdateLoop({ onStateChange: broadcastUpdaterState });

    app.on("activate", () => {
      appendStartupTrace("app:activate", `windows=${BrowserWindow.getAllWindows().length}`);
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(activeAppUrl);
      }
    });
  })
  .catch(async (error) => {
    const detail = error instanceof Error ? error.stack || error.message : String(error || "Unknown startup error");
    appendStartupTrace("app:whenReady:error", detail);
    try {
      await showInternalErrorWindow({
        title: "In-Accord failed to start",
        source: "app:startup",
        detail,
        fatal: true,
      });
    } catch (_fallbackError) {
      app.quit();
    }
  });

app.on("before-quit", () => {
  appendStartupTrace("app:before-quit");
  stopMemoryWatch();

  if (nextServer) {
    try {
      nextServer.close();
    } catch (_error) {
      // Ignore shutdown errors.
    }
    nextServer = null;
  }
});

app.on("window-all-closed", () => {
  appendStartupTrace("app:window-all-closed", `platform=${process.platform}`);
  if (typeof stopUpdateLoop === "function") {
    stopUpdateLoop();
    stopUpdateLoop = null;
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});
