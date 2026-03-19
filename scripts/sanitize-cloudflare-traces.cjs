const fs = require("node:fs");
const path = require("node:path");

const traceRoot = path.join(process.cwd(), ".next");

const shouldStripTrace = (entry) => {
  const normalized = String(entry).replace(/\\/g, "/");

  if (normalized.includes("/.data/")) {
    return true;
  }

  if (normalized.includes("/runtime-data/") || normalized.includes("/runtime-data-disabled/")) {
    return true;
  }

  return /(^|\/)[A-Za-z]:\//.test(normalized);
};

const walk = (dirPath, visit) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, visit);
      continue;
    }

    visit(fullPath);
  }
};

let changedFiles = 0;
let strippedEntries = 0;

if (!fs.existsSync(traceRoot)) {
  console.log("[sanitize-cloudflare-traces] no .next directory found");
  process.exit(0);
}

walk(traceRoot, (filePath) => {
  if (!filePath.endsWith(".nft.json")) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed.files)) {
    return;
  }

  const originalCount = parsed.files.length;
  parsed.files = parsed.files.filter((entry) => !shouldStripTrace(entry));

  if (parsed.files.length === originalCount) {
    return;
  }

  changedFiles += 1;
  strippedEntries += originalCount - parsed.files.length;
  fs.writeFileSync(filePath, JSON.stringify(parsed), "utf8");
});

console.log(
  `[sanitize-cloudflare-traces] updated ${changedFiles} trace files and removed ${strippedEntries} local-only entries`
);
