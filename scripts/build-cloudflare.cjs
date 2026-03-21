const { execSync } = require("node:child_process");

const env = {
  ...process.env,
  INACCORD_DISABLE_FILE_DATA: "1",
  INACCORD_SKIP_OPENNEXT_COMPILE: "1",
};

try {
  execSync("npm run build", {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });

  execSync("node scripts/sanitize-cloudflare-traces.cjs", {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
} catch (error) {
  process.exit(typeof error?.status === "number" ? error.status : 1);
}
