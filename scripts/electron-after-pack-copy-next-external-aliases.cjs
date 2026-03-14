"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const manifestPath = path.join(root, ".next-external-aliases.json");

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

module.exports = async function afterPack(context) {
  const aliases = readManifest();
  if (aliases.length === 0) {
    console.log("[electron-after-pack-copy-next-external-aliases] No alias packages to copy.");
    return;
  }

  const resourcesDir = path.join(context.appOutDir, "resources");
  for (const entry of aliases) {
    if (!entry || typeof entry.aliasName !== "string" || typeof entry.baseName !== "string") {
      continue;
    }

    ensurePackagedAlias(resourcesDir, entry.aliasName, entry.baseName);
  }

  console.log(
    `[electron-after-pack-copy-next-external-aliases] Copied ${aliases.length} alias package(s) into packaged resources.`
  );
};