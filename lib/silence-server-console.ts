import fs from "node:fs";
import os from "node:os";
import path from "node:path";

declare global {
  // eslint-disable-next-line no-var
  var __inaccordConsoleSilenced: boolean | undefined;
  // eslint-disable-next-line no-var
  var __inaccordConsoleLogPatched: boolean | undefined;
}

const shouldSilence = (process.env.ENABLE_SERVER_LOGS ?? "false").toLowerCase() !== "true";
const maxLogSizeBytes = 10 * 1024 * 1024;
const workspaceRoot = path.resolve(process.cwd());
const defaultServerLogDir = path.join(os.tmpdir(), "in-accord", "logs");
const configuredServerLogFile = String(process.env.SERVER_LOG_FILE ?? "").trim();

const isPathInsideWorkspace = (targetPath: string) => {
  const relativePath = path.relative(workspaceRoot, targetPath);
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
};

const resolveServerLogPath = () => {
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

const formatLogMessage = (args: unknown[]) => {
  return args
    .map((arg) => {
      if (typeof arg === "string") {
        return arg;
      }

      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
};

const deleteLogFileWhenTooLarge = () => {
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
