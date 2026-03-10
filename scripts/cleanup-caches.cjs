#!/usr/bin/env node
/*
 * Safe workspace cache cleanup helper.
 * - Default: removes regenerable caches only
 * - Optional: --include-win64 to remove large build output folder Win-64
 * - Optional: --dry-run to preview actions
 */

const fs = require("fs");
const path = require("path");

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const includeWin64 = args.has("--include-win64");

const targets = [".next", ".next-dev", ".electron-cache"];
if (includeWin64) {
  targets.push("Win-64");
}

function getSizeBytes(targetPath) {
  if (!fs.existsSync(targetPath)) return 0;
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return stat.size;

  let total = 0;
  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(targetPath, entry.name);
    if (entry.isDirectory()) total += getSizeBytes(full);
    else if (entry.isFile()) total += fs.statSync(full).size;
  }
  return total;
}

function formatMB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

let removed = 0;
let removedBytes = 0;
let missing = 0;

console.log(`Workspace: ${root}`);
console.log(`Mode: ${dryRun ? "DRY RUN" : "DELETE"}`);
console.log(`Targets: ${targets.join(", ")}`);

for (const rel of targets) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    missing += 1;
    console.log(`- [skip] ${rel} (not found)`);
    continue;
  }

  const size = getSizeBytes(full);
  if (dryRun) {
    console.log(`- [plan] ${rel} (${formatMB(size)})`);
    continue;
  }

  fs.rmSync(full, { recursive: true, force: true });
  removed += 1;
  removedBytes += size;
  console.log(`- [done] ${rel} (${formatMB(size)})`);
}

if (dryRun) {
  console.log("\nDry run complete.");
} else {
  console.log(`\nRemoved: ${removed} target(s), freed ~${formatMB(removedBytes)}`);
}
console.log(`Missing: ${missing} target(s)`);
