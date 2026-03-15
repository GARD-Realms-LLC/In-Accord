#!/usr/bin/env node

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const packageManifestPath = path.join(root, "package.json");
const defaultDistDirRelative = path.join("Desktop", "win64");
let distDir = path.join(root, defaultDistDirRelative);
const releaseVersionStatePath = path.join(root, "build", "release-version.json");

const DISPLAY_BASE_MAJOR = 1;
const DISPLAY_BASE_MINOR = 0;
const DISPLAY_BASE_PATCH = 1;
const DISPLAY_MAX_PATCH = 99;
const MIN_INTERNAL_MAJOR = 1;
const MIN_INTERNAL_MINOR = 0;
const MIN_INTERNAL_PATCH = 178;

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

function toRelativeOutputDir(targetDir) {
  const relative = path.relative(root, targetDir);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return targetDir;
  }

  return relative.split(path.sep).join("/");
}

function buildElectronBuilderCommand(outputDir, version, displayVersion) {
  const outputArg = toRelativeOutputDir(outputDir);
  return (
    `npx electron-builder --win nsis --x64 ` +
    `-c.directories.output=${outputArg} ` +
    `-c.extraMetadata.version=${version} ` +
    `-c.extraMetadata.inaccordDisplayVersion=${displayVersion}`
  );
}

function buildElectronBuilderArgs(outputDir, version, displayVersion) {
  return [
    "electron-builder",
    "--win",
    "nsis",
    "--x64",
    `-c.directories.output=${toRelativeOutputDir(outputDir)}`,
    `-c.extraMetadata.version=${version}`,
    `-c.extraMetadata.inaccordDisplayVersion=${displayVersion}`,
  ];
}

function isLockedOutputError(error) {
  const detail = String(error?.message || "").toLowerCase();
  return detail.includes("app.asar") && detail.includes("being used by another process");
}

function runCleanupForOutputDir(outputDir) {
  run("npm run cleanup:dist-locks", {
    BUILD_OUTPUT_DIR: outputDir,
  });
}

function runElectronBuilderWithRetry(version, displayVersion) {
  const sharedEnv = {
    ELECTRON_CACHE: ".electron-cache/electron",
    ELECTRON_BUILDER_CACHE: ".electron-cache/builder",
    TEMP: path.join(root, ".electron-cache", "tmp"),
    TMP: path.join(root, ".electron-cache", "tmp"),
  };

  const attemptBuild = (outputDir) => {
    distDir = outputDir;
    runCleanupForOutputDir(outputDir);
    run(buildElectronBuilderCommand(outputDir, version, displayVersion), {
      ...sharedEnv,
      BUILD_OUTPUT_DIR: outputDir,
    });
  };

  const freshOutputDir = path.join(root, "Desktop", "win64");

  attemptBuild(freshOutputDir);
}

function readPackageManifest() {
  return JSON.parse(fs.readFileSync(packageManifestPath, "utf8"));
}

function snapshotPackageManifest() {
  return fs.readFileSync(packageManifestPath, "utf8");
}

function restorePackageManifest(snapshot) {
  const original = String(snapshot || "");
  if (!original) {
    return;
  }

  const current = fs.existsSync(packageManifestPath)
    ? fs.readFileSync(packageManifestPath, "utf8")
    : "";

  if (current !== original) {
    fs.writeFileSync(packageManifestPath, original, "utf8");
    console.log("[build:release:strict] Restored root package.json after packaging");
  }
}

function parseSemver(version) {
  const versionString = String(version || "").trim();
  const match = versionString.match(/^(\d+)\.(\d+)\.(\d+)$/);

  if (!match) {
    return null;
  }

  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  const patch = Number.parseInt(match[3], 10);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return null;
  }

  return { major, minor, patch };
}

function formatSemver(major, minor, patch) {
  return `${major}.${minor}.${patch}`;
}

function compareSemver(left, right) {
  if (left.major !== right.major) {
    return left.major - right.major;
  }

  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }

  return left.patch - right.patch;
}

function bumpInternalVersion(version) {
  const minInternalVersion = {
    major: MIN_INTERNAL_MAJOR,
    minor: MIN_INTERNAL_MINOR,
    patch: MIN_INTERNAL_PATCH,
  };
  const parsed = parseSemver(version);

  if (!parsed || compareSemver(parsed, minInternalVersion) < 0) {
    return formatSemver(minInternalVersion.major, minInternalVersion.minor, minInternalVersion.patch);
  }

  if (parsed.patch >= 999) {
    return formatSemver(parsed.major, parsed.minor + 1, 0);
  }

  return formatSemver(parsed.major, parsed.minor, parsed.patch + 1);
}

function bumpDisplayVersion(version) {
  const parsed = parseSemver(version);

  if (!parsed) {
    return formatSemver(DISPLAY_BASE_MAJOR, DISPLAY_BASE_MINOR, DISPLAY_BASE_PATCH);
  }

  if (parsed.major < DISPLAY_BASE_MAJOR || parsed.minor < 0 || parsed.patch < 0) {
    return formatSemver(DISPLAY_BASE_MAJOR, DISPLAY_BASE_MINOR, DISPLAY_BASE_PATCH);
  }

  if (parsed.patch >= DISPLAY_MAX_PATCH) {
    return formatSemver(parsed.major, parsed.minor + 1, DISPLAY_BASE_PATCH);
  }

  return formatSemver(parsed.major, parsed.minor, parsed.patch + 1);
}

function readReleaseVersionState(pkg) {
  const fallback = {
    version: String(pkg?.version || "").trim(),
    displayVersion: String(pkg?.inaccordDisplayVersion || pkg?.version || "").trim(),
  };

  if (!fs.existsSync(releaseVersionStatePath)) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(releaseVersionStatePath, "utf8"));
    return {
      version: String(parsed?.version || fallback.version).trim(),
      displayVersion: String(parsed?.displayVersion || fallback.displayVersion).trim(),
    };
  } catch {
    return fallback;
  }
}

function writeReleaseVersionState(version, displayVersion) {
  fs.mkdirSync(path.dirname(releaseVersionStatePath), { recursive: true });
  fs.writeFileSync(
    releaseVersionStatePath,
    `${JSON.stringify({ version, displayVersion }, null, 2)}\n`,
    "utf8"
  );
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    if (typeof process.env[key] === "string" && process.env[key].length > 0) {
      continue;
    }

    let value = match[2] || "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function runProgram(command, args, extraEnv = {}, options = {}) {
  const windowsCmdShims = new Set(["npm", "npx", "pnpm", "yarn"]);
  const resolvedCommand =
    process.platform === "win32" && windowsCmdShims.has(String(command).toLowerCase())
      ? `${command}.cmd`
      : command;
  const renderedArgs = args.join(" ");
  console.log(`\n[build:release:strict] > ${command}${renderedArgs ? ` ${renderedArgs}` : ""}`);
  const result = spawnSync(resolvedCommand, args, {
    cwd: root,
    shell: false,
    stdio: options.stdio || "inherit",
    env: { ...process.env, ...extraEnv },
  });

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command}${renderedArgs ? ` ${renderedArgs}` : ""}`);
  }

  return result;
}

function getConfiguredUpdateManifestUrl() {
  return String(process.env.INACCORD_UPDATE_MANIFEST_URL || "").trim();
}

function getGithubReleaseInfoFromManifestUrl(manifestUrl) {
  const raw = String(manifestUrl || "").trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.hostname.toLowerCase() !== "github.com") {
      return null;
    }

    const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/releases\/(?:latest\/download|download\/v[^/]+)\/[^/]+$/i);
    if (!match) {
      return null;
    }

    return {
      owner: match[1],
      repo: match[2],
      fullRepo: `${match[1]}/${match[2]}`,
    };
  } catch (_error) {
    return null;
  }
}

function buildPublishedAssetUrl(manifestUrl, version, assetFileName) {
  const normalizedManifestUrl = String(manifestUrl || "").trim();
  if (!normalizedManifestUrl) {
    throw new Error("INACCORD_UPDATE_MANIFEST_URL is required for updater publishing");
  }

  const githubReleaseInfo = getGithubReleaseInfoFromManifestUrl(normalizedManifestUrl);
  if (githubReleaseInfo) {
    return `https://github.com/${githubReleaseInfo.fullRepo}/releases/download/v${version}/${assetFileName}`;
  }

  return new URL(assetFileName, normalizedManifestUrl).toString();
}

function formatDisplayVersion(version) {
  const match = String(version).trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return String(version).trim();
  }

  return `${match[1]}.${match[2]}.${String(match[3]).padStart(2, "0")}`;
}

function resolveDisplayVersion(pkg) {
  return formatDisplayVersion(pkg.inaccordDisplayVersion || pkg.version);
}

function ensureFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function getCanonicalInstallerFileName(version) {
  return `In-Accord-Setup-v${version}-x64.exe`;
}

function getCanonicalInstallerPath(version) {
  return path.join(distDir, getCanonicalInstallerFileName(version));
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

function syncLatestYmlVersionMetadata(latestYmlPath, version, displayVersion) {
  const text = fs.readFileSync(latestYmlPath, "utf8");
  const withoutInjectedMetadata = text
    .replace(/^displayVersion:\s*.*\r?\n/gm, "")
    .replace(/^internalVersion:\s*.*\r?\n/gm, "");
  const nextText = `displayVersion: ${displayVersion}\ninternalVersion: ${version}\n${withoutInjectedMetadata}`;
  fs.writeFileSync(latestYmlPath, nextText, "utf8");
}

function syncLatestYmlAssetUrls(latestYmlPath, assetUrl) {
  const normalizedAssetUrl = String(assetUrl || "").trim();
  if (!normalizedAssetUrl) {
    throw new Error("Updater asset URL is required to sync latest.yml paths");
  }

  const text = fs.readFileSync(latestYmlPath, "utf8");
  const nextText = text
    .replace(/^path:\s*.*$/m, `path: ${normalizedAssetUrl}`)
    .replace(/^\s*-\s+url:\s*.*$/m, `  - url: ${normalizedAssetUrl}`);
  fs.writeFileSync(latestYmlPath, nextText, "utf8");
}

function publishUpdaterArtifacts({ manifestUrl, version, displayVersion, latestYmlPath, setupExe, blockmap }) {
  const releaseTag = `v${version}`;
  const publishCommand = String(process.env.INACCORD_UPDATE_PUBLISH_COMMAND || "").trim();
  const publishEnv = {
    INACCORD_UPDATE_MANIFEST_URL: manifestUrl,
    INACCORD_UPDATE_VERSION: version,
    INACCORD_UPDATE_DISPLAY_VERSION: displayVersion,
    INACCORD_UPDATE_RELEASE_TAG: releaseTag,
    INACCORD_UPDATE_LATEST_YML: latestYmlPath,
    INACCORD_UPDATE_SETUP_EXE: setupExe,
    INACCORD_UPDATE_BLOCKMAP: blockmap,
  };

  if (publishCommand) {
    run(publishCommand, publishEnv);
    return;
  }

  const githubReleaseInfo = getGithubReleaseInfoFromManifestUrl(manifestUrl);
  if (!githubReleaseInfo) {
    throw new Error(
      "No automatic updater publish target configured. Set INACCORD_UPDATE_PUBLISH_COMMAND or use a GitHub release manifest URL."
    );
  }

  const sharedArgs = ["-R", githubReleaseInfo.fullRepo];
  const releaseNotes =
    `Automated updater release for ${displayVersion} (${version}). ` +
    "Published by build:release:strict so every packaged build updates the live updater feed.";

  const releaseExists = spawnSync("gh", ["release", "view", releaseTag, ...sharedArgs], {
    cwd: root,
    shell: false,
    stdio: "ignore",
    env: process.env,
  }).status === 0;

  if (releaseExists) {
    runProgram("gh", ["release", "upload", releaseTag, latestYmlPath, setupExe, blockmap, ...sharedArgs, "--clobber"]);
    return;
  }

  runProgram("gh", [
    "release",
    "create",
    releaseTag,
    latestYmlPath,
    setupExe,
    blockmap,
    ...sharedArgs,
    "--title",
    releaseTag,
    "--notes",
    releaseNotes,
  ]);
}

function renameInstallerArtifactsForDisplayVersion(version, displayVersion, latestYmlPath) {
  const setupExe = findInstallerExePath(version);
  const blockmap = `${setupExe}.blockmap`;
  const setupExeDisplay = getCanonicalInstallerPath(displayVersion);
  const blockmapDisplay = `${setupExeDisplay}.blockmap`;

  if (displayVersion === version && setupExe === setupExeDisplay) {
    return {
      version,
      displayVersion,
      setupExe,
      blockmap,
    };
  }

  if (setupExeDisplay !== setupExe) {
    if (fs.existsSync(blockmap)) {
      if (blockmapDisplay !== blockmap && fs.existsSync(blockmapDisplay)) {
        fs.rmSync(blockmapDisplay, { force: true });
      }
      fs.renameSync(blockmap, blockmapDisplay);
    }
    if (fs.existsSync(setupExeDisplay)) {
      fs.rmSync(setupExeDisplay, { force: true });
    }
    fs.renameSync(setupExe, setupExeDisplay);

    const latestYmlText = fs.readFileSync(latestYmlPath, "utf8");
    const updatedLatestYmlText = latestYmlText.replace(
      /In-Accord(?:-|\s)Setup\sv?\d+\.\d+\.\d+-x64\.exe|In-Accord-Setup-v\d+\.\d+\.\d+-x64\.exe/g,
      getCanonicalInstallerFileName(displayVersion)
    );
    fs.writeFileSync(latestYmlPath, updatedLatestYmlText, "utf8");
  }

  return {
    version,
    displayVersion,
    setupExe: setupExeDisplay,
    blockmap: blockmapDisplay,
  };
}

function main() {
  console.log("[build:release:strict] Starting strict release build...");
  const originalPackageManifest = snapshotPackageManifest();

  try {
    loadEnvFile(path.join(root, ".env"));
    const pkg = readPackageManifest();
    const releaseState = readReleaseVersionState(pkg);
    const version = bumpInternalVersion(releaseState.version || pkg.version);
    const displayVersion = bumpDisplayVersion(releaseState.displayVersion || pkg.inaccordDisplayVersion || pkg.version);

    run("npm run clean:next");
    runWithSingleRetry(
      "npm run build",
      "Build failed on first attempt; retrying once after transient Next.js trace/artifact issue..."
    );
    run("node scripts/materialize-next-external-aliases.cjs");
    run("npm run generate:win-icon");
    run("npm run prepare:win-fav-icon", {
      BUILD_OUTPUT_DIR: path.join(root, "Desktop", "builder-assets"),
    });
    run('node -e "require(\'fs\').mkdirSync(\'.electron-cache/tmp\',{recursive:true})"');
    runElectronBuilderWithRetry(version, displayVersion);

    const manifestUrl = getConfiguredUpdateManifestUrl();
    const latestYml = path.join(distDir, "latest.yml");
    ensureFileExists(latestYml, "latest.yml");

    verifyLatestYmlContainsVersion(version, latestYml);
    const artifactInfo = renameInstallerArtifactsForDisplayVersion(version, displayVersion, latestYml);
    syncLatestYmlVersionMetadata(latestYml, version, displayVersion);
    syncLatestYmlAssetUrls(
      latestYml,
      buildPublishedAssetUrl(manifestUrl, version, path.basename(artifactInfo.setupExe))
    );
    ensureFileExists(artifactInfo.setupExe, "Installer EXE");
    ensureFileExists(artifactInfo.blockmap, "Installer blockmap");
    publishUpdaterArtifacts({
      manifestUrl,
      version,
      displayVersion,
      latestYmlPath: latestYml,
      setupExe: artifactInfo.setupExe,
      blockmap: artifactInfo.blockmap,
    });
    writeReleaseVersionState(version, displayVersion);

    console.log("\n[build:release:strict] ✅ Build + artifact verification passed");
    console.log(`[build:release:strict] Version: ${artifactInfo.displayVersion}`);
    console.log(`[build:release:strict] Internal version: ${artifactInfo.version}`);
    console.log(`[build:release:strict] Installer: ${artifactInfo.setupExe}`);
    console.log(`[build:release:strict] Published via: ${manifestUrl}`);
  } finally {
    restorePackageManifest(originalPackageManifest);
  }
}

try {
  main();
} catch (error) {
  console.error(`\n[build:release:strict] ❌ ${error.message}`);
  process.exit(1);
}
