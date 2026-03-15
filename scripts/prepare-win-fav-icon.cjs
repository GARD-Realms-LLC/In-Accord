const fs = require("fs");
const path = require("path");

function main() {
  const root = path.join(__dirname, "..");
  const generatedIcon = path.join(root, "Images", "app-icon.ico");
  const fallbackIcon = path.join(root, "Images", "fav.ico");
  const sourceIcon = fs.existsSync(generatedIcon) ? generatedIcon : fallbackIcon;
  const configuredOutputDir = process.env.BUILD_OUTPUT_DIR || path.join("Desktop", "builder-assets");
  const outputDir = path.isAbsolute(configuredOutputDir)
    ? configuredOutputDir
    : path.join(root, configuredOutputDir);
  const primaryTargetIcon = path.join(outputDir, "app-icon.ico");
  const targetIcon = path.join(outputDir, "fav.ico");

  if (!fs.existsSync(sourceIcon)) {
    throw new Error(`Required icon is missing: ${sourceIcon}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(sourceIcon, primaryTargetIcon);
  fs.copyFileSync(sourceIcon, targetIcon);

  console.log(
    `Prepared Windows icons: ${path.relative(root, primaryTargetIcon)} and ${path.relative(root, targetIcon)}`
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[prepare-win-fav-icon] ${message}`);
  process.exit(1);
}
