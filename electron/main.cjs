const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

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

const DEFAULT_URL = "http://127.0.0.1:3000";
let stopUpdateLoop = null;
let nextServer = null;
let activeAppUrl = DEFAULT_URL;
let crashHandlingInProgress = false;

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
      return `http://127.0.0.1:${address.port}`;
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
    server.listen(0, "127.0.0.1", resolve);
  });

  nextServer = server;
  const address = server.address();

  if (!address || typeof address !== "object" || typeof address.port !== "number") {
    throw new Error("Could not determine internal server port");
  }

  return `http://127.0.0.1:${address.port}`;
}

async function resolveAppUrl() {
  if (process.env.ELECTRON_START_URL) {
    return process.env.ELECTRON_START_URL;
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
    shell.openExternal(url);
    return { action: "deny" };
  });
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
