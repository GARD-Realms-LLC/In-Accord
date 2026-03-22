const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const PACKAGED_PORT = Number.parseInt(process.env.INACCORD_DESKTOP_PORT || "3210", 10);

const getNpmCommand = () => (process.platform === "win32" ? "npm.cmd" : "npm");

const pathExists = async (targetPath) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const normalizeConfiguredHttpOrigin = (value) => {
  const normalized = String(value || "").trim().replace(/\/$/, "");
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    const hostname = String(parsed.hostname || "").trim().toLowerCase();

    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !hostname ||
      hostname === "localhost" ||
      hostname === "::1" ||
      hostname.startsWith("127.")
    ) {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
};

const resolveConfiguredDesktopStartUrl = (env = process.env) => {
  const configuredOrigin =
    normalizeConfiguredHttpOrigin(env.INACCORD_DESKTOP_START_URL) ||
    normalizeConfiguredHttpOrigin(env.NEXT_PUBLIC_SITE_URL);

  if (!configuredOrigin) {
    throw new Error(
      "Desktop start URL is not configured. Set INACCORD_DESKTOP_START_URL or NEXT_PUBLIC_SITE_URL to a non-loopback absolute http(s) origin.",
    );
  }

  return configuredOrigin;
};

const waitForUrl = async (url, { timeoutMs = 180_000, intervalMs = 500 } = {}) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
      });

      if (response) {
        return true;
      }
    } catch {
      // Retry until the timeout expires.
    }

    await wait(intervalMs);
  }

  throw new Error(`Timed out waiting for ${url}`);
};

const runCommand = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT_DIR,
      env: options.env || process.env,
      stdio: options.stdio || "inherit",
      shell: process.platform === "win32",
      windowsHide: true,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });
  });

const copyDirectory = async (sourcePath, targetPath) => {
  if (!(await pathExists(sourcePath))) {
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.cp(sourcePath, targetPath, { recursive: true, force: true });
};

const normalizeInAppPath = (value, fallback = "/") => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return fallback;
  }

  if (/^https?:\/\//i.test(normalized)) {
    try {
      const parsed = new URL(normalized);
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || fallback;
    } catch {
      return fallback;
    }
  }

  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return fallback;
  }

  return normalized;
};

module.exports = {
  ROOT_DIR,
  PACKAGED_PORT,
  getNpmCommand,
  pathExists,
  resolveConfiguredDesktopStartUrl,
  waitForUrl,
  runCommand,
  copyDirectory,
  normalizeInAppPath,
};
