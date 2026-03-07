#!/usr/bin/env node

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const distDir = path.join(root, "dist", "win64");

function run(command, extraEnv = {}) {
  console.log(`\n[build:release:strict] > ${command}`);
  const result = spawnSync(command, {
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command}`);
  }
}

function runWithSingleRetry(command, retryNote, extraEnv = {}) {
  try {
    run(command, extraEnv);
  } catch (error) {
    console.warn(`\n[build:release:strict] ⚠ ${retryNote}`);
    run(command, extraEnv);
  }
}

function readPackageVersion() {
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  return pkg.version;
}

function ensureFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function findInstallerExePath(version) {
  const exes = fs
    .readdirSync(distDir)
    .filter(
      (name) =>
        name.toLowerCase().endsWith(".exe") &&
        !name.toLowerCase().includes("__uninstaller") &&
        name.includes(version)
    )
    .map((name) => path.join(distDir, name));

  if (exes.length === 0) {
    throw new Error(`Installer EXE not found for version ${version} in ${distDir}`);
  }

  if (exes.length > 1) {
    throw new Error(
      `Multiple installer EXEs found for version ${version}: ${exes
        .map((p) => path.basename(p))
        .join(", ")}`
    );
  }

  return exes[0];
}

function verifyLatestYmlContainsVersion(version, latestYmlPath) {
  const text = fs.readFileSync(latestYmlPath, "utf8");
  if (!text.includes(version)) {
    throw new Error(`latest.yml does not contain expected version ${version}`);
  }
}

function main() {
  console.log("[build:release:strict] Starting strict release build...");

  run("npm run cleanup:dist-locks");
  run("npm run clean:next");
  run("npm run version:bump:patch");
  runWithSingleRetry(
    "npm run build",
    "Build failed on first attempt; retrying once after transient Next.js trace/artifact issue..."
  );
  run("npm run prepare:win-fav-icon");
  run('node -e "require(\'fs\').mkdirSync(\'.electron-cache/tmp\',{recursive:true})"');
  run(
    "npx electron-builder --win nsis --x64 -c.directories.output=dist/win64 -c.win.signAndEditExecutable=false",
    {
      ELECTRON_CACHE: ".electron-cache/electron",
      ELECTRON_BUILDER_CACHE: ".electron-cache/builder",
      TEMP: path.join(root, ".electron-cache", "tmp"),
      TMP: path.join(root, ".electron-cache", "tmp"),
      BUILD_OUTPUT_DIR: "dist/win64",
    }
  );

  const version = readPackageVersion();
  const latestYml = path.join(distDir, "latest.yml");
  ensureFileExists(latestYml, "latest.yml");

  const setupExe = findInstallerExePath(version);
  const blockmap = `${setupExe}.blockmap`;
  ensureFileExists(setupExe, "Installer EXE");
  ensureFileExists(blockmap, "Installer blockmap");
  verifyLatestYmlContainsVersion(version, latestYml);

  console.log("\n[build:release:strict] ✅ Build + artifact verification passed");
  console.log(`[build:release:strict] Version: ${version}`);
  console.log(`[build:release:strict] Installer: ${setupExe}`);
}

try {
  main();
} catch (error) {
  console.error(`\n[build:release:strict] ❌ ${error.message}`);
  process.exit(1);
}
