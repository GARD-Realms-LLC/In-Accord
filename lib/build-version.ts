import packageJson from "../package.json";

const rawVersion = String(packageJson.version ?? "").trim();
const versionParts = rawVersion.split(".").filter(Boolean);
const buildNumber = versionParts[versionParts.length - 1] || rawVersion || "0";
const displayVersion = String((packageJson as { inaccordDisplayVersion?: string }).inaccordDisplayVersion ?? "").trim();

export const INACCORD_INTERNAL_VERSION = rawVersion || buildNumber;
export const INACCORD_BUILD_NUMBER = buildNumber;
export const INACCORD_VERSION_LABEL = displayVersion || rawVersion || buildNumber;
