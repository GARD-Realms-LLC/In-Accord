const { execFileSync } = require("node:child_process");
const path = require("node:path");

const rootDir = process.cwd();
const nextCliPath = path.join(rootDir, "node_modules", "next", "dist", "bin", "next");
const openNextCliPath = path.join(
  rootDir,
  "node_modules",
  "@opennextjs",
  "cloudflare",
  "dist",
  "cli",
  "index.js"
);

const shouldCompileOpenNext = !["1", "true", "yes"].includes(
  String(process.env.INACCORD_SKIP_OPENNEXT_COMPILE ?? "").trim().toLowerCase()
);

const env = {
  ...process.env,
  INACCORD_DISABLE_FILE_DATA: "1",
  ...(shouldCompileOpenNext ? { NEXT_OUTPUT_MODE: "standalone" } : {}),
};

const runNode = (scriptPath, args = []) => {
  execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: rootDir,
    env,
    stdio: "inherit",
  });
};

try {
  runNode(path.join(rootDir, "scripts", "repair-next-install.cjs"));
  runNode(nextCliPath, ["build", "--webpack"]);
  runNode(path.join(rootDir, "scripts", "sanitize-cloudflare-traces.cjs"));

  if (shouldCompileOpenNext) {
    runNode(path.join(rootDir, "scripts", "patch-opennext-prefetch-hints.cjs"));
    runNode(openNextCliPath, ["build", "--skipBuild", "--config", "wrangler.jsonc", "--skipWranglerConfigCheck"]);
    runNode(path.join(rootDir, "scripts", "patch-opennext-prefetch-hints.cjs"));
  }
} catch (error) {
  process.exit(typeof error?.status === "number" ? error.status : 1);
}
