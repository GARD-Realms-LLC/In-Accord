const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = process.cwd();
const NEXT_PICOCOLORS_FILE = path.join(
  ROOT_DIR,
  "node_modules",
  "next",
  "dist",
  "lib",
  "picocolors.js"
);
const MINIMATCH_ESM_FILE = path.join(
  ROOT_DIR,
  "node_modules",
  "minimatch",
  "dist",
  "esm",
  "index.js"
);
const MINIMATCH_LEGACY_BRACE_EXPANSION_FILE = path.join(
  ROOT_DIR,
  "node_modules",
  "minimatch",
  "node_modules",
  "brace-expansion",
  "index.js"
);

const PICOCOLORS_SOURCE = `"use strict";

const processRef = globalThis && globalThis.process ? globalThis.process : null;
const env = processRef && processRef.env ? processRef.env : null;
const stdout = processRef && processRef.stdout ? processRef.stdout : null;
const enabled =
  !!env &&
  !env.NO_COLOR &&
  (env.FORCE_COLOR || (stdout && stdout.isTTY && !env.CI && env.TERM !== "dumb"));

const replaceClose = (value, close, replace, index) => {
  const start = value.substring(0, index) + replace;
  const end = value.substring(index + close.length);
  const nextIndex = end.indexOf(close);
  return nextIndex !== -1
    ? start + replaceClose(end, close, replace, nextIndex)
    : start + end;
};

const formatter = (open, close, replace = open) => {
  if (!enabled) {
    return String;
  }

  return (input) => {
    const value = "" + input;
    const index = value.indexOf(close, open.length);
    return index !== -1
      ? open + replaceClose(value, close, replace, index) + close
      : open + value + close;
  };
};

const api = {
  reset: enabled ? (input) => "\\x1b[0m" + input + "\\x1b[0m" : String,
  bold: formatter("\\x1b[1m", "\\x1b[22m", "\\x1b[22m\\x1b[1m"),
  dim: formatter("\\x1b[2m", "\\x1b[22m", "\\x1b[22m\\x1b[2m"),
  italic: formatter("\\x1b[3m", "\\x1b[23m"),
  underline: formatter("\\x1b[4m", "\\x1b[24m"),
  inverse: formatter("\\x1b[7m", "\\x1b[27m"),
  hidden: formatter("\\x1b[8m", "\\x1b[28m"),
  strikethrough: formatter("\\x1b[9m", "\\x1b[29m"),
  black: formatter("\\x1b[30m", "\\x1b[39m"),
  red: formatter("\\x1b[31m", "\\x1b[39m"),
  green: formatter("\\x1b[32m", "\\x1b[39m"),
  yellow: formatter("\\x1b[33m", "\\x1b[39m"),
  blue: formatter("\\x1b[34m", "\\x1b[39m"),
  magenta: formatter("\\x1b[35m", "\\x1b[39m"),
  purple: formatter("\\x1b[38;2;173;127;168m", "\\x1b[39m"),
  cyan: formatter("\\x1b[36m", "\\x1b[39m"),
  white: formatter("\\x1b[37m", "\\x1b[39m"),
  gray: formatter("\\x1b[90m", "\\x1b[39m"),
  bgBlack: formatter("\\x1b[40m", "\\x1b[49m"),
  bgRed: formatter("\\x1b[41m", "\\x1b[49m"),
  bgGreen: formatter("\\x1b[42m", "\\x1b[49m"),
  bgYellow: formatter("\\x1b[43m", "\\x1b[49m"),
  bgBlue: formatter("\\x1b[44m", "\\x1b[49m"),
  bgMagenta: formatter("\\x1b[45m", "\\x1b[49m"),
  bgCyan: formatter("\\x1b[46m", "\\x1b[49m"),
  bgWhite: formatter("\\x1b[47m", "\\x1b[49m"),
};

Object.defineProperty(api, "__esModule", { value: true });

module.exports = api;
`;

const MINIMATCH_IMPORT_SENTINEL = "brace-expansion expand helper is unavailable";
const MINIMATCH_IMPORT_TARGET = `import * as braceExpansion from 'brace-expansion';
const expand = typeof braceExpansion.expand === 'function'
  ? braceExpansion.expand
  : typeof braceExpansion.default === 'function'
    ? braceExpansion.default
    : typeof braceExpansion.default?.expand === 'function'
      ? braceExpansion.default.expand
      : (() => {
          throw new TypeError('brace-expansion expand helper is unavailable');
        });`;
const MINIMATCH_IMPORT_LEGACY_PATCHES = [
  "import { expand } from 'brace-expansion';",
  `import * as braceExpansion from 'brace-expansion';\nconst { expand } = braceExpansion;`,
];
const BALANCED_MATCH_SENTINEL = "balanced-match helper is unavailable";
const BALANCED_MATCH_REQUIRE_TARGET = "var balanced = require('balanced-match');";
const BALANCED_MATCH_REQUIRE_REPLACEMENT = `var balancedMatch = require('balanced-match');
var balanced = typeof balancedMatch === 'function'
  ? balancedMatch
  : typeof balancedMatch.balanced === 'function'
    ? balancedMatch.balanced
    : typeof balancedMatch.default === 'function'
      ? balancedMatch.default
      : typeof balancedMatch.default?.balanced === 'function'
        ? balancedMatch.default.balanced
        : function () {
            throw new TypeError('balanced-match helper is unavailable');
          };`;

const repairNextPicocolors = () => {
  if (fs.existsSync(NEXT_PICOCOLORS_FILE)) {
    console.log("[repair-next-install] next picocolors helper is present.");
    return;
  }

  fs.mkdirSync(path.dirname(NEXT_PICOCOLORS_FILE), { recursive: true });
  fs.writeFileSync(NEXT_PICOCOLORS_FILE, PICOCOLORS_SOURCE, "utf8");
  console.log("[repair-next-install] restored next/dist/lib/picocolors.js");
};

const repairMinimatchEsmImport = () => {
  if (!fs.existsSync(MINIMATCH_ESM_FILE)) {
    console.log("[repair-next-install] minimatch ESM entry not found, skipping import patch.");
    return;
  }

  const source = fs.readFileSync(MINIMATCH_ESM_FILE, "utf8");
  if (source.includes(MINIMATCH_IMPORT_SENTINEL)) {
    console.log("[repair-next-install] minimatch ESM import already correct.");
    return;
  }

  const legacyPatch = MINIMATCH_IMPORT_LEGACY_PATCHES.find((candidate) =>
    source.includes(candidate)
  );

  if (!legacyPatch) {
    console.log("[repair-next-install] minimatch ESM import target not found, skipping.");
    return;
  }

  fs.writeFileSync(
    MINIMATCH_ESM_FILE,
    source.replace(legacyPatch, MINIMATCH_IMPORT_TARGET),
    "utf8"
  );
  console.log("[repair-next-install] patched minimatch ESM brace-expansion compatibility shim.");
};

const repairNestedBraceExpansionBalancedMatch = () => {
  if (!fs.existsSync(MINIMATCH_LEGACY_BRACE_EXPANSION_FILE)) {
    console.log("[repair-next-install] nested brace-expansion entry not found, skipping balanced-match patch.");
    return;
  }

  const source = fs.readFileSync(MINIMATCH_LEGACY_BRACE_EXPANSION_FILE, "utf8");
  if (source.includes(BALANCED_MATCH_SENTINEL)) {
    console.log("[repair-next-install] nested brace-expansion balanced-match shim already patched.");
    return;
  }

  if (!source.includes(BALANCED_MATCH_REQUIRE_TARGET)) {
    console.log("[repair-next-install] nested brace-expansion balanced-match target not found, skipping.");
    return;
  }

  fs.writeFileSync(
    MINIMATCH_LEGACY_BRACE_EXPANSION_FILE,
    source.replace(BALANCED_MATCH_REQUIRE_TARGET, BALANCED_MATCH_REQUIRE_REPLACEMENT),
    "utf8"
  );
  console.log("[repair-next-install] patched nested brace-expansion balanced-match compatibility shim.");
};

repairNextPicocolors();
repairMinimatchEsmImport();
repairNestedBraceExpansionBalancedMatch();
