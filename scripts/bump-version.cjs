const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const packageJsonPath = path.join(root, "package.json");
const packageLockPath = path.join(root, "package-lock.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

const BASE_MAJOR = 1;
const BASE_MINOR = 0;
const BASE_PATCH = 25;

function bumpSemverFromBase(version) {
  const versionString = String(version).trim();
  const match = versionString.match(/^(\d+)\.(\d+)\.(\d+)$/);

  if (!match) {
    return `${BASE_MAJOR}.${BASE_MINOR}.${BASE_PATCH}`;
  }

  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  const patch = Number.parseInt(match[3], 10);

  const isValid = Number.isFinite(major) && Number.isFinite(minor) && Number.isFinite(patch);
  const isSupportedTrack = major === BASE_MAJOR && minor === BASE_MINOR && patch >= BASE_PATCH;

  if (!isValid || !isSupportedTrack) {
    return `${BASE_MAJOR}.${BASE_MINOR}.${BASE_PATCH}`;
  }

  return `${BASE_MAJOR}.${BASE_MINOR}.${patch + 1}`;
}

function main() {
  const pkg = readJson(packageJsonPath);
  const nextVersion = bumpSemverFromBase(pkg.version);

  pkg.version = nextVersion;
  writeJson(packageJsonPath, pkg);

  if (fs.existsSync(packageLockPath)) {
    const lock = readJson(packageLockPath);

    if (typeof lock.version === "string") {
      lock.version = nextVersion;
    }

    if (lock.packages && lock.packages[""] && typeof lock.packages[""].version === "string") {
      lock.packages[""].version = nextVersion;
    }

    writeJson(packageLockPath, lock);
  }

  process.stdout.write(`[version] bumped to ${nextVersion}\n`);
}

main();
