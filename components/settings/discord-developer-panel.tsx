"use client";

import { useEffect, useMemo, useState } from "react";
import { AppWindow, Bot, Link2, Loader2, ShieldCheck, ShieldX, Trash2 } from "lucide-react";
import axios from "axios";

import { BotCommandsDialog } from "@/components/bot-commands-dialog";
import { Button } from "@/components/ui/button";
import type { BotGhostIntegrationConfig, OtherAppConfig, OtherBotConfig } from "@/lib/user-preferences";

type OtherDeveloperPanelProps = {
  apps: OtherAppConfig[];
  bots: OtherBotConfig[];
  botGhost: BotGhostIntegrationConfig;
  botAutoImportOnSave: boolean;
  isSaving: boolean;
  status: string | null;
  onStatusChange: (value: string | null) => void;
  onSavingChange: (value: boolean) => void;
  onAppsChange: (value: OtherAppConfig[]) => void;
  onBotsChange: (value: OtherBotConfig[]) => void;
  onBotGhostChange: (value: BotGhostIntegrationConfig) => void;
  onBotAutoImportOnSaveChange: (value: boolean) => void;
};

const sanitizeScopes = (value: string) =>
  Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0)
    )
  );

const sanitizeCommandNames = (value: string) =>
  Array.from(
    new Set(
      value
        .split(",")
        .map((item) =>
          item
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, "")
            .replace(/[_\s]+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
        )
        .filter((item) => item.length > 0)
    )
  ).slice(0, 500);

const makeId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `cfg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

type OwnedServerOption = {
  serverId: string;
  serverName: string;
};

export const OtherDeveloperPanel = ({
  apps,
  bots,
  botGhost,
  botAutoImportOnSave,
  isSaving,
  status,
  onStatusChange,
  onSavingChange,
  onAppsChange,
  onBotsChange,
  onBotGhostChange,
  onBotAutoImportOnSaveChange,
}: OtherDeveloperPanelProps) => {
  const [appSearch, setAppSearch] = useState("");
  const [botSearch, setBotSearch] = useState("");
  const [appFilter, setAppFilter] = useState<"ALL" | "ENABLED" | "DISABLED">("ALL");
  const [botFilter, setBotFilter] = useState<"ALL" | "ENABLED" | "DISABLED">("ALL");

  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [editingBotId, setEditingBotId] = useState<string | null>(null);
  const [appDrafts, setAppDrafts] = useState<Record<string, { name: string; applicationId: string; clientId: string; redirectUri: string; scopes: string }>>({});
  const [botDrafts, setBotDrafts] = useState<Record<string, { name: string; applicationId: string; botUserId: string; token: string; commands: string; permissions: string }>>({});

  const [newAppName, setNewAppName] = useState("");
  const [newAppId, setNewAppId] = useState("");
  const [newClientId, setNewClientId] = useState("");
  const [newRedirectUri, setNewRedirectUri] = useState("");
  const [newAppScopes, setNewAppScopes] = useState("applications.commands, identify");

  const [newBotName, setNewBotName] = useState("");
  const [newBotAppId, setNewBotAppId] = useState("");
  const [newBotUserId, setNewBotUserId] = useState("");
  const [newBotToken, setNewBotToken] = useState("");
  const [newBotCommands, setNewBotCommands] = useState("help, ping, echo");
  const [newBotPermissions, setNewBotPermissions] = useState("send_messages, view_channel");
  const [ownedServers, setOwnedServers] = useState<OwnedServerOption[]>([]);
  const [selectedServerByBotId, setSelectedServerByBotId] = useState<Record<string, string>>({});
  const [attachingBotId, setAttachingBotId] = useState<string | null>(null);
  const [importingCommandsBotId, setImportingCommandsBotId] = useState<string | null>(null);
  const [commandsDialogBotId, setCommandsDialogBotId] = useState<string | null>(null);
  const [botGhostWebhookUrl, setBotGhostWebhookUrl] = useState(botGhost.webhookUrl ?? "");
  const [botGhostApiKey, setBotGhostApiKey] = useState("");
  const [isCheckingBotGhostHealth, setIsCheckingBotGhostHealth] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const hydrateOwnedServers = async () => {
      try {
        const response = await axios.get<{ ownedServers?: Array<{ serverId?: string; serverName?: string }> }>(
          "/api/server-tags"
        );

        if (cancelled) {
          return;
        }

        const normalized = Array.isArray(response.data?.ownedServers)
          ? response.data.ownedServers
              .map((entry) => ({
                serverId: String(entry.serverId ?? "").trim(),
                serverName: String(entry.serverName ?? "").trim() || "Unnamed server",
              }))
              .filter((entry) => entry.serverId.length > 0)
          : [];

        setOwnedServers(normalized);
      } catch {
        if (!cancelled) {
          setOwnedServers([]);
        }
      }
    };

    void hydrateOwnedServers();

    return () => {
      cancelled = true;
    };
  }, []);

  const onAttachBotToInAccordServer = async (botId: string) => {
    const selectedServerId = String(selectedServerByBotId[botId] ?? "").trim();
    if (!selectedServerId) {
      onStatusChange("Select an In-Accord server before adding the bot.");
      return;
    }

    try {
      setAttachingBotId(botId);
      onStatusChange(null);

      const response = await axios.post<{ message?: string }>(
        `/api/servers/${selectedServerId}/integrations/bots/attach`,
        { botId }
      );

      onStatusChange(response.data?.message || "Bot added to In-Accord server.");
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (typeof error.response?.data === "string"
            ? error.response.data
            : (error.response?.data as { message?: string; error?: string } | undefined)?.message ||
              (error.response?.data as { message?: string; error?: string } | undefined)?.error ||
              "Could not add bot to In-Accord server.")
        : "Could not add bot to In-Accord server.";

      onStatusChange(message);
    } finally {
      setAttachingBotId(null);
    }
  };

  const onImportBotCommands = async (
    botId: string,
    options?: {
      suppressStatus?: boolean;
      baseBots?: OtherBotConfig[];
    }
  ): Promise<{ importedCount: number; commands: string[] }> => {
    try {
      setImportingCommandsBotId(botId);
      if (!options?.suppressStatus) {
        onStatusChange(null);
      }

      const response = await axios.post<{ importedCount?: number; commands?: string[]; message?: string }>(
        `/api/integrations/discord/bots/${encodeURIComponent(botId)}/commands/import`
      );

      const importedCommands = Array.isArray(response.data?.commands)
        ? sanitizeCommandNames(response.data.commands.join(","))
        : [];

      if (importedCommands.length > 0) {
        const sourceBots = options?.baseBots ?? bots;
        const nextBots = sourceBots.map((item) =>
          item.id === botId
            ? {
                ...item,
                commands: importedCommands,
              }
            : item
        );

        onBotsChange(nextBots);
      }

      const importedCount = Number(response.data?.importedCount ?? importedCommands.length ?? 0);
      if (!options?.suppressStatus) {
        onStatusChange(response.data?.message || `Imported ${importedCount} command${importedCount === 1 ? "" : "s"}.`);
      }

      return {
        importedCount,
        commands: importedCommands,
      };
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (typeof error.response?.data === "string"
            ? error.response.data
            : (error.response?.data as { message?: string; error?: string } | undefined)?.message ||
              (error.response?.data as { message?: string; error?: string } | undefined)?.error ||
                "Could not import commands from Discord.")
              : "Could not import commands from Discord.";

      if (!options?.suppressStatus) {
        onStatusChange(message);
      }

      throw new Error(message);
    } finally {
      setImportingCommandsBotId(null);
    }
  };

  const connectedCount = useMemo(
    () =>
      apps.filter((item) => item.enabled).length +
      bots.filter((item) => item.enabled).length +
      (botGhost.enabled ? 1 : 0),
    [apps, botGhost.enabled, bots]
  );

  useEffect(() => {
    setBotGhostWebhookUrl(botGhost.webhookUrl ?? "");
  }, [botGhost.webhookUrl]);

  const filteredApps = useMemo(() => {
    const query = appSearch.trim().toLowerCase();
    return apps.filter((item) => {
      const statusMatch =
        appFilter === "ALL" || (appFilter === "ENABLED" ? item.enabled : !item.enabled);

      if (!statusMatch) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [item.name, item.applicationId, item.clientId, item.redirectUri]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [appFilter, appSearch, apps]);

  const filteredBots = useMemo(() => {
    const query = botSearch.trim().toLowerCase();
    return bots.filter((item) => {
      const statusMatch =
        botFilter === "ALL" || (botFilter === "ENABLED" ? item.enabled : !item.enabled);

      if (!statusMatch) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [item.name, item.applicationId, item.botUserId, item.tokenHint]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [botFilter, botSearch, bots]);

  const persist = async (
    nextApps: OtherAppConfig[],
    nextBots: OtherBotConfig[],
    nextBotGhost: BotGhostIntegrationConfig,
    successMessage: string,
    botTokens?: Record<string, string>,
    nextBotAutoImportOnSave?: boolean
  ): Promise<boolean> => {
    try {
      onSavingChange(true);
      onStatusChange(null);

      await axios.patch("/api/profile/preferences", {
        OtherApps: nextApps,
        OtherBots: nextBots,
        botGhost: nextBotGhost,
        OtherBotTokens: botTokens,
        OtherBotAutoImportOnSave:
          typeof nextBotAutoImportOnSave === "boolean"
            ? nextBotAutoImportOnSave
            : botAutoImportOnSave,
      });

      onAppsChange(nextApps);
      onBotsChange(nextBots);
      onBotGhostChange(nextBotGhost);
      if (typeof nextBotAutoImportOnSave === "boolean") {
        onBotAutoImportOnSaveChange(nextBotAutoImportOnSave);
      }
      onStatusChange(successMessage);
      return true;
    } catch {
      onStatusChange("Could not save Other settings right now.");
      return false;
    } finally {
      onSavingChange(false);
    }
  };

  const onAddApp = async () => {
    const name = newAppName.trim();
    const applicationId = newAppId.trim();
    const clientId = newClientId.trim();
    const redirectUri = newRedirectUri.trim();

    if (!name || !applicationId || !clientId) {
      onStatusChange("App name, Application ID, and Client ID are required.");
      return;
    }

    if (redirectUri && !/^https?:\/\//i.test(redirectUri)) {
      onStatusChange("Redirect URI must start with http:// or https://.");
      return;
    }

    const nextApps: OtherAppConfig[] = [
      {
        id: makeId(),
        name,
        applicationId,
        clientId,
        scopes: sanitizeScopes(newAppScopes),
        redirectUri,
        enabled: true,
        createdAt: new Date().toISOString(),
      },
      ...apps,
    ];

    await persist(nextApps, bots, botGhost, "Other app saved.");

    setNewAppName("");
    setNewAppId("");
    setNewClientId("");
    setNewRedirectUri("");
    setNewAppScopes("applications.commands, identify");
  };

  const onAddBot = async () => {
    const name = newBotName.trim();
    const applicationId = newBotAppId.trim();
    const botUserId = newBotUserId.trim();
    const token = newBotToken.trim();

    if (!name || !applicationId) {
      onStatusChange("Bot name and Application ID are required.");
      return;
    }

    const tokenHint = token.length === 0 ? "" : `••••••••${token.slice(-4)}`;

    const nextBots: OtherBotConfig[] = [
      {
        id: makeId(),
        name,
        applicationId,
        botUserId,
        tokenHint,
        commands: sanitizeCommandNames(newBotCommands),
        permissions: sanitizeScopes(newBotPermissions),
        enabled: true,
        createdAt: new Date().toISOString(),
      },
      ...bots,
    ];

    await persist(
      apps,
      nextBots,
      botGhost,
      "Other bot saved. Use 'Add to In-Accord Server' below to make it appear in a server.",
      token ? { [nextBots[0].id]: token } : undefined
    );

    if (botAutoImportOnSave && token) {
      try {
        const imported = await onImportBotCommands(nextBots[0].id, {
          suppressStatus: true,
          baseBots: nextBots,
        });
        onStatusChange(
          `Other bot saved and imported ${imported.importedCount} command${imported.importedCount === 1 ? "" : "s"}.`
        );
      } catch (error) {
        const message = error instanceof Error && error.message
          ? error.message
          : "Could not import commands from Discord.";
        onStatusChange(`Other bot saved, but command import failed: ${message}`);
      }
    }

    setNewBotName("");
    setNewBotAppId("");
    setNewBotUserId("");
    setNewBotToken("");
    setNewBotCommands("help, ping, echo");
    setNewBotPermissions("send_messages, view_channel");
  };

  const onToggleApp = async (id: string) => {
    const nextApps = apps.map((item) =>
      item.id === id
        ? {
            ...item,
            enabled: !item.enabled,
          }
        : item
    );

    await persist(nextApps, bots, botGhost, "Other app updated.");
  };

  const onToggleBot = async (id: string) => {
    const nextBots = bots.map((item) =>
      item.id === id
        ? {
            ...item,
            enabled: !item.enabled,
          }
        : item
    );

    await persist(apps, nextBots, botGhost, "Other bot updated.");
  };

  const onRemoveApp = async (id: string) => {
    const nextApps = apps.filter((item) => item.id !== id);
    await persist(nextApps, bots, botGhost, "Other app removed.");
  };

  const onRemoveBot = async (id: string) => {
    const nextBots = bots.filter((item) => item.id !== id);
    const saved = await persist(apps, nextBots, botGhost, "Other bot removed.");

    if (!saved) {
      return;
    }

    try {
      const response = await axios.post<{ detachedCount?: number; message?: string }>(
        `/api/integrations/discord/bots/${encodeURIComponent(id)}/detach`
      );

      const detachedCount = Number(response.data?.detachedCount ?? 0);
      onStatusChange(
        response.data?.message ||
          `Other bot removed and detached from ${detachedCount} server member${detachedCount === 1 ? "" : "s"}.`
      );
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (typeof error.response?.data === "string"
            ? error.response.data
            : (error.response?.data as { message?: string; error?: string } | undefined)?.message ||
              (error.response?.data as { message?: string; error?: string } | undefined)?.error ||
              "Could not detach removed bot from server members.")
        : "Could not detach removed bot from server members.";

      onStatusChange(`Other bot removed, but detach cleanup failed: ${message}`);
    }
  };

  const startEditApp = (id: string) => {
    const current = apps.find((item) => item.id === id);
    if (!current) {
      return;
    }

    setEditingAppId(id);
    setAppDrafts((state) => ({
      ...state,
      [id]: {
        name: current.name,
        applicationId: current.applicationId,
        clientId: current.clientId,
        redirectUri: current.redirectUri,
        scopes: current.scopes.join(", "),
      },
    }));
  };

  const startEditBot = (id: string) => {
    const current = bots.find((item) => item.id === id);
    if (!current) {
      return;
    }

    setEditingBotId(id);
    setBotDrafts((state) => ({
      ...state,
      [id]: {
        name: current.name,
        applicationId: current.applicationId,
        botUserId: current.botUserId,
        token: "",
        commands: (current.commands ?? []).join(", "),
        permissions: current.permissions.join(", "),
      },
    }));
  };

  const saveEditApp = async (id: string) => {
    const draft = appDrafts[id];
    if (!draft) {
      return;
    }

    const nextApps = apps.map((item) =>
      item.id === id
        ? {
            ...item,
            name: draft.name.trim() || item.name,
            applicationId: draft.applicationId.trim() || item.applicationId,
            clientId: draft.clientId.trim() || item.clientId,
            redirectUri: draft.redirectUri.trim(),
            scopes: sanitizeScopes(draft.scopes),
          }
        : item
    );

    await persist(nextApps, bots, botGhost, "Other app updated.");
    setEditingAppId(null);
  };

  const saveEditBot = async (id: string) => {
    const draft = botDrafts[id];
    if (!draft) {
      return;
    }

    const nextBots = bots.map((item) =>
      item.id === id
        ? {
            ...item,
            name: draft.name.trim() || item.name,
            applicationId: draft.applicationId.trim() || item.applicationId,
            botUserId: draft.botUserId.trim(),
            commands: sanitizeCommandNames(draft.commands),
            permissions: sanitizeScopes(draft.permissions),
          }
        : item
    );

    const token = draft.token.trim();

    await persist(
      apps,
      nextBots,
      botGhost,
      "Other bot updated.",
      token ? { [id]: token } : undefined
    );

    if (botAutoImportOnSave && token) {
      try {
        const imported = await onImportBotCommands(id, {
          suppressStatus: true,
          baseBots: nextBots,
        });
        onStatusChange(
          `Other bot updated and imported ${imported.importedCount} command${imported.importedCount === 1 ? "" : "s"}.`
        );
      } catch (error) {
        const message = error instanceof Error && error.message
          ? error.message
          : "Could not import commands from Other.";
        onStatusChange(`Other bot updated, but command import failed: ${message}`);
      }
    }

    setEditingBotId(null);
  };

  const getApiKeyHint = (value: string) => {
    const normalized = value.trim();
    if (!normalized) {
      return "";
    }

    return `••••••••${normalized.slice(-4)}`;
  };

  const validateBotGhost = () => {
    const webhook = botGhostWebhookUrl.trim();
    if (!webhook) {
      return "Webhook URL is required.";
    }

    if (!/^https:\/\//i.test(webhook)) {
      return "Webhook URL must use HTTPS.";
    }

    if (!/(botghost\.com|discord\.com|discordapp\.com)/i.test(webhook)) {
      return "Webhook URL host must be BotGhost/Discord.";
    }

    const apiKey = botGhostApiKey.trim();
    if (apiKey && apiKey.length < 8) {
      return "API key appears too short.";
    }

    return null;
  };

  const onSaveBotGhost = async () => {
    const validationError = validateBotGhost();
    if (validationError) {
      onStatusChange(validationError);
      return;
    }

    const nextBotGhost: BotGhostIntegrationConfig = {
      ...botGhost,
      enabled: true,
      webhookUrl: botGhostWebhookUrl.trim(),
      apiKeyHint: botGhostApiKey.trim() ? getApiKeyHint(botGhostApiKey) : botGhost.apiKeyHint,
      lastHealthStatus: botGhost.lastHealthStatus,
      lastHealthCheckedAt: botGhost.lastHealthCheckedAt,
    };

    await persist(apps, bots, nextBotGhost, "BotGhost integration saved.");
    setBotGhostApiKey("");
  };

  const onToggleBotAutoImportOnSave = async (nextValue: boolean) => {
    await persist(
      apps,
      bots,
      botGhost,
      `Auto-import on save ${nextValue ? "enabled" : "disabled"}.`,
      undefined,
      nextValue
    );
  };

  const onDisableBotGhost = async () => {
    const nextBotGhost: BotGhostIntegrationConfig = {
      ...botGhost,
      enabled: false,
      lastHealthStatus: "unknown",
      lastHealthCheckedAt: new Date().toISOString(),
    };

    await persist(apps, bots, nextBotGhost, "BotGhost integration disabled.");
  };

  const onCheckBotGhostHealth = async () => {
    const validationError = validateBotGhost();
    if (validationError) {
      onStatusChange(validationError);
      return;
    }

    try {
      setIsCheckingBotGhostHealth(true);
      onStatusChange(null);

      const response = await axios.post<{ status?: "healthy" | "unhealthy"; message?: string }>(
        "/api/integrations/botghost/health",
        {
          webhookUrl: botGhostWebhookUrl.trim(),
          apiKey: botGhostApiKey.trim() || undefined,
        }
      );

      const nextStatus = response.data.status === "healthy" ? "healthy" : "unhealthy";

      const nextBotGhost: BotGhostIntegrationConfig = {
        ...botGhost,
        enabled: true,
        webhookUrl: botGhostWebhookUrl.trim(),
        apiKeyHint: botGhostApiKey.trim() ? getApiKeyHint(botGhostApiKey) : botGhost.apiKeyHint,
        lastHealthStatus: nextStatus,
        lastHealthCheckedAt: new Date().toISOString(),
      };

      await persist(apps, bots, nextBotGhost, response.data.message || `BotGhost health: ${nextStatus}.`);
      setBotGhostApiKey("");
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string } | undefined)?.message || "BotGhost health check failed."
        : "BotGhost health check failed.";

      const nextBotGhost: BotGhostIntegrationConfig = {
        ...botGhost,
        enabled: false,
        webhookUrl: botGhostWebhookUrl.trim(),
        apiKeyHint: botGhostApiKey.trim() ? getApiKeyHint(botGhostApiKey) : botGhost.apiKeyHint,
        lastHealthStatus: "unhealthy",
        lastHealthCheckedAt: new Date().toISOString(),
      };

      await persist(apps, bots, nextBotGhost, message);
      setBotGhostApiKey("");
    } finally {
      setIsCheckingBotGhostHealth(false);
    }
  };

  const botGhostStatusBadge =
    botGhost.enabled && botGhost.lastHealthStatus === "healthy"
      ? { label: "Healthy", className: "border-emerald-500/35 bg-emerald-500/15 text-emerald-200" }
      : botGhost.enabled && botGhost.lastHealthStatus === "unhealthy"
        ? { label: "Needs attention", className: "border-amber-500/35 bg-amber-500/15 text-amber-200" }
        : { label: "Not connected", className: "border-zinc-500/35 bg-zinc-500/15 text-zinc-200" };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white">Bot/App Developer</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Configure Other application metadata and bot runtime settings for your In-Accord account.
            </p>
          </div>

          <span className="rounded bg-[#3f4248] px-2 py-1 text-xs text-[#dbdee1]">
            Enabled: {connectedCount}
          </span>
        </div>

        <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-2">
          <div className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
              <AppWindow className="h-3.5 w-3.5" />
              Add Other App
            </p>
            <div className="mt-2 min-w-0 space-y-2">
              <input
                value={newAppName}
                onChange={(event) => setNewAppName(event.target.value)}
                placeholder="App name"
                className="h-9 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none placeholder:text-[#7f8690]"
              />
              <input
                value={newAppId}
                onChange={(event) => setNewAppId(event.target.value)}
                placeholder="Application ID"
                className="h-9 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none placeholder:text-[#7f8690]"
              />
              <input
                value={newClientId}
                onChange={(event) => setNewClientId(event.target.value)}
                placeholder="Client ID"
                className="h-9 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none placeholder:text-[#7f8690]"
              />
              <input
                value={newRedirectUri}
                onChange={(event) => setNewRedirectUri(event.target.value)}
                placeholder="Redirect URI (optional)"
                className="h-9 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none placeholder:text-[#7f8690]"
              />
              <input
                value={newAppScopes}
                onChange={(event) => setNewAppScopes(event.target.value)}
                placeholder="Scopes (comma separated)"
                className="h-9 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none placeholder:text-[#7f8690]"
              />
              <Button
                type="button"
                onClick={() => void onAddApp()}
                disabled={isSaving}
                className="h-8 w-full min-w-0 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:opacity-60"
              >
                {isSaving ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </span>
                ) : (
                  "Add App"
                )}
              </Button>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
              <Bot className="h-3.5 w-3.5" />
              Add Other Bot
            </p>
            <div className="mt-2 min-w-0 space-y-2">
              <input
                value={newBotName}
                onChange={(event) => setNewBotName(event.target.value)}
                placeholder="Bot name"
                className="h-9 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none placeholder:text-[#7f8690]"
              />
              <input
                value={newBotAppId}
                onChange={(event) => setNewBotAppId(event.target.value)}
                placeholder="Application ID"
                className="h-9 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none placeholder:text-[#7f8690]"
              />
              <input
                value={newBotUserId}
                onChange={(event) => setNewBotUserId(event.target.value)}
                placeholder="Bot User ID (optional)"
                className="h-9 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none placeholder:text-[#7f8690]"
              />
              <input
                value={newBotToken}
                onChange={(event) => setNewBotToken(event.target.value)}
                placeholder="Bot token (stored as masked hint only)"
                className="h-9 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none placeholder:text-[#7f8690]"
              />
              <input
                value={newBotPermissions}
                onChange={(event) => setNewBotPermissions(event.target.value)}
                placeholder="Permissions (comma separated)"
                className="h-9 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none placeholder:text-[#7f8690]"
              />
              <input
                value={newBotCommands}
                onChange={(event) => setNewBotCommands(event.target.value)}
                placeholder="Slash commands (comma separated, e.g. help,ping,echo)"
                className="h-9 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none placeholder:text-[#7f8690]"
              />
              <label className="inline-flex items-center gap-2 text-[11px] text-[#b5bac1]">
                <input
                  type="checkbox"
                  checked={botAutoImportOnSave}
                  onChange={(event) => {
                    void onToggleBotAutoImportOnSave(event.target.checked);
                  }}
                  disabled={isSaving}
                  className="h-3.5 w-3.5 rounded border border-black/25 bg-[#111214]"
                />
                Auto-import slash commands from Other when saving a bot token
              </label>
              <Button
                type="button"
                onClick={() => void onAddBot()}
                disabled={isSaving}
                className="h-8 w-full min-w-0 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:opacity-60"
              >
                {isSaving ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </span>
                ) : (
                  "Add Bot"
                )}
              </Button>
              <p className="text-[11px] text-[#949ba4]">
                Saving here stores bot configuration. Use the bot card action below to add it to an In-Accord server.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
              <Link2 className="h-3.5 w-3.5" />
              BotGhost Integration
            </p>

            <span className={`rounded border px-2 py-1 text-[11px] ${botGhostStatusBadge.className}`}>
              {botGhostStatusBadge.label}
            </span>
          </div>

          <div className="mt-2 grid gap-2">
            <input
              value={botGhostWebhookUrl}
              onChange={(event) => setBotGhostWebhookUrl(event.target.value)}
              placeholder="https://... (BotGhost/Discord webhook URL)"
              className="h-9 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none placeholder:text-[#7f8690]"
            />
            <input
              value={botGhostApiKey}
              onChange={(event) => setBotGhostApiKey(event.target.value)}
              placeholder="BotGhost API key (optional for validation)"
              className="h-9 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none placeholder:text-[#7f8690]"
            />

            <p className="text-[11px] text-[#949ba4]">
              Saved key hint: <span className="font-semibold text-[#dbdee1]">{botGhost.apiKeyHint || "Not set"}</span>
            </p>

            {botGhost.lastHealthCheckedAt ? (
              <p className="text-[11px] text-[#949ba4]">
                Last health check: {new Date(botGhost.lastHealthCheckedAt).toLocaleString()}
              </p>
            ) : null}

            <div className="mt-1 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void onSaveBotGhost()}
                disabled={isSaving || isCheckingBotGhostHealth}
                className="h-8 border border-indigo-500/35 bg-indigo-500/15 px-3 text-xs text-indigo-200 hover:bg-indigo-500/25"
              >
                Save Connection
              </Button>

              <Button
                type="button"
                onClick={() => void onCheckBotGhostHealth()}
                disabled={isSaving || isCheckingBotGhostHealth}
                className="h-8 border border-emerald-500/35 bg-emerald-500/15 px-3 text-xs text-emerald-200 hover:bg-emerald-500/25"
              >
                {isCheckingBotGhostHealth ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Checking...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    {botGhost.lastHealthStatus === "healthy" ? (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    ) : (
                      <ShieldX className="h-3.5 w-3.5" />
                    )}
                    Health Check
                  </span>
                )}
              </Button>

              <Button
                type="button"
                onClick={() => void onDisableBotGhost()}
                disabled={isSaving || isCheckingBotGhostHealth}
                className="h-8 border border-rose-500/35 bg-rose-500/15 px-3 text-xs text-rose-200 hover:bg-rose-500/25"
              >
                Disable
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Other Apps</p>
            <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_140px]">
              <input
                value={appSearch}
                onChange={(event) => setAppSearch(event.target.value)}
                placeholder="Search apps"
                className="h-8 rounded-md border border-black/25 bg-[#1a1b1e] px-2.5 text-xs text-white outline-none placeholder:text-[#7f8690]"
              />
              <select
                value={appFilter}
                onChange={(event) => setAppFilter(event.target.value as "ALL" | "ENABLED" | "DISABLED")}
                className="h-8 rounded-md border border-black/25 bg-[#1a1b1e] px-2.5 text-xs text-white outline-none"
              >
                <option value="ALL">All statuses</option>
                <option value="ENABLED">Enabled</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </div>
            {filteredApps.length === 0 ? (
              <p className="text-xs text-[#949ba4]">No apps configured yet.</p>
            ) : (
              <div className="space-y-2">
                {filteredApps.map((app) => {
                  const isEditing = editingAppId === app.id;
                  const draft = appDrafts[app.id];
                  return (
                    <div key={app.id} className="min-w-0 overflow-hidden rounded-md border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#dbdee1]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-white">{isEditing ? "Editing app" : app.name}</p>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          onClick={() => void onToggleApp(app.id)}
                          disabled={isSaving}
                          className={`h-7 px-2 text-[11px] ${
                            app.enabled
                              ? "border border-emerald-500/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                              : "border border-zinc-500/35 bg-zinc-500/15 text-zinc-200 hover:bg-zinc-500/25"
                          }`}
                        >
                          {app.enabled ? "Enabled" : "Disabled"}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => (isEditing ? setEditingAppId(null) : startEditApp(app.id))}
                          disabled={isSaving}
                          className="h-7 border border-indigo-500/35 bg-indigo-500/15 px-2 text-[11px] text-indigo-200 hover:bg-indigo-500/25"
                        >
                          {isEditing ? "Cancel" : "Edit"}
                        </Button>
                        {isEditing ? (
                          <Button
                            type="button"
                            onClick={() => void saveEditApp(app.id)}
                            disabled={isSaving}
                            className="h-7 border border-emerald-500/35 bg-emerald-500/15 px-2 text-[11px] text-emerald-200 hover:bg-emerald-500/25"
                          >
                            Save
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          onClick={() => void onRemoveApp(app.id)}
                          disabled={isSaving}
                          className="h-7 border border-rose-500/35 bg-rose-500/15 px-2 text-[11px] text-rose-200 hover:bg-rose-500/25"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {isEditing && draft ? (
                      <div className="mt-2 grid min-w-0 gap-2">
                        <input
                          value={draft.name}
                          onChange={(event) =>
                            setAppDrafts((state) => ({
                              ...state,
                              [app.id]: { ...draft, name: event.target.value },
                            }))
                          }
                          className="h-8 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#111214] px-2 text-xs text-white outline-none"
                        />
                        <input
                          value={draft.applicationId}
                          onChange={(event) =>
                            setAppDrafts((state) => ({
                              ...state,
                              [app.id]: { ...draft, applicationId: event.target.value },
                            }))
                          }
                          className="h-8 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#111214] px-2 text-xs text-white outline-none"
                        />
                        <input
                          value={draft.clientId}
                          onChange={(event) =>
                            setAppDrafts((state) => ({
                              ...state,
                              [app.id]: { ...draft, clientId: event.target.value },
                            }))
                          }
                          className="h-8 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#111214] px-2 text-xs text-white outline-none"
                        />
                        <input
                          value={draft.redirectUri}
                          onChange={(event) =>
                            setAppDrafts((state) => ({
                              ...state,
                              [app.id]: { ...draft, redirectUri: event.target.value },
                            }))
                          }
                          className="h-8 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#111214] px-2 text-xs text-white outline-none"
                        />
                        <input
                          value={draft.scopes}
                          onChange={(event) =>
                            setAppDrafts((state) => ({
                              ...state,
                              [app.id]: { ...draft, scopes: event.target.value },
                            }))
                          }
                          className="h-8 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#111214] px-2 text-xs text-white outline-none"
                        />
                      </div>
                    ) : (
                      <>
                        <p className="mt-1">Application ID: {app.applicationId}</p>
                        <p>Client ID: {app.clientId}</p>
                        <p className="truncate" title={app.redirectUri || "No redirect URI"}>
                          Redirect: {app.redirectUri || "Not set"}
                        </p>
                      </>
                    )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Other Bots</p>
            <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_140px]">
              <input
                value={botSearch}
                onChange={(event) => setBotSearch(event.target.value)}
                placeholder="Search bots"
                className="h-8 rounded-md border border-black/25 bg-[#1a1b1e] px-2.5 text-xs text-white outline-none placeholder:text-[#7f8690]"
              />
              <select
                value={botFilter}
                onChange={(event) => setBotFilter(event.target.value as "ALL" | "ENABLED" | "DISABLED")}
                className="h-8 rounded-md border border-black/25 bg-[#1a1b1e] px-2.5 text-xs text-white outline-none"
              >
                <option value="ALL">All statuses</option>
                <option value="ENABLED">Enabled</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </div>
            {filteredBots.length === 0 ? (
              <p className="text-xs text-[#949ba4]">No bots configured yet.</p>
            ) : (
              <div className="space-y-2">
                {filteredBots.map((bot) => {
                  const isEditing = editingBotId === bot.id;
                  const draft = botDrafts[bot.id];
                  return (
                    <div key={bot.id} className="min-w-0 overflow-hidden rounded-md border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#dbdee1]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-white">{isEditing ? "Editing bot" : bot.name}</p>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          onClick={() => void onToggleBot(bot.id)}
                          disabled={isSaving}
                          className={`h-7 px-2 text-[11px] ${
                            bot.enabled
                              ? "border border-emerald-500/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                              : "border border-zinc-500/35 bg-zinc-500/15 text-zinc-200 hover:bg-zinc-500/25"
                          }`}
                        >
                          {bot.enabled ? "Enabled" : "Disabled"}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => (isEditing ? setEditingBotId(null) : startEditBot(bot.id))}
                          disabled={isSaving}
                          className="h-7 border border-indigo-500/35 bg-indigo-500/15 px-2 text-[11px] text-indigo-200 hover:bg-indigo-500/25"
                        >
                          {isEditing ? "Cancel" : "Edit"}
                        </Button>
                        {isEditing ? (
                          <Button
                            type="button"
                            onClick={() => void saveEditBot(bot.id)}
                            disabled={isSaving}
                            className="h-7 border border-emerald-500/35 bg-emerald-500/15 px-2 text-[11px] text-emerald-200 hover:bg-emerald-500/25"
                          >
                            Save
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          onClick={() => void onRemoveBot(bot.id)}
                          disabled={isSaving}
                          className="h-7 border border-rose-500/35 bg-rose-500/15 px-2 text-[11px] text-rose-200 hover:bg-rose-500/25"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {isEditing && draft ? (
                      <div className="mt-2 grid min-w-0 gap-2">
                        <input
                          value={draft.name}
                          onChange={(event) =>
                            setBotDrafts((state) => ({
                              ...state,
                              [bot.id]: { ...draft, name: event.target.value },
                            }))
                          }
                          className="h-8 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#111214] px-2 text-xs text-white outline-none"
                        />
                        <input
                          value={draft.applicationId}
                          onChange={(event) =>
                            setBotDrafts((state) => ({
                              ...state,
                              [bot.id]: { ...draft, applicationId: event.target.value },
                            }))
                          }
                          className="h-8 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#111214] px-2 text-xs text-white outline-none"
                        />
                        <input
                          value={draft.botUserId}
                          onChange={(event) =>
                            setBotDrafts((state) => ({
                              ...state,
                              [bot.id]: { ...draft, botUserId: event.target.value },
                            }))
                          }
                          className="h-8 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#111214] px-2 text-xs text-white outline-none"
                        />
                        <input
                          value={draft.token}
                          onChange={(event) =>
                            setBotDrafts((state) => ({
                              ...state,
                              [bot.id]: { ...draft, token: event.target.value },
                            }))
                          }
                          placeholder="Set new bot token (optional)"
                          className="h-8 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#111214] px-2 text-xs text-white outline-none"
                        />
                        <input
                          value={draft.commands}
                          onChange={(event) =>
                            setBotDrafts((state) => ({
                              ...state,
                              [bot.id]: { ...draft, commands: event.target.value },
                            }))
                          }
                          className="h-8 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#111214] px-2 text-xs text-white outline-none"
                        />
                        <input
                          value={draft.permissions}
                          onChange={(event) =>
                            setBotDrafts((state) => ({
                              ...state,
                              [bot.id]: { ...draft, permissions: event.target.value },
                            }))
                          }
                          className="h-8 w-full min-w-0 max-w-full rounded-md border border-black/25 bg-[#111214] px-2 text-xs text-white outline-none"
                        />
                      </div>
                    ) : (
                      <>
                        <p className="mt-1">Application ID: {bot.applicationId}</p>
                        <p>Bot User ID: {bot.botUserId || "Not set"}</p>
                        <p>Commands: {(bot.commands ?? []).length > 0 ? bot.commands.join(", ") : "Not set"}</p>
                        <p>Token Hint: {bot.tokenHint || "Not set"}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            onClick={() => void onImportBotCommands(bot.id)}
                            disabled={isSaving || importingCommandsBotId === bot.id}
                            className="h-7 border border-cyan-500/35 bg-cyan-500/15 px-2 text-[11px] text-cyan-200 hover:bg-cyan-500/25"
                          >
                            {importingCommandsBotId === bot.id ? (
                              <span className="inline-flex items-center gap-1.5">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Importing...
                              </span>
                            ) : (
                              "Import Slash Commands"
                            )}
                          </Button>
                          <Button
                            type="button"
                            onClick={() => setCommandsDialogBotId(bot.id)}
                            className="h-7 border border-indigo-500/35 bg-indigo-500/15 px-2 text-[11px] text-indigo-200 hover:bg-indigo-500/25"
                          >
                            COMMANDS
                          </Button>
                        </div>
                          <p className="mt-1 text-[11px] text-[#949ba4]">
                            Pulls slash commands from Other using this bot token.
                          </p>
                        <div className="mt-2 rounded-md border border-white/10 bg-[#111214] px-2 py-2">
                          <p className="text-[11px] text-[#949ba4]">Add to In-Accord Server</p>
                          {ownedServers.length === 0 ? (
                            <p className="mt-1 text-[11px] text-[#c7ccd3]">
                              You do not own any servers yet. Create one first, then attach this bot.
                            </p>
                          ) : (
                            <>
                              <select
                                value={selectedServerByBotId[bot.id] ?? ""}
                                onChange={(event) =>
                                  setSelectedServerByBotId((current) => ({
                                    ...current,
                                    [bot.id]: event.target.value,
                                  }))
                                }
                                className="mt-1 h-8 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-2 text-xs text-white outline-none"
                              >
                                <option value="">Select server...</option>
                                {ownedServers.map((option) => (
                                  <option key={`${bot.id}-${option.serverId}`} value={option.serverId}>
                                    {option.serverName}
                                  </option>
                                ))}
                              </select>

                              <Button
                                type="button"
                                onClick={() => void onAttachBotToInAccordServer(bot.id)}
                                disabled={attachingBotId === bot.id || isSaving}
                                className="mt-2 h-7 border border-indigo-500/35 bg-indigo-500/15 px-2 text-[11px] text-indigo-200 hover:bg-indigo-500/25"
                              >
                                {attachingBotId === bot.id ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Adding...
                                  </span>
                                ) : (
                                  "Add to In-Accord Server"
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {status ? (
          <p className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">{status}</p>
        ) : null}

        <BotCommandsDialog
          open={Boolean(commandsDialogBotId)}
          onOpenChange={(open) => {
            if (!open) {
              setCommandsDialogBotId(null);
            }
          }}
          botName={
            bots.find((item) => item.id === commandsDialogBotId)?.name ||
            "Bot"
          }
          commands={
            (bots.find((item) => item.id === commandsDialogBotId)?.commands ?? [])
          }
        />
      </div>
    </div>
  );
};
