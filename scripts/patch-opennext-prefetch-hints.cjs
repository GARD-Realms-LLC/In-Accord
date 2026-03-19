const fs = require("node:fs");
const path = require("node:path");

const rootDir = process.cwd();
const opennextPluginPath = path.join(
  rootDir,
  "node_modules",
  "@opennextjs",
  "cloudflare",
  "dist",
  "cli",
  "build",
  "patches",
  "plugins",
  "load-manifest.js"
);
const serverFunctionsDir = path.join(rootDir, ".open-next", "server-functions");
const nextBuildDir = path.join(rootDir, ".next");

const manifestGlobNeedle = '**/{*-manifest,required-server-files}.json';
const manifestGlobReplacement =
  '**/{*-manifest,required-server-files,prefetch-hints,subresource-integrity-manifest,fallback-build-manifest}.json';

const optionalManifestFallbacks = [
  ["/server/prefetch-hints.json", "{}"],
  ["/server/subresource-integrity-manifest.json", "{}"],
  ["/fallback-build-manifest.json", "{}"],
];

const normalizeRelativeManifestPath = (baseDir, filePath) =>
  `/${path.relative(baseDir, filePath).split(path.sep).join("/")}`;

const shouldIncludeManifestFile = (relativeManifestPath) =>
  /(?:^|\/)(?:[^/]*manifest[^/]*|required-server-files|prefetch-hints)\.json$/i.test(
    relativeManifestPath
  );

const shouldAliasManifestWithoutJson = (relativeManifestPath) =>
  /(?:^|\/)(?:[^/]*manifest[^/]*|prefetch-hints)\.json$/i.test(relativeManifestPath);

const collectManifestFiles = (baseDir, currentDir = baseDir, collected = []) => {
  if (!fs.existsSync(currentDir)) {
    return collected;
  }

  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      collectManifestFiles(baseDir, absolutePath, collected);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const relativeManifestPath = normalizeRelativeManifestPath(baseDir, absolutePath);
    if (!shouldIncludeManifestFile(relativeManifestPath)) {
      continue;
    }

    const raw = fs.readFileSync(absolutePath, "utf8").trim();
    if (!raw) {
      continue;
    }

    collected.push({
      endsWith: relativeManifestPath,
      literal: raw,
    });

    if (shouldAliasManifestWithoutJson(relativeManifestPath)) {
      collected.push({
        endsWith: relativeManifestPath.replace(/\.json$/i, ""),
        literal: raw,
      });
    }
  }

  return collected;
};

const getBuiltHandlerManifestPatches = (functionDir) => {
  const manifestPatches = new Map();
  const addManifestPatch = (endsWith, literal) => {
    if (!manifestPatches.has(endsWith)) {
      manifestPatches.set(endsWith, literal);
    }
  };

  collectManifestFiles(path.join(functionDir, ".next")).forEach((entry) => {
    addManifestPatch(entry.endsWith, entry.literal);
  });
  collectManifestFiles(nextBuildDir).forEach((entry) => {
    addManifestPatch(entry.endsWith, entry.literal);
  });
  optionalManifestFallbacks.forEach(([endsWith, literal]) => {
    addManifestPatch(endsWith, literal);
    if (endsWith.endsWith(".json")) {
      addManifestPatch(endsWith.replace(/\.json$/i, ""), literal);
    }
  });

  return Array.from(manifestPatches, ([endsWith, literal]) => ({
    endsWith,
    literal,
  }));
};

const patchOpenNextSourcePlugin = () => {
  if (!fs.existsSync(opennextPluginPath)) {
    console.log("[patch-opennext-prefetch-hints] OpenNext source plugin not found");
    return false;
  }

  const original = fs.readFileSync(opennextPluginPath, "utf8");

  if (original.includes(manifestGlobReplacement)) {
    console.log("[patch-opennext-prefetch-hints] OpenNext source plugin already patched");
    return false;
  }

  if (!original.includes(manifestGlobNeedle)) {
    console.log("[patch-opennext-prefetch-hints] OpenNext source plugin pattern not found");
    return false;
  }

  const updated = original.replace(manifestGlobNeedle, manifestGlobReplacement);
  fs.writeFileSync(opennextPluginPath, updated, "utf8");
  console.log("[patch-opennext-prefetch-hints] Patched OpenNext source plugin");
  return true;
};

const patchBuiltHandlers = () => {
  if (!fs.existsSync(serverFunctionsDir)) {
    console.log("[patch-opennext-prefetch-hints] No .open-next server functions found");
    return 0;
  }

  let patchedCount = 0;
  const functionDirs = fs.readdirSync(serverFunctionsDir, { withFileTypes: true });

  for (const entry of functionDirs) {
    if (!entry.isDirectory()) {
      continue;
    }

    const functionDir = path.join(serverFunctionsDir, entry.name);
    const handlerPath = path.join(functionDir, "handler.mjs");
    const manifestPatches = getBuiltHandlerManifestPatches(functionDir);
    if (!fs.existsSync(handlerPath)) {
      continue;
    }

    const originalHandler = fs.readFileSync(handlerPath, "utf8");

    if (
      manifestPatches.every((manifestPatch) =>
        originalHandler.includes(`.endsWith("${manifestPatch.endsWith}")`)
      )
    ) {
      continue;
    }

    if (!originalHandler.includes("Unexpected loadManifest(")) {
      continue;
    }

    const throwPattern = /throw new Error\(`Unexpected loadManifest\(\$\{([^}]+)\}\) call!`\)/;
    const match = originalHandler.match(throwPattern);

    if (!match) {
      continue;
    }

    const pathVariable = match[1];
    const injectedCase =
      manifestPatches
        .map((manifestPatch) => {
          return `if(${pathVariable}.endsWith("${manifestPatch.endsWith}"))return${manifestPatch.literal};`;
        })
        .join("") +
      `throw new Error(\`Unexpected loadManifest(\${${pathVariable}}) call!\`)`;
    const updatedHandler = originalHandler.replace(throwPattern, injectedCase);

    if (updatedHandler === originalHandler) {
      continue;
    }

    fs.writeFileSync(handlerPath, updatedHandler, "utf8");
    patchedCount += 1;
    console.log(`[patch-opennext-prefetch-hints] Patched ${path.relative(rootDir, handlerPath)}`);
  }

  if (patchedCount === 0) {
    console.log("[patch-opennext-prefetch-hints] No built handlers needed patching");
  }

  return patchedCount;
};

patchOpenNextSourcePlugin();
patchBuiltHandlers();
