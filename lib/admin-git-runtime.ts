import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type AdminGitRuntimeStatus = {
  gitBinaryAvailable: boolean;
  repoRoot: string | null;
  workTreeAvailable: boolean;
  mode: "local-git" | "unavailable";
  reason:
    | "ok"
    | "git-binary-missing"
    | "repo-not-found"
    | "git-command-failed";
  message: string;
};

type GitCommandResult = {
  stdout: string;
  stderr: string;
};

const WINDOWS_DRIVE_ROOT_PATTERN = /^[A-Za-z]:\\?$/;

const normalizeOutput = (value: string | Buffer | null | undefined) => String(value ?? "").trim();

const getCandidateRoots = () => {
  const candidates = new Set<string>();
  const cwd = process.cwd();
  const initCwd = String(process.env.INIT_CWD ?? "").trim();
  const configuredRoot = String(process.env.INACCORD_REPO_ROOT ?? "").trim();

  for (const candidate of [cwd, initCwd, configuredRoot]) {
    if (candidate) {
      candidates.add(path.resolve(candidate));
    }
  }

  let current = path.resolve(cwd);
  while (true) {
    candidates.add(current);

    const parent = path.dirname(current);
    if (parent === current || WINDOWS_DRIVE_ROOT_PATTERN.test(current)) {
      break;
    }

    current = parent;
  }

  return Array.from(candidates);
};

const hasGitMarker = (candidate: string) => {
  try {
    return fs.existsSync(path.join(candidate, ".git"));
  } catch {
    return false;
  }
};

const formatGitError = (args: string[], stdout: string, stderr: string) => {
  const detail = stderr || stdout || "Git command failed.";
  return `git ${args.join(" ")}: ${detail}`;
};

const runGit = async (cwd: string, args: string[]): Promise<GitCommandResult> => {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 16,
    });

    return {
      stdout: normalizeOutput(stdout),
      stderr: normalizeOutput(stderr),
    };
  } catch (error) {
    const stdout = normalizeOutput((error as { stdout?: string | Buffer | null })?.stdout);
    const stderr = normalizeOutput((error as { stderr?: string | Buffer | null })?.stderr);
    throw new Error(formatGitError(args, stdout, stderr));
  }
};

export const resolveAdminGitRuntime = async (): Promise<AdminGitRuntimeStatus> => {
  let gitBinaryAvailable = true;

  for (const candidate of getCandidateRoots()) {
    if (!hasGitMarker(candidate)) {
      continue;
    }

    try {
      const result = await runGit(candidate, ["rev-parse", "--show-toplevel"]);
      const repoRoot = result.stdout ? path.resolve(result.stdout) : path.resolve(candidate);

      return {
        gitBinaryAvailable: true,
        repoRoot,
        workTreeAvailable: true,
        mode: "local-git",
        reason: "ok",
        message: `Local Git workspace available at ${repoRoot}.`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Git command failed.";

      if (/not recognized|enoent|spawn git/i.test(message)) {
        gitBinaryAvailable = false;
        break;
      }
    }
  }

  if (!gitBinaryAvailable) {
    return {
      gitBinaryAvailable: false,
      repoRoot: null,
      workTreeAvailable: false,
      mode: "unavailable",
      reason: "git-binary-missing",
      message: "Git is not available in this runtime.",
    };
  }

  const fallbackRoots = getCandidateRoots();
  for (const candidate of fallbackRoots) {
    try {
      const result = await runGit(candidate, ["rev-parse", "--show-toplevel"]);
      const repoRoot = result.stdout ? path.resolve(result.stdout) : path.resolve(candidate);

      return {
        gitBinaryAvailable: true,
        repoRoot,
        workTreeAvailable: true,
        mode: "local-git",
        reason: "ok",
        message: `Local Git workspace available at ${repoRoot}.`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Git command failed.";

      if (/not recognized|enoent|spawn git/i.test(message)) {
        return {
          gitBinaryAvailable: false,
          repoRoot: null,
          workTreeAvailable: false,
          mode: "unavailable",
          reason: "git-binary-missing",
          message: "Git is not available in this runtime.",
        };
      }
    }
  }

  return {
    gitBinaryAvailable: true,
    repoRoot: null,
    workTreeAvailable: false,
    mode: "unavailable",
    reason: "repo-not-found",
    message:
      "No local Git work tree was found for this runtime. Start the app from the repo workspace so PUSH can use the local checkout.",
  };
};

export const runAdminGit = async (repoRoot: string, args: string[]) => runGit(repoRoot, args);