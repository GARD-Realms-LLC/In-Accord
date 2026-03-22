"use strict";

const fs = require("fs");
const path = require("path");
const ResEdit = require("resedit");

const root = path.join(__dirname, "..");
const manifestPath = path.join(root, ".next-external-aliases.json");
const WINDOWS_VERSION_LANGUAGE = 1033;
const WINDOWS_VERSION_CODEPAGE = 1200;

function readManifest() {
  if (!fs.existsSync(manifestPath)) {
    return [];
  }

  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function ensurePackagedAlias(resourcesDir, aliasName, baseName) {
  const aliasDir = path.join(resourcesDir, "node_modules", ...aliasName.split("/"));
  const packagedBaseDir = path.join(resourcesDir, "app.asar", "node_modules", ...baseName.split("/"));

  fs.mkdirSync(aliasDir, { recursive: true });

  const requireTarget = toPosix(path.relative(aliasDir, packagedBaseDir));
  const packageJson = {
    name: aliasName,
    private: true,
    main: "./index.js",
    module: "./index.mjs",
    exports: {
      ".": {
        require: "./index.js",
        import: "./index.mjs",
        default: "./index.js"
      }
    }
  };

  fs.writeFileSync(path.join(aliasDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(aliasDir, "index.js"), `module.exports = require(${JSON.stringify(requireTarget)});\n`, "utf8");
  fs.writeFileSync(
    path.join(aliasDir, "index.mjs"),
    `import * as pkg from ${JSON.stringify(requireTarget)};\nexport * from ${JSON.stringify(requireTarget)};\nexport default pkg.default ?? pkg;\n`,
    "utf8"
  );
}

function firstExistingPath(...candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function normalizeWindowsVersion(version) {
  const raw = String(version || "").trim();
  if (!raw) {
    return "0.0.0.0";
  }

  const parts = raw
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part) && part >= 0)
    .slice(0, 4);

  while (parts.length < 4) {
    parts.push(0);
  }

  return parts.join(".");
}

function getWindowsVersionStrings(context) {
  const appInfo = context?.packager?.appInfo;
  const internalVersion = String(appInfo?.version || "").trim();
  const buildVersion =
    normalizeWindowsVersion(
      appInfo?.shortVersionWindows ||
        (typeof appInfo?.getVersionInWeirdWindowsForm === "function"
          ? appInfo.getVersionInWeirdWindowsForm()
          : internalVersion)
    ) || "0.0.0.0";

  return {
    internalVersion,
    buildVersion,
  };
}

function stampWindowsExecutable(context) {
  if (context?.electronPlatformName !== "win32") {
    return;
  }

  const productFilename = String(context?.packager?.appInfo?.productFilename || "").trim();
  if (!productFilename) {
    console.warn("[electron-after-pack-copy-next-external-aliases] Skipping Windows executable branding: missing product filename.");
    return;
  }

  const executablePath = path.join(context.appOutDir, `${productFilename}.exe`);
  if (!fs.existsSync(executablePath)) {
    console.warn(
      `[electron-after-pack-copy-next-external-aliases] Skipping Windows executable branding: ${executablePath} was not found.`
    );
    return;
  }

  const iconPath = firstExistingPath(
    path.join(root, "Images", "app-icon.ico"),
    path.join(root, "Desktop", "builder-assets", "app-icon.ico"),
    path.join(root, "Images", "fav.ico"),
    path.join(root, "Desktop", "builder-assets", "fav.ico")
  );

  const executableData = fs.readFileSync(executablePath);
  const executable = ResEdit.NtExecutable.from(executableData, { ignoreCert: true });
  const resources = ResEdit.NtExecutableResource.from(executable);
  const iconGroups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
  const targetIconGroup = iconGroups[0] || null;
  const targetIconGroupId = targetIconGroup?.id || 101;
  const targetIconLang = Number(targetIconGroup?.lang || WINDOWS_VERSION_LANGUAGE);

  if (iconPath) {
    const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
      resources.entries,
      targetIconGroupId,
      targetIconLang,
      iconFile.icons.map((item) => item.data)
    );
  }

  const appInfo = context.packager.appInfo;
  const productName = String(appInfo?.productName || productFilename).trim() || productFilename;
  const companyName = String(appInfo?.companyName || "").trim();
  const copyright = String(appInfo?.copyright || "").trim();
  const { internalVersion, buildVersion } = getWindowsVersionStrings(context);
  const versionLanguage = { lang: WINDOWS_VERSION_LANGUAGE, codepage: WINDOWS_VERSION_CODEPAGE };
  const versionInfos = ResEdit.Resource.VersionInfo.fromEntries(resources.entries);
  const versionInfo = versionInfos[0] || ResEdit.Resource.VersionInfo.createEmpty();

  versionInfo.lang = WINDOWS_VERSION_LANGUAGE;
  versionInfo.setFileVersion(buildVersion, WINDOWS_VERSION_LANGUAGE);
  versionInfo.setProductVersion(buildVersion, WINDOWS_VERSION_LANGUAGE);
  versionInfo.setStringValues(versionLanguage, {
    CompanyName: companyName || productName,
    FileDescription: productName,
    FileVersion: buildVersion,
    InternalName: productFilename,
    LegalCopyright: copyright,
    OriginalFilename: `${productFilename}.exe`,
    ProductName: productName,
    ProductVersion: internalVersion || buildVersion,
  });
  versionInfo.outputToResourceEntries(resources.entries);

  resources.outputResource(executable);
  fs.writeFileSync(executablePath, Buffer.from(executable.generate()));

  console.log(
    `[electron-after-pack-copy-next-external-aliases] Branded Windows executable: ${path.relative(root, executablePath)}`
  );
}

module.exports = async function afterPack(context) {
  const aliases = readManifest();
  const resourcesDir = path.join(context.appOutDir, "resources");

  if (aliases.length === 0) {
    console.log("[electron-after-pack-copy-next-external-aliases] No alias packages to copy.");
  } else {
    for (const entry of aliases) {
      if (!entry || typeof entry.aliasName !== "string" || typeof entry.baseName !== "string") {
        continue;
      }

      ensurePackagedAlias(resourcesDir, entry.aliasName, entry.baseName);
    }

    console.log(
      `[electron-after-pack-copy-next-external-aliases] Copied ${aliases.length} alias package(s) into packaged resources.`
    );
  }

  stampWindowsExecutable(context);
};