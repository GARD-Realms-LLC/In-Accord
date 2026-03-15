const { app, shell } = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");
const https = require("node:https");
const { spawn } = require("node:child_process");

const UPDATE_MANIFEST_URL = process.env.INACCORD_UPDATE_MANIFEST_URL;
const UPDATE_AUTO_DOWNLOAD = String(process.env.INACCORD_UPDATE_AUTO_DOWNLOAD || "true").trim().toLowerCase() !== "false";
const UPDATE_CHECK_INTERVAL_MS = Number(process.env.INACCORD_UPDATE_CHECK_INTERVAL_MS || 30 * 60 * 1000);
const UPDATE_REQUEST_TIMEOUT_MS = Number(process.env.INACCORD_UPDATE_REQUEST_TIMEOUT_MS || 15_000);
const UPDATE_MAX_MANIFEST_BYTES = Number(process.env.INACCORD_UPDATE_MAX_MANIFEST_BYTES || 1024 * 1024);
const UPDATE_MAX_INSTALLER_BYTES = Number(process.env.INACCORD_UPDATE_MAX_INSTALLER_BYTES || 1024 * 1024 * 1024);
const UPDATE_MAX_REDIRECTS = 5;

let updateCheckInFlight = false;
let updateDownloadInFlight = false;
let cachedManifest = null;
let cachedInstallerPath = "";
let backgroundDownloadPromise = null;
let lastNotifiedUpdateSignature = "";

const formatDisplayVersion = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d+)\.(\d+)\.(\d+)$/);

  if (!match) {
    return raw;
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
      // Try next candidate.
    }
  }

  return null;
};

const getCurrentDisplayVersion = () => {
  const manifest = readRuntimePackageManifest();
  return formatDisplayVersion(manifest?.inaccordDisplayVersion || manifest?.version || app.getVersion());
};

const extractDisplayVersionFromInstallerUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    const fileName = path.basename(parsed.pathname || "");
    const match = fileName.match(/v(\d+\.\d+\.\d+)/i);
    return match ? formatDisplayVersion(match[1]) : "";
  } catch {
    const fileName = path.basename(raw);
    const match = fileName.match(/v(\d+\.\d+\.\d+)/i);
    return match ? formatDisplayVersion(match[1]) : "";
  }
};

const updaterState = {
  enabled: Boolean(UPDATE_MANIFEST_URL),
  status: UPDATE_MANIFEST_URL ? "idle" : "disabled",
  currentVersion: getCurrentDisplayVersion(),
  latestVersion: "",
  currentInternalVersion: app.getVersion(),
  latestInternalVersion: "",
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

const consumeUpdaterNotificationSignal = () => {
  const notification = updaterState.notification;
  if (!notification || typeof notification !== "object") {
    return null;
  }

  const status = String(notification.status || "").trim();
  const version = String(notification.version || "").trim();
  if (!status || !version) {
    return null;
  }

  const signature = `${status}:${version}`;
  if (signature === lastNotifiedUpdateSignature) {
    return null;
  }

  lastNotifiedUpdateSignature = signature;
  return {
    status,
    version,
    title: String(notification.title || "").trim(),
    body: String(notification.body || "").trim(),
  };
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

const unquoteYamlScalar = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    return normalized.slice(1, -1);
  }

  return normalized;
};

const toAbsoluteUrl = (baseUrl, candidate) => {
  const normalizedCandidate = String(candidate || "").trim();
  if (!normalizedCandidate) {
    return "";
  }

  try {
    return new URL(normalizedCandidate, baseUrl).toString();
  } catch (_error) {
    return normalizedCandidate;
  }
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

const fetchManifestDocument = (url, redirectCount = 0, requestUrl = url) =>
  new Promise((resolve, reject) => {
    if (redirectCount > UPDATE_MAX_REDIRECTS) {
      reject(new Error("Manifest request exceeded redirect limit"));
      return;
    }

    const client = getHttpClient(url);
    const request = client.get(url, { timeout: UPDATE_REQUEST_TIMEOUT_MS }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        resolve(fetchManifestDocument(toAbsoluteUrl(url, response.headers.location), redirectCount + 1, requestUrl));
        return;
      }

      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`Manifest request failed with status ${response.statusCode || "unknown"}`));
        return;
      }

      const declaredLength = Number(response.headers["content-length"] || 0);
      if (Number.isFinite(declaredLength) && declaredLength > UPDATE_MAX_MANIFEST_BYTES) {
        response.resume();
        reject(new Error(`Manifest exceeds max size (${UPDATE_MAX_MANIFEST_BYTES} bytes)`));
        return;
      }

      const chunks = [];
      let totalBytes = 0;
      response.on("data", (chunk) => {
        const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += bufferChunk.length;

        if (totalBytes > UPDATE_MAX_MANIFEST_BYTES) {
          response.destroy(new Error(`Manifest exceeds max size (${UPDATE_MAX_MANIFEST_BYTES} bytes)`));
          return;
        }

        chunks.push(bufferChunk);
      });
      response.on("end", () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve({
            raw,
            contentType: String(response.headers["content-type"] || "").trim().toLowerCase(),
            url,
            finalUrl: url,
            requestUrl,
          });
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

const parseLatestYml = (raw) => {
  const lines = String(raw || "").split(/\r?\n/);
  const manifest = {
    version: "",
    displayVersion: "",
    internalVersion: "",
    path: "",
    sha512: "",
    releaseNotes: "",
    files: [],
  };

  let currentFile = null;
  let collectingReleaseNotes = false;
  const releaseNoteLines = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (collectingReleaseNotes) {
        releaseNoteLines.push("");
      }
      continue;
    }

    if (/^releaseNotes:\s*[>|]?$/.test(trimmed)) {
      collectingReleaseNotes = true;
      currentFile = null;
      continue;
    }

    if (collectingReleaseNotes) {
      if (/^[A-Za-z0-9_-]+:/.test(trimmed) || /^-\s+url:/.test(trimmed)) {
        collectingReleaseNotes = false;
      } else {
        releaseNoteLines.push(trimmed.replace(/^[-\s]+/, ""));
        continue;
      }
    }

    const versionMatch = trimmed.match(/^version:\s*(.+)$/);
    if (versionMatch) {
      manifest.version = unquoteYamlScalar(versionMatch[1]);
      currentFile = null;
      continue;
    }

    const displayVersionMatch = trimmed.match(/^displayVersion:\s*(.+)$/);
    if (displayVersionMatch) {
      manifest.displayVersion = unquoteYamlScalar(displayVersionMatch[1]);
      currentFile = null;
      continue;
    }

    const internalVersionMatch = trimmed.match(/^internalVersion:\s*(.+)$/);
    if (internalVersionMatch) {
      manifest.internalVersion = unquoteYamlScalar(internalVersionMatch[1]);
      currentFile = null;
      continue;
    }

    const pathMatch = trimmed.match(/^path:\s*(.+)$/);
    if (pathMatch) {
      manifest.path = unquoteYamlScalar(pathMatch[1]);
      currentFile = null;
      continue;
    }

    const sha512Match = trimmed.match(/^sha512:\s*(.+)$/);
    if (sha512Match && !currentFile) {
      manifest.sha512 = unquoteYamlScalar(sha512Match[1]);
      continue;
    }

    const fileUrlMatch = trimmed.match(/^-\s+url:\s*(.+)$/);
    if (fileUrlMatch) {
      currentFile = { url: unquoteYamlScalar(fileUrlMatch[1]), sha512: "" };
      manifest.files.push(currentFile);
      continue;
    }

    const nestedUrlMatch = trimmed.match(/^url:\s*(.+)$/);
    if (nestedUrlMatch && currentFile) {
      currentFile.url = unquoteYamlScalar(nestedUrlMatch[1]);
      continue;
    }

    const nestedSha512Match = trimmed.match(/^sha512:\s*(.+)$/);
    if (nestedSha512Match && currentFile) {
      currentFile.sha512 = unquoteYamlScalar(nestedSha512Match[1]);
    }
  }

  if (releaseNoteLines.length > 0) {
    manifest.releaseNotes = releaseNoteLines.join("\n").trim();
  }

  return manifest;
};

const parseManifestDocument = (document) => {
  const raw = String(document?.raw || "").trim();
  if (!raw) {
    throw new Error("Update manifest was empty");
  }

  const looksLikeJson = raw.startsWith("{") || raw.startsWith("[");
  const looksLikeYaml = /(^|\n)version:\s*/i.test(raw) || String(document?.url || "").toLowerCase().endsWith(".yml");

  if (looksLikeJson) {
    return JSON.parse(raw);
  }

  if (looksLikeYaml) {
    return parseLatestYml(raw);
  }

  try {
    return JSON.parse(raw);
  } catch (_error) {
    return parseLatestYml(raw);
  }
};

const ensureDir = async (dirPath) => {
  await fsp.mkdir(dirPath, { recursive: true });
};

const hashFile = (filePath, algorithm, encoding) =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest(encoding)));
    stream.on("error", reject);
  });

const downloadFile = (url, destinationPath, onProgress, redirectCount = 0) =>
  new Promise((resolve, reject) => {
    if (redirectCount > UPDATE_MAX_REDIRECTS) {
      reject(new Error("Download exceeded redirect limit"));
      return;
    }

    const client = getHttpClient(url);
    let settled = false;

    const finishError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      void fsp.rm(destinationPath, { force: true }).catch(() => undefined);
      reject(error);
    };

    const finishSuccess = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(destinationPath);
    };

    const request = client.get(url, { timeout: UPDATE_REQUEST_TIMEOUT_MS }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        resolve(
          downloadFile(toAbsoluteUrl(url, response.headers.location), destinationPath, onProgress, redirectCount + 1)
        );
        return;
      }

      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`Download failed with status ${response.statusCode || "unknown"}`));
        return;
      }

      const output = fs.createWriteStream(destinationPath);
      const totalBytes = Number(response.headers["content-length"] || 0);

      if (Number.isFinite(totalBytes) && totalBytes > UPDATE_MAX_INSTALLER_BYTES) {
        response.destroy(new Error(`Installer exceeds max size (${UPDATE_MAX_INSTALLER_BYTES} bytes)`));
        output.destroy();
        return;
      }

      let receivedBytes = 0;

      response.on("data", (chunk) => {
        receivedBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);

        if (receivedBytes > UPDATE_MAX_INSTALLER_BYTES) {
          response.destroy(new Error(`Installer exceeds max size (${UPDATE_MAX_INSTALLER_BYTES} bytes)`));
          output.destroy(new Error(`Installer exceeds max size (${UPDATE_MAX_INSTALLER_BYTES} bytes)`));
          return;
        }

        if (typeof onProgress === "function" && totalBytes > 0) {
          const ratio = Math.min(1, receivedBytes / totalBytes);
          onProgress(Math.round(ratio * 100));
        }
      });

      response.pipe(output);

      output.on("finish", () => {
        output.close(() => finishSuccess());
      });
      output.on("error", finishError);
      response.on("error", finishError);
    });

    request.on("timeout", () => {
      request.destroy(new Error("Download timed out"));
    });
    request.on("error", finishError);
  });

const getManifestFields = (manifest) => {
  const latestInternalVersion = String(
    manifest.internalVersion || manifest.version || manifest.latestVersion || ""
  ).trim();
  const installerUrl = String(
    manifest.installerUrl ||
      manifest.url ||
      manifest.path ||
      (Array.isArray(manifest.files) && manifest.files[0] && manifest.files[0].url) ||
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
  const sha512 = String(
    manifest.sha512 ||
      (Array.isArray(manifest.files) && manifest.files[0] && manifest.files[0].sha512) ||
      ""
  ).trim();
  const releaseNotes = String(manifest.notes || manifest.releaseNotes || "").trim();
  const latestDisplayVersion = formatDisplayVersion(
    String(
      manifest.displayVersion ||
        manifest.latestDisplayVersion ||
        extractDisplayVersionFromInstallerUrl(installerUrl) ||
        latestInternalVersion
    ).trim()
  );

  return {
    latestVersion: latestDisplayVersion,
    latestInternalVersion,
    installerUrl,
    sha256,
    sha512,
    releaseNotes,
  };
};

const installDownloadedUpdate = async (installerPath) => {
  const normalizedInstallerPath = String(installerPath || "").trim();
  if (!normalizedInstallerPath) {
    throw new Error("No installer path was provided for update installation");
  }

  if (!fs.existsSync(normalizedInstallerPath)) {
    throw new Error(`Downloaded installer was not found: ${normalizedInstallerPath}`);
  }

  const installerProcess = spawn(normalizedInstallerPath, ["/S", "--updated"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });

  installerProcess.unref();
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
      currentVersion: getCurrentDisplayVersion(),
      currentInternalVersion: app.getVersion(),
    },
    onStateChange
  );

  try {
    const manifestDocument = await fetchManifestDocument(UPDATE_MANIFEST_URL);
    const manifest = parseManifestDocument(manifestDocument);
    const { latestVersion, latestInternalVersion, installerUrl, sha256, sha512, releaseNotes } = getManifestFields(manifest);
    const currentVersion = getCurrentDisplayVersion();
    const currentInternalVersion = app.getVersion();

    if (!latestInternalVersion || !installerUrl) {
      throw new Error("Manifest missing required fields: version and installerUrl");
    }

    cachedManifest = {
      latestVersion: latestInternalVersion,
      latestDisplayVersion: latestVersion,
      installerUrl: toAbsoluteUrl(manifestDocument.requestUrl || manifestDocument.url || UPDATE_MANIFEST_URL, installerUrl),
      sha256,
      sha512,
      releaseNotes,
    };

    if (!isVersionNewer(latestInternalVersion, currentInternalVersion)) {
      setUpdaterState(
        {
          status: "up-to-date",
          currentVersion,
          latestVersion,
          currentInternalVersion,
          latestInternalVersion,
          releaseNotes,
          progress: 0,
          requiresRestart: false,
          message: "You are up to date.",
          notification: null,
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
        currentInternalVersion,
        latestInternalVersion,
        releaseNotes,
        progress: 0,
        requiresRestart: false,
        message: `Update ${latestVersion} is available.`,
        notification: {
          status: "update-available",
          version: latestVersion || latestInternalVersion,
          title: "In-Accord update available",
          body: `Version ${latestVersion || latestInternalVersion} is now available.`,
        },
      },
      onStateChange
    );

    if (UPDATE_AUTO_DOWNLOAD && !cachedInstallerPath && !backgroundDownloadPromise) {
      backgroundDownloadPromise = downloadAndPrepareUpdate({ onStateChange }).finally(() => {
        backgroundDownloadPromise = null;
      });
    }

    return getUpdaterState();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown update error";
    setUpdaterState(
      {
        status: "error",
        message,
        requiresRestart: false,
        notification: null,
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
        notification: null,
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
        latestVersion: cachedManifest.latestDisplayVersion || formatDisplayVersion(cachedManifest.latestVersion),
        latestInternalVersion: cachedManifest.latestVersion,
        releaseNotes: cachedManifest.releaseNotes || "",
        progress: 0,
        requiresRestart: false,
        message: "Downloading update...",
        notification: null,
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
      const downloadedSha = await hashFile(installerPath, "sha256", "hex");
      if (downloadedSha !== cachedManifest.sha256) {
        await fsp.rm(installerPath, { force: true });
        throw new Error("Downloaded installer failed integrity verification");
      }
    }

    if (cachedManifest.sha512) {
      const downloadedSha512 = await hashFile(installerPath, "sha512", "base64");
      if (downloadedSha512 !== cachedManifest.sha512) {
        await fsp.rm(installerPath, { force: true });
        throw new Error("Downloaded installer failed SHA-512 integrity verification");
      }
    }

    cachedInstallerPath = installerPath;
    setUpdaterState(
      {
        status: "ready-to-restart",
        progress: 100,
        requiresRestart: true,
        message: `Update ${cachedManifest.latestDisplayVersion || formatDisplayVersion(cachedManifest.latestVersion)} downloaded. Restart required to install.`,
        notification: {
          status: "ready-to-restart",
          version: cachedManifest.latestDisplayVersion || formatDisplayVersion(cachedManifest.latestVersion),
          title: "In-Accord update ready",
          body: "The update finished downloading and is ready to install.",
        },
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
        notification: null,
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
        notification: null,
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
  }, 2_000);

  const periodicTimer = setInterval(() => {
    void checkForUpdatesNow({ onStateChange });
  }, Math.max(60_000, UPDATE_CHECK_INTERVAL_MS));

  return () => {
    clearTimeout(initialTimer);
    clearInterval(periodicTimer);
  };
};

module.exports = {
  consumeUpdaterNotificationSignal,
  getUpdaterState,
  checkForUpdatesNow,
  downloadAndPrepareUpdate,
  restartAndInstallUpdate,
  startUpdateLoop,
};
