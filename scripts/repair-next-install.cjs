const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = process.cwd();
const TARGET_FILE = path.join(
  ROOT_DIR,
  "node_modules",
  "next",
  "dist",
  "lib",
  "picocolors.js"
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

const repairNextInstall = () => {
  if (fs.existsSync(TARGET_FILE)) {
    console.log("[repair-next-install] next picocolors helper is present.");
    return;
  }

  fs.mkdirSync(path.dirname(TARGET_FILE), { recursive: true });
  fs.writeFileSync(TARGET_FILE, PICOCOLORS_SOURCE, "utf8");
  console.log("[repair-next-install] restored next/dist/lib/picocolors.js");
};

repairNextInstall();
