import { access, copyFile, mkdir } from "fs/promises";
import path from "path";

const isFileDataDisabled = () => String(process.env.INACCORD_DISABLE_FILE_DATA ?? "").trim() === "1";
const isStandaloneBuildActive = () => String(process.env.NEXT_OUTPUT_MODE ?? "").trim() === "standalone";
const DISABLED_RUNTIME_DATA_DIR_NAME = ".runtime-data-disabled";
const DEFAULT_RUNTIME_DATA_DIR_NAME = ".runtime-data";

const normalizeConfiguredPath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(trimmed);
};

export const getRuntimeDataDir = () => {
  if (isFileDataDisabled() || isStandaloneBuildActive()) {
    return path.join(process.cwd(), DISABLED_RUNTIME_DATA_DIR_NAME);
  }

  const configured = normalizeConfiguredPath(String(process.env.INACCORD_RUNTIME_DATA_DIR ?? ""));
  return configured || path.join(process.cwd(), DEFAULT_RUNTIME_DATA_DIR_NAME);
};

export const getLegacyWorkspaceDataDir = () => path.join(process.cwd(), ".data");

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

  const runtimeStoresDir = path.join(getRuntimeDataDir(), "stores");
  const runtimeFile = path.join(runtimeStoresDir, normalizedFileName);
  const legacyFile = path.join(getLegacyWorkspaceDataDir(), normalizedFileName);

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
