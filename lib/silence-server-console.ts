declare global {
  // eslint-disable-next-line no-var
  var __inaccordConsoleSilenced: boolean | undefined;
}

const shouldSilence = (process.env.ENABLE_SERVER_LOGS ?? "false").toLowerCase() !== "true";

if (shouldSilence && !globalThis.__inaccordConsoleSilenced) {
  const noop = () => {};

  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.error = noop;

  globalThis.__inaccordConsoleSilenced = true;
}

export {};
