import "server-only";

type FsModule = typeof import("fs");
type OsModule = typeof import("os");
type PathModule = typeof import("path");

let cachedFsModule: FsModule | null = null;
let cachedOsModule: OsModule | null = null;
let cachedPathModule: PathModule | null = null;

const getBuiltinModule = <T,>(id: string): T | null => {
  const builtinLoader = (process as typeof process & {
    getBuiltinModule?: (moduleName: string) => T | undefined;
  }).getBuiltinModule;

  if (typeof builtinLoader === "function") {
    const loaded = builtinLoader(id);
    if (loaded) {
      return loaded;
    }
  }

  return null;
};

const getFsModule = (): FsModule | null => {
  if (cachedFsModule) {
    return cachedFsModule;
  }

  cachedFsModule = getBuiltinModule<FsModule>("fs");
  return cachedFsModule;
};

const getOsModule = (): OsModule | null => {
  if (cachedOsModule) {
    return cachedOsModule;
  }

  cachedOsModule = getBuiltinModule<OsModule>("os");
  return cachedOsModule;
};

const getPathModule = (): PathModule | null => {
  if (cachedPathModule) {
    return cachedPathModule;
  }

  cachedPathModule = getBuiltinModule<PathModule>("path");
  return cachedPathModule;
};

declare global {
  // eslint-disable-next-line no-var
  var __inaccordConsoleSilenced: boolean | undefined;
  // eslint-disable-next-line no-var
  var __inaccordConsoleLogPatched: boolean | undefined;
}

const shouldSilence = (process.env.ENABLE_SERVER_LOGS ?? "false").toLowerCase() !== "true";
const maxLogSizeBytes = 10 * 1024 * 1024;
const path = getPathModule();
const fs = getFsModule();
const os = getOsModule();
const canWriteServerLog =
  path !== null &&
  fs !== null &&
  os !== null;
const workspaceRoot = canWriteServerLog ? path.resolve(process.cwd()) : "";
const defaultServerLogDir = canWriteServerLog
  ? path.join(os.tmpdir(), "in-accord", "logs")
  : "";
const configuredServerLogFile = String(process.env.SERVER_LOG_FILE ?? "").trim();

const isPathInsideWorkspace = (targetPath: string) => {
  if (!canWriteServerLog || !path) {
    return false;
  }

  const relativePath = path.relative(workspaceRoot, targetPath);
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
};

const resolveServerLogPath = () => {
  if (!canWriteServerLog || !path) {
    return null;
  }

  const fallbackPath = path.join(defaultServerLogDir, "server.log");

  if (!configuredServerLogFile) {
    return fallbackPath;
  }

  const configuredPath = path.isAbsolute(configuredServerLogFile)
    ? path.normalize(configuredServerLogFile)
    : path.join(defaultServerLogDir, configuredServerLogFile.replace(/^([.][\\/])+/, ""));

  if (isPathInsideWorkspace(configuredPath)) {
    return path.join(defaultServerLogDir, path.basename(configuredPath) || "server.log");
  }

  return configuredPath;
};

const serverLogPath = resolveServerLogPath();

const formatErrorForLog = (
  error: Error,
  seen = new WeakSet<object>(),
): Record<string, unknown> => {
  if (seen.has(error)) {
    return { name: error.name, message: error.message, circular: true };
  }

  seen.add(error);

  const next: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack ?? null,
  };

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    next.cause = formatErrorForLog(cause, seen);
  } else if (cause !== undefined) {
    next.cause = String(cause);
  }

  for (const [key, value] of Object.entries(error)) {
    if (key in next) {
      continue;
    }

    next[key] = value;
  }

  return next;
};

const formatLogValue = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    try {
      return JSON.stringify(formatErrorForLog(value));
    } catch {
      return `${value.name}: ${value.message}`;
    }
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const formatLogMessage = (args: unknown[]) => {
  return args.map((arg) => formatLogValue(arg)).join(" ");
};

const deleteLogFileWhenTooLarge = () => {
  if (!canWriteServerLog || !fs || !serverLogPath) {
    return;
  }

  try {
    if (!fs.existsSync(serverLogPath)) {
      return;
    }

    const stats = fs.statSync(serverLogPath);
    if (stats.size >= maxLogSizeBytes) {
      fs.unlinkSync(serverLogPath);
    }
  } catch {
    // Never break app execution because of logging file management.
  }
};

const writeServerLog = (level: "LOG" | "INFO" | "WARN" | "ERROR", args: unknown[]) => {
  if (!canWriteServerLog || !fs || !path || !serverLogPath) {
    return;
  }

  try {
    fs.mkdirSync(path.dirname(serverLogPath), { recursive: true });
    deleteLogFileWhenTooLarge();

    const line = `[${new Date().toISOString()}] [${level}] ${formatLogMessage(args)}\n`;
    fs.appendFileSync(serverLogPath, line, "utf8");

    deleteLogFileWhenTooLarge();
  } catch {
    // Never break app execution because of logging file management.
  }
};

if (shouldSilence && !globalThis.__inaccordConsoleSilenced) {
  const noop = () => {};

  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.error = noop;

  globalThis.__inaccordConsoleSilenced = true;
}

if (!shouldSilence && !globalThis.__inaccordConsoleLogPatched) {
  const originalLog = console.log.bind(console);
  const originalInfo = console.info.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    originalLog(...args);
    writeServerLog("LOG", args);
  };

  console.info = (...args: unknown[]) => {
    originalInfo(...args);
    writeServerLog("INFO", args);
  };

  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    writeServerLog("WARN", args);
  };

  console.error = (...args: unknown[]) => {
    originalError(...args);
    writeServerLog("ERROR", args);
  };

  globalThis.__inaccordConsoleLogPatched = true;
}

export {};
