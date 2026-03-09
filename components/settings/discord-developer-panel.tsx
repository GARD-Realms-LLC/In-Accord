"use client";

import { useMemo, useState } from "react";
import { AppWindow, Bot, Loader2, Trash2 } from "lucide-react";
import axios from "axios";

import { Button } from "@/components/ui/button";
import type { DiscordAppConfig, DiscordBotConfig } from "@/lib/user-preferences";

type DiscordDeveloperPanelProps = {
  apps: DiscordAppConfig[];
  bots: DiscordBotConfig[];
  isSaving: boolean;
  status: string | null;
  onStatusChange: (value: string | null) => void;
  onSavingChange: (value: boolean) => void;
  onAppsChange: (value: DiscordAppConfig[]) => void;
  onBotsChange: (value: DiscordBotConfig[]) => void;
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

const makeId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `cfg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const DiscordDeveloperPanel = ({
  apps,
  bots,
  isSaving,
  status,
  onStatusChange,
  onSavingChange,
  onAppsChange,
  onBotsChange,
}: DiscordDeveloperPanelProps) => {
  const [appSearch, setAppSearch] = useState("");
  const [botSearch, setBotSearch] = useState("");
  const [appFilter, setAppFilter] = useState<"ALL" | "ENABLED" | "DISABLED">("ALL");
  const [botFilter, setBotFilter] = useState<"ALL" | "ENABLED" | "DISABLED">("ALL");

  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [editingBotId, setEditingBotId] = useState<string | null>(null);
  const [appDrafts, setAppDrafts] = useState<Record<string, { name: string; applicationId: string; clientId: string; redirectUri: string; scopes: string }>>({});
  const [botDrafts, setBotDrafts] = useState<Record<string, { name: string; applicationId: string; botUserId: string; permissions: string }>>({});

  const [newAppName, setNewAppName] = useState("");
  const [newAppId, setNewAppId] = useState("");
  const [newClientId, setNewClientId] = useState("");
  const [newRedirectUri, setNewRedirectUri] = useState("");
  const [newAppScopes, setNewAppScopes] = useState("applications.commands, identify");

  const [newBotName, setNewBotName] = useState("");
  const [newBotAppId, setNewBotAppId] = useState("");
  const [newBotUserId, setNewBotUserId] = useState("");
  const [newBotToken, setNewBotToken] = useState("");
  const [newBotPermissions, setNewBotPermissions] = useState("send_messages, view_channel");

  const connectedCount = useMemo(
    () => apps.filter((item) => item.enabled).length + bots.filter((item) => item.enabled).length,
    [apps, bots]
  );

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

  const persist = async (nextApps: DiscordAppConfig[], nextBots: DiscordBotConfig[], successMessage: string) => {
    try {
      onSavingChange(true);
      onStatusChange(null);

      await axios.patch("/api/profile/preferences", {
        discordApps: nextApps,
        discordBots: nextBots,
      });

      onAppsChange(nextApps);
      onBotsChange(nextBots);
      onStatusChange(successMessage);
    } catch {
      onStatusChange("Could not save Discord settings right now.");
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

    const nextApps: DiscordAppConfig[] = [
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

    await persist(nextApps, bots, "Discord app saved.");

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

    const nextBots: DiscordBotConfig[] = [
      {
        id: makeId(),
        name,
        applicationId,
        botUserId,
        tokenHint,
        permissions: sanitizeScopes(newBotPermissions),
        enabled: true,
        createdAt: new Date().toISOString(),
      },
      ...bots,
    ];

    await persist(apps, nextBots, "Discord bot saved.");

    setNewBotName("");
    setNewBotAppId("");
    setNewBotUserId("");
    setNewBotToken("");
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

    await persist(nextApps, bots, "Discord app updated.");
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

    await persist(apps, nextBots, "Discord bot updated.");
  };

  const onRemoveApp = async (id: string) => {
    const nextApps = apps.filter((item) => item.id !== id);
    await persist(nextApps, bots, "Discord app removed.");
  };

  const onRemoveBot = async (id: string) => {
    const nextBots = bots.filter((item) => item.id !== id);
    await persist(apps, nextBots, "Discord bot removed.");
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

    await persist(nextApps, bots, "Discord app updated.");
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
            permissions: sanitizeScopes(draft.permissions),
          }
        : item
    );

    await persist(apps, nextBots, "Discord bot updated.");
    setEditingBotId(null);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white">Bot/App Developer</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Configure Discord application metadata and bot runtime settings for your In-Accord account.
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
              Add Discord App
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
              Add Discord Bot
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
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Discord Apps</p>
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
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Discord Bots</p>
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
                        <p>Token Hint: {bot.tokenHint || "Not set"}</p>
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
      </div>
    </div>
  );
};
