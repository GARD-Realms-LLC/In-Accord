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

const manifestGlobNeedle = '**/{*-manifest,required-server-files}.json';
const manifestGlobReplacement = '**/{*-manifest,required-server-files,prefetch-hints}.json';

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
    const prefetchHintsPath = path.join(functionDir, ".next", "server", "prefetch-hints.json");

    if (!fs.existsSync(handlerPath) || !fs.existsSync(prefetchHintsPath)) {
      continue;
    }

    const originalHandler = fs.readFileSync(handlerPath, "utf8");

    if (originalHandler.includes('.endsWith("/server/prefetch-hints.json")')) {
      continue;
    }

    if (!originalHandler.includes("Unexpected loadManifest(")) {
      continue;
    }

    const prefetchHints = JSON.parse(fs.readFileSync(prefetchHintsPath, "utf8") || "{}");
    const serializedPrefetchHints = JSON.stringify(prefetchHints);
    const throwPattern = /throw new Error\(`Unexpected loadManifest\(\$\{([^}]+)\}\) call!`\)/;
    const match = originalHandler.match(throwPattern);

    if (!match) {
      continue;
    }

    const pathVariable = match[1];
    const injectedCase =
      `if(${pathVariable}.endsWith("/server/prefetch-hints.json"))return${serializedPrefetchHints};` +
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
