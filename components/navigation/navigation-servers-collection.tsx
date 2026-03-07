"use client";

import { useEffect, useMemo, useState } from "react";
import { Folder, FolderOpen, Pencil, Trash2 } from "lucide-react";

import { NavigationItem } from "@/components/navigation/navigation-item";
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

type ServerEntry = {
  id: string;
  name: string;
  imageUrl: string | null;
  updatedAt?: Date | string;
};

type ServerFolder = {
  id: string;
  name: string;
  serverIds: string[];
};

type NavigationServersCollectionProps = {
  myServers: ServerEntry[];
  joinedServers: ServerEntry[];
};

const STORAGE_KEY = "in-accord.server-rail-folders.v1";
const STORAGE_DB_NAME = "in-accord-ui-state";
const STORAGE_STORE_NAME = "kv";

type PersistenceMode = "local" | "indexeddb" | "session" | "memory";

const openFoldersDb = async (): Promise<IDBDatabase | null> => {
  if (typeof window === "undefined" || typeof window.indexedDB === "undefined") {
    return null;
  }

  return new Promise((resolve) => {
    const request = window.indexedDB.open(STORAGE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORAGE_STORE_NAME)) {
        db.createObjectStore(STORAGE_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
};

const readFromIndexedDb = async (key: string): Promise<string | null> => {
  const db = await openFoldersDb();
  if (!db) {
    return null;
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORAGE_STORE_NAME, "readonly");
    const store = tx.objectStore(STORAGE_STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => {
      const value = request.result;
      resolve(typeof value === "string" ? value : null);
    };

    request.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
    tx.onabort = () => db.close();
  });
};

const writeToIndexedDb = async (key: string, value: string): Promise<boolean> => {
  const db = await openFoldersDb();
  if (!db) {
    return false;
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORAGE_STORE_NAME, "readwrite");
    const store = tx.objectStore(STORAGE_STORE_NAME);
    store.put(value, key);

    tx.oncomplete = () => {
      db.close();
      resolve(true);
    };
    tx.onerror = () => {
      db.close();
      resolve(false);
    };
    tx.onabort = () => {
      db.close();
      resolve(false);
    };
  });
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

    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const maybeFolder = item as Partial<ServerFolder>;
        if (typeof maybeFolder.id !== "string" || typeof maybeFolder.name !== "string") {
          return null;
        }

        const serverIds = Array.isArray(maybeFolder.serverIds)
          ? maybeFolder.serverIds.filter((id): id is string => typeof id === "string")
          : [];

        return {
          id: maybeFolder.id,
          name: maybeFolder.name,
          serverIds,
        };
      })
      .filter((item): item is ServerFolder => item !== null);
  } catch {
    return [];
  }
};

const pruneEmptyFolders = (sourceFolders: ServerFolder[]) =>
  sourceFolders.filter((folder) => folder.serverIds.length > 0);

export const NavigationServersCollection = ({
  myServers,
  joinedServers,
}: NavigationServersCollectionProps) => {
  const [folders, setFolders] = useState<ServerFolder[]>([]);
  const [isFoldersLoaded, setIsFoldersLoaded] = useState(false);
  const [persistenceMode, setPersistenceMode] = useState<PersistenceMode>("local");
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [recentlyUngroupedServerIds, setRecentlyUngroupedServerIds] = useState<string[]>([]);
  const [draggedServerId, setDraggedServerId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverServerId, setDragOverServerId] = useState<string | null>(null);

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
      let raw: string | null = null;

      try {
        raw = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        raw = null;
      }

      if (!raw) {
        raw = await readFromIndexedDb(STORAGE_KEY);
      }

      if (!raw) {
        try {
          raw = window.sessionStorage.getItem(STORAGE_KEY);
        } catch {
          raw = null;
        }
      }

      const loaded = safeParseFolders(raw);
      const validServerIds = new Set(allServers.map((server) => server.id));

      const normalized = loaded
        .map((folder) => ({
          ...folder,
          serverIds: folder.serverIds.filter((id) => validServerIds.has(id)),
        }))
        .filter((folder) => folder.serverIds.length > 0 || folder.name.trim().length > 0);

      if (isCancelled) {
        return;
      }

      setFolders(normalized);
      setIsFoldersLoaded(true);
    };

    void loadFolders();

    return () => {
      isCancelled = true;
    };
  }, [allServers]);

  useEffect(() => {
    if (!isFoldersLoaded) {
      return;
    }

    const payload = JSON.stringify(
      folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        serverIds: Array.from(new Set(folder.serverIds)),
      }))
    );

    const persist = async () => {
      try {
        window.localStorage.setItem(STORAGE_KEY, payload);
        setPersistenceMode("local");
        return;
      } catch {
        // continue
      }

      const idbSaved = await writeToIndexedDb(STORAGE_KEY, payload);
      if (idbSaved) {
        setPersistenceMode("indexeddb");
        return;
      }

      try {
        window.sessionStorage.setItem(STORAGE_KEY, payload);
        setPersistenceMode("session");
        return;
      } catch {
        setPersistenceMode("memory");
      }

      console.warn("[SERVER_RAIL_FOLDERS_PERSIST] Unable to persist folders in any storage backend");
    };

    void persist();
  }, [folders, isFoldersLoaded]);

  const folderServerIds = useMemo(
    () => new Set(folders.flatMap((folder) => folder.serverIds)),
    [folders]
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
  };

  const closeEditFolderPopup = () => {
    setEditingFolderId(null);
    setEditingFolderName("");
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
            }
          : folder
      )
    );

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

    setFolders((prev) => prev.filter((folder) => folder.id !== editingFolderId));
    setExpandedFolderId((prev) => (prev === editingFolderId ? null : prev));
    closeEditFolderPopup();
  };

  const renderServerItem = (server: ServerEntry) => (
    <div
      key={server.id}
      onDragOver={(event) => {
        if (!draggedServerId || draggedServerId === server.id) {
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
        if (draggedServerId) {
          dropServerOnServer(draggedServerId, server.id);
        }
        setDragOverServerId(null);
        setDraggedServerId(null);
        setDragOverFolderId(null);
      }}
      className={`rounded-2xl transition ${
        dragOverServerId === server.id ? "scale-[1.02] ring-2 ring-emerald-400/80" : ""
      }`}
    >
      <NavigationItem
        id={server.id}
        name={server.name}
        imageUrl={server.imageUrl}
        updatedAt={server.updatedAt}
        draggable
        onDragStart={() => setDraggedServerId(server.id)}
        onDragEnd={() => {
          setDraggedServerId(null);
          setDragOverFolderId(null);
          setDragOverServerId(null);
        }}
      />
    </div>
  );

  return (
    <div
      onDragOver={(event) => {
        if (!draggedServerId) {
          return;
        }
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (draggedServerId) {
          ungroupServer(draggedServerId);
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
        <DialogContent className="border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:max-w-[430px]">
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
              className="border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveFolderName();
                }
              }}
            />
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
        </DialogContent>
      </Dialog>

      {persistenceMode === "session" ? (
        <div className="mb-2 px-3 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-yellow-600 dark:text-yellow-400">
          Persistent storage full — temporary session fallback active
        </div>
      ) : persistenceMode === "memory" ? (
        <div className="mb-2 px-3 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-red-600 dark:text-red-400">
          Unable to persist folder layout in this browser
        </div>
      ) : null}

      {folders.length > 0 || recentlyUngroupedServers.length > 0 ? (
        <div className="mb-4 flex w-full flex-col items-center gap-2 px-2">
          {folders.map((folder) => {
            const isExpanded = expandedFolderId === folder.id;
            const containedServers = folder.serverIds
              .map((id) => allServerMap.get(id))
              .filter((server): server is ServerEntry => Boolean(server));
            const previewServers = containedServers.slice(0, 4);

            return (
              <div key={folder.id} className="w-full">
                <button
                  type="button"
                  onClick={() => setExpandedFolderId((prev) => (prev === folder.id ? null : folder.id))}
                  onDragOver={(event) => {
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
                    if (draggedServerId) {
                      assignServerToFolder(draggedServerId, folder.id);
                    }
                    setDragOverFolderId(null);
                    setDragOverServerId(null);
                  }}
                  className={`mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border transition-all ${
                    dragOverFolderId === folder.id
                      ? "border-emerald-400 bg-emerald-500/20"
                      : "border-zinc-300 bg-zinc-200 hover:bg-zinc-300 dark:border-zinc-600 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                  }`}
                  title={`${folder.name} (${folder.serverIds.length})`}
                  aria-label={`${folder.name} folder`}
                >
                  {previewServers.length > 0 ? (
                    <div className="grid h-8 w-8 grid-cols-2 gap-0.5 overflow-hidden rounded-lg">
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
                  ) : isExpanded ? (
                    <FolderOpen className="h-5 w-5 text-zinc-700 dark:text-zinc-100" />
                  ) : (
                    <Folder className="h-5 w-5 text-zinc-700 dark:text-zinc-100" />
                  )}
                </button>
                <p className="mt-1 truncate px-1 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-600 dark:text-zinc-300">
                  <button
                    type="button"
                    className="inline-flex max-w-full items-center gap-1 rounded px-1 text-inherit transition hover:text-zinc-800 dark:hover:text-zinc-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      openEditFolderPopup(folder);
                    }}
                    title={`Edit ${folder.name}`}
                    aria-label={`Edit ${folder.name} folder`}
                  >
                    <span className="truncate">{folder.name}</span>
                    <Pencil className="h-3 w-3 shrink-0" />
                  </button>
                </p>

                {isExpanded && containedServers.length > 0 ? (
                  <div className="mt-2 flex flex-col items-center gap-3">
                    {containedServers.map((server) => (
                      <div key={`folder-${folder.id}-${server.id}`} className="flex justify-center">
                        {renderServerItem(server)}
                      </div>
                    ))}
                  </div>
                ) : null}
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

      <div className="text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-300">
        My Servers
      </div>

      {ungroupedMyServers.map((server) => (
        <div key={server.id} className="mb-4 flex justify-center">
          {renderServerItem(server)}
        </div>
      ))}

      <div className="mt-1 mb-2 flex justify-center">
        <div className="h-0.5 w-10 rounded-md bg-zinc-300 dark:bg-zinc-700" />
      </div>

      <div className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-300">
        Joined Servers
      </div>

      {ungroupedJoinedServers.map((server) => (
        <div key={`joined-${server.id}`} className="mb-4 flex justify-center">
          {renderServerItem(server)}
        </div>
      ))}

      {ungroupedJoinedServers.length === 0 ? (
        <div className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
          N/A
        </div>
      ) : null}
    </div>
  );
};
