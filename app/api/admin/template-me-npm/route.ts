import { NextResponse } from "next/server";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";

import { currentProfile } from "@/lib/current-profile";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StreamStatus = "starting" | "running" | "stopped" | "error";

type StreamSnapshot = {
  output: string;
  status: StreamStatus;
  startedAt: string | null;
  lastExitCode: number | null;
  lastError: string | null;
  updatedAt: string;
};

type StreamManager = {
  process: ChildProcessWithoutNullStreams | null;
  output: string;
  status: StreamStatus;
  startedAt: string | null;
  lastExitCode: number | null;
  lastError: string | null;
  listeners: Set<(snapshot: StreamSnapshot) => void>;
  restartTimer: NodeJS.Timeout | null;
};

const STREAM_SYMBOL = Symbol.for("inaccord.template_me_npm_live_stream");
const MAX_OUTPUT_CHARS = 200_000;
const RESTART_DELAY_MS = 1_000;

const getManager = () => {
  const globalWithManager = globalThis as typeof globalThis & {
    [STREAM_SYMBOL]?: StreamManager;
  };

  if (!globalWithManager[STREAM_SYMBOL]) {
    globalWithManager[STREAM_SYMBOL] = {
      process: null,
      output: "",
      status: "stopped",
      startedAt: null,
      lastExitCode: null,
      lastError: null,
      listeners: new Set(),
      restartTimer: null,
    };
  }

  return globalWithManager[STREAM_SYMBOL]!;
};

const getSnapshot = (manager: StreamManager): StreamSnapshot => ({
  output: manager.output,
  status: manager.status,
  startedAt: manager.startedAt,
  lastExitCode: manager.lastExitCode,
  lastError: manager.lastError,
  updatedAt: new Date().toISOString(),
});

const appendOutput = (manager: StreamManager, chunk: string) => {
  manager.output = `${manager.output}${chunk}`;
  if (manager.output.length > MAX_OUTPUT_CHARS) {
    manager.output = manager.output.slice(manager.output.length - MAX_OUTPUT_CHARS);
  }
};

const broadcast = (manager: StreamManager) => {
  const snapshot = getSnapshot(manager);
  manager.listeners.forEach((listener) => {
    listener(snapshot);
  });
};

const ensureLiveProcess = () => {
  const manager = getManager();
  if (manager.process) {
    return manager;
  }

  if (manager.restartTimer) {
    clearTimeout(manager.restartTimer);
    manager.restartTimer = null;
  }

  const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
  manager.status = "starting";
  manager.lastError = null;
  manager.lastExitCode = null;
  manager.startedAt = new Date().toISOString();
  appendOutput(manager, `\n[${new Date().toISOString()}] starting: npm run bot:template-me:live\n`);

  const child = spawn(npmExecutable, ["run", "bot:template-me:live"], {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    windowsHide: true,
  });

  manager.process = child;
  manager.status = "running";
  broadcast(manager);

  child.stdout.on("data", (chunk) => {
    appendOutput(manager, String(chunk ?? ""));
    broadcast(manager);
  });

  child.stderr.on("data", (chunk) => {
    appendOutput(manager, String(chunk ?? ""));
    broadcast(manager);
  });

  child.on("error", (error) => {
    manager.status = "error";
    manager.lastError = error instanceof Error ? error.message : String(error);
    appendOutput(manager, `\n[${new Date().toISOString()}] process error: ${manager.lastError}\n`);
    broadcast(manager);
  });

  child.on("close", (code) => {
    manager.process = null;
    manager.lastExitCode = typeof code === "number" ? code : 1;
    manager.status = manager.lastExitCode === 0 ? "stopped" : "error";
    appendOutput(manager, `\n[${new Date().toISOString()}] process exited with code ${manager.lastExitCode}\n`);
    broadcast(manager);

    if (manager.listeners.size > 0) {
      manager.restartTimer = setTimeout(() => {
        manager.restartTimer = null;
        ensureLiveProcess();
      }, RESTART_DELAY_MS);
    }
  });

  return manager;
};

const ensureAdmin = async () => {
  const profile = await currentProfile();
  if (!profile) {
    return { ok: false as const, response: new NextResponse("Unauthorized", { status: 401 }) };
  }

  if (!hasInAccordAdministrativeAccess(profile.role)) {
    return { ok: false as const, response: new NextResponse("Forbidden", { status: 403 }) };
  }

  return { ok: true as const, profile };
};

export async function GET(req: Request) {
  try {
    const auth = await ensureAdmin();
    if (!auth.ok) {
      return auth.response;
    }

    const manager = ensureLiveProcess();
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;

        const send = (snapshot: StreamSnapshot) => {
          if (closed) {
            return;
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(snapshot)}\n\n`)
          );
        };

        const onSnapshot = (snapshot: StreamSnapshot) => {
          send(snapshot);
        };

        send(getSnapshot(manager));
        manager.listeners.add(onSnapshot);

        const heartbeat = setInterval(() => {
          if (closed) {
            return;
          }

          controller.enqueue(encoder.encode(": ping\n\n"));
        }, 15_000);

        const closeStream = () => {
          if (closed) {
            return;
          }

          closed = true;
          clearInterval(heartbeat);
          manager.listeners.delete(onSnapshot);

          try {
            controller.close();
          } catch {
            // no-op
          }
        };

        req.signal.addEventListener("abort", closeStream);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[ADMIN_TEMPLATE_ME_NPM_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
