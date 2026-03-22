import { loadInAccordSdkModule } from "@/lib/inaccord-sdk-runtime";

const TEMPLATE_ME_CONTROL_HOST = "127.0.0.1";
const TEMPLATE_ME_CONTROL_PORT = 3030;
const TEMPLATE_ME_CONTROL_URL = `http://${TEMPLATE_ME_CONTROL_HOST}:${TEMPLATE_ME_CONTROL_PORT}/health`;

type ControlServerLike = {
  close: (callback: () => void) => void;
  once: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener: (event: string, listener: (...args: unknown[]) => void) => void;
  listen: (port: number, host: string, callback: () => void) => void;
};

type HttpModuleLike = {
  createServer: (
    listener: (
      req: { url?: string | null },
      res: { writeHead: (statusCode: number, headers: Record<string, string>) => void; end: (body: string) => void }
    ) => void
  ) => ControlServerLike;
};

let cachedHttpModule: HttpModuleLike | null = null;

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

  private controlServer: ControlServerLike | null = null;

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

  private getHttpModule(): HttpModuleLike {
    if (cachedHttpModule) {
      return cachedHttpModule;
    }

    const builtinLoader = (process as typeof process & {
      getBuiltinModule?: (moduleName: string) => HttpModuleLike | undefined;
    }).getBuiltinModule;

    if (typeof builtinLoader !== "function") {
      throw new Error("Builtin module 'http' is unavailable in this runtime.");
    }

    const loaded = builtinLoader("http");
    if (!loaded) {
      throw new Error("Builtin module 'http' is unavailable in this runtime.");
    }

    cachedHttpModule = loaded;
    return cachedHttpModule;
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
        controlPort: TEMPLATE_ME_CONTROL_PORT,
        controlUrl: TEMPLATE_ME_CONTROL_URL,
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
      void this.closeControlServer().finally(() => {
        this.setState({
          status: "stopped",
          stoppedAt: new Date().toISOString(),
          guildCount: 0,
          controlPort: null,
          controlUrl: null,
        });
      });
    });
  }

  private async ensureControlServer() {
    if (this.controlServer) {
      this.setState({
        controlPort: TEMPLATE_ME_CONTROL_PORT,
        controlUrl: TEMPLATE_ME_CONTROL_URL,
      });
      return;
    }

    const { createServer } = this.getHttpModule();
    const server = createServer((req, res) => {
      if (String(req.url ?? "").toLowerCase() !== "/health") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }

      const state = this.getState();
      const ok = state.status === "running";

      res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: state.status,
          botId: state.botId,
          botName: state.botName,
          botTag: state.botTag,
          guildCount: state.guildCount,
          applicationId: state.applicationId,
          updatedAt: state.updatedAt,
          lastError: state.lastError,
        })
      );
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(TEMPLATE_ME_CONTROL_PORT, TEMPLATE_ME_CONTROL_HOST, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });

    this.controlServer = server;
    this.setState({
      controlPort: TEMPLATE_ME_CONTROL_PORT,
      controlUrl: TEMPLATE_ME_CONTROL_URL,
    });
  }

  private async closeControlServer() {
    const currentServer = this.controlServer;
    if (!currentServer) {
      this.setState({
        controlPort: null,
        controlUrl: null,
      });
      return;
    }

    this.controlServer = null;

    await new Promise<void>((resolve) => {
      currentServer.close(() => resolve());
    });

    this.setState({
      controlPort: null,
      controlUrl: null,
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
      const upstreamSdkModule = await loadInAccordSdkModule<{
        Client?: ExternalBotSdkLike["Client"];
        GatewayIntentBits?: ExternalBotSdkLike["GatewayIntentBits"];
        default?: unknown;
      }>();
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
      await this.ensureControlServer();
      this.client = client;
      await client.login(token);

      if (this.state.status === "starting") {
        this.setState({
          status: "running",
          startedAt: new Date().toISOString(),
          stoppedAt: null,
          guildCount: Number(client.guilds?.cache?.size ?? 0),
          botUserId: String(client.user?.id ?? "").trim() || null,
          botTag: String(client.user?.tag ?? client.user?.username ?? "").trim() || null,
          controlPort: TEMPLATE_ME_CONTROL_PORT,
          controlUrl: TEMPLATE_ME_CONTROL_URL,
        });
      }
    } catch (error) {
      this.client = null;
      this.setState({
        status: "error",
        stoppedAt: new Date().toISOString(),
        controlPort: this.controlServer ? TEMPLATE_ME_CONTROL_PORT : null,
        controlUrl: this.controlServer ? TEMPLATE_ME_CONTROL_URL : null,
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
    await this.closeControlServer();
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
