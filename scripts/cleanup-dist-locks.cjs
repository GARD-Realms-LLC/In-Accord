const fs = require("fs");
const path = require("path");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const removeWithRetries = async (targetPath, retries = 12, delayMs = 500) => {
  for (let i = 0; i < retries; i += 1) {
    if (!fs.existsSync(targetPath)) {
      return true;
    }

    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } catch (_error) {
      // ignore and retry
    }

    if (!fs.existsSync(targetPath)) {
      return true;
    }

    await sleep(delayMs);
  }

  return !fs.existsSync(targetPath);
};

async function main() {
  const root = path.join(__dirname, "..");
  const configuredOutputDir = process.env.BUILD_OUTPUT_DIR || path.join("Desktop", "win64");
  const outputDir = path.isAbsolute(configuredOutputDir)
    ? configuredOutputDir
    : path.join(root, configuredOutputDir);

  const lockTargets = [outputDir];

  for (const target of lockTargets) {
    await removeWithRetries(target);
  }

  console.log(`Build output lock cleanup complete for: ${outputDir}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[cleanup-dist-locks] ${message}`);
  process.exit(1);
});
