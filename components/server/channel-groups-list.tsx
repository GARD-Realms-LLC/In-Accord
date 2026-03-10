"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";

import { ChannelType, MemberRole, type Channel, type Server } from "@/lib/db/types";

import { ChannelDropZone } from "./channel-drop-zone";
import { ChannelGroupSettingsButton } from "./channel-group-settings-button";
import { ServerChannel } from "./server-channel";

interface GroupWithChannels {
  id: string;
  name: string;
  icon?: string | null;
  channels: Channel[];
}

interface ChannelGroupsListProps {
  serverId: string;
  role?: MemberRole;
  server: Server;
  groups: GroupWithChannels[];
  connectedVoiceCountsByChannelId?: Record<string, number>;
}

interface GroupEventDetail {
  serverId: string;
  group: {
    id: string;
    name: string;
    icon?: string | null;
  };
}

interface ApiChannelGroup {
  id: string;
  name: string;
  icon?: string | null;
}

const CHANNEL_GROUP_CREATED_EVENT = "inaccord:channel-group-created";

const reorderGroups = (groups: GroupWithChannels[], draggedId: string, targetId: string) => {
  if (!draggedId || !targetId || draggedId === targetId) {
    return groups;
  }

  const fromIndex = groups.findIndex((group) => group.id === draggedId);
  const toIndex = groups.findIndex((group) => group.id === targetId);

  if (fromIndex === -1 || toIndex === -1) {
    return groups;
  }

  const next = [...groups];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

export const ChannelGroupsList = ({
  serverId,
  role,
  server,
  groups,
  connectedVoiceCountsByChannelId = {},
}: ChannelGroupsListProps) => {
  const router = useRouter();
  const [orderedGroups, setOrderedGroups] = useState<GroupWithChannels[]>(groups);
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  const upsertGroups = (previous: GroupWithChannels[], incomingGroups: ApiChannelGroup[]) => {
    const previousById = new Map(previous.map((group) => [group.id, group]));

    const merged = incomingGroups.map((incoming) => {
      const existing = previousById.get(incoming.id);
      return {
        id: incoming.id,
        name: incoming.name,
        icon: incoming.icon ?? null,
        channels: existing?.channels ?? [],
      } satisfies GroupWithChannels;
    });

    return merged;
  };

  useEffect(() => {
    setOrderedGroups((current) => {
      if (current.length === 0) {
        return groups;
      }

      return current;
    });
  }, [groups]);

  useEffect(() => {
    const onCreated = (event: Event) => {
      const customEvent = event as CustomEvent<GroupEventDetail>;
      const detail = customEvent.detail;

      if (!detail || detail.serverId !== serverId || !detail.group?.id) {
        return;
      }

      setOrderedGroups((current) => {
        if (current.some((group) => group.id === detail.group.id)) {
          return current.map((group) =>
            group.id === detail.group.id
              ? { ...group, name: detail.group.name || group.name, icon: detail.group.icon ?? group.icon ?? null }
              : group,
          );
        }

        return [
          ...current,
          {
            id: detail.group.id,
            name: detail.group.name,
            icon: detail.group.icon ?? null,
            channels: [],
          },
        ];
      });
    };

    window.addEventListener(CHANNEL_GROUP_CREATED_EVENT, onCreated as EventListener);
    return () => {
      window.removeEventListener(CHANNEL_GROUP_CREATED_EVENT, onCreated as EventListener);
    };
  }, [serverId]);

  useEffect(() => {
    let isCancelled = false;

    const syncGroups = async () => {
      try {
        const response = await axios.get("/api/channel-groups", {
          params: { serverId, _t: Date.now() },
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        });
        const payload = response.data as { channelGroups?: ApiChannelGroup[]; groups?: ApiChannelGroup[] };
        const apiGroups = (payload.channelGroups ?? payload.groups ?? []).filter(
          (group) => typeof group?.id === "string" && typeof group?.name === "string",
        );

        if (!isCancelled) {
          setOrderedGroups((current) => upsertGroups(current, apiGroups));
        }
      } catch (error) {
        console.warn("[CHANNEL_GROUPS_SYNC]", error);
      }
    };

    void syncGroups();

    return () => {
      isCancelled = true;
    };
  }, [serverId]);

  const canManageGroups = role !== MemberRole.GUEST;
  const onGroupDragStart = (event: React.DragEvent<HTMLElement>, groupId: string) => {
    if (!canManageGroups) {
      return;
    }

    setDraggedGroupId(groupId);
    event.dataTransfer.setData("inaccord/channel-group-id", groupId);
    event.dataTransfer.setData("text/plain", groupId);
    event.dataTransfer.effectAllowed = "move";
  };

  const onGroupDragEnd = () => {
    setDraggedGroupId(null);
    setDragOverGroupId(null);
  };

  const onGroupDragOver = (event: React.DragEvent<HTMLElement>, targetGroupId: string) => {
    const hasGroupType = event.dataTransfer.types.includes("inaccord/channel-group-id");
    if (!hasGroupType || !canManageGroups) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragOverGroupId !== targetGroupId) {
      setDragOverGroupId(targetGroupId);
    }
  };

  const onGroupDrop = async (event: React.DragEvent<HTMLElement>, targetGroupId: string) => {
    event.preventDefault();

    if (!canManageGroups || isSavingOrder) {
      return;
    }

    const payloadDraggedId =
      event.dataTransfer.getData("inaccord/channel-group-id")?.trim() || draggedGroupId || "";

    setDraggedGroupId(null);
    setDragOverGroupId(null);

    if (!payloadDraggedId || payloadDraggedId === targetGroupId) {
      return;
    }

    const previousOrder = orderedGroups;
    const nextOrder = reorderGroups(previousOrder, payloadDraggedId, targetGroupId);

    if (nextOrder === previousOrder) {
      return;
    }

    setOrderedGroups(nextOrder);

    try {
      setIsSavingOrder(true);
      await axios.patch("/api/channel-groups/reorder", {
        serverId,
        orderedGroupIds: nextOrder.map((group) => group.id),
      });
      router.refresh();
    } catch (error) {
      console.error("[CHANNEL_GROUPS_REORDER]", error);
      setOrderedGroups(previousOrder);
      window.alert("Failed to reorder channel groups.");
    } finally {
      setIsSavingOrder(false);
    }
  };

  return (
    <div className="space-y-2">
      {orderedGroups.map((group) => {
        const isActiveDragTarget = !!draggedGroupId && dragOverGroupId === group.id;

        return (
          <div
            key={group.id}
            onDragOver={(event) => onGroupDragOver(event, group.id)}
            onDrop={(event) => onGroupDrop(event, group.id)}
            className={isActiveDragTarget ? "rounded-md ring-1 ring-indigo-500/50" : undefined}
          >
            <ChannelDropZone
              serverId={serverId}
              targetGroupId={group.id}
              className="rounded-md bg-black/5 px-2 py-1.5 dark:bg-zinc-900/40"
            >
              <details open className="group/details">
                <summary
                  className="mb-1 flex w-full list-none items-center rounded-sm px-1 py-0.5 hover:bg-black/10 dark:hover:bg-zinc-700/30"
                >
                  <p className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                    {group.icon ? `${group.icon} ` : ""}
                    {group.name} - {group.channels.length}
                  </p>
                  <div className="ml-auto flex items-center gap-1 pl-2">
                    {role !== MemberRole.GUEST ? (
                      <ChannelGroupSettingsButton groupId={group.id} groupName={group.name} groupIcon={group.icon} />
                    ) : null}
                    <span className="text-[10px] text-zinc-500 transition group-open/details:rotate-180 dark:text-zinc-400">
                      ⌄
                    </span>
                    {canManageGroups ? (
                      <span
                        draggable
                        onDragStart={(event) => onGroupDragStart(event, group.id)}
                        onDragEnd={onGroupDragEnd}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        className="inline-flex cursor-grab items-center rounded-sm p-0.5 text-zinc-500 hover:bg-black/10 active:cursor-grabbing dark:text-zinc-400 dark:hover:bg-zinc-700/30"
                        title="Drag to reorder group"
                        aria-label="Drag to reorder group"
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </span>
                    ) : null}
                  </div>
                </summary>

                {group.channels.length > 0 ? (
                  <div className="space-y-0.5 pt-1">
                    {group.channels.map((channel) => (
                      <ServerChannel
                        key={channel.id}
                        channel={channel}
                        role={role}
                        server={server}
                        draggable
                        connectedCount={connectedVoiceCountsByChannelId[channel.id] ?? 0}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="pt-1 text-[11px] text-zinc-500 dark:text-zinc-400">No channels yet</p>
                )}
              </details>
            </ChannelDropZone>
          </div>
        );
      })}
    </div>
  );
};
