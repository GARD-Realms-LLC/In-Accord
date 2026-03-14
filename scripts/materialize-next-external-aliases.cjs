#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const nextDir = path.join(root, process.env.NEXT_DIST_DIR || ".next");
const nodeModulesDir = path.join(root, "node_modules");
const manifestPath = path.join(root, ".next-external-aliases.json");

function walk(dirPath, filePaths = []) {
  if (!fs.existsSync(dirPath)) {
    return filePaths;
  }

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(entryPath, filePaths);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".nft.json")) {
      filePaths.push(entryPath);
    }
  }

  return filePaths;
}

function collectHashedAliases() {
  const aliases = new Set();
  const nftFiles = walk(nextDir);
  const aliasPattern = /node_modules\/(?:((?:@[^/"\\]+\/)?[^/"\\]+-[a-f0-9]{16,}))(?=[/"\\])/g;

  for (const nftFile of nftFiles) {
    const text = fs.readFileSync(nftFile, "utf8");
    for (const match of text.matchAll(aliasPattern)) {
      aliases.add(match[1]);
    }
  }

  return [...aliases].sort();
}

function deriveBasePackageName(aliasName) {
  if (aliasName.startsWith("@")) {
    const [scope, packageName] = aliasName.split("/");
    return `${scope}/${packageName.replace(/-[a-f0-9]{16,}$/i, "")}`;
  }

  return aliasName.replace(/-[a-f0-9]{16,}$/i, "");
}

function ensureAliasPackage(aliasName) {
  const aliasDir = path.join(nodeModulesDir, ...aliasName.split("/"));
  const baseName = deriveBasePackageName(aliasName);
  const baseDir = path.join(nodeModulesDir, ...baseName.split("/"));

  if (!fs.existsSync(baseDir)) {
    console.warn(`[materialize-next-external-aliases] Skipping ${aliasName}; base package not found: ${baseName}`);
    return false;
  }

  fs.mkdirSync(aliasDir, { recursive: true });

  const packageJsonPath = path.join(aliasDir, "package.json");
  const indexJsPath = path.join(aliasDir, "index.js");
  const indexMjsPath = path.join(aliasDir, "index.mjs");

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

  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  fs.writeFileSync(indexJsPath, `module.exports = require(${JSON.stringify(baseName)});\n`, "utf8");
  fs.writeFileSync(
    indexMjsPath,
    `import * as pkg from ${JSON.stringify(baseName)};\nexport * from ${JSON.stringify(baseName)};\nexport default pkg.default ?? pkg;\n`,
    "utf8"
  );

  return true;
}

function writeManifest(aliases) {
  const manifest = aliases.map((aliasName) => ({
    aliasName,
    baseName: deriveBasePackageName(aliasName),
  }));

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function main() {
  if (!fs.existsSync(nextDir)) {
    throw new Error(`Next output directory not found: ${nextDir}`);
  }

  if (!fs.existsSync(nodeModulesDir)) {
    throw new Error(`node_modules directory not found: ${nodeModulesDir}`);
  }

  const aliases = collectHashedAliases();
  if (aliases.length === 0) {
    fs.writeFileSync(manifestPath, "[]\n", "utf8");
    console.log("[materialize-next-external-aliases] No hashed external aliases detected.");
    return;
  }

  let createdCount = 0;
  for (const aliasName of aliases) {
    if (ensureAliasPackage(aliasName)) {
      createdCount += 1;
    }
  }

  writeManifest(aliases);

  console.log(
    `[materialize-next-external-aliases] Prepared ${createdCount} alias package(s): ${aliases.join(", ")}`
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[materialize-next-external-aliases] ${message}`);
  process.exit(1);
}
