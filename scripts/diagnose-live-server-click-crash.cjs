const fs = require("fs");
const { execSync } = require("child_process");
const path = require("path");

const { chromium } = require("playwright-core");

const repoRoot = path.resolve(__dirname, "..");
const logPath = path.join(repoRoot, ".codex-server-repro.log");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const databaseName = "inaccordweb";
const verifyUserId = "00000002";
const verifyEmail = "dacowles@gmail.com";
const verifyPassword = "TempVerify!2026";
const verifyPasswordHash =
  "1a296708084605e81febf4a0b9671a92:eb3dc83eee9769ecc176c13eba6ba5f9590eacd23d1d278e34b4ab39de0e342cc1e611b8a47ab3a187f7abf7ffb49c4fb32c941e7e5950b1d0311fa976a7b69d";
const baseUrl = "https://in-accord.net";
const serverButtonName = /Open .*server/i;
const targetServerPath = "/servers/c5125059-2188-4140-9254-b9d0ce36ab47";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const quoteArg = (value) => {
  const normalized = String(value ?? "");
  if (!/[ \t"]/g.test(normalized)) {
    return normalized;
  }

  return `"${normalized.replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\+)$/g, "$1$1")}"`;
};

const runWranglerJson = (args) => {
  const command = ["npx", "wrangler", ...args].map(quoteArg).join(" ");
  const output = execSync(command, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: "cmd.exe",
  });

  return JSON.parse(output);
};

const executeRemoteSql = (command) =>
  runWranglerJson(["d1", "execute", databaseName, "--remote", "--json", "--command", command]);

const readSingleValue = (command, key) => {
  const result = executeRemoteSql(command);
  return result?.[0]?.results?.[0]?.[key] ?? null;
};

const parseSetCookies = (headerValue) => {
  const raw = Array.isArray(headerValue) ? headerValue.join(",") : String(headerValue ?? "");
  const parts = [];
  let start = 0;
  let inExpires = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const nextSlice = raw.slice(index, index + 8).toLowerCase();
    if (nextSlice === "expires=") {
      inExpires = true;
    }
    if (char === ";" && inExpires) {
      inExpires = false;
    }
    if (char === "," && !inExpires) {
      parts.push(raw.slice(start, index).trim());
      start = index + 1;
    }
  }

  const tail = raw.slice(start).trim();
  if (tail) {
    parts.push(tail);
  }

  return parts
    .map((cookie) => {
      const [nameValue, ...attributeParts] = cookie.split(";").map((part) => part.trim());
      const separatorIndex = nameValue.indexOf("=");
      if (separatorIndex < 1) {
        return null;
      }

      const name = nameValue.slice(0, separatorIndex);
      const value = nameValue.slice(separatorIndex + 1);
      const attributes = new Map();

      for (const attribute of attributeParts) {
        const [attributeName, attributeValue] = attribute.split("=");
        attributes.set(String(attributeName ?? "").toLowerCase(), attributeValue ?? true);
      }

      return {
        name,
        value,
        domain: "in-accord.net",
        path: String(attributes.get("path") ?? "/"),
        httpOnly: attributes.has("httponly"),
        secure: attributes.has("secure"),
        sameSite: "Lax",
      };
    })
    .filter(Boolean);
};

const parseSessionIdFromCookieValue = (cookieValue) => {
  const parts = String(cookieValue ?? "").split(".");
  if (parts.length < 4) {
    return null;
  }

  return String(parts[parts.length - 2] ?? "").trim() || null;
};

const summarizeBody = (body) =>
  String(body ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);

const appendLog = (value) => {
  fs.appendFileSync(logPath, `${new Date().toISOString()} ${value}\n`);
};

const main = async () => {
  fs.writeFileSync(logPath, "");
  const progress = [];
  const originalPasswordHash = readSingleValue(
    `select "passwordHash" from "LocalCredential" where "userId" = '${verifyUserId}' limit 1`,
    "passwordHash",
  );

  if (!originalPasswordHash) {
    throw new Error(`Missing LocalCredential row for ${verifyUserId}`);
  }

  let tailProcess = null;
  let browser = null;
  let context = null;
  let page = null;
  let createdSessionId = null;

  const networkEvents = [];
  const consoleEvents = [];
  const pageErrors = [];
  const emitSnapshot = async (label) => {
    let bodySample = "";
    try {
      bodySample = page ? summarizeBody(await page.locator("body").innerText()) : "";
    } catch {
      bodySample = "<unavailable>";
    }

    return {
      label,
      progress,
      finalUrl: page?.url?.() ?? "",
      matchedTargetServer: page?.url?.().includes(targetServerPath) ?? false,
      pageBodySample: bodySample,
      pageErrors,
      consoleEvents,
      networkEvents,
    };
  };

  const watchdog = setTimeout(async () => {
    try {
      appendLog("watchdog-timeout");
      console.log(JSON.stringify(await emitSnapshot("watchdog-timeout"), null, 2));
    } catch (error) {
      appendLog(`watchdog-error ${String(error)}`);
      console.log(JSON.stringify({ label: "watchdog-timeout", progress, watchdogError: String(error) }, null, 2));
    }
    process.exit(2);
  }, 60000);

  try {
    progress.push("set-temp-password");
    appendLog("set-temp-password");
    executeRemoteSql(
      `update "LocalCredential" set "passwordHash" = '${verifyPasswordHash}', "updatedAt" = CURRENT_TIMESTAMP where "userId" = '${verifyUserId}'`,
    );

    progress.push("launch-browser");
    appendLog("launch-browser");
    browser = await chromium.launch({
      executablePath: chromePath,
      headless: true,
    });

    context = await browser.newContext({
      viewport: { width: 1440, height: 980 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Avast/145.0.34156.160",
    });

    const signInResponse = await context.request.post(`${baseUrl}/api/auth/sign-in`, {
      data: {
        email: verifyEmail,
        password: verifyPassword,
      },
    });

    const setCookieHeaders = signInResponse
      .headersArray()
      .filter((header) => header.name.toLowerCase() === "set-cookie")
      .map((header) => header.value);

    const cookies = parseSetCookies(setCookieHeaders);
    if (cookies.length === 0) {
      appendLog(`sign-in-no-cookies status=${signInResponse.status()}`);
      throw new Error(`Sign-in returned no cookies. status=${signInResponse.status()}`);
    }

    progress.push("sign-in-success");
    appendLog("sign-in-success");
    createdSessionId =
      parseSessionIdFromCookieValue(cookies.find((cookie) => cookie.name === "inaccord_session_user_id")?.value) ??
      null;

    await context.addCookies(cookies);

    page = await context.newPage();
    progress.push("page-created");
    appendLog("page-created");

    page.on("console", async (message) => {
      let body = message.text();
      const type = message.type();
      if (type === "error") {
        try {
          const args = await Promise.all(
            message.args().map(async (arg) => {
              try {
                return await arg.jsonValue();
              } catch {
                return String(arg);
              }
            }),
          );
          body = `${body} ${JSON.stringify(args)}`;
        } catch {}
      }

      consoleEvents.push({
        type,
        text: summarizeBody(body),
      });
      appendLog(`console ${type} ${summarizeBody(body)}`);
    });

    page.on("pageerror", (error) => {
      pageErrors.push({
        message: String(error?.message ?? error),
        stack: summarizeBody(error?.stack),
      });
      appendLog(`pageerror ${String(error?.message ?? error)}`);
    });

    page.on("response", async (response) => {
      const url = response.url();
      const status = response.status();
      if (
        status >= 400 ||
        url.includes("_rsc=") ||
        url.includes("/api/profile/preferences") ||
        url.includes("/api/socket/")
      ) {
        let body = "";
        try {
          body = summarizeBody(await response.text());
        } catch {
          body = "<unreadable>";
        }

        networkEvents.push({
          url,
          status,
          body,
        });
        appendLog(`response ${status} ${url} ${body}`);
      }
    });

    await page.goto(`${baseUrl}/users`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    progress.push("users-loaded");
    appendLog(`users-loaded url=${page.url()}`);

    const directButton = page.getByRole("button", { name: serverButtonName }).first();
    if ((await directButton.count()) === 0) {
      const labels = await page
        .locator("a, button")
        .evaluateAll((elements) =>
          elements
            .map((element) => ({
              tag: element.tagName,
              text: (element.textContent || "").replace(/\s+/g, " ").trim(),
              ariaLabel: element.getAttribute("aria-label") || "",
              title: element.getAttribute("title") || "",
              href: element.tagName === "A" ? element.getAttribute("href") || "" : "",
            }))
            .filter((entry) => entry.text || entry.ariaLabel || entry.title || entry.href)
            .slice(0, 200),
        );
      throw new Error(`Could not find a real server button on /users: ${JSON.stringify(labels)}`);
    }

    progress.push("click-server-button");
    appendLog("click-server-button");
    await directButton.click({ noWaitAfter: true, timeout: 10000 });
    await wait(8000);
    progress.push("post-click-wait-finished");
    appendLog(`post-click-wait-finished url=${page.url()}`);

    console.log(JSON.stringify(await emitSnapshot("completed"), null, 2));
  } finally {
    clearTimeout(watchdog);
    appendLog(`finally progress=${JSON.stringify(progress)}`);
    try {
      if (page) {
        await page.close();
      }
    } catch {}
    try {
      if (context) {
        await context.close();
      }
    } catch {}
    try {
      if (browser) {
        await browser.close();
      }
    } catch {}
    try {
      appendLog("restore-password");
      executeRemoteSql(
        `update "LocalCredential" set "passwordHash" = '${originalPasswordHash}', "updatedAt" = CURRENT_TIMESTAMP where "userId" = '${verifyUserId}'`,
      );
    } catch {}

    try {
      if (createdSessionId) {
        appendLog(`delete-session ${createdSessionId}`);
        executeRemoteSql(
          `delete from "InAccordSession" where "userId" = '${verifyUserId}' and "sessionId" = '${createdSessionId}'`,
        );
      }
    } catch {}
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
