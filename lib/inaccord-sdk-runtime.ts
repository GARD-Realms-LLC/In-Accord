import "server-only";

type CryptoModule = typeof import("crypto");
type FsPromisesModule = typeof import("fs/promises");
type ModuleModule = typeof import("module");
type PathModule = typeof import("path");

const SDK_SOURCE_FILE = "In-Accord.js";
const ENCRYPTED_SDK_FILE = "In-Accord.sdk.enc";
const SDK_KEY_MATERIAL = [
  73, 110, 65, 99, 99, 111, 114, 100, 68, 101, 115, 107, 116, 111, 112, 83, 100,
  107, 69, 110, 99, 114, 121, 112, 116, 105, 111, 110, 86, 49,
]
  .map((value) => String.fromCharCode(value))
  .join("");

declare global {
  // eslint-disable-next-line no-var
  var __inaccordSdkRuntimeCache:
    | {
        source: string;
        sourceHash: string;
        moduleExports: unknown;
      }
    | undefined;
}

const getBuiltinModule = <TModule,>(name: string): TModule => {
  const processWithBuiltinLookup = process as NodeJS.Process & {
    getBuiltinModule?: (moduleName: string) => unknown;
  };

  if (typeof processWithBuiltinLookup.getBuiltinModule === "function") {
    const loaded = processWithBuiltinLookup.getBuiltinModule(name);
    if (loaded) {
      return loaded as TModule;
    }
  }

  throw new Error(`Builtin module '${name}' is unavailable in this runtime.`);
};

const getCryptoModule = () => getBuiltinModule<CryptoModule>("crypto");
const getFsPromisesModule = () => getBuiltinModule<FsPromisesModule>("fs/promises");
const getModuleModule = () => getBuiltinModule<ModuleModule>("module");
const getPathModule = () => getBuiltinModule<PathModule>("path");

const getSdkPaths = () => {
  const pathModule = getPathModule();
  const root = process.cwd();

  return {
    root,
    sourcePath: pathModule.join(root, SDK_SOURCE_FILE),
    encryptedPath: pathModule.join(root, ENCRYPTED_SDK_FILE),
    packageJsonPath: pathModule.join(root, "package.json"),
  };
};

const deriveSdkKey = () => {
  const cryptoModule = getCryptoModule();
  return cryptoModule.createHash("sha256").update(SDK_KEY_MATERIAL).digest();
};

const readFileIfPresent = async (filePath: string) => {
  const fsPromises = getFsPromisesModule();

  try {
    return await fsPromises.readFile(filePath, "utf8");
  } catch {
    return null;
  }
};

const decryptPackagedSdkSource = async () => {
  const encryptedPayload = await readFileIfPresent(getSdkPaths().encryptedPath);
  if (!encryptedPayload) {
    return null;
  }

  let parsedPayload: {
    iv?: string;
    tag?: string;
    data?: string;
  } | null = null;

  try {
    parsedPayload = JSON.parse(encryptedPayload) as {
      iv?: string;
      tag?: string;
      data?: string;
    };
  } catch {
    throw new Error("Encrypted In-Accord SDK payload is invalid JSON.");
  }

  const iv = String(parsedPayload?.iv ?? "").trim();
  const tag = String(parsedPayload?.tag ?? "").trim();
  const data = String(parsedPayload?.data ?? "").trim();

  if (!iv || !tag || !data) {
    throw new Error("Encrypted In-Accord SDK payload is incomplete.");
  }

  const cryptoModule = getCryptoModule();
  const decipher = cryptoModule.createDecipheriv(
    "aes-256-gcm",
    deriveSdkKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]).toString("utf8");
};

export const readInAccordSdkSource = async () => {
  if (globalThis.__inaccordSdkRuntimeCache?.source) {
    return globalThis.__inaccordSdkRuntimeCache.source;
  }

  const plaintextSource = await readFileIfPresent(getSdkPaths().sourcePath);
  const source = plaintextSource ?? (await decryptPackagedSdkSource());

  if (!source) {
    throw new Error("In-Accord SDK source is unavailable in this runtime.");
  }

  const cryptoModule = getCryptoModule();
  const sourceHash = cryptoModule.createHash("sha256").update(source).digest("hex");
  globalThis.__inaccordSdkRuntimeCache = {
    source,
    sourceHash,
    moduleExports: globalThis.__inaccordSdkRuntimeCache?.moduleExports,
  };

  return source;
};

export const getInAccordSdkSourceHash = async () => {
  if (globalThis.__inaccordSdkRuntimeCache?.sourceHash) {
    return globalThis.__inaccordSdkRuntimeCache.sourceHash;
  }

  await readInAccordSdkSource();
  return globalThis.__inaccordSdkRuntimeCache?.sourceHash ?? null;
};

export const loadInAccordSdkModule = async <TModule = unknown>() => {
  if (globalThis.__inaccordSdkRuntimeCache?.moduleExports) {
    return globalThis.__inaccordSdkRuntimeCache.moduleExports as TModule;
  }

  const source = await readInAccordSdkSource();
  const moduleModule = getModuleModule();
  const { packageJsonPath, sourcePath, root } = getSdkPaths();
  const requireFromRoot = moduleModule.createRequire(packageJsonPath);

  const commonJsModule = { exports: {} as unknown };
  const evaluator = new Function(
    "require",
    "module",
    "exports",
    "__filename",
    "__dirname",
    `${source}\n//# sourceURL=${sourcePath.replace(/\\/g, "/")}`,
  );

  evaluator(
    requireFromRoot,
    commonJsModule,
    commonJsModule.exports,
    sourcePath,
    root,
  );

  globalThis.__inaccordSdkRuntimeCache = {
    source,
    sourceHash:
      globalThis.__inaccordSdkRuntimeCache?.sourceHash ??
      getCryptoModule().createHash("sha256").update(source).digest("hex"),
    moduleExports: commonJsModule.exports,
  };

  return commonJsModule.exports as TModule;
};