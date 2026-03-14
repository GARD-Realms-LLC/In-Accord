const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const packageJsonPath = path.join(root, "package.json");
const packageLockPath = path.join(root, "package-lock.json");
const DISPLAY_VERSION_KEY = "inaccordDisplayVersion";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

const DISPLAY_BASE_MAJOR = 1;
const DISPLAY_BASE_MINOR = 0;
const DISPLAY_BASE_PATCH = 1;
const DISPLAY_MAX_PATCH = 99;
const MIN_INTERNAL_MAJOR = 1;
const MIN_INTERNAL_MINOR = 0;
const MIN_INTERNAL_PATCH = 178;

function parseSemver(version) {
  const versionString = String(version).trim();
  const match = versionString.match(/^(\d+)\.(\d+)\.(\d+)$/);

  if (!match) {
    return null;
  }

  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  const patch = Number.parseInt(match[3], 10);
  const isValid = Number.isFinite(major) && Number.isFinite(minor) && Number.isFinite(patch);

  if (!isValid) {
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

  if (
    parsed.major < DISPLAY_BASE_MAJOR ||
    parsed.minor < 0 ||
    parsed.patch < 0
  ) {
    return formatSemver(DISPLAY_BASE_MAJOR, DISPLAY_BASE_MINOR, DISPLAY_BASE_PATCH);
  }

  if (parsed.patch >= DISPLAY_MAX_PATCH) {
    return formatSemver(parsed.major, parsed.minor + 1, DISPLAY_BASE_PATCH);
  }

  return formatSemver(parsed.major, parsed.minor, parsed.patch + 1);
}

function main() {
  const pkg = readJson(packageJsonPath);
  const nextVersion = bumpInternalVersion(pkg.version);
  const nextDisplayVersion = bumpDisplayVersion(pkg[DISPLAY_VERSION_KEY]);

  pkg.version = nextVersion;
  pkg[DISPLAY_VERSION_KEY] = nextDisplayVersion;
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

  process.stdout.write(
    `[version] internal=${nextVersion} display=${nextDisplayVersion}\n`
  );
}

main();
