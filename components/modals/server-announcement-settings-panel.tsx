"use client";

import axios from "axios";
import { Loader2, Megaphone, Plus, RadioTower } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type AnnouncementChannelItem = {
  id: string;
  name: string;
  type: "ANNOUNCEMENT";
};

type AnnouncementSettingsPayload = {
  communityEnabled: boolean;
  announcementChannelId: string | null;
  guidelines: string | null;
};

type AnnouncementPanelResponse = {
  canManage: boolean;
  settings?: AnnouncementSettingsPayload;
  channels?: AnnouncementChannelItem[];
};

const DEFAULT_SETTINGS: AnnouncementSettingsPayload = {
  communityEnabled: false,
  announcementChannelId: null,
  guidelines: null,
};

export function ServerAnnouncementSettingsPanel({ serverId }: { serverId?: string }) {
  const [canManage, setCanManage] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [channels, setChannels] = useState<AnnouncementChannelItem[]>([]);
  const [settings, setSettings] = useState<AnnouncementSettingsPayload>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeChannel = useMemo(
    () => channels.find((item) => item.id === settings.announcementChannelId) ?? null,
    [channels, settings.announcementChannelId]
  );

  const loadSettings = useCallback(async () => {
    if (!serverId) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setSuccess(null);

      const response = await axios.get<AnnouncementPanelResponse>(`/api/servers/${serverId}/announcements`);
      setCanManage(response.data.canManage === true);
      setChannels(response.data.channels ?? []);
      setSettings(response.data.settings ?? DEFAULT_SETTINGS);
    } catch (loadError) {
      if (axios.isAxiosError(loadError)) {
        const message =
          (loadError.response?.data as { error?: string } | undefined)?.error ||
          (typeof loadError.response?.data === "string" ? loadError.response.data : "") ||
          loadError.message;
        setError(message || "Failed to load announcement settings.");
      } else {
        setError("Failed to load announcement settings.");
      }
      setCanManage(false);
      setChannels([]);
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setIsLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const onSave = async () => {
    if (!serverId || !canManage) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      const response = await axios.patch<AnnouncementPanelResponse>(`/api/servers/${serverId}/announcements`, {
        communityEnabled: settings.communityEnabled,
        announcementChannelId: settings.announcementChannelId,
        guidelines: settings.guidelines ?? "",
      });

      setChannels(response.data.channels ?? []);
      setSettings(response.data.settings ?? settings);
      setSuccess("Announcement setup saved.");
    } catch (saveError) {
      if (axios.isAxiosError(saveError)) {
        const message =
          (saveError.response?.data as { error?: string } | undefined)?.error ||
          (typeof saveError.response?.data === "string" ? saveError.response.data : "") ||
          saveError.message;
        setError(message || "Failed to save announcement settings.");
      } else {
        setError("Failed to save announcement settings.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const onCreateAnnouncementChannel = async () => {
    if (!serverId || !canManage) {
      return;
    }

    try {
      setIsCreatingChannel(true);
      setError(null);
      setSuccess(null);

      const response = await axios.patch<AnnouncementPanelResponse>(`/api/servers/${serverId}/announcements`, {
        communityEnabled: true,
        announcementChannelId: settings.announcementChannelId,
        guidelines: settings.guidelines ?? "",
        createAnnouncementChannel: true,
      });

      setChannels(response.data.channels ?? []);
      setSettings(response.data.settings ?? settings);
      setSuccess("Announcement channel created.");
    } catch (createError) {
      if (axios.isAxiosError(createError)) {
        const message =
          (createError.response?.data as { error?: string } | undefined)?.error ||
          (typeof createError.response?.data === "string" ? createError.response.data : "") ||
          createError.message;
        setError(message || "Failed to create announcement channel.");
      } else {
        setError("Failed to create announcement channel.");
      }
    } finally {
      setIsCreatingChannel(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Community</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">
            {settings.communityEnabled ? "Enabled" : "Disabled"}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Announcement Channels</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-100">{channels.length}</p>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Primary Channel</p>
          <p className="mt-1 truncate text-sm font-semibold text-zinc-100">
            {activeChannel ? `#${activeChannel.name}` : "Not selected"}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Announcement Setup</p>
            <p className="mt-1 text-xs text-zinc-400">
              Choose which channel carries staff updates and define the posting guidelines for your team.
            </p>
          </div>
          <Megaphone className="h-5 w-5 shrink-0 text-zinc-400" />
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 rounded-md border border-zinc-700 bg-[#1e1f22] px-3 py-2 text-sm text-zinc-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading announcement setup...
          </div>
        ) : (
          <>
            <label className="flex items-center gap-2 rounded-md border border-zinc-700 bg-[#1e1f22] px-3 py-2 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={settings.communityEnabled}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    communityEnabled: event.target.checked,
                  }))
                }
                disabled={!canManage || isSaving || isCreatingChannel}
              />
              Enable announcement features for this server
            </label>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Primary Announcement Channel</p>
                <select
                  value={settings.announcementChannelId ?? ""}
                  onChange={(event) =>
                    setSettings((previous) => ({
                      ...previous,
                      announcementChannelId: event.target.value || null,
                    }))
                  }
                  disabled={!canManage || isSaving || isCreatingChannel || channels.length === 0}
                  className="h-10 w-full rounded-md border border-zinc-700 bg-[#15161a] px-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                >
                  <option value="">No primary channel selected</option>
                  {channels.map((channelItem) => (
                    <option key={channelItem.id} value={channelItem.id}>
                      #{channelItem.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={() => void onCreateAnnouncementChannel()}
                  disabled={!canManage || isSaving || isCreatingChannel}
                  className="h-10 bg-[#4e5058] px-3 text-xs text-white hover:bg-[#5d6069]"
                >
                  {isCreatingChannel ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Create Channel
                </Button>
              </div>
            </div>

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Posting Guidelines</p>
              <textarea
                value={settings.guidelines ?? ""}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    guidelines: event.target.value.slice(0, 1200),
                  }))
                }
                rows={5}
                maxLength={1200}
                disabled={!canManage || isSaving || isCreatingChannel}
                className="w-full rounded-md border border-zinc-700 bg-[#15161a] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                placeholder="Share how staff should use announcement channels: cadence, tone, release notes, alerts, and who approves posts."
              />
              <p className="mt-1 text-right text-[11px] text-zinc-500">{(settings.guidelines ?? "").length}/1200</p>
            </div>

            <div className="rounded-lg border border-zinc-700 bg-[#1e1f22] p-3">
              <div className="mb-2 flex items-center gap-2 text-zinc-200">
                <RadioTower className="h-4 w-4 text-zinc-400" />
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-300">How it works</p>
              </div>
              <ul className="space-y-1 text-xs text-zinc-400">
                <li>• Announcement channels are read-only for guests.</li>
                <li>• Moderators and server managers can publish updates.</li>
                <li>• Create as many announcement channels as your server needs, then choose the main one here.</li>
              </ul>
            </div>
          </>
        )}

        {error ? (
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </p>
        ) : null}

        {success ? (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            {success}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            onClick={() => void loadSettings()}
            disabled={isLoading || isSaving || isCreatingChannel}
            className="bg-transparent text-zinc-300 hover:bg-white/10"
          >
            Reset
          </Button>
          <Button
            type="button"
            onClick={() => void onSave()}
            disabled={!canManage || isLoading || isSaving || isCreatingChannel}
            className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
          >
            {isSaving ? "Saving..." : "Save Announcement Setup"}
          </Button>
        </div>
      </div>
    </div>
  );
}
