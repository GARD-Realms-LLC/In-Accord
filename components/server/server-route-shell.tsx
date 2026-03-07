"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpCircle,
  Bell,
  CheckCircle2,
  Hash,
  Loader2,
  Mic,
  PanelRightClose,
  PanelRightOpen,
  PhoneCall,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
  Video,
} from "lucide-react";

import { ServerSearch } from "@/components/server/server-search";
import { MemberRole } from "@/lib/db/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type SearchItem = {
  id: string;
  name: string;
};

type OnlineUserItem = {
  id: string;
  name: string;
  role: MemberRole;
};

type UpdaterState = {
  enabled?: boolean;
  status?: string;
  currentVersion?: string;
  latestVersion?: string;
  releaseNotes?: string;
  progress?: number;
  requiresRestart?: boolean;
  message?: string;
};

type RuntimeMeta = {
  isPackaged?: boolean;
  runtimeMode?: "development" | "production" | string;
  appVersion?: string;
};

interface ServerRouteShellProps {
  serverName: string;
  serverId: string;
  textChannels: SearchItem[];
  voiceChannels: SearchItem[];
  videoChannels: SearchItem[];
  onlineUsers: OnlineUserItem[];
  leftSidebar: React.ReactNode;
  rightSidebar: React.ReactNode;
  rightFooter: React.ReactNode;
  children: React.ReactNode;
}

export const ServerRouteShell = ({
  serverName,
  serverId,
  textChannels,
  voiceChannels,
  videoChannels,
  onlineUsers,
  leftSidebar,
  rightSidebar,
  rightFooter,
  children,
}: ServerRouteShellProps) => {
  const [isMembersCollapsed, setIsMembersCollapsed] = useState(false);
  const [isUpdaterModalOpen, setIsUpdaterModalOpen] = useState(false);
  const [runtimeMeta, setRuntimeMeta] = useState<RuntimeMeta>({
    isPackaged: false,
    runtimeMode: "development",
    appVersion: "",
  });
  const [updaterState, setUpdaterState] = useState<UpdaterState>({
    enabled: false,
    status: "disabled",
    progress: 0,
    message: "Updater unavailable.",
  });
  const [isUpdaterActionPending, setIsUpdaterActionPending] = useState(false);
  const GLOBAL_SERVERS_RAIL_WIDTH = 108;
  const CHANNELS_RAIL_WIDTH = 240;
  const TOPBAR_LEFT_GAP = 8;
  const CHANNELS_TO_CHAT_GAP = 8;
  const USER_BOX_HEIGHT = 84;
  const USER_BOX_BOTTOM_GAP = 2;
  const CHANNELS_TO_USERBOX_GAP = 10;
  const CHANNELS_RAIL_LEFT = GLOBAL_SERVERS_RAIL_WIDTH + TOPBAR_LEFT_GAP;
  const CONTENT_LEFT_PADDING = CHANNELS_RAIL_WIDTH + TOPBAR_LEFT_GAP + CHANNELS_TO_CHAT_GAP;

  const electronApi = typeof window !== "undefined" ? (window as any).electronAPI : null;

  useEffect(() => {
    if (!electronApi) {
      return;
    }

    let unlisten = () => undefined;

    void electronApi.getUpdaterStatus?.().then((state: UpdaterState) => {
      if (state) {
        setUpdaterState(state);
      }
    });

    if (typeof electronApi.onUpdaterState === "function") {
      unlisten = electronApi.onUpdaterState((state: UpdaterState) => {
        if (state) {
          setUpdaterState(state);
        }
      });
    }

    void electronApi.getRuntimeMeta?.().then((meta: RuntimeMeta) => {
      if (meta) {
        setRuntimeMeta(meta);
      }
    });

    return () => {
      unlisten();
    };
  }, [electronApi]);

  const roleIconMap = {
    [MemberRole.GUEST]: null,
    [MemberRole.MODERATOR]: <ShieldCheck className="h-4 w-4 mr-2 text-indigo-500" />,
    [MemberRole.ADMIN]: <ShieldAlert className="h-4 w-4 mr-2 text-rose-500" />,
  };

  const headerTitleStyle = useMemo(
    () => ({
      left: "calc((100% - 256px) / 2)",
      maxWidth: isMembersCollapsed ? "calc(100% - 304px)" : "calc(100% - 560px)",
    }),
    [isMembersCollapsed]
  );

  const updaterStatus = updaterState.status || "idle";
  const isProductionRuntime = Boolean(runtimeMeta.isPackaged) || runtimeMeta.runtimeMode === "production";
  const hasAvailableUpdate =
    updaterStatus === "update-available" ||
    updaterStatus === "downloading" ||
    updaterStatus === "ready-to-restart" ||
    updaterStatus === "installing";

  const updateProgress = Math.max(0, Math.min(100, Number(updaterState.progress || 0)));
  const canUpgradeNow = updaterStatus === "update-available";
  const canRestartNow = updaterStatus === "ready-to-restart" && updaterState.requiresRestart;

  const handleCheckForUpdates = async () => {
    if (!electronApi?.checkForUpdatesNow) {
      return;
    }

    setIsUpdaterActionPending(true);
    try {
      const nextState = await electronApi.checkForUpdatesNow();
      if (nextState) {
        setUpdaterState(nextState);
      }
    } finally {
      setIsUpdaterActionPending(false);
    }
  };

  const handleUpgradeNow = async () => {
    if (!electronApi?.upgradeNow) {
      return;
    }

    setIsUpdaterActionPending(true);
    try {
      const nextState = await electronApi.upgradeNow();
      if (nextState) {
        setUpdaterState(nextState);
      }
    } finally {
      setIsUpdaterActionPending(false);
    }
  };

  const handleRestartNow = async () => {
    if (!electronApi?.restartNow) {
      return;
    }

    setIsUpdaterActionPending(true);
    try {
      await electronApi.restartNow();
    } finally {
      setIsUpdaterActionPending(false);
    }
  };

  return (
    <div className="h-full overflow-hidden">
      <header
        className="theme-server-topbar fixed right-0 top-0 z-40 flex h-12 items-center overflow-hidden rounded-b-xl border-b border-border bg-background px-4"
        style={{ left: `${CHANNELS_RAIL_LEFT}px` }}
      >
        {isProductionRuntime ? (
          <div className="absolute left-12 top-1/2 z-20 -translate-y-1/2">
            <span className="inline-flex items-center rounded-md border border-amber-500/35 bg-amber-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-200">
              Production Mode
            </span>
          </div>
        ) : null}

        {hasAvailableUpdate ? (
          <div className="absolute left-3 top-1/2 z-20 -translate-y-1/2">
            <button
              type="button"
              onClick={() => setIsUpdaterModalOpen(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-400/40 bg-emerald-500/20 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.45)] transition hover:bg-emerald-500/30 hover:text-emerald-100"
              title="Update available"
              aria-label="Open updater"
            >
              {updaterStatus === "downloading" || updaterStatus === "installing" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUpCircle className="h-4 w-4" />
              )}
            </button>
          </div>
        ) : null}

        <h1
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 truncate text-center text-sm font-bold uppercase tracking-[0.08em] text-foreground"
          style={headerTitleStyle}
        >
          {serverName}
        </h1>

        <div className="absolute right-[276px] top-1/2 z-20 flex -translate-y-1/2 items-center gap-1 text-muted-foreground">
          <button type="button" title="Start Call" className="rounded p-1.5 hover:bg-[#3f4248] hover:text-white transition-colors">
            <PhoneCall className="h-4 w-4" />
          </button>
          <button type="button" title="Start Video" className="rounded p-1.5 hover:bg-[#3f4248] hover:text-white transition-colors">
            <Video className="h-4 w-4" />
          </button>
          <button type="button" title="Invite People" className="rounded p-1.5 hover:bg-[#3f4248] hover:text-white transition-colors">
            <UserPlus className="h-4 w-4" />
          </button>
          <button type="button" title="Notifications" className="rounded p-1.5 hover:bg-[#3f4248] hover:text-white transition-colors">
            <Bell className="h-4 w-4" />
          </button>
        </div>

        <div
          className="absolute top-1/2 z-20 -translate-y-1/2 text-muted-foreground"
          style={{ left: "calc(100% - 252px)" }}
        >
          <button
            type="button"
            title={isMembersCollapsed ? "Expand Online Members" : "Collapse Online Members"}
            onClick={() => setIsMembersCollapsed((prev) => !prev)}
            className="rounded p-1.5 hover:bg-[#3f4248] hover:text-white transition-colors"
          >
            {isMembersCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
          </button>
        </div>

        <div
          className="theme-server-search-shell absolute top-1/2 z-20 w-[163px] -translate-y-1/2 -translate-x-1/2 rounded-md border border-border bg-card/90"
          style={{ left: "calc(100% - 128px)" }}
        >
          <ServerSearch
            serverId={serverId}
            serverName={serverName}
            data={[
              {
                label: "Server",
                type: "server",
                data: [
                  {
                    id: serverId,
                    name: serverName,
                    icon: <Hash className="mr-2 h-4 w-4" />,
                  },
                ],
              },
              {
                label: "Text Channels",
                type: "channel",
                data: textChannels.map((channel) => ({
                  id: channel.id,
                  name: channel.name,
                  icon: <Hash className="mr-2 h-4 w-4" />,
                })),
              },
              {
                label: "Voice Channels",
                type: "channel",
                data: voiceChannels.map((channel) => ({
                  id: channel.id,
                  name: channel.name,
                  icon: <Mic className="mr-2 h-4 w-4" />,
                })),
              },
              {
                label: "Video Channels",
                type: "channel",
                data: videoChannels.map((channel) => ({
                  id: channel.id,
                  name: channel.name,
                  icon: <Video className="mr-2 h-4 w-4" />,
                })),
              },
              {
                label: "Online Users",
                type: "member",
                data: onlineUsers.map((member) => ({
                  id: member.id,
                  name: member.name,
                  icon: roleIconMap[member.role],
                })),
              },
            ]}
          />
        </div>
      </header>

      <aside
        className="fixed top-14 z-40"
        style={{
          left: `${CHANNELS_RAIL_LEFT}px`,
          width: `${CHANNELS_RAIL_WIDTH}px`,
          bottom: `${USER_BOX_HEIGHT + CHANNELS_TO_USERBOX_GAP}px`,
        }}
      >
        {leftSidebar}
      </aside>

      {!isMembersCollapsed ? (
        <aside
          className="settings-scrollbar fixed top-12 right-0 z-30 w-64 overflow-y-auto px-2 py-2"
          style={{ bottom: `${USER_BOX_HEIGHT + USER_BOX_BOTTOM_GAP}px` }}
        >
          {rightSidebar}
        </aside>
      ) : null}

      {rightFooter ? (
        <aside
          className="fixed right-0 h-[84px] w-64 z-30 px-2 pb-2 flex items-center justify-center"
          style={{ bottom: `${USER_BOX_BOTTOM_GAP}px` }}
        >
          {rightFooter}
        </aside>
      ) : null}

      <main
        className={`box-border h-full overflow-hidden pt-14 p-2 ${isMembersCollapsed ? "pr-0" : "pr-[256px]"}`}
        style={{ paddingLeft: `${CONTENT_LEFT_PADDING}px` }}
      >
        {children}
      </main>

      <Dialog open={isUpdaterModalOpen} onOpenChange={setIsUpdaterModalOpen}>
        <DialogContent className="settings-theme-scope settings-scrollbar max-w-xl rounded-2xl border-black/30 bg-[#2b2d31] text-[#dbdee1]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <ArrowUpCircle className="h-5 w-5 text-emerald-400" />
              In-Accord Updater
            </DialogTitle>
            <DialogDescription className="text-[#b5bac1]">
              Keep your client up to date with live updates.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 rounded-xl border border-black/20 bg-[#1e1f22] p-4">
            <div className="grid grid-cols-2 gap-2 text-xs text-[#b5bac1]">
              <p>
                <span className="text-[#949ba4]">Current:</span> {updaterState.currentVersion || "unknown"}
              </p>
              <p>
                <span className="text-[#949ba4]">Latest:</span> {updaterState.latestVersion || "unknown"}
              </p>
            </div>

            <div className="rounded-lg border border-black/20 bg-[#15161a] px-3 py-2 text-xs text-[#b5bac1]">
              {updaterStatus === "error" ? (
                <span className="inline-flex items-center gap-2 text-rose-300">
                  <TriangleAlert className="h-4 w-4" />
                  {updaterState.message || "Update failed."}
                </span>
              ) : updaterStatus === "ready-to-restart" ? (
                <span className="inline-flex items-center gap-2 text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  Update downloaded. Restart required to complete install.
                </span>
              ) : (
                updaterState.message || "Waiting for update check..."
              )}
            </div>

            {(updaterStatus === "downloading" || updaterStatus === "ready-to-restart" || updateProgress > 0) ? (
              <div className="space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-black/25">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${updateProgress}%` }}
                  />
                </div>
                <p className="text-right text-[11px] text-[#949ba4]">{updateProgress}%</p>
              </div>
            ) : null}

            {updaterState.releaseNotes ? (
              <div className="rounded-lg border border-black/20 bg-[#15161a] px-3 py-2 text-xs text-[#b5bac1]">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Release notes</p>
                <p className="whitespace-pre-wrap break-words">{updaterState.releaseNotes}</p>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCheckForUpdates}
              disabled={isUpdaterActionPending || updaterStatus === "downloading" || updaterStatus === "installing"}
            >
              Check for updates
            </Button>

            <div className="flex items-center gap-2">
              {canUpgradeNow ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleUpgradeNow}
                  disabled={isUpdaterActionPending}
                >
                  {isUpdaterActionPending ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Starting...
                    </span>
                  ) : (
                    "Upgrade Now"
                  )}
                </Button>
              ) : null}

              {canRestartNow ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleRestartNow}
                  disabled={isUpdaterActionPending}
                >
                  {isUpdaterActionPending ? "Restarting..." : "OK - Restart App"}
                </Button>
              ) : null}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
