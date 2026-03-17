"use client";

import axios from "axios";
import { CloudUpload, Download, FolderArchive, Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ServerBackupDestination = "FILE" | "S3" | "FTP";

type ServerBackupConfig = {
  serverId: string;
  destination: ServerBackupDestination;
  fileNamePrefix: string;
  s3Endpoint: string | null;
  s3Region: string | null;
  s3Bucket: string | null;
  s3AccessKeyId: string | null;
  s3SecretAccessKey: string | null;
  s3Prefix: string | null;
  ftpHost: string | null;
  ftpPort: number;
  ftpSecure: boolean;
  ftpUsername: string | null;
  ftpPassword: string | null;
  ftpBasePath: string | null;
  lastBackupAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ServerBackupRecord = {
  id: string;
  serverId: string;
  createdByProfileId: string;
  destination: ServerBackupDestination;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  status: "READY";
  remotePath: string | null;
  remoteUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type BackupResponse = {
  serverId: string;
  config: ServerBackupConfig;
  backups: ServerBackupRecord[];
  downloadUrl?: string;
};

type Props = {
  serverId?: string | null;
};

const emptyConfig = (serverId: string): ServerBackupConfig => ({
  serverId,
  destination: "FILE",
  fileNamePrefix: "server-backup",
  s3Endpoint: "",
  s3Region: "",
  s3Bucket: "",
  s3AccessKeyId: "",
  s3SecretAccessKey: "",
  s3Prefix: "",
  ftpHost: "",
  ftpPort: 21,
  ftpSecure: false,
  ftpUsername: "",
  ftpPassword: "",
  ftpBasePath: "/",
  lastBackupAt: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
});

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return "Never";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Never";
  }

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let index = 0;

  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }

  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
};

const triggerDownload = (href: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const anchor = window.document.createElement("a");
  anchor.href = href;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  window.document.body.appendChild(anchor);
  anchor.click();
  window.document.body.removeChild(anchor);
};

export const ServerBackupSettingsPanel = ({ serverId }: Props) => {
  const normalizedServerId = String(serverId ?? "").trim();
  const [config, setConfig] = useState<ServerBackupConfig>(() => emptyConfig(normalizedServerId));
  const [backups, setBackups] = useState<ServerBackupRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadBackups = useCallback(async () => {
    if (!normalizedServerId) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await axios.get<BackupResponse>(`/api/servers/${normalizedServerId}/backups`, {
        params: { _t: Date.now() },
      });

      setConfig(response.data.config ?? emptyConfig(normalizedServerId));
      setBackups(Array.isArray(response.data.backups) ? response.data.backups : []);
    } catch (cause) {
      if (axios.isAxiosError(cause)) {
        const message =
          (cause.response?.data as { error?: string } | string | undefined) && typeof cause.response?.data === "object"
            ? cause.response?.data?.error
            : typeof cause.response?.data === "string"
              ? cause.response.data
              : cause.message;
        setError(message || "Failed to load backup settings.");
      } else {
        setError("Failed to load backup settings.");
      }
      setConfig(emptyConfig(normalizedServerId));
      setBackups([]);
    } finally {
      setIsLoading(false);
    }
  }, [normalizedServerId]);

  useEffect(() => {
    setConfig(emptyConfig(normalizedServerId));
    setBackups([]);
    setError(null);
    setSuccess(null);

    if (!normalizedServerId) {
      return;
    }

    void loadBackups();
  }, [loadBackups, normalizedServerId]);

  const updateField = <K extends keyof ServerBackupConfig>(key: K, value: ServerBackupConfig[K]) => {
    setConfig((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const saveConfig = async () => {
    if (!normalizedServerId || isSaving) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      const response = await axios.patch<BackupResponse>(`/api/servers/${normalizedServerId}/backups`, {
        destination: config.destination,
        fileNamePrefix: config.fileNamePrefix,
        s3Endpoint: config.s3Endpoint,
        s3Region: config.s3Region,
        s3Bucket: config.s3Bucket,
        s3AccessKeyId: config.s3AccessKeyId,
        s3SecretAccessKey: config.s3SecretAccessKey,
        s3Prefix: config.s3Prefix,
        ftpHost: config.ftpHost,
        ftpPort: config.ftpPort,
        ftpSecure: config.ftpSecure,
        ftpUsername: config.ftpUsername,
        ftpPassword: config.ftpPassword,
        ftpBasePath: config.ftpBasePath,
      });

      setConfig(response.data.config ?? emptyConfig(normalizedServerId));
      setBackups(Array.isArray(response.data.backups) ? response.data.backups : []);
      setSuccess("Backup settings saved.");
    } catch (cause) {
      if (axios.isAxiosError(cause)) {
        const message =
          (cause.response?.data as { error?: string } | string | undefined) && typeof cause.response?.data === "object"
            ? cause.response?.data?.error
            : typeof cause.response?.data === "string"
              ? cause.response.data
              : cause.message;
        setError(message || "Failed to save backup settings.");
      } else {
        setError("Failed to save backup settings.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const runBackup = async () => {
    if (!normalizedServerId || isRunning) {
      return;
    }

    try {
      setIsRunning(true);
      setError(null);
      setSuccess(null);

      const response = await axios.post<BackupResponse>(`/api/servers/${normalizedServerId}/backups`, {
        destination: config.destination,
      });

      setConfig(response.data.config ?? emptyConfig(normalizedServerId));
      setBackups(Array.isArray(response.data.backups) ? response.data.backups : []);
      setSuccess(
        config.destination === "FILE"
          ? "Backup created and download started."
          : `Backup created and sent to ${config.destination === "S3" ? "third-party cloud" : "FTP"}.`
      );

      if (response.data.downloadUrl && config.destination === "FILE") {
        triggerDownload(response.data.downloadUrl);
      }
    } catch (cause) {
      if (axios.isAxiosError(cause)) {
        const message =
          (cause.response?.data as { error?: string } | string | undefined) && typeof cause.response?.data === "object"
            ? cause.response?.data?.error
            : typeof cause.response?.data === "string"
              ? cause.response.data
              : cause.message;
        setError(message || "Failed to create backup.");
      } else {
        setError("Failed to create backup.");
      }
    } finally {
      setIsRunning(false);
    }
  };

  const cloudSummary = useMemo(() => {
    if (config.destination === "FILE") {
      return "Creates a JSON backup and downloads it locally while keeping a server-side history copy.";
    }

    if (config.destination === "S3") {
      return "Uses S3-compatible storage such as Cloudflare R2, MinIO, Backblaze B2 S3, or another third-party object store.";
    }

    return "Uploads the backup JSON directly to your configured FTP/FTPS destination path.";
  }, [config.destination]);

  if (!normalizedServerId) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-4 text-sm text-zinc-300">
        Select a server to manage backups.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Destination</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">
            {config.destination === "FILE" ? "File download" : config.destination === "S3" ? "3rd-party cloud" : "FTP / FTPS"}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Latest backup</p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{formatDateTime(config.lastBackupAt)}</p>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">History retained</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-100">{backups.length}</p>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Per-server backups</p>
            <p className="mt-1 text-xs text-zinc-400">Capture server structure, settings, invites, events, members, and role data into a portable JSON snapshot.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void saveConfig()}
              disabled={isLoading || isSaving || isRunning}
              className="bg-[#4e5058] text-white hover:bg-[#5d6069]"
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Settings
            </Button>
            <Button
              type="button"
              onClick={() => void runBackup()}
              disabled={isLoading || isSaving || isRunning}
              className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
            >
              {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderArchive className="mr-2 h-4 w-4" />}
              Run Backup
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Backup destination</p>
            <select
              value={config.destination}
              onChange={(event) => updateField("destination", event.target.value as ServerBackupDestination)}
              className="h-10 w-full rounded-md border border-zinc-700 bg-[#15161a] px-3 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              disabled={isLoading || isSaving || isRunning}
            >
              <option value="FILE">File download</option>
              <option value="S3">3rd-party cloud (S3-compatible)</option>
              <option value="FTP">FTP / FTPS</option>
            </select>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Filename prefix</p>
            <Input
              value={config.fileNamePrefix ?? ""}
              onChange={(event) => updateField("fileNamePrefix", event.target.value)}
              placeholder="server-backup"
              disabled={isLoading || isSaving || isRunning}
              className="h-10 border-zinc-700 bg-[#15161a] text-sm text-zinc-100"
            />
          </div>
        </div>

        <div className="rounded-md border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100">
          {cloudSummary}
        </div>

        {config.destination === "S3" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Endpoint</p>
              <Input
                value={config.s3Endpoint ?? ""}
                onChange={(event) => updateField("s3Endpoint", event.target.value)}
                placeholder="https://example.r2.cloudflarestorage.com"
                disabled={isLoading || isSaving || isRunning}
                className="h-10 border-zinc-700 bg-[#15161a] text-sm text-zinc-100"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Region</p>
              <Input
                value={config.s3Region ?? ""}
                onChange={(event) => updateField("s3Region", event.target.value)}
                placeholder="auto"
                disabled={isLoading || isSaving || isRunning}
                className="h-10 border-zinc-700 bg-[#15161a] text-sm text-zinc-100"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Bucket</p>
              <Input
                value={config.s3Bucket ?? ""}
                onChange={(event) => updateField("s3Bucket", event.target.value)}
                placeholder="server-backups"
                disabled={isLoading || isSaving || isRunning}
                className="h-10 border-zinc-700 bg-[#15161a] text-sm text-zinc-100"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Key prefix</p>
              <Input
                value={config.s3Prefix ?? ""}
                onChange={(event) => updateField("s3Prefix", event.target.value)}
                placeholder="servers/my-server"
                disabled={isLoading || isSaving || isRunning}
                className="h-10 border-zinc-700 bg-[#15161a] text-sm text-zinc-100"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Access key</p>
              <Input
                value={config.s3AccessKeyId ?? ""}
                onChange={(event) => updateField("s3AccessKeyId", event.target.value)}
                placeholder="Access key ID"
                disabled={isLoading || isSaving || isRunning}
                className="h-10 border-zinc-700 bg-[#15161a] text-sm text-zinc-100"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Secret key</p>
              <Input
                type="password"
                value={config.s3SecretAccessKey ?? ""}
                onChange={(event) => updateField("s3SecretAccessKey", event.target.value)}
                placeholder="Secret access key"
                disabled={isLoading || isSaving || isRunning}
                className="h-10 border-zinc-700 bg-[#15161a] text-sm text-zinc-100"
              />
            </div>
          </div>
        ) : null}

        {config.destination === "FTP" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Host</p>
              <Input
                value={config.ftpHost ?? ""}
                onChange={(event) => updateField("ftpHost", event.target.value)}
                placeholder="ftp.example.com"
                disabled={isLoading || isSaving || isRunning}
                className="h-10 border-zinc-700 bg-[#15161a] text-sm text-zinc-100"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Port</p>
              <Input
                type="number"
                value={String(config.ftpPort ?? 21)}
                onChange={(event) => updateField("ftpPort", Number.parseInt(event.target.value || "21", 10) || 21)}
                placeholder="21"
                disabled={isLoading || isSaving || isRunning}
                className="h-10 border-zinc-700 bg-[#15161a] text-sm text-zinc-100"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Username</p>
              <Input
                value={config.ftpUsername ?? ""}
                onChange={(event) => updateField("ftpUsername", event.target.value)}
                placeholder="backup-user"
                disabled={isLoading || isSaving || isRunning}
                className="h-10 border-zinc-700 bg-[#15161a] text-sm text-zinc-100"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Password</p>
              <Input
                type="password"
                value={config.ftpPassword ?? ""}
                onChange={(event) => updateField("ftpPassword", event.target.value)}
                placeholder="Password"
                disabled={isLoading || isSaving || isRunning}
                className="h-10 border-zinc-700 bg-[#15161a] text-sm text-zinc-100"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Remote path</p>
              <Input
                value={config.ftpBasePath ?? ""}
                onChange={(event) => updateField("ftpBasePath", event.target.value)}
                placeholder="/backups/servers"
                disabled={isLoading || isSaving || isRunning}
                className="h-10 border-zinc-700 bg-[#15161a] text-sm text-zinc-100"
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-700 bg-[#15161a] px-3 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  checked={Boolean(config.ftpSecure)}
                  onChange={(event) => updateField("ftpSecure", event.target.checked)}
                  disabled={isLoading || isSaving || isRunning}
                />
                Use FTPS / secure mode
              </label>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>
        ) : null}

        {success ? (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{success}</p>
        ) : null}
      </div>

      <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Recent backup history</p>
            <p className="mt-1 text-xs text-zinc-400">Every run is stored so you can download it again later, even if the primary destination was cloud or FTP.</p>
          </div>
          <Button
            type="button"
            onClick={() => void loadBackups()}
            disabled={isLoading || isSaving || isRunning}
            className="bg-transparent text-zinc-300 hover:bg-white/10"
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CloudUpload className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>

        <div className="max-h-90 space-y-2 overflow-y-auto overflow-x-hidden pr-1">
          {isLoading ? (
            <div className="flex items-center gap-2 rounded-md border border-zinc-700 bg-[#1e1f22] px-3 py-2 text-sm text-zinc-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading backup history...
            </div>
          ) : backups.length === 0 ? (
            <p className="rounded-md border border-zinc-700 bg-[#1e1f22] px-3 py-2 text-xs text-zinc-400">
              No backups yet. Save your destination settings, then run a backup.
            </p>
          ) : (
            backups.map((backup) => {
              const downloadUrl = `/api/servers/${encodeURIComponent(normalizedServerId)}/backups/${encodeURIComponent(backup.id)}`;
              return (
                <div key={backup.id} className="flex flex-col gap-3 rounded-lg border border-zinc-700 bg-[#1e1f22] px-3 py-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-100">{backup.fileName}</p>
                    <div className="mt-1 grid gap-1 text-xs text-zinc-400 sm:grid-cols-2">
                      <p>Created: {formatDateTime(backup.createdAt)}</p>
                      <p>Size: {formatBytes(backup.sizeBytes)}</p>
                      <p>Destination: {backup.destination === "FILE" ? "File download" : backup.destination === "S3" ? "3rd-party cloud" : "FTP / FTPS"}</p>
                      <p>Status: {backup.status}</p>
                    </div>
                    {backup.remotePath ? (
                      <p className="mt-2 break-all text-[11px] text-indigo-200">Remote path: {backup.remotePath}</p>
                    ) : null}
                    {backup.remoteUrl ? (
                      <p className="mt-1 break-all text-[11px] text-indigo-200">Remote URL: {backup.remoteUrl}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      onClick={() => triggerDownload(downloadUrl)}
                      className="bg-[#4e5058] text-white hover:bg-[#5d6069]"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
