const fs = require("node:fs");
const path = require("node:path");

const compileConfigPath = path.join(
  process.cwd(),
  "node_modules",
  "@opennextjs",
  "aws",
  "dist",
  "build",
  "compileConfig.js",
);

const sentinel = "OpenNext compileConfig uses repo-local build dir on Windows";

if (!fs.existsSync(compileConfigPath)) {
  console.log("[patch-opennext-compile-config] compileConfig.js not found, skipping");
  process.exit(0);
}

const source = fs.readFileSync(compileConfigPath, "utf8");

if (source.includes(sentinel)) {
  console.log("[patch-opennext-compile-config] compileConfig.js already patched");
  process.exit(0);
}

const target = `    const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "open-next-tmp"));`;
const replacement = `    // ${sentinel}
    const openNextConfigRoot = path.join(process.cwd(), ".open-next-config-build");
    fs.mkdirSync(openNextConfigRoot, { recursive: true });
    const buildDir = fs.mkdtempSync(path.join(openNextConfigRoot, "open-next-tmp-"));`;

if (!source.includes(target)) {
  console.log("[patch-opennext-compile-config] target snippet not found, skipping");
  process.exit(0);
}

fs.writeFileSync(compileConfigPath, source.replace(target, replacement), "utf8");
console.log("[patch-opennext-compile-config] patched OpenNext compileConfig for repo-local Windows output");