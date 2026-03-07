const fs = require("fs");
const path = require("path");

function main() {
  const root = path.join(__dirname, "..");
  const sourceIcon = path.join(root, "Images", "fav.ico");
  const configuredOutputDir = process.env.BUILD_OUTPUT_DIR || path.join("dist", "win64");
  const outputDir = path.isAbsolute(configuredOutputDir)
    ? configuredOutputDir
    : path.join(root, configuredOutputDir);
  const targetIcon = path.join(outputDir, "fav.ico");

  if (!fs.existsSync(sourceIcon)) {
    throw new Error(`Required icon is missing: ${sourceIcon}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(sourceIcon, targetIcon);

  console.log(`Prepared fixed Windows icon: ${path.relative(root, targetIcon)}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[prepare-win-fav-icon] ${message}`);
  process.exit(1);
}
