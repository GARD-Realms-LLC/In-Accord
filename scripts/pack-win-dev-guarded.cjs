const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const distDir = path.join(root, "dist");
const stableOutputDir = path.join(distDir, "Win Dev");
const rollingBuildsDir = path.join(distDir, ".win-dev-builds");
const cacheTmpDir = path.join(root, ".electron-cache", "tmp");
const stablePendingDir = path.join(distDir, "Win Dev.__next");
const stableBackupDir = path.join(distDir, "Win Dev.__old");

const timestamp = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
};

const run = (command, env = {}) => {
  console.log(`\n[pack-win-dev-guarded] > ${command}`);

  const result = spawnSync(command, {
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: {
      ...process.env,
      ...env,
    },
  });

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command}`);
  }
};

const removePathIfExists = (targetPath) => {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to remove ${targetPath}: ${message}`);
  }
};

const copyDir = (fromDir, toDir) => {
  fs.cpSync(fromDir, toDir, { recursive: true, force: true });
};

const promoteStagedBuildToStable = (stageDir) => {
  removePathIfExists(stablePendingDir);
  removePathIfExists(stableBackupDir);

  copyDir(stageDir, stablePendingDir);

  if (fs.existsSync(stableOutputDir)) {
    fs.renameSync(stableOutputDir, stableBackupDir);
  }

  fs.renameSync(stablePendingDir, stableOutputDir);

  removePathIfExists(stableBackupDir);
};

const writeHowToRunFile = (stageDir) => {
  const exePath = path.join(stageDir, "win-unpacked", "In-Accord-V2.exe");
  const notesPath = path.join(distDir, "WIN_DEV_README.txt");

  const lines = [
    "In-Accord Win Dev test build",
    "",
    `Stable path: ${stableOutputDir}`,
    `Current build: ${stageDir}`,
    "",
    "Run:",
    `  ${path.join(stableOutputDir, "win-unpacked", "In-Accord-V2.exe")}`,
    "",
    "If the stable path is temporarily unavailable, run current build directly:",
    `  ${exePath}`,
    "",
    "Note: this guarded build flow writes to a fresh folder each run, then copies/switches",
    "to a real 'Win Dev' directory (no redirects/junctions used).",
  ];

  fs.writeFileSync(notesPath, `${lines.join("\n")}\n`, "utf8");
};

function main() {
  fs.mkdirSync(rollingBuildsDir, { recursive: true });
  fs.mkdirSync(cacheTmpDir, { recursive: true });

  const stageDir = path.join(rollingBuildsDir, `build-${timestamp()}`);
  const stageDirRelative = path.relative(root, stageDir);

  console.log("[pack-win-dev-guarded] Building Win Dev package in isolated staging output...");
  console.log(`[pack-win-dev-guarded] Stage output: ${stageDir}`);

  run("npm run clean:next");
  run("npm run prepare:win-fav-icon", {
    BUILD_OUTPUT_DIR: stageDir,
  });

  run("next build", {
    BUILD_OUTPUT_DIR: stageDir,
  });

  const builderOutput = stageDirRelative.split(path.sep).join("/");
  const iconPath = path.join(stageDir, "fav.ico").split(path.sep).join("/");

  run(
    `electron-builder --dir --win --x64 -c.directories.output=\"${builderOutput}\" -c.win.icon=\"${iconPath}\" -c.win.signAndEditExecutable=false`,
    {
      ELECTRON_CACHE: ".electron-cache\\electron",
      ELECTRON_BUILDER_CACHE: ".electron-cache\\builder",
      TEMP: cacheTmpDir,
      TMP: cacheTmpDir,
      BUILD_OUTPUT_DIR: stageDir,
    }
  );

  promoteStagedBuildToStable(stageDir);
  writeHowToRunFile(stageDir);

  console.log("\n[pack-win-dev-guarded] ✅ Win Dev package ready");
  console.log(`[pack-win-dev-guarded] Stable test path: ${stableOutputDir}`);
  console.log(`[pack-win-dev-guarded] Current staged build: ${stageDir}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n[pack-win-dev-guarded] ❌ ${message}`);
  process.exit(1);
}
