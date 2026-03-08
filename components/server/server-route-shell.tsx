"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpCircle,
  Bell,
  CheckCircle2,
  GripVertical,
  Hash,
  Loader2,
  Mic,
  PanelRightClose,
  PanelRightOpen,
  PhoneCall,
  SlidersHorizontal,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
  Video,
  X,
} from "lucide-react";

import { ServerSearch } from "@/components/server/server-search";
import { SupportHelpControls } from "@/components/topbar/support-help-controls";
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

type ServerTabItem = {
  serverId: string;
  serverName: string;
  defaultChannelId: string | null;
  lastVisitedAt: number;
};

type TabBarPreferences = {
  tabMinWidth: number;
  tabMaxWidth: number;
  barRounded: boolean;
  activeTabColor: string;
  inactiveTabColor: string;
  compactMode: boolean;
  closeOnHover: boolean;
};

type TabBarPreset = {
  id: string;
  label: string;
  prefs: TabBarPreferences;
};

type CustomTabBarPreset = {
  label: string;
  prefs: TabBarPreferences;
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
  const SERVER_TAB_DRAG_MIME = "application/x-inaccord-server-tab";
  const router = useRouter();
  const pathname = usePathname();
  const [isMembersCollapsed, setIsMembersCollapsed] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [hasLoadedTabsFromStorage, setHasLoadedTabsFromStorage] = useState(false);
  const [isUpdaterModalOpen, setIsUpdaterModalOpen] = useState(false);
  const [isTabCustomizePanelOpen, setIsTabCustomizePanelOpen] = useState(false);
  const [serverTabs, setServerTabs] = useState<ServerTabItem[]>([]);
  const [tabBarPreferences, setTabBarPreferences] = useState<TabBarPreferences>({
    tabMinWidth: 120,
    tabMaxWidth: 220,
    barRounded: true,
    activeTabColor: "#5865f2",
    inactiveTabColor: "#3f4248",
    compactMode: false,
    closeOnHover: false,
  });
  const [customTabPresets, setCustomTabPresets] = useState<Array<CustomTabBarPreset | null>>([null, null]);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
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
  const TAB_BAR_PRESETS: TabBarPreset[] = [
    {
      id: "classic",
      label: "Classic",
      prefs: {
        tabMinWidth: 120,
        tabMaxWidth: 220,
        barRounded: true,
        activeTabColor: "#5865f2",
        inactiveTabColor: "#3f4248",
        compactMode: false,
        closeOnHover: false,
      },
    },
    {
      id: "neon",
      label: "Neon",
      prefs: {
        tabMinWidth: 120,
        tabMaxWidth: 240,
        barRounded: true,
        activeTabColor: "#00e5ff",
        inactiveTabColor: "#17324a",
        compactMode: false,
        closeOnHover: true,
      },
    },
    {
      id: "mono",
      label: "Mono",
      prefs: {
        tabMinWidth: 110,
        tabMaxWidth: 220,
        barRounded: false,
        activeTabColor: "#8a8f98",
        inactiveTabColor: "#2f3338",
        compactMode: true,
        closeOnHover: true,
      },
    },
    {
      id: "sunset",
      label: "Sunset",
      prefs: {
        tabMinWidth: 120,
        tabMaxWidth: 240,
        barRounded: true,
        activeTabColor: "#ff7b54",
        inactiveTabColor: "#5a2d2d",
        compactMode: false,
        closeOnHover: false,
      },
    },
  ];
  const GLOBAL_SERVERS_RAIL_WIDTH = 108;
  const CHANNELS_RAIL_WIDTH = 240;
  const TOPBAR_LEFT_GAP = 8;
  const CHANNELS_TO_CHAT_GAP = 8;
  const RIGHT_RAIL_WIDTH = 288;
  const SEARCH_SHELL_WIDTH = 163;
  const TOPBAR_HEIGHT = 48;
  const TABBAR_HEIGHT = 40;
  const TOP_TO_CONTENT_GAP = 8;
  const USER_BOX_HEIGHT = 84;
  const USER_BOX_BOTTOM_GAP = 2;
  const CHANNELS_TO_USERBOX_GAP = 10;
  const MAX_PERSISTED_TABS = 30;
  const MAX_SERVER_NAME_LENGTH = 80;
  const CHANNELS_RAIL_LEFT = GLOBAL_SERVERS_RAIL_WIDTH + TOPBAR_LEFT_GAP;
  const CONTENT_LEFT_PADDING = CHANNELS_RAIL_WIDTH + TOPBAR_LEFT_GAP + CHANNELS_TO_CHAT_GAP;
  const CONTENT_TOP = TOPBAR_HEIGHT + TABBAR_HEIGHT;
  const LEFT_SIDEBAR_TOP = CONTENT_TOP + TOP_TO_CONTENT_GAP;
  const MAIN_TOP_PADDING = CONTENT_TOP + TOP_TO_CONTENT_GAP;

  const defaultChannelId = useMemo(() => {
    const preferred = textChannels.find((item) => item.name.toLowerCase() === "general") ?? textChannels[0];
    if (preferred?.id) {
      return preferred.id;
    }

    const fallback = voiceChannels[0] ?? videoChannels[0] ?? null;
    return fallback?.id ?? null;
  }, [textChannels, videoChannels, voiceChannels]);

  const navigateToServerTab = (tab: ServerTabItem) => {
    const target = tab.defaultChannelId
      ? `/servers/${tab.serverId}/channels/${tab.defaultChannelId}`
      : `/servers/${tab.serverId}`;

    router.push(target);
  };

  const reorderTabs = (tabs: ServerTabItem[], sourceId: string, targetId: string) => {
    const sourceIndex = tabs.findIndex((tab) => tab.serverId === sourceId);
    const targetIndex = tabs.findIndex((tab) => tab.serverId === targetId);

    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return tabs;
    }

    const next = [...tabs];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    return next;
  };

  const addOrActivateServerTab = (input: { serverId: string; serverName?: string | null }) => {
    const droppedServerId = String(input.serverId ?? "").trim();
    if (!droppedServerId) {
      return;
    }

    const droppedServerName = String(input.serverName ?? "").trim().slice(0, MAX_SERVER_NAME_LENGTH) || "Server";

    mutateTabsAndPersist((baseTabs) => {
      const existingIndex = baseTabs.findIndex((tab) => tab.serverId === droppedServerId);
      const now = Date.now();

      if (existingIndex >= 0) {
        const next = [...baseTabs];
        next[existingIndex] = {
          ...next[existingIndex],
          serverName: droppedServerName,
          lastVisitedAt: now,
        };
        return next;
      }

      return [
        ...baseTabs,
        {
          serverId: droppedServerId,
          serverName: droppedServerName,
          defaultChannelId: droppedServerId === serverId ? defaultChannelId : null,
          lastVisitedAt: now,
        },
      ];
    });

    router.push(`/servers/${droppedServerId}`);
  };

  const readServerTabDragPayload = (event: { dataTransfer?: DataTransfer | null }) => {
    let payloadRaw = "";

    try {
      payloadRaw = event.dataTransfer?.getData(SERVER_TAB_DRAG_MIME) || "";
    } catch {
      payloadRaw = "";
    }

    if (!payloadRaw) {
      return null;
    }

    try {
      const parsed = JSON.parse(payloadRaw) as { serverId?: string; serverName?: string; source?: string };
      const parsedId = String(parsed.serverId ?? "").trim();
      if (!parsedId) {
        return null;
      }

      return {
        serverId: parsedId,
        serverName: parsed.serverName,
        source: String(parsed.source ?? "").trim().toLowerCase(),
      };
    } catch {
      return null;
    }
  };

  const compactTabsForStorage = (tabs: ServerTabItem[]): ServerTabItem[] => {
    const orderedIds: string[] = [];
    const deduped = new Map<string, ServerTabItem>();

    for (const tab of tabs) {
      const id = String(tab.serverId ?? "").trim();
      if (!id) {
        continue;
      }

      const normalized: ServerTabItem = {
        serverId: id,
        serverName: String(tab.serverName ?? "").trim().slice(0, MAX_SERVER_NAME_LENGTH) || "Server",
        defaultChannelId:
          typeof tab.defaultChannelId === "string" && tab.defaultChannelId.trim().length > 0
            ? tab.defaultChannelId.trim()
            : null,
        lastVisitedAt:
          typeof tab.lastVisitedAt === "number" && Number.isFinite(tab.lastVisitedAt)
            ? tab.lastVisitedAt
            : Date.now(),
      };

      if (!deduped.has(id)) {
        orderedIds.push(id);
      }

      deduped.set(id, normalized);
    }

    const stableTabs = orderedIds
      .map((id) => deduped.get(id))
      .filter((tab): tab is ServerTabItem => Boolean(tab));

    if (stableTabs.length <= MAX_PERSISTED_TABS) {
      return stableTabs;
    }

    return stableTabs.slice(stableTabs.length - MAX_PERSISTED_TABS);
  };

  const mutateTabsAndPersist = (updater: (baseTabs: ServerTabItem[]) => ServerTabItem[]) => {
    setServerTabs((prev) => {
      const baseTabs = compactTabsForStorage(prev);
      return compactTabsForStorage(updater(baseTabs));
    });
  };

  const isHexColor = (value: unknown): value is string =>
    typeof value === "string" && /^#([0-9a-fA-F]{6})$/.test(value.trim());

  const hexToRgba = (hex: string, alpha: number) => {
    const cleaned = hex.replace("#", "");
    if (cleaned.length !== 6) {
      return `rgba(88, 101, 242, ${alpha})`;
    }

    const int = Number.parseInt(cleaned, 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const electronApi = typeof window !== "undefined" ? (window as any).electronAPI : null;

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") {
      return;
    }

    const loadServerTabsState = async () => {
      try {
        const response = await fetch("/api/profile/server-tabs", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          setHasLoadedTabsFromStorage(true);
          return;
        }

        const data = (await response.json()) as {
          tabs?: ServerTabItem[];
          tabBarPreferences?: Partial<TabBarPreferences>;
          customTabPresets?: Array<CustomTabBarPreset | null>;
        };

        if (Array.isArray(data.tabs)) {
          setServerTabs(compactTabsForStorage(data.tabs));
        }

        if (data.tabBarPreferences && typeof data.tabBarPreferences === "object") {
          const parsed = data.tabBarPreferences;
          const nextMin =
            typeof parsed.tabMinWidth === "number" && Number.isFinite(parsed.tabMinWidth)
              ? Math.min(180, Math.max(90, Math.round(parsed.tabMinWidth)))
              : 120;
          const nextMax =
            typeof parsed.tabMaxWidth === "number" && Number.isFinite(parsed.tabMaxWidth)
              ? Math.min(320, Math.max(nextMin + 20, Math.round(parsed.tabMaxWidth)))
              : 220;

          setTabBarPreferences({
            tabMinWidth: nextMin,
            tabMaxWidth: nextMax,
            barRounded: parsed.barRounded !== false,
            activeTabColor: isHexColor(parsed.activeTabColor) ? parsed.activeTabColor.trim() : "#5865f2",
            inactiveTabColor: isHexColor(parsed.inactiveTabColor) ? parsed.inactiveTabColor.trim() : "#3f4248",
            compactMode: parsed.compactMode === true,
            closeOnHover: parsed.closeOnHover === true,
          });
        }

        if (Array.isArray(data.customTabPresets)) {
          const normalized = data.customTabPresets.slice(0, 2).map((entry, index) => {
            if (!entry || typeof entry !== "object") {
              return null;
            }

            const row = entry as Partial<CustomTabBarPreset>;
            const prefs = row.prefs as Partial<TabBarPreferences> | undefined;
            if (!prefs) {
              return null;
            }

            const min =
              typeof prefs.tabMinWidth === "number" && Number.isFinite(prefs.tabMinWidth)
                ? Math.min(180, Math.max(90, Math.round(prefs.tabMinWidth)))
                : 120;
            const max =
              typeof prefs.tabMaxWidth === "number" && Number.isFinite(prefs.tabMaxWidth)
                ? Math.min(320, Math.max(min + 20, Math.round(prefs.tabMaxWidth)))
                : 220;

            return {
              label:
                typeof row.label === "string" && row.label.trim().length > 0
                  ? row.label.trim().slice(0, 28)
                  : `Custom ${index + 1}`,
              prefs: {
                tabMinWidth: min,
                tabMaxWidth: max,
                barRounded: prefs.barRounded !== false,
                activeTabColor: isHexColor(prefs.activeTabColor) ? prefs.activeTabColor.trim() : "#5865f2",
                inactiveTabColor: isHexColor(prefs.inactiveTabColor) ? prefs.inactiveTabColor.trim() : "#3f4248",
                compactMode: prefs.compactMode === true,
                closeOnHover: prefs.closeOnHover === true,
              },
            } satisfies CustomTabBarPreset;
          });

          setCustomTabPresets([normalized[0] ?? null, normalized[1] ?? null]);
        }
      } catch {
        // keep in-memory defaults if server state cannot be loaded
      } finally {
        setHasLoadedTabsFromStorage(true);
      }
    };

    void loadServerTabsState();
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated || !hasLoadedTabsFromStorage) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        await fetch("/api/profile/server-tabs", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tabs: serverTabs,
            tabBarPreferences,
            customTabPresets,
          }),
        });
      } catch {
        // keep UI responsive if persistence call fails
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [customTabPresets, hasLoadedTabsFromStorage, isHydrated, serverTabs, tabBarPreferences]);

  useEffect(() => {
    if (!isHydrated || !hasLoadedTabsFromStorage) {
      return;
    }

    const currentName = serverName.trim().slice(0, MAX_SERVER_NAME_LENGTH);

    mutateTabsAndPersist((baseTabs) => {
      const existingIndex = baseTabs.findIndex((tab) => tab.serverId === serverId);
      const now = Date.now();

      if (existingIndex >= 0) {
        const next = [...baseTabs];
        next[existingIndex] = {
          ...next[existingIndex],
          serverName: currentName,
          defaultChannelId,
          lastVisitedAt: now,
        };
        return next;
      }

      return [
        ...baseTabs,
        {
          serverId,
          serverName: currentName,
          defaultChannelId,
          lastVisitedAt: now,
        },
      ];
    });
  }, [defaultChannelId, hasLoadedTabsFromStorage, isHydrated, serverId, serverName]);

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
      left: isMembersCollapsed
        ? `calc((100% + ${CONTENT_LEFT_PADDING}px) / 2)`
        : `calc((100% + ${CONTENT_LEFT_PADDING}px - ${RIGHT_RAIL_WIDTH}px) / 2)`,
      maxWidth: isMembersCollapsed
        ? `calc(100% - ${CONTENT_LEFT_PADDING + 24}px)`
        : `calc(100% - ${CONTENT_LEFT_PADDING + RIGHT_RAIL_WIDTH + 24}px)`,
    }),
    [CONTENT_LEFT_PADDING, RIGHT_RAIL_WIDTH, isMembersCollapsed]
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

  if (!isHydrated) {
    return <div className="h-full overflow-hidden" suppressHydrationWarning />;
  }

  return (
    <div className="h-full overflow-hidden" suppressHydrationWarning>
      <header
        className="theme-server-topbar fixed right-0 top-0 z-40 flex h-12 items-center overflow-hidden rounded-b-xl border-b border-border bg-background"
        style={{ left: `${CHANNELS_RAIL_LEFT}px` }}
      >
        <SupportHelpControls panelTop={TOPBAR_HEIGHT + TOP_TO_CONTENT_GAP} />

        {isProductionRuntime ? (
          <div className="absolute left-48 top-1/2 z-20 -translate-y-1/2">
            <span className="inline-flex items-center rounded-md border border-amber-500/35 bg-amber-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-200">
              Production Mode
            </span>
          </div>
        ) : null}

        {hasAvailableUpdate ? (
          <div className="absolute left-40 top-1/2 z-20 -translate-y-1/2">
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
          className="absolute inset-y-0 z-10 flex -translate-x-1/2 items-center truncate text-center text-sm font-bold uppercase tracking-[0.08em] text-foreground"
          style={headerTitleStyle}
        >
          {serverName}
        </h1>

        <div
          className="absolute inset-y-0 z-20 flex items-center gap-1 text-muted-foreground"
          style={{ right: `${RIGHT_RAIL_WIDTH + 20}px` }}
        >
          <button type="button" title="Start Call" className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-[#3f4248] hover:text-white transition-colors">
            <PhoneCall className="h-4 w-4" />
          </button>
          <button type="button" title="Start Video" className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-[#3f4248] hover:text-white transition-colors">
            <Video className="h-4 w-4" />
          </button>
          <button type="button" title="Invite People" className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-[#3f4248] hover:text-white transition-colors">
            <UserPlus className="h-4 w-4" />
          </button>
          <button type="button" title="Notifications" className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-[#3f4248] hover:text-white transition-colors">
            <Bell className="h-4 w-4" />
          </button>
        </div>

        <div
          className="absolute inset-y-0 z-20 flex items-center text-muted-foreground"
          style={{ right: `${RIGHT_RAIL_WIDTH - 4}px` }}
        >
          <button
            type="button"
            title={isMembersCollapsed ? "Expand Online Members" : "Collapse Online Members"}
            onClick={() => setIsMembersCollapsed((prev) => !prev)}
            className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-[#3f4248] hover:text-white transition-colors"
          >
            {isMembersCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
          </button>
        </div>

        <div
          className="absolute inset-y-0 z-20 flex items-center"
          style={{ right: `${(RIGHT_RAIL_WIDTH - SEARCH_SHELL_WIDTH) / 2}px` }}
        >
          <div className="theme-server-search-shell w-40.75 rounded-md border border-border bg-card/90">
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
        </div>
      </header>

      <div
        id="server-tabs-bar"
        className={`fixed right-0 z-35 flex h-10 items-center border-b border-border bg-card/80 px-2 backdrop-blur-sm ${
          tabBarPreferences.barRounded ? "rounded-b-2xl" : "rounded-none"
        }`}
        style={{ top: `${TOPBAR_HEIGHT}px`, left: `${CHANNELS_RAIL_LEFT}px` }}
      >
        <div
          className="settings-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden py-1"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = draggedTabId ? "move" : "copy";
          }}
          onDrop={(event) => {
            event.preventDefault();

            const parsed = readServerTabDragPayload(event);
            if (parsed && parsed.source === "server-rail") {
              addOrActivateServerTab({
                serverId: parsed.serverId,
                serverName: parsed.serverName,
              });
              setDraggedTabId(null);
              return;
            }

            if (draggedTabId) {
              setDraggedTabId(null);
              return;
            }

            if (!parsed) {
              return;
            }

            addOrActivateServerTab({
              serverId: parsed.serverId,
              serverName: parsed.serverName,
            });
          }}
        >
          {serverTabs.map((tab) => {
            const isActive = pathname?.includes(`/servers/${tab.serverId}/`) ?? false;
            const canCloseTab = serverTabs.length > 1;
            const tabHeightClass = tabBarPreferences.compactMode ? "h-7" : "h-8";
            const tabTextClass = tabBarPreferences.compactMode ? "text-[11px]" : "text-xs";
            const tabPaddingClass = tabBarPreferences.compactMode ? "px-1.5" : "px-2";
            const activeBg = hexToRgba(tabBarPreferences.activeTabColor, 0.26);
            const inactiveBg = hexToRgba(tabBarPreferences.inactiveTabColor, 0.22);
            const inactiveHover = hexToRgba(tabBarPreferences.inactiveTabColor, 0.36);

            return (
              <div
                key={tab.serverId}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();

                  const parsed = readServerTabDragPayload(event);

                  if (parsed && parsed.source === "server-rail") {
                    if (parsed.serverId !== tab.serverId) {
                      addOrActivateServerTab({
                        serverId: parsed.serverId,
                        serverName: parsed.serverName,
                      });
                    }
                    setDraggedTabId(null);
                    return;
                  }

                  const sourceTabId = String(draggedTabId ?? parsed?.serverId ?? "").trim();
                  if (!sourceTabId || sourceTabId === tab.serverId) {
                    return;
                  }

                  mutateTabsAndPersist((baseTabs) => reorderTabs(baseTabs, sourceTabId, tab.serverId));
                  setDraggedTabId(null);
                }}
                className={`group relative flex min-w-30 max-w-55 flex-none items-center gap-2 rounded-md border text-left transition hover:brightness-110 ${tabHeightClass} ${tabPaddingClass} ${tabTextClass}`}
                style={{
                  minWidth: `${tabBarPreferences.tabMinWidth}px`,
                  maxWidth: `${tabBarPreferences.tabMaxWidth}px`,
                  borderColor: isActive ? tabBarPreferences.activeTabColor : `${tabBarPreferences.inactiveTabColor}99`,
                  backgroundColor: isActive ? activeBg : inactiveBg,
                  color: isActive ? "#ffffff" : "#d4d4d8",
                }}
                onMouseEnter={(event) => {
                  if (!isActive) {
                    event.currentTarget.style.backgroundColor = inactiveHover;
                  }
                }}
                onMouseLeave={(event) => {
                  if (!isActive) {
                    event.currentTarget.style.backgroundColor = inactiveBg;
                  }
                }}
                title={tab.serverName}
              >
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    setDraggedTabId(tab.serverId);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData(
                      SERVER_TAB_DRAG_MIME,
                      JSON.stringify({
                        serverId: tab.serverId,
                        serverName: tab.serverName,
                        source: "tab",
                      })
                    );
                  }}
                  onDragEnd={() => setDraggedTabId(null)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-300 transition hover:bg-black/25 hover:text-white"
                  title="Drag to reorder tab"
                  aria-label={`Drag ${tab.serverName} tab to reorder`}
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => navigateToServerTab(tab)}
                  className="min-w-0 flex-1 truncate text-left"
                >
                  <span className="truncate font-semibold">{tab.serverName}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Close ${tab.serverName} tab`}
                  disabled={!canCloseTab}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    mutateTabsAndPersist((baseTabs) => {
                      if (baseTabs.length <= 1) {
                        return baseTabs;
                      }

                      const currentIndex = baseTabs.findIndex((item) => item.serverId === tab.serverId);
                      const nextTabs = baseTabs.filter((item) => item.serverId !== tab.serverId);

                      if (isActive) {
                        if (nextTabs.length > 0) {
                          const fallbackIndex = Math.max(0, Math.min(currentIndex, nextTabs.length - 1));
                          navigateToServerTab(nextTabs[fallbackIndex]);
                        }
                      }

                      return nextTabs;
                    });
                  }}
                  className={`ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition ${
                    canCloseTab
                      ? `${tabBarPreferences.closeOnHover ? "opacity-0 group-hover:opacity-100" : "opacity-100"} text-zinc-300 hover:bg-black/25 hover:text-white`
                      : "cursor-not-allowed text-zinc-600 opacity-50"
                  }`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setIsTabCustomizePanelOpen((prev) => !prev)}
          className="ml-2 inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border/70 bg-background/70 px-2 text-xs font-semibold text-zinc-200 transition hover:bg-background/95"
          title="Customise tab bar"
          aria-label="Customise tab bar"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Customise
        </button>
      </div>

      {isTabCustomizePanelOpen ? (
        <aside
          className="fixed right-0 z-40 w-80 border-l border-border bg-card/95 p-3 backdrop-blur-md"
          style={{ top: `${CONTENT_TOP + TOP_TO_CONTENT_GAP}px`, bottom: "0px" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-100">Tab Bar Customise</h2>
            <button
              type="button"
              onClick={() => setIsTabCustomizePanelOpen(false)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-black/20 hover:text-white"
              aria-label="Close tab customisation panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 text-xs text-zinc-300">
            <div>
              <p className="mb-2 font-medium text-zinc-200">Tab minimum width: {tabBarPreferences.tabMinWidth}px</p>
              <input
                type="range"
                min={90}
                max={180}
                step={5}
                value={tabBarPreferences.tabMinWidth}
                onChange={(event) => {
                  const nextMin = Math.min(180, Math.max(90, Number(event.target.value) || 120));
                  setTabBarPreferences((prev) => ({
                    ...prev,
                    tabMinWidth: nextMin,
                    tabMaxWidth: Math.max(prev.tabMaxWidth, nextMin + 20),
                  }));
                }}
                className="w-full"
              />
            </div>

            <div>
              <p className="mb-2 font-medium text-zinc-200">Tab maximum width: {tabBarPreferences.tabMaxWidth}px</p>
              <input
                type="range"
                min={120}
                max={320}
                step={5}
                value={tabBarPreferences.tabMaxWidth}
                onChange={(event) => {
                  const rawMax = Number(event.target.value) || 220;
                  setTabBarPreferences((prev) => ({
                    ...prev,
                    tabMaxWidth: Math.min(320, Math.max(prev.tabMinWidth + 20, rawMax)),
                  }));
                }}
                className="w-full"
              />
            </div>

            <label className="flex items-center justify-between rounded-md border border-border/60 bg-background/60 px-2 py-2">
              <span className="font-medium text-zinc-200">Rounded tab bar</span>
              <input
                type="checkbox"
                checked={tabBarPreferences.barRounded}
                onChange={(event) => {
                  const nextChecked = event.target.checked;
                  setTabBarPreferences((prev) => ({
                    ...prev,
                    barRounded: nextChecked,
                  }));
                }}
              />
            </label>

            <label className="flex items-center justify-between rounded-md border border-border/60 bg-background/60 px-2 py-2">
              <span className="font-medium text-zinc-200">Compact tab mode</span>
              <input
                type="checkbox"
                checked={tabBarPreferences.compactMode}
                onChange={(event) => {
                  setTabBarPreferences((prev) => ({
                    ...prev,
                    compactMode: event.target.checked,
                  }));
                }}
              />
            </label>

            <label className="flex items-center justify-between rounded-md border border-border/60 bg-background/60 px-2 py-2">
              <span className="font-medium text-zinc-200">Show close icon on hover</span>
              <input
                type="checkbox"
                checked={tabBarPreferences.closeOnHover}
                onChange={(event) => {
                  setTabBarPreferences((prev) => ({
                    ...prev,
                    closeOnHover: event.target.checked,
                  }));
                }}
              />
            </label>

            <div className="rounded-md border border-border/60 bg-background/60 px-2 py-2">
              <p className="mb-2 font-medium text-zinc-200">Active tab color</p>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={tabBarPreferences.activeTabColor}
                  onChange={(event) => {
                    const nextColor = event.target.value;
                    if (!isHexColor(nextColor)) {
                      return;
                    }
                    setTabBarPreferences((prev) => ({ ...prev, activeTabColor: nextColor }));
                  }}
                  className="h-7 w-10 rounded border border-border/70 bg-transparent p-0"
                />
                <span className="font-mono text-[11px] text-zinc-400">{tabBarPreferences.activeTabColor}</span>
              </div>
            </div>

            <div className="rounded-md border border-border/60 bg-background/60 px-2 py-2">
              <p className="mb-2 font-medium text-zinc-200">Inactive tab color</p>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={tabBarPreferences.inactiveTabColor}
                  onChange={(event) => {
                    const nextColor = event.target.value;
                    if (!isHexColor(nextColor)) {
                      return;
                    }
                    setTabBarPreferences((prev) => ({ ...prev, inactiveTabColor: nextColor }));
                  }}
                  className="h-7 w-10 rounded border border-border/70 bg-transparent p-0"
                />
                <span className="font-mono text-[11px] text-zinc-400">{tabBarPreferences.inactiveTabColor}</span>
              </div>
            </div>

            <div className="rounded-md border border-border/60 bg-background/60 px-2 py-2">
              <p className="mb-2 font-medium text-zinc-200">Style presets</p>
              <div className="grid grid-cols-2 gap-2">
                {TAB_BAR_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setTabBarPreferences(preset.prefs)}
                    className="inline-flex items-center justify-center rounded-md border border-border/70 bg-background/70 px-2 py-1.5 text-[11px] font-semibold text-zinc-200 transition hover:bg-background/95"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-border/60 bg-background/60 px-2 py-2">
              <p className="mb-2 font-medium text-zinc-200">Custom presets</p>
              <div className="space-y-2">
                {[0, 1].map((slotIndex) => {
                  const slot = customTabPresets[slotIndex];
                  return (
                    <div key={`custom-preset-slot-${slotIndex}`} className="rounded-md border border-border/60 bg-background/50 px-2 py-2">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-zinc-200">
                          {slot?.label ?? `Custom ${slotIndex + 1}`}
                        </span>
                        <span className="text-[10px] text-zinc-500">Slot {slotIndex + 1}</span>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const snapshot: CustomTabBarPreset = {
                              label: `Custom ${slotIndex + 1}`,
                              prefs: { ...tabBarPreferences },
                            };

                            setCustomTabPresets((prev) => {
                              const next = [...prev];
                              next[slotIndex] = snapshot;
                              return next as Array<CustomTabBarPreset | null>;
                            });
                          }}
                          className="inline-flex flex-1 items-center justify-center rounded-md border border-border/70 bg-background/70 px-2 py-1.5 text-[11px] font-semibold text-zinc-200 transition hover:bg-background/95"
                        >
                          Save
                        </button>

                        <button
                          type="button"
                          disabled={!slot}
                          onClick={() => {
                            if (!slot) {
                              return;
                            }

                            setTabBarPreferences({ ...slot.prefs });
                          }}
                          className={`inline-flex flex-1 items-center justify-center rounded-md border px-2 py-1.5 text-[11px] font-semibold transition ${
                            slot
                              ? "border-border/70 bg-background/70 text-zinc-200 hover:bg-background/95"
                              : "cursor-not-allowed border-border/40 bg-background/40 text-zinc-500"
                          }`}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setTabBarPreferences({
                  tabMinWidth: 120,
                  tabMaxWidth: 220,
                  barRounded: true,
                  activeTabColor: "#5865f2",
                  inactiveTabColor: "#3f4248",
                  compactMode: false,
                  closeOnHover: false,
                });
              }}
              className="inline-flex w-full items-center justify-center rounded-md border border-border/70 bg-background/70 px-2 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-background/95"
            >
              Reset tab bar style
            </button>

            <div className="rounded-md border border-border/60 bg-background/60 px-2 py-2 text-[11px] text-zinc-400">
              Tip: You can still drag tabs to reorder, and drag servers from the left rail into this bar.
            </div>
          </div>
        </aside>
      ) : null}

      <aside
        className="fixed z-40"
        style={{
          top: `${LEFT_SIDEBAR_TOP}px`,
          left: `${CHANNELS_RAIL_LEFT}px`,
          width: `${CHANNELS_RAIL_WIDTH}px`,
          bottom: `${USER_BOX_HEIGHT + CHANNELS_TO_USERBOX_GAP}px`,
        }}
      >
        {leftSidebar}
      </aside>

      {!isMembersCollapsed ? (
        <aside
          className="settings-scrollbar fixed right-0 z-30 overflow-y-auto px-2 py-2"
          style={{
            top: `${CONTENT_TOP}px`,
            width: `${RIGHT_RAIL_WIDTH}px`,
            bottom: `${USER_BOX_HEIGHT + USER_BOX_BOTTOM_GAP}px`,
          }}
        >
          {rightSidebar}
        </aside>
      ) : null}

      {rightFooter ? (
        <aside
          className="fixed right-0 z-30 flex h-21 items-center justify-center px-2 pb-2"
          style={{ width: `${RIGHT_RAIL_WIDTH}px`, bottom: `${USER_BOX_BOTTOM_GAP}px` }}
        >
          {rightFooter}
        </aside>
      ) : null}

      <main
        className="box-border h-full overflow-hidden p-2"
        style={{
          paddingTop: `${MAIN_TOP_PADDING}px`,
          paddingLeft: `${CONTENT_LEFT_PADDING}px`,
          paddingRight: isMembersCollapsed ? "0px" : `${RIGHT_RAIL_WIDTH}px`,
        }}
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
                <p className="whitespace-pre-wrap wrap-break-word">{updaterState.releaseNotes}</p>
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
