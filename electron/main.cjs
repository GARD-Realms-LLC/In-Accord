const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const http = require("http");
const fs = require("fs");
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

const {
  getUpdaterState,
  checkForUpdatesNow,
  downloadAndPrepareUpdate,
  restartAndInstallUpdate,
  startUpdateLoop,
} = require("./updater.cjs");

const DEFAULT_URL = "http://localhost:3000";
let stopUpdateLoop = null;
let nextServer = null;
let activeAppUrl = DEFAULT_URL;
let crashHandlingInProgress = false;
let mainWindow = null;

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

const normalizeProcessName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.exe$/i, "");

const normalizeWindowTitle = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

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

const listRunningProcessEntriesWindows = async () => {
  const psArgs = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "Get-Process | Select-Object ProcessName,MainWindowTitle | ConvertTo-Json -Compress",
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
        }))
        .filter((entry) => entry.processName.length > 0);
    } catch (_tasklistError) {
      return [];
    }
  }
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

const detectRuntimeActivity = async () => {
  if (process.platform !== "win32") {
    return null;
  }

  const runningEntries = await listRunningProcessEntriesWindows();
  const runningSet = new Set(runningEntries.map((entry) => entry.processName));
  const windowTitles = runningEntries
    .map((entry) => entry.windowTitle)
    .filter((title) => title.length > 0);

  if (runningSet.size === 0) {
    return null;
  }

  const gameLabel =
    findFirstCatalogMatch(runningSet, GAME_PROCESS_CATALOG) ||
    findFirstTitleHintMatch(windowTitles, GAME_WINDOW_TITLE_HINTS);
  if (gameLabel) {
    return {
      type: "game",
      title: gameLabel,
      source: "native-process",
      detectedAt: new Date().toISOString(),
    };
  }

  const videoLabel =
    findFirstCatalogMatch(runningSet, VIDEO_PROCESS_CATALOG) ||
    findFirstTitleHintMatch(windowTitles, VIDEO_WINDOW_TITLE_HINTS);
  if (videoLabel) {
    return {
      type: "video",
      title: videoLabel,
      source: "native-process",
      detectedAt: new Date().toISOString(),
    };
  }

  const musicLabel =
    findFirstCatalogMatch(runningSet, MUSIC_PROCESS_CATALOG) ||
    findFirstTitleHintMatch(windowTitles, MUSIC_WINDOW_TITLE_HINTS);
  if (musicLabel) {
    return {
      type: "music",
      title: musicLabel,
      source: "native-process",
      detectedAt: new Date().toISOString(),
    };
  }

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
    const payload = JSON.stringify({
      ...entry,
      timestamp: new Date().toISOString(),
      appVersion: app.getVersion(),
      isPackaged: app.isPackaged,
      platform: process.platform,
      pid: process.pid,
    });
    fs.appendFileSync(getCrashLogPath(), `${payload}\n`, "utf8");
  } catch (_error) {
    // Never throw from crash logging.
  }
};

const toCrashDetail = (reason) => {
  if (reason instanceof Error) {
    return reason.stack || reason.message;
  }
  return String(reason || "Unknown crash reason");
};

const reportCrash = async ({ source, reason, fatal = false }) => {
  const detail = toCrashDetail(reason);
  appendCrashLog({ source, detail, fatal });

  if (!app.isReady() || crashHandlingInProgress) {
    return;
  }

  crashHandlingInProgress = true;
  try {
    await dialog.showMessageBox({
      type: "error",
      title: "In-Accord crash detected",
      message: `Crash source: ${source}`,
      detail,
      buttons: ["OK"],
      noLink: true,
    });
  } catch (_dialogError) {
    // Ignore dialog issues while handling crash.
  } finally {
    crashHandlingInProgress = false;
  }

  if (fatal) {
    app.quit();
  }
};

const wireCrashHandlers = () => {
  process.on("uncaughtException", (error) => {
    void reportCrash({ source: "main-process:uncaughtException", reason: error, fatal: true });
  });

  process.on("unhandledRejection", (reason) => {
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

const broadcastUpdaterState = (state) => {
  const payload = state || getUpdaterState();
  for (const windowInstance of BrowserWindow.getAllWindows()) {
    windowInstance.webContents.send("inaccord:updater-state", payload);
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

async function resolveAppUrl() {
  if (process.env.ELECTRON_START_URL) {
    return String(process.env.ELECTRON_START_URL).replace("http://127.0.0.1", "http://localhost");
  }

  if (!app.isPackaged) {
    return DEFAULT_URL;
  }

  return startInternalServer();
}

function createWindow(appUrl) {
  const appIcon = path.join(__dirname, "..", "Images", "fav.ico");

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    icon: appIcon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  void win.loadURL(appUrl).catch(async (error) => {
    const detail = error instanceof Error ? error.message : String(error || "Unknown startup error");
    appendCrashLog({ source: "window:loadURL", detail, fatal: false });
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<h2>In-Accord failed to start</h2><p>${detail}</p>`)}`);
  });

  win.webContents.on("did-fail-load", (_event, code, description, validatedURL) => {
    appendCrashLog({
      source: "window:did-fail-load",
      detail: `${description} (code ${code}) @ ${validatedURL}`,
      fatal: false,
    });
  });

  win.webContents.on("did-finish-load", () => {
    win.webContents.send("inaccord:updater-state", getUpdaterState());
  });

  win.webContents.on("context-menu", (event) => {
    event.preventDefault();
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
  void popoutWindow.loadURL(targetUrl);

  popoutWindow.on("closed", () => {
    const match = normalizedPath.match(/^\/meeting-popout\/([^/]+)\/([^/?#]+)/i);
    const payload = {
      serverId: match?.[1] || null,
      channelId: match?.[2] || null,
    };

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("inaccord:meeting-popout-closed", payload);
    } else {
      for (const windowInstance of BrowserWindow.getAllWindows()) {
        if (!windowInstance.isDestroyed()) {
          windowInstance.webContents.send("inaccord:meeting-popout-closed", payload);
        }
      }
    }
  });

  return popoutWindow;
}

app
  .whenReady()
  .then(async () => {
    wireCrashHandlers();
    activeAppUrl = await resolveAppUrl();
    createWindow(activeAppUrl);

    stopUpdateLoop = startUpdateLoop({ onStateChange: broadcastUpdaterState });

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
        runtimeMode: app.isPackaged ? "production" : "development",
        appVersion: app.getVersion(),
      };
    });

    ipcMain.handle("inaccord:runtime-activity-get", async () => {
      return detectRuntimeActivity();
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

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(activeAppUrl);
      }
    });
  })
  .catch(async (error) => {
    const detail = error instanceof Error ? error.stack || error.message : String(error || "Unknown startup error");
    try {
      const fallbackWindow = new BrowserWindow({
        width: 920,
        height: 620,
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });

      await fallbackWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(`<h2>In-Accord failed to start</h2><pre style="white-space:pre-wrap;">${detail}</pre>`)}`
      );
    } catch (_fallbackError) {
      await dialog.showMessageBox({
        type: "error",
        title: "In-Accord failed to start",
        message: "The desktop app could not initialize.",
        detail,
      });
      app.quit();
    }
  });

app.on("before-quit", () => {
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
  if (typeof stopUpdateLoop === "function") {
    stopUpdateLoop();
    stopUpdateLoop = null;
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});
