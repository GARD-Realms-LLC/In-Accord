const path = require("path");
const { spawn, spawnSync } = require("child_process");

const electronBinary = require("electron");

const {
  ROOT_DIR,
  getNpmCommand,
  resolveConfiguredDesktopStartUrl,
  waitForUrl,
} = require("./shared.cjs");

const sharedEnv = {
  ...process.env,
  INACCORD_DESKTOP_RUNTIME: "1",
  INACCORD_DISABLE_FILE_DATA: "1",
  NEXT_PUBLIC_INACCORD_DISABLE_CLIENT_PERSISTENCE: "1",
};

let shuttingDown = false;
let webServerProcess = null;
let electronProcess = null;
const desktopStartUrl = resolveConfiguredDesktopStartUrl(sharedEnv);

const terminateChild = (child) => {
  if (!child || child.killed) {
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  child.kill("SIGTERM");
};

const shutdown = (exitCode = 0) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  terminateChild(electronProcess);
  terminateChild(webServerProcess);
  process.exit(exitCode);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const startWebServer = () => {
  webServerProcess = spawn(getNpmCommand(), ["run", "dev"], {
    cwd: ROOT_DIR,
    env: sharedEnv,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true,
  });

  webServerProcess.on("exit", (code) => {
    if (!shuttingDown) {
      shutdown(code ?? 1);
    }
  });

  webServerProcess.on("error", (error) => {
    console.error("[INACCORD_APP_DEV_WEB_SERVER]", error);
    if (!shuttingDown) {
      shutdown(1);
    }
  });
};

const startElectron = async () => {
  await waitForUrl(`${desktopStartUrl}/api/auth/session?diagnostics=1`);

  electronProcess = spawn(electronBinary, [path.join(ROOT_DIR, "dev", "app", "main.cjs")], {
    cwd: ROOT_DIR,
    env: {
      ...sharedEnv,
      INACCORD_DESKTOP_DEV: "1",
      INACCORD_DESKTOP_START_URL: desktopStartUrl,
    },
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  });

  electronProcess.on("error", (error) => {
    console.error("[INACCORD_APP_DEV_ELECTRON]", error);
    shutdown(1);
  });

  electronProcess.on("exit", (code) => {
    shutdown(code ?? 0);
  });
};

const canReuseRunningServer = async () => {
  try {
    await waitForUrl(`${desktopStartUrl}/api/auth/session?diagnostics=1`, {
      timeoutMs: 2_500,
      intervalMs: 250,
    });
    return true;
  } catch {
    return false;
  }
};

const main = async () => {
  const runningServerAvailable = await canReuseRunningServer();
  if (!runningServerAvailable) {
    startWebServer();
  }

  await startElectron();
};

main().catch((error) => {
  console.error("[INACCORD_APP_DEV]", error);
  shutdown(1);
});
