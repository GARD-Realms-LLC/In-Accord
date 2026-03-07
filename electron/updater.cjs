const { app, shell } = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");
const https = require("node:https");

const UPDATE_MANIFEST_URL = process.env.INACCORD_UPDATE_MANIFEST_URL;
const UPDATE_CHECK_INTERVAL_MS = Number(process.env.INACCORD_UPDATE_CHECK_INTERVAL_MS || 30 * 60 * 1000);
const UPDATE_REQUEST_TIMEOUT_MS = Number(process.env.INACCORD_UPDATE_REQUEST_TIMEOUT_MS || 15_000);

let updateCheckInFlight = false;
let updateDownloadInFlight = false;
let cachedManifest = null;
let cachedInstallerPath = "";

const updaterState = {
  enabled: Boolean(UPDATE_MANIFEST_URL),
  status: UPDATE_MANIFEST_URL ? "idle" : "disabled",
  currentVersion: app.getVersion(),
  latestVersion: "",
  releaseNotes: "",
  progress: 0,
  requiresRestart: false,
  message: UPDATE_MANIFEST_URL ? "" : "INACCORD_UPDATE_MANIFEST_URL is not configured",
};

const getUpdaterState = () => ({ ...updaterState });

const setUpdaterState = (patch, onStateChange) => {
  Object.assign(updaterState, patch);
  if (typeof onStateChange === "function") {
    onStateChange(getUpdaterState());
  }
};

const parseVersion = (value) => {
  const cleaned = String(value || "")
    .trim()
    .replace(/^v/i, "");

  if (!cleaned) {
    return [0, 0, 0];
  }

  const parts = cleaned
    .split(".")
    .map((part) => Number.parseInt(part.replace(/[^0-9]/g, ""), 10))
    .map((part) => (Number.isFinite(part) ? part : 0));

  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
};

const isVersionNewer = (candidate, current) => {
  const a = parseVersion(candidate);
  const b = parseVersion(current);

  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) {
      return true;
    }
    if (a[i] < b[i]) {
      return false;
    }
  }

  return false;
};

const getHttpClient = (url) => (url.startsWith("https:") ? https : http);

const fetchJson = (url) =>
  new Promise((resolve, reject) => {
    const client = getHttpClient(url);
    const request = client.get(url, { timeout: UPDATE_REQUEST_TIMEOUT_MS }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        resolve(fetchJson(response.headers.location));
        return;
      }

      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`Manifest request failed with status ${response.statusCode || "unknown"}`));
        return;
      }

      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("end", () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(error);
        }
      });
      response.on("error", reject);
    });

    request.on("timeout", () => {
      request.destroy(new Error("Manifest request timed out"));
    });

    request.on("error", reject);
  });

const ensureDir = async (dirPath) => {
  await fsp.mkdir(dirPath, { recursive: true });
};

const sha256File = (filePath) =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });

const downloadFile = (url, destinationPath, onProgress) =>
  new Promise((resolve, reject) => {
    const client = getHttpClient(url);

    const request = client.get(url, { timeout: UPDATE_REQUEST_TIMEOUT_MS }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        resolve(downloadFile(response.headers.location, destinationPath, onProgress));
        return;
      }

      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`Download failed with status ${response.statusCode || "unknown"}`));
        return;
      }

      const output = fs.createWriteStream(destinationPath);
      const totalBytes = Number(response.headers["content-length"] || 0);
      let receivedBytes = 0;

      response.on("data", (chunk) => {
        receivedBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
        if (typeof onProgress === "function" && totalBytes > 0) {
          const ratio = Math.min(1, receivedBytes / totalBytes);
          onProgress(Math.round(ratio * 100));
        }
      });

      response.pipe(output);

      output.on("finish", () => {
        output.close(() => resolve(destinationPath));
      });
      output.on("error", reject);
      response.on("error", reject);
    });

    request.on("timeout", () => {
      request.destroy(new Error("Download timed out"));
    });
    request.on("error", reject);
  });

const getManifestFields = (manifest) => {
  const latestVersion = String(manifest.version || manifest.latestVersion || "").trim();
  const installerUrl = String(
    manifest.installerUrl ||
      manifest.url ||
      (manifest.platforms && manifest.platforms.win64 && manifest.platforms.win64.url) ||
      ""
  ).trim();
  const sha256 = String(
    manifest.sha256 ||
      manifest.installerSha256 ||
      (manifest.platforms && manifest.platforms.win64 && manifest.platforms.win64.sha256) ||
      ""
  )
    .trim()
    .toLowerCase();
  const releaseNotes = String(manifest.notes || manifest.releaseNotes || "").trim();

  return {
    latestVersion,
    installerUrl,
    sha256,
    releaseNotes,
  };
};

const installDownloadedUpdate = async (installerPath) => {
  const openResult = await shell.openPath(installerPath);
  if (openResult) {
    throw new Error(openResult);
  }

  app.quit();
};

const checkForUpdatesNow = async ({ onStateChange } = {}) => {
  if (!UPDATE_MANIFEST_URL) {
    setUpdaterState(
      {
        enabled: false,
        status: "disabled",
        message: "INACCORD_UPDATE_MANIFEST_URL is not configured",
      },
      onStateChange
    );
    return getUpdaterState();
  }

  if (updateCheckInFlight) {
    return getUpdaterState();
  }

  updateCheckInFlight = true;
  setUpdaterState(
    {
      status: "checking",
      message: "Checking for updates...",
      currentVersion: app.getVersion(),
    },
    onStateChange
  );

  try {
    const manifest = await fetchJson(UPDATE_MANIFEST_URL);
    const { latestVersion, installerUrl, sha256, releaseNotes } = getManifestFields(manifest);
    const currentVersion = app.getVersion();

    if (!latestVersion || !installerUrl) {
      throw new Error("Manifest missing required fields: version and installerUrl");
    }

    cachedManifest = {
      latestVersion,
      installerUrl,
      sha256,
      releaseNotes,
    };

    if (!isVersionNewer(latestVersion, currentVersion)) {
      setUpdaterState(
        {
          status: "up-to-date",
          currentVersion,
          latestVersion,
          releaseNotes,
          progress: 0,
          requiresRestart: false,
          message: "You are up to date.",
        },
        onStateChange
      );
      return getUpdaterState();
    }

    setUpdaterState(
      {
        status: "update-available",
        currentVersion,
        latestVersion,
        releaseNotes,
        progress: 0,
        requiresRestart: false,
        message: `Update ${latestVersion} is available.`,
      },
      onStateChange
    );

    return getUpdaterState();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown update error";
    setUpdaterState(
      {
        status: "error",
        message,
        requiresRestart: false,
      },
      onStateChange
    );

    return getUpdaterState();
  } finally {
    updateCheckInFlight = false;
  }
};

const downloadAndPrepareUpdate = async ({ onStateChange } = {}) => {
  if (updateDownloadInFlight) {
    return getUpdaterState();
  }

  if (!cachedManifest) {
    await checkForUpdatesNow({ onStateChange });
  }

  if (!cachedManifest || !cachedManifest.installerUrl || !cachedManifest.latestVersion) {
    setUpdaterState(
      {
        status: "error",
        message: "No update metadata available. Try checking for updates again.",
      },
      onStateChange
    );
    return getUpdaterState();
  }

  updateDownloadInFlight = true;

  try {
    setUpdaterState(
      {
        status: "downloading",
        latestVersion: cachedManifest.latestVersion,
        releaseNotes: cachedManifest.releaseNotes || "",
        progress: 0,
        requiresRestart: false,
        message: "Downloading update...",
      },
      onStateChange
    );

    const updatesDir = path.join(app.getPath("userData"), "updates", cachedManifest.latestVersion);
    await ensureDir(updatesDir);

    const installerPath = path.join(updatesDir, `In-Accord-Setup-${cachedManifest.latestVersion}.exe`);
    await downloadFile(cachedManifest.installerUrl, installerPath, (progress) => {
      setUpdaterState({ progress }, onStateChange);
    });

    if (cachedManifest.sha256) {
      const downloadedSha = await sha256File(installerPath);
      if (downloadedSha !== cachedManifest.sha256) {
        await fsp.rm(installerPath, { force: true });
        throw new Error("Downloaded installer failed integrity verification");
      }
    }

    cachedInstallerPath = installerPath;
    setUpdaterState(
      {
        status: "ready-to-restart",
        progress: 100,
        requiresRestart: true,
        message: `Update ${cachedManifest.latestVersion} downloaded. Restart required to install.`,
      },
      onStateChange
    );

    return getUpdaterState();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown update download error";
    setUpdaterState(
      {
        status: "error",
        message,
        requiresRestart: false,
      },
      onStateChange
    );

    return getUpdaterState();
  } finally {
    updateDownloadInFlight = false;
  }
};

const restartAndInstallUpdate = async ({ onStateChange } = {}) => {
  if (!cachedInstallerPath) {
    setUpdaterState(
      {
        status: "error",
        message: "No downloaded update is ready to install.",
      },
      onStateChange
    );
    return getUpdaterState();
  }

  setUpdaterState(
    {
      status: "installing",
      message: "Launching installer and restarting app...",
    },
    onStateChange
  );

  await installDownloadedUpdate(cachedInstallerPath);
  return getUpdaterState();
};

const startUpdateLoop = ({ onStateChange } = {}) => {
  if (!UPDATE_MANIFEST_URL) {
    return () => undefined;
  }

  const initialTimer = setTimeout(() => {
    void checkForUpdatesNow({ onStateChange });
  }, 10_000);

  const periodicTimer = setInterval(() => {
    void checkForUpdatesNow({ onStateChange });
  }, Math.max(60_000, UPDATE_CHECK_INTERVAL_MS));

  return () => {
    clearTimeout(initialTimer);
    clearInterval(periodicTimer);
  };
};

module.exports = {
  getUpdaterState,
  checkForUpdatesNow,
  downloadAndPrepareUpdate,
  restartAndInstallUpdate,
  startUpdateLoop,
};
