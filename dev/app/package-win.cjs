const fs = require("fs/promises");
const path = require("path");

const electronPackager = require("@electron/packager");

const packageJson = require("../../package.json");
const {
  ROOT_DIR,
  getNpmCommand,
  runCommand,
  copyDirectory,
} = require("./shared.cjs");

const DESKTOP_DIST_DIR_NAME = ".n";
const STAGED_STANDALONE_DIR_NAME = "s";
const UPDATE_CONFIG_FILENAME = "update-config.json";
const APP_CONFIG_FILENAME = "app-config.json";
const SQUIRREL_ICON_URL =
  "https://raw.githubusercontent.com/GARD-Realms-LLC/In-Accord/main/public/fav.ico";
const NEXT_DESKTOP_DIR = path.join(ROOT_DIR, DESKTOP_DIST_DIR_NAME);
const NEXT_STANDALONE_DIR = path.join(NEXT_DESKTOP_DIR, "standalone");
const INSTALLER_LOADING_GIF = path.join(
  ROOT_DIR,
  "dev",
  "app",
  "assets",
  "installer-loading.gif",
);
const FINAL_DESKTOP_OUTPUT_DIR = path.join(ROOT_DIR, "Desktop", "win64");
const FINAL_PACKAGED_APP_DIR = path.join(FINAL_DESKTOP_OUTPUT_DIR, "package");
const FINAL_INSTALLER_DIR = path.join(FINAL_DESKTOP_OUTPUT_DIR, "installer");
const SHORT_STAGE_ROOT = path.join(path.parse(ROOT_DIR).root, "ia");
const APP_SOURCE_DIR = path.join(SHORT_STAGE_ROOT, "a");
const PACKAGED_APP_DIR = path.join(SHORT_STAGE_ROOT, "p");
const INSTALLER_DIR = path.join(SHORT_STAGE_ROOT, "i");
const ELECTRON_CACHE_DIR = path.join(SHORT_STAGE_ROOT, "c");
const DESKTOP_PROFILE_DIR = path.join(SHORT_STAGE_ROOT, "h");
const NUGET_APPDATA_DIR = path.join(DESKTOP_PROFILE_DIR, "AppData", "Roaming");
const NUGET_LOCALAPPDATA_DIR = path.join(
  DESKTOP_PROFILE_DIR,
  "AppData",
  "Local",
);
const NUGET_PACKAGES_DIR = path.join(SHORT_STAGE_ROOT, "n");
const DESKTOP_TEMP_DIR = path.join(SHORT_STAGE_ROOT, "t");
const UPDATE_CHECK_DELAY_MS = 5_000;
const UPDATE_FIRST_RUN_DELAY_MS = 15_000;
const UPDATE_INTERVAL_MS = 5 * 60 * 1_000;
const BUILD_METADATA_FILENAME = "build-metadata.json";

const buildDesktopEnv = {
  ...process.env,
  NEXT_OUTPUT_MODE: "standalone",
  NEXT_DIST_DIR: DESKTOP_DIST_DIR_NAME,
  INACCORD_SKIP_OPENNEXT_COMPILE: "1",
  INACCORD_DISABLE_FILE_DATA: "1",
  NEXT_PUBLIC_INACCORD_DISABLE_CLIENT_PERSISTENCE: "1",
  USERPROFILE: DESKTOP_PROFILE_DIR,
  HOME: DESKTOP_PROFILE_DIR,
  APPDATA: NUGET_APPDATA_DIR,
  LOCALAPPDATA: NUGET_LOCALAPPDATA_DIR,
  NUGET_PACKAGES: NUGET_PACKAGES_DIR,
  TEMP: DESKTOP_TEMP_DIR,
  TMP: DESKTOP_TEMP_DIR,
  TMPDIR: DESKTOP_TEMP_DIR,
};

const buildCloudflareEnv = {
  ...process.env,
  INACCORD_DISABLE_FILE_DATA: "1",
};

const packager =
  electronPackager.packager ?? electronPackager.default ?? electronPackager;
const electronVersion = String(
  packageJson.devDependencies?.electron ||
    packageJson.dependencies?.electron ||
    "",
).replace(/^[^\d]*/, "");
const loadCreateWindowsInstaller = () => {
  const electronWinstaller = require("electron-winstaller");
  return (
    electronWinstaller.createWindowsInstaller ??
    electronWinstaller.default?.createWindowsInstaller ??
    electronWinstaller.default ??
    electronWinstaller
  );
};

const shouldIgnorePackagedPath = (targetPath) => {
  const relativePath = path.relative(ROOT_DIR, targetPath).replace(/\\/g, "/");
  if (!relativePath) {
    return false;
  }

  if (
    relativePath.startsWith(".git/") ||
    relativePath === ".git" ||
    relativePath.startsWith("node_modules/") ||
    relativePath === "node_modules" ||
    relativePath.startsWith(".next/") ||
    relativePath === ".next" ||
    relativePath.startsWith(".next-dev/") ||
    relativePath === ".next-dev" ||
    relativePath.startsWith(".electron-cache/") ||
    relativePath === ".electron-cache" ||
    relativePath.startsWith(".data/") ||
    relativePath === ".data" ||
    relativePath.startsWith("Desktop/") ||
    relativePath === "Desktop" ||
    relativePath.startsWith("dist/") ||
    relativePath === "dist" ||
    relativePath.startsWith("coverage/") ||
    relativePath === "coverage" ||
    relativePath.startsWith("build/") ||
    relativePath === "build" ||
    relativePath.startsWith("clerk-react/") ||
    relativePath === "clerk-react"
  ) {
    return true;
  }

  return false;
};

const stripWrappingQuotes = (value) => {
  const trimmedValue = String(value || "").trim();
  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1);
  }

  return trimmedValue;
};

const isHttpUpdateFeed = (value) =>
  /^https?:\/\//i.test(String(value || "").trim());

const normalizeHttpOrigin = (value) => {
  const trimmedValue = stripWrappingQuotes(value).replace(/\/$/, "");
  if (!trimmedValue) {
    return null;
  }

  try {
    const parsed = new URL(trimmedValue);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
};

const isLoopbackOrigin = (value) => {
  const normalizedOrigin = normalizeHttpOrigin(value);
  if (!normalizedOrigin) {
    return false;
  }

  try {
    const parsed = new URL(normalizedOrigin);
    const hostname = parsed.hostname.trim().toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
};

const readCloudflareRouteOrigin = async () => {
  const wranglerConfigPath = path.join(ROOT_DIR, "wrangler.jsonc");
  let rawConfig;

  try {
    rawConfig = await fs.readFile(wranglerConfigPath, "utf8");
  } catch {
    return null;
  }

  try {
    const parsedConfig = JSON.parse(rawConfig);
    const routes = Array.isArray(parsedConfig?.routes) ? parsedConfig.routes : [];
    const customDomainRoute = routes.find(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        entry.custom_domain === true &&
        typeof entry.pattern === "string",
    );
    const pattern = String(customDomainRoute?.pattern || "")
      .trim()
      .replace(/\/+$/, "");

    if (!pattern || pattern.includes("*") || pattern.includes("/") || pattern.includes(":")) {
      return null;
    }

    return normalizeHttpOrigin(`https://${pattern}`);
  } catch {
    return null;
  }
};

const normalizeUpdateFeed = (value) => {
  const trimmedValue = stripWrappingQuotes(value);
  if (!trimmedValue) {
    throw new Error("INACCORD_DESKTOP_UPDATE_URL must not be empty.");
  }

  if (isHttpUpdateFeed(trimmedValue)) {
    return trimmedValue;
  }

  if (!path.isAbsolute(trimmedValue)) {
    throw new Error(
      "INACCORD_DESKTOP_UPDATE_URL must be an absolute folder path or an http(s) URL.",
    );
  }

  return path.normalize(trimmedValue);
};

const readEnvFileEntries = async () => {
  const envFilePath = path.join(ROOT_DIR, ".env");
  const envContents = await fs.readFile(envFilePath, "utf8");
  const entries = new Map();

  for (const line of envContents.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine.slice(separatorIndex + 1);
    entries.set(key, value);
  }

  return entries;
};

const readRequiredUpdateFeed = async () => {
  const envEntries = await readEnvFileEntries();
  const configuredValue = envEntries.get("INACCORD_DESKTOP_UPDATE_URL");

  if (configuredValue) {
    return normalizeUpdateFeed(configuredValue);
  }

  throw new Error(
    "INACCORD_DESKTOP_UPDATE_URL must be set in .env for Windows desktop builds.",
  );
};

const readRequiredDesktopAppOrigin = async () => {
  const envEntries = await readEnvFileEntries();
  const configuredOrigin =
    envEntries.get("INACCORD_DESKTOP_APP_ORIGIN") ??
    envEntries.get("NEXT_PUBLIC_SITE_URL");
  const normalizedOrigin = normalizeHttpOrigin(configuredOrigin);
  const cloudflareRouteOrigin = await readCloudflareRouteOrigin();

  if (normalizedOrigin && !isLoopbackOrigin(normalizedOrigin)) {
    return normalizedOrigin;
  }

  if (cloudflareRouteOrigin) {
    return cloudflareRouteOrigin;
  }

  if (!normalizedOrigin) {
    throw new Error(
      "INACCORD_DESKTOP_APP_ORIGIN or NEXT_PUBLIC_SITE_URL must be set in .env to an absolute http(s) origin for Windows desktop builds.",
    );
  }

  throw new Error(
    "Desktop app origin is still set to localhost. Set INACCORD_DESKTOP_APP_ORIGIN to your real site origin, or keep a Cloudflare custom-domain route in wrangler.jsonc.",
  );
};

const prepareStandaloneAssets = async () => {
  await copyDirectory(
    path.join(NEXT_DESKTOP_DIR, "static"),
    path.join(NEXT_STANDALONE_DIR, DESKTOP_DIST_DIR_NAME, "static"),
  );

  await copyDirectory(
    path.join(ROOT_DIR, "public"),
    path.join(NEXT_STANDALONE_DIR, "public"),
  );
};

const writeBuildMetadata = async () => {
  await runCommand(
    "node",
    [path.join(ROOT_DIR, "scripts", "write-build-metadata.cjs")],
    {
      cwd: ROOT_DIR,
      env: buildDesktopEnv,
    },
  );
};

const runProjectBuild = async (env) => {
  await runCommand(getNpmCommand(), ["run", "build"], {
    cwd: ROOT_DIR,
    env,
  });
};

const writeDesktopPackageJson = async () => {
  const desktopPackageJson = {
    name: "in-accord-desktop",
    productName: "In-Accord",
    version: packageJson.version,
    description: "In-Accord desktop shell",
    main: "dev/app/main.cjs",
    private: true,
    devDependencies: {
      electron:
        packageJson.devDependencies?.electron ||
        packageJson.dependencies?.electron,
    },
  };

  await fs.writeFile(
    path.join(APP_SOURCE_DIR, "package.json"),
    `${JSON.stringify(desktopPackageJson, null, 2)}\n`,
    "utf8",
  );
};

const writeDesktopUpdateConfig = async (stagedDesktopDir, updateFeed) => {
  const updateConfig = {
    feedUrl: updateFeed,
    initialDelayMs: UPDATE_CHECK_DELAY_MS,
    firstRunDelayMs: UPDATE_FIRST_RUN_DELAY_MS,
    intervalMs: UPDATE_INTERVAL_MS,
  };

  await fs.writeFile(
    path.join(stagedDesktopDir, UPDATE_CONFIG_FILENAME),
    `${JSON.stringify(updateConfig, null, 2)}\n`,
    "utf8",
  );
};

const writeDesktopAppConfig = async (stagedDesktopDir, appOrigin) => {
  const appConfig = {
    appOrigin,
  };

  await fs.writeFile(
    path.join(stagedDesktopDir, APP_CONFIG_FILENAME),
    `${JSON.stringify(appConfig, null, 2)}\n`,
    "utf8",
  );
};

const copyIfPresent = async (sourcePath, targetPath) => {
  try {
    await fs.access(sourcePath);
  } catch {
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
};

const stageDesktopAppSource = async (updateFeed, appOrigin) => {
  const stagedDesktopDir = path.join(APP_SOURCE_DIR, "dev", "app");
  const stagedStandaloneDir = path.join(
    APP_SOURCE_DIR,
    STAGED_STANDALONE_DIR_NAME,
  );

  await fs.rm(APP_SOURCE_DIR, { recursive: true, force: true });
  await fs.mkdir(stagedDesktopDir, { recursive: true });

  await fs.copyFile(
    path.join(ROOT_DIR, "dev", "app", "main.cjs"),
    path.join(stagedDesktopDir, "main.cjs"),
  );
  await fs.copyFile(
    path.join(ROOT_DIR, "dev", "app", "preload.cjs"),
    path.join(stagedDesktopDir, "preload.cjs"),
  );
  await fs.copyFile(
    path.join(ROOT_DIR, "dev", "app", "shared.cjs"),
    path.join(stagedDesktopDir, "shared.cjs"),
  );
  await writeDesktopUpdateConfig(stagedDesktopDir, updateFeed);
  await writeDesktopAppConfig(stagedDesktopDir, appOrigin);

  await copyDirectory(
    path.join(NEXT_STANDALONE_DIR, ".next"),
    path.join(stagedStandaloneDir, ".next"),
  );
  await copyDirectory(
    path.join(NEXT_STANDALONE_DIR, DESKTOP_DIST_DIR_NAME),
    path.join(stagedStandaloneDir, DESKTOP_DIST_DIR_NAME),
  );
  await copyDirectory(
    path.join(NEXT_STANDALONE_DIR, "node_modules"),
    path.join(stagedStandaloneDir, "node_modules"),
  );
  await copyDirectory(
    path.join(NEXT_STANDALONE_DIR, "public"),
    path.join(stagedStandaloneDir, "public"),
  );

  await copyIfPresent(
    path.join(NEXT_STANDALONE_DIR, ".env"),
    path.join(stagedStandaloneDir, ".env"),
  );
  await copyIfPresent(
    path.join(NEXT_STANDALONE_DIR, "In-Accord.js"),
    path.join(stagedStandaloneDir, "In-Accord.js"),
  );
  await copyIfPresent(
    path.join(ROOT_DIR, BUILD_METADATA_FILENAME),
    path.join(stagedStandaloneDir, BUILD_METADATA_FILENAME),
  );
  await copyIfPresent(
    path.join(NEXT_STANDALONE_DIR, "package.json"),
    path.join(stagedStandaloneDir, "package.json"),
  );
  await copyIfPresent(
    path.join(NEXT_STANDALONE_DIR, "server.js"),
    path.join(stagedStandaloneDir, "server.js"),
  );

  await writeDesktopPackageJson();
};

const buildStandaloneApp = async (updateFeed, appOrigin) => {
  await fs.rm(FINAL_DESKTOP_OUTPUT_DIR, { recursive: true, force: true });
  await fs.rm(SHORT_STAGE_ROOT, { recursive: true, force: true });
  await fs.mkdir(NUGET_APPDATA_DIR, { recursive: true });
  await fs.mkdir(NUGET_LOCALAPPDATA_DIR, { recursive: true });
  await fs.mkdir(NUGET_PACKAGES_DIR, { recursive: true });
  await fs.mkdir(DESKTOP_TEMP_DIR, { recursive: true });

  await writeBuildMetadata();
  await runProjectBuild(buildCloudflareEnv);
  await runProjectBuild(buildDesktopEnv);

  await prepareStandaloneAssets();
  await stageDesktopAppSource(updateFeed, appOrigin);
};

const packageDesktopApp = async () => {
  await fs.rm(PACKAGED_APP_DIR, { recursive: true, force: true });
  await fs.rm(INSTALLER_DIR, { recursive: true, force: true });
  await fs.mkdir(PACKAGED_APP_DIR, { recursive: true });
  await fs.mkdir(INSTALLER_DIR, { recursive: true });

  const appPaths = await packager({
    dir: APP_SOURCE_DIR,
    name: "In-Accord",
    executableName: "In-Accord",
    platform: "win32",
    arch: "x64",
    out: PACKAGED_APP_DIR,
    overwrite: true,
    prune: false,
    asar: false,
    electronVersion,
    icon: path.join(ROOT_DIR, "fav.ico"),
    appVersion: packageJson.version,
    win32metadata: {
      CompanyName: "GARD Realms LLC",
      FileDescription: "In-Accord Desktop",
      OriginalFilename: "In-Accord.exe",
      ProductName: "In-Accord",
      InternalName: "In-Accord",
    },
  });

  const appDirectory = appPaths[0];
  if (!appDirectory) {
    throw new Error("Electron packager did not return an output directory.");
  }

  return appDirectory;
};

const persistDesktopArtifacts = async (appDirectory) => {
  const finalPackagedAppDirectory = path.join(
    FINAL_PACKAGED_APP_DIR,
    path.basename(appDirectory),
  );

  await fs.rm(FINAL_PACKAGED_APP_DIR, { recursive: true, force: true });
  await fs.rm(FINAL_INSTALLER_DIR, { recursive: true, force: true });
  await fs.mkdir(FINAL_PACKAGED_APP_DIR, { recursive: true });
  await fs.mkdir(FINAL_INSTALLER_DIR, { recursive: true });

  await copyDirectory(appDirectory, finalPackagedAppDirectory);
  await copyDirectory(INSTALLER_DIR, FINAL_INSTALLER_DIR);

  return {
    packagedAppDirectory: finalPackagedAppDirectory,
    installerDirectory: FINAL_INSTALLER_DIR,
  };
};

const createSquirrelInstaller = async (appDirectory, updateFeed) => {
  await fs.mkdir(NUGET_APPDATA_DIR, { recursive: true });
  await fs.mkdir(NUGET_LOCALAPPDATA_DIR, { recursive: true });
  await fs.mkdir(NUGET_PACKAGES_DIR, { recursive: true });
  await fs.mkdir(DESKTOP_TEMP_DIR, { recursive: true });

  const previousAppData = process.env.APPDATA;
  const previousLocalAppData = process.env.LOCALAPPDATA;
  const previousNugetPackages = process.env.NUGET_PACKAGES;
  const previousUserProfile = process.env.USERPROFILE;
  const previousHome = process.env.HOME;
  const previousTemp = process.env.TEMP;
  const previousTmp = process.env.TMP;
  const previousTmpDir = process.env.TMPDIR;

  process.env.APPDATA = NUGET_APPDATA_DIR;
  process.env.LOCALAPPDATA = NUGET_LOCALAPPDATA_DIR;
  process.env.NUGET_PACKAGES = NUGET_PACKAGES_DIR;
  process.env.USERPROFILE = DESKTOP_PROFILE_DIR;
  process.env.HOME = DESKTOP_PROFILE_DIR;
  process.env.TEMP = DESKTOP_TEMP_DIR;
  process.env.TMP = DESKTOP_TEMP_DIR;
  process.env.TMPDIR = DESKTOP_TEMP_DIR;

  try {
    const createWindowsInstaller = loadCreateWindowsInstaller();

    await createWindowsInstaller({
      appDirectory,
      outputDirectory: INSTALLER_DIR,
      authors: "GARD Realms LLC",
      description: "In-Accord desktop shell",
      exe: "In-Accord.exe",
      iconUrl: SQUIRREL_ICON_URL,
      loadingGif: INSTALLER_LOADING_GIF,
      noMsi: true,
      remoteReleases: isHttpUpdateFeed(updateFeed) ? updateFeed : undefined,
      setupExe: `In-Accord-${packageJson.version}-Setup.exe`,
      setupIcon: path.join(ROOT_DIR, "fav.ico"),
      skipUpdateIcon: false,
      title: "In-Accord",
    });
  } finally {
    if (previousAppData === undefined) {
      delete process.env.APPDATA;
    } else {
      process.env.APPDATA = previousAppData;
    }

    if (previousLocalAppData === undefined) {
      delete process.env.LOCALAPPDATA;
    } else {
      process.env.LOCALAPPDATA = previousLocalAppData;
    }

    if (previousNugetPackages === undefined) {
      delete process.env.NUGET_PACKAGES;
    } else {
      process.env.NUGET_PACKAGES = previousNugetPackages;
    }

    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }

    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }

    if (previousTemp === undefined) {
      delete process.env.TEMP;
    } else {
      process.env.TEMP = previousTemp;
    }

    if (previousTmp === undefined) {
      delete process.env.TMP;
    } else {
      process.env.TMP = previousTmp;
    }

    if (previousTmpDir === undefined) {
      delete process.env.TMPDIR;
    } else {
      process.env.TMPDIR = previousTmpDir;
    }
  }
};

const syncConfiguredUpdateFeed = async (updateFeed) => {
  if (isHttpUpdateFeed(updateFeed)) {
    return;
  }

  const normalizedUpdateFeed = path.resolve(updateFeed);
  if (normalizedUpdateFeed === path.resolve(INSTALLER_DIR)) {
    return;
  }

  await fs.rm(normalizedUpdateFeed, { recursive: true, force: true });
  await copyDirectory(INSTALLER_DIR, normalizedUpdateFeed);
};

const main = async () => {
  const updateFeed = await readRequiredUpdateFeed();
  const desktopAppOrigin = await readRequiredDesktopAppOrigin();

  await buildStandaloneApp(updateFeed, desktopAppOrigin);
  const appDirectory = await packageDesktopApp();
  await createSquirrelInstaller(appDirectory, updateFeed);
  await syncConfiguredUpdateFeed(updateFeed);
  const artifactPaths = await persistDesktopArtifacts(appDirectory);

  console.log(
    `[INACCORD_APP_DIST_WIN] Packaged app: ${artifactPaths.packagedAppDirectory}`,
  );
  console.log(
    `[INACCORD_APP_DIST_WIN] Squirrel installer output: ${artifactPaths.installerDirectory}`,
  );
  console.log(`[INACCORD_APP_DIST_WIN] Update feed: ${updateFeed}`);
  console.log(`[INACCORD_APP_DIST_WIN] Desktop app origin: ${desktopAppOrigin}`);
};

main().catch((error) => {
  console.error("[INACCORD_APP_DIST_WIN]", error);
  process.exit(1);
});
