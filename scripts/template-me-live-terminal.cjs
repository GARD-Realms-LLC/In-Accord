const HEALTH_URL = "http://127.0.0.1:3030/health";
const POLL_INTERVAL_MS = 2500;
const HEALTH_TIMEOUT_MS = 1500;

const toIso = () => new Date().toISOString();

const checkHealth = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(HEALTH_URL, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    return {
      ok: response.ok,
      httpStatus: response.status,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      payload: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const logLine = (line) => {
  process.stdout.write(`${line}\n`);
};

let stopped = false;
let timer = null;

const stop = (signal) => {
  if (stopped) {
    return;
  }

  stopped = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  logLine(`[${toIso()}] [template-me-live] received ${signal}; exiting.`);
  process.exit(0);
};

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

const loop = async () => {
  if (stopped) {
    return;
  }

  const rssMb = Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;
  const health = await checkHealth();

  if (health.ok) {
    const status = typeof health.payload?.status === "string" ? health.payload.status : "unknown";
    const guildCount =
      typeof health.payload?.guildCount === "number" && Number.isFinite(health.payload.guildCount)
        ? health.payload.guildCount
        : "n/a";

    logLine(
      `[${toIso()}] [template-me-live] health=UP http=${health.httpStatus} runtime=${status} guilds=${guildCount} rss=${rssMb}MB`
    );
  } else {
    logLine(
      `[${toIso()}] [template-me-live] health=DOWN http=${health.httpStatus ?? "n/a"} error=${health.error ?? "unreachable"} rss=${rssMb}MB`
    );
  }

  timer = setTimeout(loop, POLL_INTERVAL_MS);
};

logLine(`[${toIso()}] [template-me-live] started. polling ${HEALTH_URL} every ${POLL_INTERVAL_MS}ms`);
void loop();
