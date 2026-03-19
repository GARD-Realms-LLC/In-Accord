import { access, copyFile, mkdir } from "fs/promises";
import os from "os";
import path from "path";

const FILE_DATA_DISABLED = String(process.env.INACCORD_DISABLE_FILE_DATA ?? "").trim() === "1";
const STANDALONE_BUILD_ACTIVE = String(process.env.NEXT_OUTPUT_MODE ?? "").trim() === "standalone";

const normalizeConfiguredPath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(trimmed);
};

const resolveOsRuntimeBaseDir = () => {
  if (process.platform === "win32") {
    const windowsBase = String(process.env.LOCALAPPDATA ?? process.env.APPDATA ?? "").trim();
    if (windowsBase) {
      return path.join(windowsBase, "In-Accord", "runtime-data");
    }

    return path.join(os.homedir(), "AppData", "Local", "In-Accord", "runtime-data");
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "In-Accord", "runtime-data");
  }

  const xdgStateHome = String(process.env.XDG_STATE_HOME ?? "").trim();
  if (xdgStateHome) {
    return path.join(xdgStateHome, "In-Accord", "runtime-data");
  }

  return path.join(os.homedir(), ".local", "state", "In-Accord", "runtime-data");
};

export const RUNTIME_DATA_DIR = (() => {
  if (FILE_DATA_DISABLED || STANDALONE_BUILD_ACTIVE) {
    return path.join(process.cwd(), ".runtime-data-disabled");
  }

  const configured = normalizeConfiguredPath(String(process.env.INACCORD_RUNTIME_DATA_DIR ?? ""));
  return configured || resolveOsRuntimeBaseDir();
})();

export const LEGACY_WORKSPACE_DATA_DIR = path.join(process.cwd(), ".data");

const pathExists = async (targetPath: string) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

export const ensureLegacyRuntimeStoreMigrated = async (fileName: string) => {
  const normalizedFileName = String(fileName ?? "").trim();
  if (!normalizedFileName) {
    return;
  }

  const runtimeStoresDir = path.join(RUNTIME_DATA_DIR, "stores");
  const runtimeFile = path.join(runtimeStoresDir, normalizedFileName);
  const legacyFile = path.join(LEGACY_WORKSPACE_DATA_DIR, normalizedFileName);

  const runtimeExists = await pathExists(runtimeFile);
  if (runtimeExists) {
    return;
  }

  const legacyExists = await pathExists(legacyFile);
  if (!legacyExists) {
    return;
  }

  await mkdir(runtimeStoresDir, { recursive: true });
  await copyFile(legacyFile, runtimeFile);
};
