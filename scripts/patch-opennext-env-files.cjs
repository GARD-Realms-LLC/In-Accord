const fs = require("node:fs");
const path = require("node:path");

const compileEnvFilesPath = path.join(
  process.cwd(),
  "node_modules",
  "@opennextjs",
  "cloudflare",
  "dist",
  "cli",
  "build",
  "open-next",
  "compile-env-files.js",
);

const sentinel = "OpenNext next-env.mjs already patched for deterministic writes";

if (!fs.existsSync(compileEnvFilesPath)) {
  console.log("[patch-opennext-env-files] compile-env-files.js not found, skipping");
  process.exit(0);
}

const source = fs.readFileSync(compileEnvFilesPath, "utf8");

if (source.includes(sentinel)) {
  console.log("[patch-opennext-env-files] compile-env-files.js already patched");
  process.exit(0);
}

const target = `    ["production", "development", "test"].forEach((mode) => fs.appendFileSync(path.join(envDir, \`next-env.mjs\`), \`export const \${mode} = \${JSON.stringify(extractProjectEnvVars(mode, buildOpts))};\\n\`));`;
const replacement = `    // ${sentinel}
    const nextEnvSource = ["production", "development", "test"]
        .map((mode) => \`export const \${mode} = \${JSON.stringify(extractProjectEnvVars(mode, buildOpts))};\\n\`)
        .join("");
    fs.writeFileSync(path.join(envDir, \`next-env.mjs\`), nextEnvSource, "utf8");`;

if (!source.includes(target)) {
  console.log("[patch-opennext-env-files] target snippet not found, skipping");
  process.exit(0);
}

fs.writeFileSync(compileEnvFilesPath, source.replace(target, replacement), "utf8");
console.log("[patch-opennext-env-files] patched OpenNext env compilation for deterministic output");
