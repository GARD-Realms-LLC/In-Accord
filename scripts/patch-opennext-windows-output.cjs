const fs = require("node:fs");
const path = require("node:path");

const helperPath = path.join(
  process.cwd(),
  "node_modules",
  "@opennextjs",
  "aws",
  "dist",
  "build",
  "helper.js",
);

const sentinel = "Skipping OpenNext output dir cleanup on Windows due to locked files.";

if (!fs.existsSync(helperPath)) {
  console.log("[patch-opennext-windows-output] helper not found, skipping");
  process.exit(0);
}

const source = fs.readFileSync(helperPath, "utf8");

if (source.includes(sentinel)) {
  console.log("[patch-opennext-windows-output] OpenNext helper already patched");
  process.exit(0);
}

const target = `    fs.rmSync(options.outputDir, { recursive: true, force: true });`;
const replacement = `    try {
        fs.rmSync(options.outputDir, { recursive: true, force: true });
    }
    catch (error) {
        if (!(process.platform === "win32" && error && typeof error === "object" && error.code === "EPERM")) {
            throw error;
        }
        logger.warn("${sentinel}");
    }`;

if (!source.includes(target)) {
  console.log("[patch-opennext-windows-output] target snippet not found, skipping");
  process.exit(0);
}

fs.writeFileSync(helperPath, source.replace(target, replacement), "utf8");
console.log("[patch-opennext-windows-output] patched OpenNext helper for Windows-locked output cleanup");
