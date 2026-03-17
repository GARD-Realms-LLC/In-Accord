import { createServer, type Server as HttpServer } from "node:http";

type TemplateMeRuntimeStatus = "stopped" | "starting" | "running" | "stopping" | "error";

export type TemplateMeRuntimeState = {
  status: TemplateMeRuntimeStatus;
  startedAt: string | null;
  stoppedAt: string | null;
  userId: string | null;
  botId: string | null;
  botName: string | null;
  applicationId: string | null;
  botUserId: string | null;
  botTag: string | null;
  guildCount: number;
  controlPort: number | null;
  controlUrl: string | null;
  lastError: string | null;
  updatedAt: string;
};

type StartTemplateMeRuntimeInput = {
  userId: string;
  botId: string;
  botName: string;
  applicationId: string;
  token: string;
};

type ExternalBotClientLike = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  once: (event: string, listener: (...args: unknown[]) => void) => void;
  login: (token: string) => Promise<string>;
  destroy: () => void;
  user?: { id?: string; tag?: string; username?: string };
  guilds?: { cache?: { size?: number } };
};

type ExternalBotSdkLike = {
  Client: new (options?: { intents?: number[] }) => ExternalBotClientLike;
  GatewayIntentBits: { Guilds: number; GuildMembers?: number };
};

const isTemplateMeRateLimitError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /rate limited|rate limit|too many requests|\b429\b/i.test(message);
};

const toTemplateMeRuntimeErrorMessage = (error: unknown, fallback: string) => {
  if (isTemplateMeRateLimitError(error)) {
    return "Template Me upstream is rate limiting bot traffic. The runtime will keep retrying automatically.";
  }

  return error instanceof Error ? error.message : fallback;
};

class TemplateMeBotRuntimeManager {
  private client: ExternalBotClientLike | null = null;
  private controlServer: HttpServer | null = null;
  private readonly controlHost = "127.0.0.1";
  private readonly fixedControlPort = 3030;

  private state: TemplateMeRuntimeState = {
    status: "stopped",
    startedAt: null,
    stoppedAt: null,
    userId: null,
    botId: null,
    botName: null,
    applicationId: null,
    botUserId: null,
    botTag: null,
    guildCount: 0,
    controlPort: null,
    controlUrl: null,
    lastError: null,
    updatedAt: new Date().toISOString(),
  };

  getState() {
    return { ...this.state };
  }

  private setState(next: Partial<TemplateMeRuntimeState>) {
    this.state = {
      ...this.state,
      ...next,
      updatedAt: new Date().toISOString(),
    };
  }

  private bindClient(client: ExternalBotClientLike) {
    client.once("ready", () => {
      const guildCount = Number(client.guilds?.cache?.size ?? 0);
      const botUserId = String(client.user?.id ?? "").trim() || null;
      const botTag = String(client.user?.tag ?? client.user?.username ?? "").trim() || null;

      this.setState({
        status: "running",
        startedAt: this.state.startedAt ?? new Date().toISOString(),
        stoppedAt: null,
        guildCount,
        botUserId,
        botTag,
        controlPort: this.fixedControlPort,
        controlUrl: `http://${this.controlHost}:${this.fixedControlPort}/health`,
        lastError: null,
      });
    });

    client.on("error", (error: unknown) => {
      if (isTemplateMeRateLimitError(error)) {
        return;
      }

      this.setState({
        status: "error",
        lastError: toTemplateMeRuntimeErrorMessage(error, "Unknown upstream client error"),
      });
    });

    client.on("shardDisconnect", () => {
      if (this.state.status === "stopping") {
        return;
      }

      this.client = null;
      this.setState({
        status: "stopped",
        stoppedAt: new Date().toISOString(),
        guildCount: 0,
        controlPort: null,
        controlUrl: null,
      });
    });
  }

  private async ensureControlServer() {
    if (this.controlServer) {
      return;
    }

    const server = createServer((req, res) => {
      const requestUrl = String(req.url ?? "").trim().toLowerCase();

      if (requestUrl === "/health") {
        const payload = {
          status: this.state.status,
          botId: this.state.botId,
          botName: this.state.botName,
          guildCount: this.state.guildCount,
          updatedAt: this.state.updatedAt,
        };

        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(payload));
        return;
      }

      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Not found" }));
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", (error) => {
        reject(error);
      });

      server.listen(this.fixedControlPort, this.controlHost, () => {
        server.removeAllListeners("error");
        resolve();
      });
    }).catch((error) => {
      const message =
        error instanceof Error
          ? error.message
          : `Unable to bind Template Me control endpoint to ${this.controlHost}:${this.fixedControlPort}.`;
      throw new Error(`Template Me control port 3030 failed: ${message}`);
    });

    this.controlServer = server;
  }

  private async stopControlServer() {
    if (!this.controlServer) {
      return;
    }

    const server = this.controlServer;
    this.controlServer = null;

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  async start(input: StartTemplateMeRuntimeInput) {
    const token = String(input.token ?? "").trim();
    if (!token) {
      throw new Error("Template Me bot token is missing.");
    }

    if (this.client) {
      await this.stop("Replaced by new start request");
    }

    this.setState({
      status: "starting",
      userId: input.userId,
      botId: input.botId,
      botName: input.botName,
      applicationId: input.applicationId,
      startedAt: null,
      stoppedAt: null,
      botUserId: null,
      botTag: null,
      guildCount: 0,
      controlPort: null,
      controlUrl: null,
      lastError: null,
    });

    try {
      const upstreamSdkModule = await import("@/In-Accord.js");
      const upstreamSdk = ((
        typeof upstreamSdkModule.Client === "function"
          ? upstreamSdkModule
          : upstreamSdkModule.default
      ) ?? upstreamSdkModule) as unknown as ExternalBotSdkLike;

      const client = new upstreamSdk.Client({
        intents: [
          upstreamSdk.GatewayIntentBits.Guilds,
          ...(typeof upstreamSdk.GatewayIntentBits.GuildMembers === "number"
            ? [upstreamSdk.GatewayIntentBits.GuildMembers]
            : []),
        ],
      });

      this.bindClient(client);
      this.client = client;
      await client.login(token);
      await this.ensureControlServer();

      if (this.state.status === "starting") {
        this.setState({
          status: "running",
          startedAt: new Date().toISOString(),
          stoppedAt: null,
          guildCount: Number(client.guilds?.cache?.size ?? 0),
          botUserId: String(client.user?.id ?? "").trim() || null,
          botTag: String(client.user?.tag ?? client.user?.username ?? "").trim() || null,
          controlPort: this.fixedControlPort,
          controlUrl: `http://${this.controlHost}:${this.fixedControlPort}/health`,
        });
      }
    } catch (error) {
      this.client = null;
      await this.stopControlServer();
      this.setState({
        status: "error",
        stoppedAt: new Date().toISOString(),
        controlPort: null,
        controlUrl: null,
        lastError: toTemplateMeRuntimeErrorMessage(error, "Failed to start Template Me bot runtime."),
      });
      throw error;
    }

    return this.getState();
  }

  async stop(reason?: string) {
    this.setState({
      status: "stopping",
      lastError: null,
    });

    if (this.client) {
      try {
        this.client.destroy();
      } catch {
        // no-op
      }
    }

    this.client = null;
    await this.stopControlServer();
    this.setState({
      status: "stopped",
      stoppedAt: new Date().toISOString(),
      guildCount: 0,
      controlPort: null,
      controlUrl: null,
      lastError: reason ? String(reason).slice(0, 300) : null,
    });

    return this.getState();
  }
}

declare global {
  var __templateMeBotRuntimeManager: TemplateMeBotRuntimeManager | undefined;
}

export const getTemplateMeBotRuntimeManager = () => {
  if (!globalThis.__templateMeBotRuntimeManager) {
    globalThis.__templateMeBotRuntimeManager = new TemplateMeBotRuntimeManager();
  }

  return globalThis.__templateMeBotRuntimeManager;
};
