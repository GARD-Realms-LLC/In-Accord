const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT_DIR, "build-metadata.json");
const GIT_EXECUTABLE = "git";
const COMMIT_PRETTY_FORMAT = "%H%x1f%h%x1f%s%x1f%an%x1f%cI";
const SAFE_ROOT_DIR = ROOT_DIR.replace(/\\/g, "/");

const runGit = async (args) => {
  const { stdout } = await execFileAsync(
    GIT_EXECUTABLE,
    ["-c", `safe.directory=${SAFE_ROOT_DIR}`, ...args],
    {
      cwd: ROOT_DIR,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 16,
    },
  );

  return String(stdout ?? "").trim();
};

const parseCommitRows = (value) =>
  String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, shortSha, message, author, committedAt] =
        line.split("\u001f");
      if (!sha || !shortSha || !message || !author || !committedAt) {
        return null;
      }

      return {
        sha,
        shortSha,
        message,
        author,
        committedAt,
      };
    })
    .filter(Boolean);

const main = async () => {
  const buildTimestamp = new Date().toISOString();
  let branch =
    process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || null;
  let commitSha =
    process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null;
  let commits = [];

  try {
    const [resolvedBranch, resolvedCommitSha, commitLog] = await Promise.all([
      branch ? Promise.resolve(branch) : runGit(["branch", "--show-current"]),
      commitSha ? Promise.resolve(commitSha) : runGit(["rev-parse", "HEAD"]),
      runGit(["log", "-n", "12", `--pretty=format:${COMMIT_PRETTY_FORMAT}`]),
    ]);

    branch = String(resolvedBranch ?? "").trim() || branch;
    commitSha = String(resolvedCommitSha ?? "").trim() || commitSha;
    commits = parseCommitRows(commitLog);
  } catch (error) {
    console.warn(
      "[WRITE_BUILD_METADATA]",
      error instanceof Error ? error.message : error,
    );
  }

  const payload = {
    buildTimestamp,
    branch: branch || null,
    commitSha: commitSha || null,
    commits,
  };

  await fs.writeFile(
    OUTPUT_PATH,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
  console.log(`[build-metadata] wrote ${OUTPUT_PATH}`);
};

main().catch((error) => {
  console.error("[WRITE_BUILD_METADATA]", error);
  process.exit(1);
});
