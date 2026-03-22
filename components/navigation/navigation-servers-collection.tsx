"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { NavigationItem } from "@/components/navigation/navigation-item";
import { NavigationOpenTabsButton } from "@/components/navigation/navigation-open-tabs-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useModal } from "@/hooks/use-modal-store";

type ServerEntry = {
  id: string;
  name: string;
  imageUrl: string | null;
  updatedAt?: Date | string;
  hasUnreadAnnouncement?: boolean;
};

type ServerFolder = {
  id: string;
  name: string;
  serverIds: string[];
  background?: string;
};

const DEFAULT_FOLDER_BACKGROUND = "#64748b";

const normalizeFolderBackground = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return /^#([0-9a-fA-F]{6})$/.test(normalized) ? normalized.toLowerCase() : DEFAULT_FOLDER_BACKGROUND;
};

const getFolderSurfaceStyle = (background?: string) => ({
  backgroundColor: normalizeFolderBackground(background),
});

type NavigationServersCollectionProps = {
  myServers: ServerEntry[];
  joinedServers: ServerEntry[];
  fallbackServerId?: string;
};

type RailContextMenuState =
  | {
      kind: "server";
      x: number;
      y: number;
      serverId: string;
    }
  | {
      kind: "folder";
      x: number;
      y: number;
      folderId: string;
    };

const safeParseFolders = (raw: string | null): ServerFolder[] => {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const folders: ServerFolder[] = [];

    for (const item of parsed) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const maybeFolder = item as Partial<ServerFolder>;
      if (typeof maybeFolder.id !== "string" || typeof maybeFolder.name !== "string") {
        continue;
      }

      const serverIds = Array.isArray(maybeFolder.serverIds)
        ? maybeFolder.serverIds.filter((id): id is string => typeof id === "string")
        : [];

      folders.push({
        id: maybeFolder.id,
        name: maybeFolder.name,
        serverIds,
        background: normalizeFolderBackground(maybeFolder.background),
      });
    }

    return folders;
  } catch {
    return [];
  }
};

const pruneEmptyFolders = (sourceFolders: ServerFolder[]) =>
  sourceFolders.filter((folder) => folder.serverIds.length > 0);

const normalizeFoldersForState = (source: ServerFolder[]) =>
  source
    .map((folder) => ({
      ...folder,
      serverIds: Array.from(new Set(folder.serverIds)),
    }))
    .filter((folder) => folder.serverIds.length > 0 || folder.name.trim().length > 0);

const folderLayoutSignature = (source: ServerFolder[]) =>
  JSON.stringify(
    source.map((folder) => ({
      id: folder.id,
      name: folder.name,
      serverIds: folder.serverIds,
      background: normalizeFolderBackground(folder.background),
    }))
  );

const resolveDraggedServerId = (
  event: { dataTransfer?: DataTransfer | null },
  fallbackId: string | null
) => {
  const fromState = String(fallbackId ?? "").trim();
  if (fromState) {
    return fromState;
  }

  const fromDataTransfer = String(event.dataTransfer?.getData("text/plain") ?? "").trim();
  return fromDataTransfer || null;
};

export const NavigationServersCollection = ({
  myServers,
  joinedServers,
  fallbackServerId,
}: NavigationServersCollectionProps) => {
  const router = useRouter();
  const { onOpen } = useModal();
  const [folders, setFolders] = useState<ServerFolder[]>([]);
  const [isFoldersLoaded, setIsFoldersLoaded] = useState(false);
  const [isSyncingFolders, setIsSyncingFolders] = useState(false);
  const [foldersSyncError, setFoldersSyncError] = useState<string | null>(null);
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [editingFolderBackground, setEditingFolderBackground] = useState(DEFAULT_FOLDER_BACKGROUND);
  const [recentlyUngroupedServerIds, setRecentlyUngroupedServerIds] = useState<string[]>([]);
  const [draggedServerId, setDraggedServerId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverServerId, setDragOverServerId] = useState<string | null>(null);
  const [railContextMenu, setRailContextMenu] = useState<RailContextMenuState | null>(null);
  const hasLocalFolderEdits = useRef(false);
  const lastAppliedLayoutSignature = useRef<string>("[]");
  const railContextMenuRef = useRef<HTMLDivElement | null>(null);
  const dragStartedServerIdRef = useRef<string | null>(null);
  const dragStartedFromFolderRef = useRef(false);
  const dragDropHandledRef = useRef(false);
  const folderClickTimerRef = useRef<number | null>(null);

  const allServers = useMemo(() => [...myServers, ...joinedServers], [myServers, joinedServers]);
  const allServerMap = useMemo(() => {
    const map = new Map<string, ServerEntry>();
    for (const server of allServers) {
      map.set(server.id, server);
    }
    return map;
  }, [allServers]);

  useEffect(() => {
    let isCancelled = false;

    const loadFolders = async () => {
      let loaded: ServerFolder[] = [];

      try {
        const response = await fetch("/api/navigation/server-rail-layout", {
          method: "GET",
          cache: "no-store",
        });

        if (response.ok) {
          const data = (await response.json()) as { folders?: unknown };
          const parsed = Array.isArray(data?.folders)
            ? safeParseFolders(JSON.stringify(data.folders))
            : [];
          loaded = parsed;
          setFoldersSyncError(null);
        } else {
          setFoldersSyncError("Unable to load rail layout from database.");
        }
      } catch {
        setFoldersSyncError("Unable to load rail layout from database.");
      }

      const normalized = normalizeFoldersForState(loaded);
      const signature = folderLayoutSignature(normalized);

      if (isCancelled) {
        return;
      }

      if (!hasLocalFolderEdits.current && signature !== lastAppliedLayoutSignature.current) {
        setFolders(normalized);
        lastAppliedLayoutSignature.current = signature;
      }

      setIsFoldersLoaded(true);
    };

    void loadFolders();

    const pollingTimer = window.setInterval(() => {
      void loadFolders();
    }, 1800);

    const onWindowFocus = () => {
      void loadFolders();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadFolders();
      }
    };

    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      isCancelled = true;
      window.clearInterval(pollingTimer);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [allServers]);

  useEffect(() => {
    if (!isFoldersLoaded || !hasLocalFolderEdits.current) {
      return;
    }

    const payload = folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      serverIds: Array.from(new Set(folder.serverIds)),
      background: normalizeFolderBackground(folder.background),
    }));
    const payloadSignature = folderLayoutSignature(payload);

    const timeoutId = window.setTimeout(async () => {
      try {
        setIsSyncingFolders(true);

        const response = await fetch("/api/navigation/server-rail-layout", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ folders: payload }),
        });

        if (!response.ok) {
          throw new Error("Failed to persist server rail folders.");
        }

        hasLocalFolderEdits.current = false;
        lastAppliedLayoutSignature.current = payloadSignature;
        setFoldersSyncError(null);
      } catch {
        setFoldersSyncError("Unable to save rail layout to database.");
      } finally {
        setIsSyncingFolders(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [folders, isFoldersLoaded]);

  const folderServerIds = useMemo(
    () => new Set(folders.flatMap((folder) => folder.serverIds)),
    [folders]
  );

  const visibleFolders = useMemo(
    () =>
      folders
        .map((folder) => {
          const visibleServerIds = folder.serverIds.filter((id) => allServerMap.has(id));
          return {
            ...folder,
            visibleServerIds,
          };
        })
        .filter((folder) => folder.visibleServerIds.length > 0),
    [allServerMap, folders]
  );

  const recentlyUngroupedSet = useMemo(
    () => new Set(recentlyUngroupedServerIds),
    [recentlyUngroupedServerIds]
  );

  const recentlyUngroupedServers = useMemo(
    () =>
      recentlyUngroupedServerIds
        .map((id) => allServerMap.get(id))
        .filter((server): server is ServerEntry => Boolean(server)),
    [recentlyUngroupedServerIds, allServerMap]
  );

  const ungroupedMyServers = myServers.filter(
    (server) => !folderServerIds.has(server.id) && !recentlyUngroupedSet.has(server.id)
  );
  const ungroupedJoinedServers = joinedServers.filter(
    (server) => !folderServerIds.has(server.id) && !recentlyUngroupedSet.has(server.id)
  );

  useEffect(() => {
    setRecentlyUngroupedServerIds((prev) =>
      prev.filter((id) => allServerMap.has(id) && !folderServerIds.has(id))
    );
  }, [allServerMap, folderServerIds]);

  const assignServerToFolder = (serverId: string, targetFolderId: string) => {
    setRecentlyUngroupedServerIds((prev) => prev.filter((id) => id !== serverId));
    hasLocalFolderEdits.current = true;
    setFolders((prev) =>
      pruneEmptyFolders(
        prev.map((folder) => {
          const withoutServer = folder.serverIds.filter((id) => id !== serverId);

          if (folder.id === targetFolderId) {
            return {
              ...folder,
              serverIds: [...withoutServer, serverId],
            };
          }

          return {
            ...folder,
            serverIds: withoutServer,
          };
        })
      )
    );
  };

  const ungroupServer = (serverId: string) => {
    hasLocalFolderEdits.current = true;
    setFolders((prev) =>
      pruneEmptyFolders(
        prev.map((folder) => ({
          ...folder,
          serverIds: folder.serverIds.filter((id) => id !== serverId),
        }))
      )
    );
  };

  const findFolderIdByServer = (serverId: string, sourceFolders: ServerFolder[]) => {
    const containingFolder = sourceFolders.find((folder) => folder.serverIds.includes(serverId));
    return containingFolder?.id ?? null;
  };

  const createFolderFromServers = (firstServerId: string, secondServerId: string) => {
    setRecentlyUngroupedServerIds((prev) =>
      prev.filter((id) => id !== firstServerId && id !== secondServerId)
    );

    hasLocalFolderEdits.current = true;
    setFolders((prev) => {
      const firstServer = allServerMap.get(firstServerId);
      const fallbackName = firstServer?.name ? `${firstServer.name} Group` : "New Folder";

      const stripped = prev.map((folder) => ({
        ...folder,
        serverIds: folder.serverIds.filter((id) => id !== firstServerId && id !== secondServerId),
      }));

      const newFolderId = `folder_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const next = [
        ...stripped,
        {
          id: newFolderId,
          name: fallbackName,
          serverIds: [firstServerId, secondServerId],
          background: DEFAULT_FOLDER_BACKGROUND,
        },
      ].filter((folder) => folder.serverIds.length > 0);

      setExpandedFolderId(newFolderId);
      return next;
    });
  };

  const dropServerOnServer = (sourceServerId: string, targetServerId: string) => {
    if (sourceServerId === targetServerId) {
      return;
    }

    const sourceFolderId = findFolderIdByServer(sourceServerId, folders);
    const targetFolderId = findFolderIdByServer(targetServerId, folders);

    if (sourceFolderId && targetFolderId && sourceFolderId === targetFolderId) {
      return;
    }

    if (targetFolderId) {
      assignServerToFolder(sourceServerId, targetFolderId);
      setExpandedFolderId(targetFolderId);
      return;
    }

    createFolderFromServers(targetServerId, sourceServerId);
  };

  const openEditFolderPopup = (folder: ServerFolder) => {
    setEditingFolderId(folder.id);
    setEditingFolderName(folder.name);
    setEditingFolderBackground(normalizeFolderBackground(folder.background));
  };

  const closeEditFolderPopup = () => {
    setEditingFolderId(null);
    setEditingFolderName("");
    setEditingFolderBackground(DEFAULT_FOLDER_BACKGROUND);
  };

  const saveFolderName = () => {
    if (!editingFolderId) {
      return;
    }

    const trimmedName = editingFolderName.trim();
    if (!trimmedName) {
      return;
    }

    setFolders((prev) =>
      prev.map((folder) =>
        folder.id === editingFolderId
          ? {
              ...folder,
              name: trimmedName,
              background: normalizeFolderBackground(editingFolderBackground),
            }
          : folder
      )
    );

    hasLocalFolderEdits.current = true;

    closeEditFolderPopup();
  };

  const deleteFolder = () => {
    if (!editingFolderId) {
      return;
    }

    const folderToDelete = folders.find((folder) => folder.id === editingFolderId);

    if (folderToDelete?.serverIds?.length) {
      setRecentlyUngroupedServerIds((prev) => {
        const next = [...prev];

        for (const serverId of folderToDelete.serverIds) {
          if (!allServerMap.has(serverId)) {
            continue;
          }

          if (!next.includes(serverId)) {
            next.push(serverId);
          }
        }

        return next;
      });
    }

    hasLocalFolderEdits.current = true;
    setFolders((prev) => prev.filter((folder) => folder.id !== editingFolderId));
    setExpandedFolderId((prev) => (prev === editingFolderId ? null : prev));
    closeEditFolderPopup();
  };

  const openServerContextMenu = (event: MouseEvent, serverId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setRailContextMenu({
      kind: "server",
      x: event.clientX,
      y: event.clientY,
      serverId,
    });
  };

  const openFolderContextMenu = (event: MouseEvent, folderId: string) => {
    event.preventDefault();
    event.stopPropagation();
    clearQueuedFolderToggle();
    setRailContextMenu({
      kind: "folder",
      x: event.clientX,
      y: event.clientY,
      folderId,
    });
  };

  useEffect(() => {
    if (!railContextMenu) {
      return;
    }

    const onDismiss = (event: Event) => {
      const menuElement = railContextMenuRef.current;
      const targetNode = event.target instanceof Node ? event.target : null;

      if (menuElement && targetNode && menuElement.contains(targetNode)) {
        return;
      }

      setRailContextMenu(null);
    };
    const onScrollDismiss = () => {
      setRailContextMenu(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRailContextMenu(null);
      }
    };

    document.addEventListener("pointerdown", onDismiss);
    document.addEventListener("scroll", onScrollDismiss, true);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onDismiss);
      document.removeEventListener("scroll", onScrollDismiss, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [railContextMenu]);

  useEffect(() => {
    return () => {
      if (folderClickTimerRef.current) {
        window.clearTimeout(folderClickTimerRef.current);
        folderClickTimerRef.current = null;
      }
    };
  }, []);

  const clearQueuedFolderToggle = () => {
    if (folderClickTimerRef.current) {
      window.clearTimeout(folderClickTimerRef.current);
      folderClickTimerRef.current = null;
    }
  };

  const queueFolderToggle = (folderId: string) => {
    clearQueuedFolderToggle();
    folderClickTimerRef.current = window.setTimeout(() => {
      setExpandedFolderId((previous) => (previous === folderId ? null : folderId));
      folderClickTimerRef.current = null;
    }, 180);
  };

  const handleFolderDoubleClick = (event: MouseEvent, folder: ServerFolder) => {
    event.preventDefault();
    event.stopPropagation();
    clearQueuedFolderToggle();
    openEditFolderPopup(folder);
  };

  const openFolderEditorFromMenu = (folderId: string) => {
    clearQueuedFolderToggle();
    const folder = folders.find((entry) => entry.id === folderId);
    setRailContextMenu(null);

    if (!folder) {
      return;
    }

    window.setTimeout(() => {
      openEditFolderPopup(folder);
    }, 0);
  };

  const renderServerItem = (server: ServerEntry, options?: { inFolder?: boolean }) => (
    <div
      key={server.id}
      onDragOver={(event) => {
        const activeDraggedServerId = resolveDraggedServerId(event, draggedServerId);
        if (!activeDraggedServerId || activeDraggedServerId === server.id) {
          return;
        }
        event.preventDefault();
        setDragOverServerId(server.id);
      }}
      onDragLeave={() => {
        if (dragOverServerId === server.id) {
          setDragOverServerId(null);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const activeDraggedServerId = resolveDraggedServerId(event, draggedServerId);
        if (activeDraggedServerId) {
          dragDropHandledRef.current = true;
          dropServerOnServer(activeDraggedServerId, server.id);
        }
        setDragOverServerId(null);
        setDraggedServerId(null);
        setDragOverFolderId(null);
      }}
      className={`rounded-md transition ${
        dragOverServerId === server.id ? "scale-[1.02] ring-2 ring-emerald-400/80" : ""
      }`}
    >
      <NavigationItem
        id={server.id}
        name={server.name}
        imageUrl={server.imageUrl}
        updatedAt={server.updatedAt}
        hasUnreadMarker={server.hasUnreadAnnouncement === true}
        appearance={options?.inFolder ? "foldered" : "default"}
        onContextMenu={(event) => openServerContextMenu(event, server.id)}
        draggable
        onDragStart={() => {
          dragStartedServerIdRef.current = server.id;
          dragStartedFromFolderRef.current = Boolean(findFolderIdByServer(server.id, folders));
          dragDropHandledRef.current = false;
          setDraggedServerId(server.id);
        }}
        onDragEnd={() => {
          const activeDraggedServerId = String(draggedServerId ?? dragStartedServerIdRef.current ?? "").trim();
          if (
            activeDraggedServerId &&
            dragStartedFromFolderRef.current &&
            !dragDropHandledRef.current
          ) {
            ungroupServer(activeDraggedServerId);
          }

          dragStartedServerIdRef.current = null;
          dragStartedFromFolderRef.current = false;
          dragDropHandledRef.current = false;
          setDraggedServerId(null);
          setDragOverFolderId(null);
          setDragOverServerId(null);
        }}
      />
    </div>
  );

  return (
    <div
      className="flex min-h-full w-full flex-col items-center justify-start"
      onDragOver={(event) => {
        const activeDraggedServerId = resolveDraggedServerId(event, draggedServerId);
        if (!activeDraggedServerId) {
          return;
        }
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const activeDraggedServerId = resolveDraggedServerId(event, draggedServerId);
        if (activeDraggedServerId) {
          dragDropHandledRef.current = true;
          ungroupServer(activeDraggedServerId);
        }
        setDraggedServerId(null);
        setDragOverFolderId(null);
        setDragOverServerId(null);
      }}
    >
      <Dialog
        open={Boolean(editingFolderId)}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeEditFolderPopup();
          }
        }}
      >
        <DialogContent className="overflow-hidden border-zinc-300 bg-zinc-100/96 text-zinc-900 shadow-2xl shadow-black/20 dark:border-zinc-700 dark:bg-zinc-900/96 dark:text-zinc-100 sm:max-w-107.5">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-32 bg-linear-to-br from-sky-400/25 via-indigo-400/18 to-violet-500/25 dark:from-sky-500/20 dark:via-indigo-500/18 dark:to-violet-600/22" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.75),transparent_55%)] dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_55%)]" />
            <div className="absolute inset-x-6 top-20 h-px bg-linear-to-r from-transparent via-white/55 to-transparent dark:via-white/15" />
          </div>

          <div className="relative space-y-4">
            <div className="rounded-xl border border-white/60 bg-white/70 px-4 py-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                Folder Background
              </p>
              <div
                className="mt-2 rounded-lg border border-black/10 px-3 py-3 text-white shadow-sm dark:border-white/10"
                style={getFolderSurfaceStyle(editingFolderBackground)}
              >
                <p className="truncate text-lg font-semibold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]">
                  {editingFolderName.trim() || "Untitled Folder"}
                </p>
              </div>
            </div>

            <DialogHeader>
              <DialogTitle>Edit Folder</DialogTitle>
              <DialogDescription>
                Rename this folder or delete it. Deleting keeps the servers and moves them back to the rail.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-2">
              <label
                htmlFor="folder-name-input"
                className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-600 dark:text-zinc-400"
              >
                Folder Name
              </label>
              <Input
                id="folder-name-input"
                value={editingFolderName}
                onChange={(event) => setEditingFolderName(event.target.value)}
                placeholder="Folder name"
                maxLength={48}
                className="border-zinc-300 bg-white/90 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-100"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    saveFolderName();
                  }
                }}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="folder-background-input"
                className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-600 dark:text-zinc-400"
              >
                Background Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="folder-background-input"
                  type="color"
                  value={normalizeFolderBackground(editingFolderBackground)}
                  onChange={(event) => setEditingFolderBackground(normalizeFolderBackground(event.target.value))}
                  className="h-10 w-14 cursor-pointer rounded border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-800"
                />
                <Input
                  value={editingFolderBackground}
                  onChange={(event) => setEditingFolderBackground(normalizeFolderBackground(event.target.value))}
                  placeholder="#64748b"
                  maxLength={7}
                  className="border-zinc-300 bg-white/90 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-100"
                />
              </div>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="destructive"
                onClick={deleteFolder}
                className="w-full sm:w-auto"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Folder
              </Button>

              <div className="flex w-full gap-2 sm:w-auto">
                <Button type="button" variant="outline" onClick={closeEditFolderPopup} className="flex-1">
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={saveFolderName}
                  className="flex-1 bg-emerald-600 text-white hover:bg-emerald-500"
                  disabled={!editingFolderName.trim()}
                >
                  Save
                </Button>
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {foldersSyncError ? (
        <div className="mb-2 px-3 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-red-600 dark:text-red-400">
          {foldersSyncError}
        </div>
      ) : null}

      {isSyncingFolders ? (
        <div className="mb-2 px-3 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300">
          Syncing rail layout...
        </div>
      ) : null}

      <NavigationOpenTabsButton fallbackServerId={fallbackServerId} />

      {folders.length > 0 || recentlyUngroupedServers.length > 0 ? (
        <div className="mb-4 flex w-full flex-col items-center gap-2 px-2">
          {visibleFolders.map((folder) => {
            const isExpanded = expandedFolderId === folder.id;
            const containedServers = folder.visibleServerIds
              .map((id) => allServerMap.get(id))
              .filter((server): server is ServerEntry => Boolean(server));
            const previewServers = containedServers.slice(0, 4);
            const folderHasUnreadAnnouncements = containedServers.some(
              (server) => server.hasUnreadAnnouncement === true
            );

            return (
              <div key={folder.id} className="flex w-full justify-center">
                {isExpanded ? (
                  <div
                    onDragOver={(event) => {
                      const activeDraggedServerId = resolveDraggedServerId(event, draggedServerId);
                      if (!activeDraggedServerId) {
                        return;
                      }
                      event.preventDefault();
                      setDragOverFolderId(folder.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverFolderId === folder.id) {
                        setDragOverFolderId(null);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const activeDraggedServerId = resolveDraggedServerId(event, draggedServerId);
                      if (activeDraggedServerId) {
                        dragDropHandledRef.current = true;
                        assignServerToFolder(activeDraggedServerId, folder.id);
                      }
                      setDragOverFolderId(null);
                      setDragOverServerId(null);
                    }}
                    className={`w-20 rounded-xl border px-2 py-2 transition-all ${
                      dragOverFolderId === folder.id
                        ? "border-emerald-400 bg-emerald-500/15 ring-2 ring-emerald-400/35"
                        : "border-zinc-300/70 dark:border-zinc-700"
                    }`}
                    style={dragOverFolderId === folder.id ? undefined : getFolderSurfaceStyle(folder.background)}
                  >
                    <button
                      type="button"
                      onClick={() => queueFolderToggle(folder.id)}
                      onContextMenu={(event) => openFolderContextMenu(event, folder.id)}
                      onDoubleClick={(event) => handleFolderDoubleClick(event, folder)}
                      className="mx-auto flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-300/70 bg-zinc-200/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-zinc-800 transition hover:bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-700/80 dark:text-zinc-100 dark:hover:bg-zinc-700"
                      title={`${folder.name} (${folder.serverIds.length})`}
                      aria-label={`${folder.name} folder`}
                    >
                      <span className="truncate">{folder.name}</span>
                    </button>

                    {containedServers.length > 0 ? (
                      <div className="mt-2 flex flex-col items-center gap-2.5">
                        {containedServers.map((server) => (
                          <div key={`folder-${folder.id}-${server.id}`} className="flex origin-center justify-center scale-92">
                            {renderServerItem(server, { inFolder: true })}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => queueFolderToggle(folder.id)}
                    onContextMenu={(event) => openFolderContextMenu(event, folder.id)}
                    onDoubleClick={(event) => handleFolderDoubleClick(event, folder)}
                    onDragOver={(event) => {
                      const activeDraggedServerId = resolveDraggedServerId(event, draggedServerId);
                      if (!activeDraggedServerId) {
                        return;
                      }
                      event.preventDefault();
                      setDragOverFolderId(folder.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverFolderId === folder.id) {
                        setDragOverFolderId(null);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const activeDraggedServerId = resolveDraggedServerId(event, draggedServerId);
                      if (activeDraggedServerId) {
                        dragDropHandledRef.current = true;
                        assignServerToFolder(activeDraggedServerId, folder.id);
                      }
                      setDragOverFolderId(null);
                      setDragOverServerId(null);
                    }}
                    className={`relative mx-auto flex h-10 w-20 items-center justify-center overflow-hidden rounded-[10px] border transition-all ${
                      dragOverFolderId === folder.id
                        ? "border-emerald-400 bg-emerald-500/20 ring-2 ring-emerald-400/40"
                        : "border-zinc-300 hover:border-primary/50 hover:ring-2 hover:ring-primary/25 dark:border-zinc-600"
                    }`}
                    style={dragOverFolderId === folder.id ? undefined : getFolderSurfaceStyle(folder.background)}
                    title={`${folder.name} (${folder.serverIds.length})`}
                    aria-label={`${folder.name} folder`}
                  >
                    {folderHasUnreadAnnouncements ? (
                      <span
                        className="absolute top-1.5 right-1.5 z-10 h-3 w-3 rounded-full border-2 border-[#111214] bg-[#5865f2] shadow-lg shadow-[#5865f2]/45"
                        aria-label="Unread announcements"
                        title="Unread announcements"
                      />
                    ) : null}
                    {previewServers.length > 0 ? (
                      <div className="grid h-full w-full grid-cols-2 gap-0.5 overflow-hidden p-1 pb-4">
                        {previewServers.map((server) => {
                          const normalizedImageUrl = String(server.imageUrl ?? "").trim();
                          const showImage =
                            normalizedImageUrl.length > 0 &&
                            normalizedImageUrl !== "/in-accord-steampunk-logo.png";
                          const initials = (server.name?.trim()?.[0] ?? "S").toUpperCase();

                          return (
                            <div
                              key={`preview-${folder.id}-${server.id}`}
                              className="flex h-full w-full items-center justify-center overflow-hidden rounded-[4px] bg-zinc-700 text-[9px] font-bold text-white"
                            >
                              {showImage ? (
                                <img
                                  src={normalizedImageUrl}
                                  alt={server.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span>{initials}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    <div
                      className={`absolute inset-x-0 bottom-0 flex h-[5%] min-h-3.5 items-center justify-center border-t px-0.5 backdrop-blur-[1px] ${
                        dragOverFolderId === folder.id
                          ? "border-emerald-300/50 bg-emerald-500/20"
                          : "border-zinc-500/20 bg-zinc-900/40"
                      }`}
                    >
                      <span className="max-w-18 truncate text-[9px] font-semibold uppercase tracking-[0.04em] text-zinc-100">
                        {folder.name}
                      </span>
                    </div>
                  </button>
                )}
              </div>
            );
          })}

          {recentlyUngroupedServers.length > 0 ? (
            <div className="mt-1 flex w-full flex-col items-center gap-3">
              {recentlyUngroupedServers.map((server) => (
                <div key={`recently-ungrouped-${server.id}`} className="flex justify-center">
                  {renderServerItem(server)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {ungroupedMyServers.map((server) => (
        <div key={server.id} className="mb-4 flex justify-center">
          {renderServerItem(server)}
        </div>
      ))}

      {myServers.length === 0 ? (
        <div className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
          OWNED - 0
        </div>
      ) : null}

      {ungroupedJoinedServers.map((server) => (
        <div key={`joined-${server.id}`} className="mb-4 flex justify-center">
          {renderServerItem(server)}
        </div>
      ))}

      {joinedServers.length === 0 ? (
        <div className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
          JOINED - 0
        </div>
      ) : null}

      {railContextMenu ? (
        <div
          ref={railContextMenuRef}
          className="fixed z-120 min-w-42 rounded-md border border-zinc-700 bg-[#1f2125] p-1 shadow-2xl shadow-black/70"
          style={{
            left: railContextMenu.x,
            top: railContextMenu.y,
          }}
        >
          {railContextMenu.kind === "server" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  const targetServer = allServerMap.get(railContextMenu.serverId);
                  if (targetServer) {
                    window.location.assign(`/servers/${encodeURIComponent(targetServer.id)}`);
                  }
                  setRailContextMenu(null);
                }}
                className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-zinc-100 transition hover:bg-white/10"
              >
                Open Server
              </button>
              {findFolderIdByServer(railContextMenu.serverId, folders) ? (
                <button
                  type="button"
                  onClick={() => {
                    ungroupServer(railContextMenu.serverId);
                    setRailContextMenu(null);
                  }}
                  className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-zinc-100 transition hover:bg-white/10"
                >
                  Remove from Folder
                </button>
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setExpandedFolderId((previous) =>
                    previous === railContextMenu.folderId ? null : railContextMenu.folderId
                  );
                  setRailContextMenu(null);
                }}
                className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-zinc-100 transition hover:bg-white/10"
              >
                {expandedFolderId === railContextMenu.folderId ? "Collapse Folder" : "Expand Folder"}
              </button>
              <button
                type="button"
                onClick={() => {
                  openFolderEditorFromMenu(railContextMenu.folderId);
                }}
                className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-zinc-100 transition hover:bg-white/10"
              >
                Edit Folder
              </button>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const folder = folders.find((entry) => entry.id === railContextMenu.folderId);
                  setRailContextMenu(null);
                  if (folder) {
                    openEditFolderPopup(folder);
                  }
                }}
                className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-rose-300 transition hover:bg-rose-500/15"
              >
                Delete Folder
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};
