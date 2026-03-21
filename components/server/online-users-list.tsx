"use client";

import { Ban, Crown, Flag, MessageCircle, Network, UserPlus, Users as UsersIcon, Wrench } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActionTooltip } from "@/components/action-tooltip";
import { BannerImage } from "@/components/ui/banner-image";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BotAppBadge } from "@/components/bot-app-badge";
import { ModeratorLineIcon } from "@/components/moderator-line-icon";
import { NewUserCloverBadge } from "@/components/new-user-clover-badge";
import { ProfileEffectLayer } from "@/components/profile-effect-layer";
import { ProfileIconRow } from "@/components/profile-icon-row";
import { ProfileNameWithServerTag } from "@/components/profile-name-with-server-tag";
import { UserAvatar } from "@/components/user-avatar";
import { BotCommandsDialog } from "@/components/bot-commands-dialog";
import { MemberRole } from "@/lib/db/types";
import { isInAccordAdministrator, isInAccordDeveloper, isInAccordModerator } from "@/lib/in-accord-admin";
import { isBotUser } from "@/lib/is-bot-user";
import { resolveBannerUrl } from "@/lib/asset-url";
import { resolveProfileIcons, type ProfileIcon } from "@/lib/profile-icons";
import { formatPresenceStatusLabel, normalizePresenceStatus, presenceStatusDotClassMap } from "@/lib/presence-status";

type OnlineRailUser = {
  id: string;
  profileId: string;
  role: MemberRole;
  assignedRoleId?: string | null;
  assignedRoleName?: string | null;
  globalRole: string | null;
  displayName: string;
  realName: string;
  profileName: string | null;
  bannerUrl: string | null;
  presenceStatus: string;
  currentGame?: string | null;
  email: string | null;
  imageUrl: string | null;
  joinedAt: string | null;
  lastLogonAt: string | null;
};

type OnlineMutualProfileData = {
  isDirectFriend?: boolean;
  directFriendStatus?: "self" | "friends" | "not_friends";
  mutualServersPercent?: number;
  mutualServersCount?: number;
  mutualFriendsCount?: number;
  mutualServers?: Array<{ id: string; name: string; imageUrl: string }>;
  mutualFriends?: Array<{
    profileId: string;
    memberId: string | null;
    serverId: string | null;
    displayName: string;
    email: string | null;
    imageUrl: string;
  }>;
};

const createEmptyOnlineMutualProfileData = (): OnlineMutualProfileData => ({
  isDirectFriend: false,
  directFriendStatus: "not_friends",
  mutualServersPercent: 0,
  mutualServersCount: 0,
  mutualFriendsCount: 0,
  mutualServers: [],
  mutualFriends: [],
});

const getProfileCardLoadErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const status = Number(error.response?.status ?? 0);
    if (status === 401) {
      return "Live profile data is unauthorized.";
    }

    if (status === 403) {
      return "Live profile data is forbidden.";
    }

    if (status >= 500) {
      return "Live profile data failed on the server.";
    }

    if (error.code === "ECONNABORTED") {
      return "Live profile data timed out.";
    }
  }

  return "Live profile data is unavailable.";
};

interface OnlineUsersListProps {
  users: OnlineRailUser[];
  roleGroups?: Array<{ id: string; name: string; position?: number }>;
  serverId?: string;
  viewerProfileId?: string | null;
  viewerMemberId?: string | null;
  canReorderRoleGroups?: boolean;
}

const BOT_COMMANDS_CACHE_LIMIT = 300;

const formatDate = (value: string | null) => {
  if (!value) {
    return "Unknown";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return parsed.toLocaleString();
};

export const OnlineUsersList = ({
  users,
  roleGroups = [],
  serverId,
  viewerProfileId = null,
  viewerMemberId = null,
  canReorderRoleGroups = false,
}: OnlineUsersListProps) => {
  const profileCardRequestSequenceRef = useRef(0);
  const params = useParams();
  const router = useRouter();
  const [activeProfileCardProfileId, setActiveProfileCardProfileId] = useState<string | null>(null);
  const [activeProfileCardLoadError, setActiveProfileCardLoadError] = useState<string | null>(null);
  const [activeProfileCard, setActiveProfileCard] = useState<{
    pronouns: string | null;
    comment: string | null;
    effectiveImageUrl?: string | null;
    nameplateLabel?: string | null;
    nameplateColor?: string | null;
    nameplateImageUrl?: string | null;
    effectiveNameplateLabel?: string | null;
    effectiveNameplateColor?: string | null;
    effectiveNameplateImageUrl?: string | null;
    profileIcons?: ProfileIcon[];
    profileEffectUrl?: string | null;
    effectiveAvatarDecorationUrl?: string | null;
    effectiveProfileEffectUrl?: string | null;
    effectiveBannerUrl?: string | null;
    isDirectFriend?: boolean;
    directFriendStatus?: "self" | "friends" | "not_friends";
    mutualServersPercent?: number;
    selectedServerTag: {
      serverId: string;
      serverName: string;
      tagCode: string;
      iconKey: string;
      iconEmoji: string;
    } | null;
    mutualServersCount?: number;
    mutualFriendsCount?: number;
    mutualServers?: Array<{ id: string; name: string; imageUrl: string }>;
    mutualFriends?: Array<{
      profileId: string;
      memberId: string | null;
      serverId: string | null;
      displayName: string;
      email: string | null;
      imageUrl: string;
    }>;
  } | null>(null);
  const [loadingProfileCardId, setLoadingProfileCardId] = useState<string | null>(null);
  const [botCommandsByProfileId, setBotCommandsByProfileId] = useState<
    Record<string, { botName: string; commands: string[] }>
  >({});
  const [loadingBotCommandsProfileId, setLoadingBotCommandsProfileId] = useState<string | null>(null);
  const [commandsDialogProfileId, setCommandsDialogProfileId] = useState<string | null>(null);
  const [collapsedByGroup, setCollapsedByGroup] = useState<Record<string, boolean>>({});
  const [orderedRoleGroups, setOrderedRoleGroups] = useState<Array<{ id: string; name: string; position?: number }>>([]);
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [isSavingGroupOrder, setIsSavingGroupOrder] = useState(false);
  const isDraggingGroupRef = useRef(false);
  const loadingBotCommandIdsRef = useRef(new Set<string>());
  const [openMutualDetails, setOpenMutualDetails] = useState<{
    type: "servers" | "friends";
    displayName: string;
    mutualServers: Array<{ id: string; name: string; imageUrl: string }>;
    mutualFriends: Array<{
      profileId: string;
      memberId: string | null;
      serverId: string | null;
      displayName: string;
      email: string | null;
      imageUrl: string;
    }>;
  } | null>(null);

  const putBoundedRecordEntry = <TValue,>(
    current: Record<string, TValue>,
    key: string,
    value: TValue,
    limit: number
  ) => {
    const keys = Object.keys(current);
    const keyExists = Object.prototype.hasOwnProperty.call(current, key);
    const next: Record<string, TValue> = {
      ...current,
      [key]: value,
    };

    if (!keyExists && keys.length >= limit) {
      const oldestKey = keys[0];
      if (oldestKey && oldestKey !== key) {
        delete next[oldestKey];
      }
    }

    return next;
  };

  const loadProfileCard = async (memberId: string, profileId: string) => {
    if (!profileId) {
      return;
    }

    const requestSequence = profileCardRequestSequenceRef.current + 1;
    profileCardRequestSequenceRef.current = requestSequence;
    const loadingTimeout = window.setTimeout(() => {
      if (profileCardRequestSequenceRef.current !== requestSequence) {
        return;
      }

      setActiveProfileCard(null);
      setActiveProfileCardLoadError("Live profile data timed out.");
      setLoadingProfileCardId((prev) => (prev === profileId ? null : prev));
    }, 5500);

    try {
      setActiveProfileCardProfileId(profileId);
      setActiveProfileCard(null);
      setActiveProfileCardLoadError(null);
      setLoadingProfileCardId(profileId);

      const requestConfig = {
        timeout: 5000,
        withCredentials: true,
        params: { memberId, viewerProfileId, viewerMemberId, _t: Date.now() },
        headers: {
          "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
          Pragma: "no-cache",
        },
      } as const;

      const [cardResult, mutualsResult] = await Promise.allSettled([
        axios.get<{
        pronouns?: string | null;
        comment?: string | null;
          effectiveImageUrl?: string | null;
          isDirectFriend?: boolean;
          directFriendStatus?: "self" | "friends" | "not_friends";
          nameplateLabel?: string | null;
          nameplateColor?: string | null;
          nameplateImageUrl?: string | null;
          effectiveNameplateLabel?: string | null;
          effectiveNameplateColor?: string | null;
          effectiveNameplateImageUrl?: string | null;
        profileIcons?: ProfileIcon[];
        profileEffectUrl?: string | null;
        effectiveAvatarDecorationUrl?: string | null;
        effectiveProfileEffectUrl?: string | null;
        effectiveBannerUrl?: string | null;
        mutualServersPercent?: number;
        mutualServersCount?: number;
        mutualFriendsCount?: number;
        mutualServers?: Array<{ id: string; name: string; imageUrl: string }>;
        mutualFriends?: Array<{
          profileId: string;
          memberId: string | null;
          serverId: string | null;
          displayName: string;
          email: string | null;
          imageUrl: string;
        }>;
        selectedServerTag?: {
          serverId: string;
          serverName: string;
          tagCode: string;
          iconKey: string;
          iconEmoji: string;
        } | null;
      }>(`/api/profile/${encodeURIComponent(profileId)}/card`, requestConfig),
        axios.get<OnlineMutualProfileData>(`/api/profile/${encodeURIComponent(profileId)}/mutuals`, requestConfig),
      ]);

      const response = cardResult.status === "fulfilled"
        ? cardResult.value
        : { data: {} as {
            pronouns?: string | null;
            comment?: string | null;
            effectiveImageUrl?: string | null;
            isDirectFriend?: boolean;
            directFriendStatus?: "self" | "friends" | "not_friends";
            nameplateLabel?: string | null;
            nameplateColor?: string | null;
            nameplateImageUrl?: string | null;
            effectiveNameplateLabel?: string | null;
            effectiveNameplateColor?: string | null;
            effectiveNameplateImageUrl?: string | null;
            profileIcons?: ProfileIcon[];
            profileEffectUrl?: string | null;
            effectiveAvatarDecorationUrl?: string | null;
            effectiveProfileEffectUrl?: string | null;
            effectiveBannerUrl?: string | null;
            mutualServersPercent?: number;
            mutualServersCount?: number;
            mutualFriendsCount?: number;
            mutualServers?: Array<{ id: string; name: string; imageUrl: string }>;
            mutualFriends?: Array<{
              profileId: string;
              memberId: string | null;
              serverId: string | null;
              displayName: string;
              email: string | null;
              imageUrl: string;
            }>;
            selectedServerTag?: {
              serverId: string;
              serverName: string;
              tagCode: string;
              iconKey: string;
              iconEmoji: string;
            } | null;
          } };
      const mutualData = mutualsResult.status === "fulfilled"
        ? mutualsResult.value.data
        : null;

      if (cardResult.status === "rejected" && mutualsResult.status === "rejected") {
        throw mutualsResult.reason ?? cardResult.reason ?? new Error("Live profile data is unavailable.");
      }

      const selectedServerTag =
        response.data?.selectedServerTag &&
        typeof response.data.selectedServerTag.serverId === "string" &&
        typeof response.data.selectedServerTag.tagCode === "string"
          ? response.data.selectedServerTag
          : null;
      const pronouns =
        typeof response.data?.pronouns === "string" && response.data.pronouns.trim().length > 0
          ? response.data.pronouns.trim()
          : null;
      const comment =
        typeof response.data?.comment === "string" && response.data.comment.trim().length > 0
          ? response.data.comment.trim()
          : null;

      if (profileCardRequestSequenceRef.current === requestSequence) {
        setActiveProfileCard({
          pronouns,
          comment,
          effectiveImageUrl:
            typeof response.data?.effectiveImageUrl === "string" && response.data.effectiveImageUrl.trim().length > 0
              ? response.data.effectiveImageUrl.trim()
              : null,
          nameplateLabel:
            typeof response.data?.nameplateLabel === "string" && response.data.nameplateLabel.trim().length > 0
              ? response.data.nameplateLabel.trim()
              : null,
          nameplateColor:
            typeof response.data?.nameplateColor === "string" && response.data.nameplateColor.trim().length > 0
              ? response.data.nameplateColor.trim()
              : null,
          nameplateImageUrl:
            typeof response.data?.nameplateImageUrl === "string" && response.data.nameplateImageUrl.trim().length > 0
              ? response.data.nameplateImageUrl.trim()
              : null,
          effectiveNameplateLabel:
            typeof response.data?.effectiveNameplateLabel === "string" && response.data.effectiveNameplateLabel.trim().length > 0
              ? response.data.effectiveNameplateLabel.trim()
              : null,
          effectiveNameplateColor:
            typeof response.data?.effectiveNameplateColor === "string" && response.data.effectiveNameplateColor.trim().length > 0
              ? response.data.effectiveNameplateColor.trim()
              : null,
          effectiveNameplateImageUrl:
            typeof response.data?.effectiveNameplateImageUrl === "string" && response.data.effectiveNameplateImageUrl.trim().length > 0
              ? response.data.effectiveNameplateImageUrl.trim()
              : null,
          profileIcons: Array.isArray(response.data?.profileIcons) ? response.data.profileIcons : [],
          profileEffectUrl:
            typeof response.data?.profileEffectUrl === "string" &&
            response.data.profileEffectUrl.trim().length > 0
              ? response.data.profileEffectUrl.trim()
              : null,
          effectiveAvatarDecorationUrl:
            typeof response.data?.effectiveAvatarDecorationUrl === "string" &&
            response.data.effectiveAvatarDecorationUrl.trim().length > 0
              ? response.data.effectiveAvatarDecorationUrl.trim()
              : null,
          effectiveProfileEffectUrl:
            typeof response.data?.effectiveProfileEffectUrl === "string" &&
            response.data.effectiveProfileEffectUrl.trim().length > 0
              ? response.data.effectiveProfileEffectUrl.trim()
              : null,
          effectiveBannerUrl:
            typeof response.data?.effectiveBannerUrl === "string" &&
            response.data.effectiveBannerUrl.trim().length > 0
              ? response.data.effectiveBannerUrl.trim()
              : null,
          isDirectFriend: mutualData
            ? Boolean(mutualData.isDirectFriend)
            : Boolean(response.data?.isDirectFriend),
          directFriendStatus:
            mutualData?.directFriendStatus === "friends" || mutualData?.directFriendStatus === "self"
              ? mutualData.directFriendStatus
              : response.data?.directFriendStatus === "friends" || response.data?.directFriendStatus === "self"
                ? response.data.directFriendStatus
                : "not_friends",
          mutualServersPercent:
            typeof mutualData?.mutualServersPercent === "number"
              ? mutualData.mutualServersPercent
              : typeof response.data?.mutualServersPercent === "number"
                ? response.data.mutualServersPercent
                : 0,
          mutualServersCount:
            typeof mutualData?.mutualServersCount === "number"
              ? mutualData.mutualServersCount
              : typeof response.data?.mutualServersCount === "number"
                ? response.data.mutualServersCount
                : 0,
          mutualFriendsCount:
            typeof mutualData?.mutualFriendsCount === "number"
              ? mutualData.mutualFriendsCount
              : typeof response.data?.mutualFriendsCount === "number"
                ? response.data.mutualFriendsCount
                : 0,
          mutualServers: Array.isArray(mutualData?.mutualServers)
            ? mutualData?.mutualServers ?? []
            : Array.isArray(response.data?.mutualServers)
              ? response.data.mutualServers
              : [],
          mutualFriends: Array.isArray(mutualData?.mutualFriends)
            ? mutualData?.mutualFriends ?? []
            : Array.isArray(response.data?.mutualFriends)
              ? response.data.mutualFriends
              : [],
          selectedServerTag,
        });
        setActiveProfileCardLoadError(null);
      }
    } catch (error) {
      if (profileCardRequestSequenceRef.current === requestSequence) {
        setActiveProfileCard(null);
        setActiveProfileCardLoadError(getProfileCardLoadErrorMessage(error));
      }
    } finally {
      window.clearTimeout(loadingTimeout);
      if (profileCardRequestSequenceRef.current === requestSequence) {
        setLoadingProfileCardId((prev) => (prev === profileId ? null : prev));
      }
    }
  };

  const loadBotCommands = async (memberId: string, profileId: string) => {
    if (!profileId || botCommandsByProfileId[profileId] || loadingBotCommandIdsRef.current.has(profileId)) {
      return;
    }

    try {
      loadingBotCommandIdsRef.current.add(profileId);
      setLoadingBotCommandsProfileId(profileId);

      const response = await axios.get<{ botName?: string; commands?: string[] }>(
        `/api/profile/${encodeURIComponent(profileId)}/bot-commands`,
        {
          params: {
            memberId,
          },
        }
      );

      const commands = Array.isArray(response.data?.commands)
        ? response.data.commands
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
        : [];

      setBotCommandsByProfileId((prev) =>
        putBoundedRecordEntry(
          prev,
          profileId,
          {
            botName: String(response.data?.botName ?? "").trim() || "Bot",
            commands,
          },
          BOT_COMMANDS_CACHE_LIMIT
        )
      );
    } catch {
      // not a configured bot profile or unavailable
    } finally {
      loadingBotCommandIdsRef.current.delete(profileId);
      setLoadingBotCommandsProfileId((prev) => (prev === profileId ? null : prev));
    }
  };

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const aName = (a.profileName || a.realName || a.displayName || a.email || a.profileId || "").toLowerCase();
      const bName = (b.profileName || b.realName || b.displayName || b.email || b.profileId || "").toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [users]);

  useEffect(() => {
    setOrderedRoleGroups(roleGroups);
  }, [roleGroups]);

  const reorderRoleGroups = (
    groups: Array<{ id: string; name: string; position?: number }>,
    sourceId: string,
    targetId: string
  ) => {
    if (!sourceId || !targetId || sourceId === targetId) {
      return groups;
    }

    const fromIndex = groups.findIndex((group) => group.id === sourceId);
    const toIndex = groups.findIndex((group) => group.id === targetId);

    if (fromIndex < 0 || toIndex < 0) {
      return groups;
    }

    const next = [...groups];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  };

  const persistRoleGroupOrder = async (nextGroups: Array<{ id: string; name: string; position?: number }>) => {
    if (!serverId || !canReorderRoleGroups) {
      return;
    }

    const rolesResponse = await axios.get<{
      roles?: Array<{ id: string; position: number; showInOnlineMembers: boolean }>;
    }>(`/api/servers/${serverId}/roles`, {
      params: { _t: Date.now() },
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    const allRoles = [...(rolesResponse.data.roles ?? [])].sort(
      (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)
    );
    if (allRoles.length === 0) {
      return;
    }

    const visibleRoleIdQueue = nextGroups.map((group) => group.id);
    let visibleIndex = 0;

    const orderedRoleIds = allRoles.map((role) => {
      if (!role.showInOnlineMembers) {
        return role.id;
      }

      const queuedId = visibleRoleIdQueue[visibleIndex];
      visibleIndex += 1;
      return queuedId || role.id;
    });

    await axios.patch(`/api/servers/${serverId}/roles/reorder`, {
      orderedRoleIds,
    });
  };

  const onGroupDragStart = (event: React.DragEvent<HTMLElement>, groupId: string) => {
    if (!canReorderRoleGroups || isSavingGroupOrder) {
      return;
    }

    isDraggingGroupRef.current = true;
    setDraggedGroupId(groupId);
    event.dataTransfer.setData("inaccord/online-role-group-id", groupId);
    event.dataTransfer.setData("text/plain", groupId);
    event.dataTransfer.effectAllowed = "move";
  };

  const onGroupDragEnd = () => {
    setDraggedGroupId(null);
    setDragOverGroupId(null);
    window.setTimeout(() => {
      isDraggingGroupRef.current = false;
    }, 0);
  };

  const onGroupDragOver = (event: React.DragEvent<HTMLElement>, targetGroupId: string) => {
    if (!canReorderRoleGroups || isSavingGroupOrder) {
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

    if (!canReorderRoleGroups || isSavingGroupOrder) {
      return;
    }

    const draggedId =
      event.dataTransfer.getData("inaccord/online-role-group-id")?.trim() ||
      event.dataTransfer.getData("text/plain")?.trim() ||
      draggedGroupId ||
      "";

    setDraggedGroupId(null);
    setDragOverGroupId(null);

    if (!draggedId || draggedId === targetGroupId) {
      return;
    }

    const previous = orderedRoleGroups;
    const next = reorderRoleGroups(previous, draggedId, targetGroupId);

    if (next === previous) {
      return;
    }

    setOrderedRoleGroups(next);

    try {
      setIsSavingGroupOrder(true);
      await persistRoleGroupOrder(next);
      router.refresh();
    } catch {
      setOrderedRoleGroups(previous);
      window.alert("Failed to reorder Online Members role groups.");
    } finally {
      setIsSavingGroupOrder(false);
    }
  };

  const renderMemberRoleIcon = (role: unknown) => {
    if (isInAccordAdministrator(String(role ?? ""))) {
      return <Crown className="h-4 w-4 mr-2 text-rose-500" aria-label="Administrator" />;
    }

    if (isInAccordModerator(String(role ?? ""))) {
      return <ModeratorLineIcon className="h-4 w-4 mr-2 text-indigo-500" aria-label="Moderator" />;
    }

    return null;
  };

  const renderMember = (member: OnlineRailUser) => {
    const profileCard = activeProfileCardProfileId === member.profileId ? activeProfileCard : null;
    const profileCardLoadError = activeProfileCardProfileId === member.profileId ? activeProfileCardLoadError : null;
    const mutualServersCount = profileCard?.mutualServers?.length || (typeof profileCard?.mutualServersCount === "number" ? profileCard.mutualServersCount : 0);
    const mutualFriendsCount = profileCard?.mutualFriends?.length || (typeof profileCard?.mutualFriendsCount === "number" ? profileCard.mutualFriendsCount : 0);
    const mutualServersPercent = typeof profileCard?.mutualServersPercent === "number" ? profileCard.mutualServersPercent : 0;
    const hasProfileCardLoadError = Boolean(profileCardLoadError);
    const isSelfProfileCard = profileCard?.directFriendStatus === "self";
    const mutualServersLabel = mutualServersCount > 0
      ? `${mutualServersPercent}% in common · ${mutualServersCount}`
      : "NOT WORKING";
    const mutualFriendsLabel = mutualFriendsCount > 0
      ? `${mutualFriendsCount} in common`
      : "NOT WORKING";
    const directFriendRelationshipLabel = profileCard?.directFriendStatus === "self"
      ? "This is you"
      : profileCard?.isDirectFriend
        ? "Direct friends"
        : "Not direct friends";
    const normalizedPresenceStatus = normalizePresenceStatus(member.presenceStatus);
    const memberCurrentGame = member.currentGame?.trim() || null;
    const isGlobalAdmin = isInAccordAdministrator(member.globalRole);
    const isGlobalDeveloper = isInAccordDeveloper(member.globalRole);
    const isGlobalModerator = isInAccordModerator(member.globalRole);
    const highestRoleIcon = isGlobalDeveloper
      ? <Wrench className="h-4 w-4 shrink-0 text-cyan-400" aria-label="Developer" />
      : isGlobalAdmin
        ? <Crown className="h-4 w-4 shrink-0 text-rose-500" aria-label="Administrator" />
      : isGlobalModerator
        ? <ModeratorLineIcon className="h-4 w-4 shrink-0 text-indigo-500" aria-label="Moderator" />
      : isInAccordAdministrator(member.role)
        ? <Crown className="h-4 w-4 shrink-0 text-rose-500" />
        : isInAccordModerator(member.role)
          ? <ModeratorLineIcon className="h-4 w-4 shrink-0 text-indigo-500" />
          : null;
    const highestRoleLabel = isGlobalDeveloper
      ? "Developer"
      : isGlobalAdmin
        ? "Administrator"
      : isGlobalModerator
        ? "Moderator"
      : isInAccordAdministrator(member.role)
          ? "Administrator"
        : isInAccordModerator(member.role)
          ? "Moderator"
          : null;
    const showBotBadge = isBotUser({
      role: member.globalRole,
      name: member.profileName || member.realName || member.displayName,
      email: member.email,
    });
    const canShowBotCommands = showBotBadge || member.profileId.startsWith("botcfg_");
    const roleAndMetaIcons = (
      <>
        <NewUserCloverBadge createdAt={member.joinedAt} className="text-[11px]" />
        {showBotBadge ? <BotAppBadge className="h-4 px-1 text-[9px]" /> : null}
        {highestRoleIcon && highestRoleLabel ? (
          <ActionTooltip label={highestRoleLabel} align="center">
            {highestRoleIcon}
          </ActionTooltip>
        ) : null}
      </>
    );
    const effectiveProfileIcons =
      profileCard?.profileIcons && profileCard.profileIcons.length > 0
        ? profileCard.profileIcons
        : resolveProfileIcons({
            userId: member.profileId,
            role: member.globalRole,
            email: member.email,
            createdAt: member.joinedAt,
          });
    const onStartDirectMessage = () => {
      const serverIdFromRoute =
        typeof params?.serverId === "string"
          ? params.serverId
          : Array.isArray(params?.serverId)
            ? (params?.serverId[0] ?? "")
            : "";

      if (!serverIdFromRoute) {
        window.alert("Unable to open PM from this view.");
        return;
      }

      router.push(`/users?serverId=${encodeURIComponent(serverIdFromRoute)}&memberId=${encodeURIComponent(member.id)}`);
    };

    const onAddFriend = async () => {
      try {
        await axios.post("/api/friends/requests", {
          profileId: member.profileId,
        });
        router.refresh();
        window.alert("Friend request sent.");
      } catch (error) {
        const message = axios.isAxiosError(error)
          ? (error.response?.data as { error?: string } | undefined)?.error ?? "Failed to send friend request."
          : "Failed to send friend request.";
        window.alert(message);
      }
    };

    const onBlockUser = async () => {
      try {
        await axios.post("/api/friends/blocked", {
          profileId: member.profileId,
        });
        router.refresh();
        window.alert("User blocked.");
      } catch (error) {
        const message = axios.isAxiosError(error)
          ? (error.response?.data as { error?: string } | undefined)?.error ?? "Failed to block user."
          : "Failed to block user.";
        window.alert(message);
      }
    };

    const onReportUser = async () => {
      try {
        await axios.post("/api/reports", {
          targetType: "USER",
          targetId: member.profileId,
          reason: "Reported from online users rail",
        });
        window.alert("User report submitted.");
      } catch (error) {
        const message = axios.isAxiosError(error)
          ? (error.response?.data as { error?: string } | undefined)?.error ?? "Failed to submit report."
          : "Failed to submit report.";
        window.alert(message);
      }
    };

    const onOpenMutualDetailsForMember = (type: "servers" | "friends") => {
      setOpenMutualDetails({
        type,
        displayName: member.profileName || member.realName || member.displayName || "Unknown User",
        mutualServers: profileCard?.mutualServers ?? [],
        mutualFriends: profileCard?.mutualFriends ?? [],
      });
    };

    return (
      <Popover
        key={`online-${member.profileId}`}
        onOpenChange={(open) => {
          if (open) {
            void loadProfileCard(member.id, member.profileId);
          } else if (activeProfileCardProfileId === member.profileId) {
            profileCardRequestSequenceRef.current += 1;
            setActiveProfileCardProfileId(null);
            setActiveProfileCard(null);
            setActiveProfileCardLoadError(null);
            setLoadingProfileCardId((prev) => (prev === member.profileId ? null : prev));
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex w-full items-start gap-4 rounded px-1 py-1 text-left hover:bg-[#2a2b2f]"
            title={`View ${member.profileName || "Profile"} profile`}
          >
            <span className="relative inline-flex h-6 w-6 shrink-0">
              <UserAvatar
                src={profileCard?.effectiveImageUrl ?? member.imageUrl ?? undefined}
                decorationSrc={profileCard?.effectiveAvatarDecorationUrl}
                className="h-6 w-6"
              />
              <span
                className={`absolute -bottom-0.5 -left-0.5 inline-flex h-2.5 w-2.5 rounded-full border border-[#111214] ${presenceStatusDotClassMap[normalizedPresenceStatus]}`}
                aria-hidden="true"
              />
            </span>
            <div className="flex w-full min-w-0 items-center gap-1">
              <ProfileNameWithServerTag
                name={member.profileName || member.realName || member.displayName || "No profile name"}
                profileId={member.profileId}
                memberId={member.id}
                containerClassName="w-full min-w-0"
                nameClassName="min-w-0 truncate text-xs text-[#dbdee1]"
                showNameplate
                nameplateSize="compact"
                plateMetaIcons={roleAndMetaIcons}
                stretchTagUnderPlate
              />
            </div>
          </button>
        </PopoverTrigger>

        <PopoverContent
          side="left"
          align="start"
          className="relative w-[320px] overflow-hidden rounded-xl border border-black/30 bg-[#111214] p-0 text-[#dbdee1] shadow-2xl shadow-black/50"
        >
          <ProfileEffectLayer src={profileCard?.effectiveProfileEffectUrl ?? profileCard?.profileEffectUrl ?? null} />
          <div className="relative h-24 bg-linear-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
            {(() => {
              const resolvedBannerUrl = resolveBannerUrl(profileCard?.effectiveBannerUrl || member.bannerUrl || null);

              return resolvedBannerUrl ? (
              <BannerImage src={resolvedBannerUrl} alt="User banner" className="object-cover" />
              ) : null;
            })()}
          </div>

          <div className="relative p-3 pt-9">
            <div className="absolute -top-10 left-3 rounded-full border-4 border-[#111214]">
              <UserAvatar
                src={profileCard?.effectiveImageUrl ?? member.imageUrl ?? undefined}
                decorationSrc={profileCard?.effectiveAvatarDecorationUrl}
                className="h-20 w-20"
              />
            </div>

            <div className="min-w-0">
              <ProfileIconRow icons={effectiveProfileIcons} className="mb-1" />
              <div className="flex w-full min-w-0 items-start gap-1.5">
                <ProfileNameWithServerTag
                  name={member.profileName || member.realName || member.displayName || "Unknown User"}
                  profileId={member.profileId}
                  memberId={member.id}
                  pronouns={profileCard?.pronouns || null}
                  disableCardFetch
                  containerClassName="w-full min-w-0"
                  nameClassName="text-base font-bold text-white"
                  showNameplate
                  nameplateClassName="mb-0 w-full max-w-full"
                  plateMetaIcons={roleAndMetaIcons}
                  stretchTagUnderPlate
                />
              </div>
            </div>
            <div className="mt-3 h-40 w-full overflow-y-auto rounded-md border border-white/10 bg-[#1a1b1e] px-3 py-2.5">
              <p
                className="whitespace-pre-wrap wrap-break-word align-top text-[11px] text-[#dbdee1]"
                style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
              >
                {profileCard?.comment || "No comment set"}
              </p>
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] p-3 text-xs">
              <div className="space-y-1 text-[#dbdee1]">
                <p>Name: {member.realName || member.profileName || member.displayName || "Unknown User"}</p>
                <p>Email: {member.email || "N/A"}</p>
                <p>Current Game: {memberCurrentGame || "Not in game"}</p>
                <p>Role: {member.role}</p>
                <p>Last logon: {formatDate(member.lastLogonAt)}</p>
                <p>Created: {formatDate(member.joinedAt)}</p>
              </div>
            </div>

            {loadingProfileCardId === member.profileId ? (
              <p className="mt-2 text-[11px] text-[#949ba4]">Loading server tag...</p>
            ) : null}

            {profileCard?.selectedServerTag ? (
              <div className="mt-2 rounded-lg border border-white/10 bg-[#1a1b1e] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Server Tag</p>
                <div className="mt-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#5865f2]/35 bg-[#5865f2]/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#d7dcff]"
                    title={`Server tag from ${profileCard.selectedServerTag.serverName}`}
                  >
                    <span>{profileCard.selectedServerTag.iconEmoji}</span>
                    <span>{profileCard.selectedServerTag.tagCode}</span>
                  </span>
                </div>
              </div>
            ) : null}

            <div className={`mt-3 grid gap-2 ${isSelfProfileCard ? "grid-cols-1" : "grid-cols-2"}`}>
              <div className="col-span-2 rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#dbdee1]">
                <span className="font-medium">Relationship: </span>
                <span className="text-[#949ba4]">
                  {loadingProfileCardId === member.profileId
                    ? "Loading..."
                    : hasProfileCardLoadError
                      ? profileCardLoadError
                      : directFriendRelationshipLabel}
                </span>
              </div>
              {!isSelfProfileCard ? (
                <>
                  <button
                    type="button"
                    onClick={() => onOpenMutualDetailsForMember("servers")}
                    disabled={loadingProfileCardId === member.profileId || hasProfileCardLoadError}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2 text-left text-xs text-[#dbdee1] transition hover:bg-[#232428] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Network className="h-4 w-4 shrink-0 text-[#949ba4]" />
                    <div className="min-w-0">
                      <p className="font-medium">Mutual servers</p>
                      <p className="text-[#949ba4]">
                        {loadingProfileCardId === member.profileId
                          ? "Loading..."
                          : hasProfileCardLoadError
                            ? profileCardLoadError
                            : mutualServersLabel}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenMutualDetailsForMember("friends")}
                    disabled={loadingProfileCardId === member.profileId || hasProfileCardLoadError}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2 text-left text-xs text-[#dbdee1] transition hover:bg-[#232428] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <UsersIcon className="h-4 w-4 shrink-0 text-[#949ba4]" />
                    <div className="min-w-0">
                      <p className="font-medium">Mutual friends</p>
                      <p className="text-[#949ba4]">
                        {loadingProfileCardId === member.profileId
                          ? "Loading..."
                          : hasProfileCardLoadError
                            ? profileCardLoadError
                            : mutualFriendsLabel}
                      </p>
                    </div>
                  </button>
                </>
              ) : null}
            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
              {canShowBotCommands ? (
                <ActionTooltip label="Commands" align="center">
                  <button
                    type="button"
                    onClick={() => {
                      setCommandsDialogProfileId(member.profileId);
                      void loadBotCommands(member.id, member.profileId);
                    }}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-indigo-500/35 bg-indigo-500/15 px-2 text-[11px] font-semibold tracking-[0.05em] text-indigo-200 transition hover:bg-indigo-500/25"
                    aria-label="Show bot commands"
                    title="Commands"
                  >
                    {loadingBotCommandsProfileId === member.profileId ? "..." : "COMMANDS"}
                  </button>
                </ActionTooltip>
              ) : null}

              <ActionTooltip label="Add Friend" align="center">
                <button
                  type="button"
                  onClick={onAddFriend}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-[#1e1f22] text-[#dbdee1] transition hover:bg-[#2a2b30]"
                  aria-label="Add friend"
                  title="Add Friend"
                >
                  <UserPlus className="h-4 w-4" />
                </button>
              </ActionTooltip>

              <ActionTooltip label="Block" align="center">
                <button
                  type="button"
                  onClick={onBlockUser}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-500/35 bg-rose-500/15 text-rose-200 transition hover:bg-rose-500/25"
                  aria-label="Block user"
                  title="Block"
                >
                  <Ban className="h-4 w-4" />
                </button>
              </ActionTooltip>

              <ActionTooltip label="Private Message" align="center">
                <button
                  type="button"
                  onClick={onStartDirectMessage}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-[#1e1f22] text-[#dbdee1] transition hover:bg-[#2a2b30]"
                  aria-label="Open private message"
                  title="Private Message"
                >
                  <MessageCircle className="h-4 w-4" />
                </button>
              </ActionTooltip>

              <ActionTooltip label="Report User" align="center">
                <button
                  type="button"
                  onClick={onReportUser}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-500/35 bg-amber-500/15 text-amber-200 transition hover:bg-amber-500/25"
                  aria-label="Report user"
                  title="Report User"
                >
                  <Flag className="h-4 w-4" />
                </button>
              </ActionTooltip>
            </div>
          </div>

          <div className="flex items-center border-t border-white/10 p-3 pt-2 text-xs text-[#b5bac1]">
            {renderMemberRoleIcon(member.role)}
            {formatPresenceStatusLabel(normalizedPresenceStatus, { showGameIcon: Boolean(memberCurrentGame) })} member
          </div>
        </PopoverContent>

        <BotCommandsDialog
          open={commandsDialogProfileId === member.profileId}
          onOpenChange={(open) => {
            if (!open) {
              setCommandsDialogProfileId((current) =>
                current === member.profileId ? null : current
              );
            }
          }}
          botName={
            botCommandsByProfileId[member.profileId]?.botName ||
            member.profileName ||
            member.displayName ||
            "Bot"
          }
          commands={botCommandsByProfileId[member.profileId]?.commands ?? []}
        />
      </Popover>
    );
  };

  const orderedGroups = useMemo(() => {
    return [...orderedRoleGroups].sort((a, b) => {
      const byPosition = Number(a.position ?? 0) - Number(b.position ?? 0);
      if (byPosition !== 0) {
        return byPosition;
      }

      return a.name.localeCompare(b.name);
    });
  }, [orderedRoleGroups]);

  const onOpenMutualServer = (serverId: string) => {
    const normalizedServerId = String(serverId ?? "").trim();
    if (!normalizedServerId) {
      return;
    }

    setOpenMutualDetails(null);
    router.push(`/servers/${encodeURIComponent(normalizedServerId)}`);
  };

  const onOpenPrivateMessageByRoute = ({
    serverId,
    memberId,
  }: {
    serverId: string | null | undefined;
    memberId: string | null | undefined;
  }) => {
    const normalizedServerId = String(serverId ?? "").trim();
    const normalizedMemberId = String(memberId ?? "").trim();

    if (!normalizedServerId || !normalizedMemberId) {
      return;
    }

    setOpenMutualDetails(null);
    router.push(`/users?serverId=${encodeURIComponent(normalizedServerId)}&memberId=${encodeURIComponent(normalizedMemberId)}`);
  };

  const { usersByRoleGroup, unassignedUsers } = useMemo(() => {
    const groupedUsers = new Map<string, OnlineRailUser[]>();
    for (const group of orderedGroups) {
      groupedUsers.set(group.id, []);
    }

    const groupIdSet = new Set<string>();
    for (const group of orderedGroups) {
      groupIdSet.add(group.id);
    }

    const groupIdByNormalizedName = new Map<string, string>();
    for (const group of orderedGroups) {
      groupIdByNormalizedName.set(group.name.trim().toLowerCase(), group.id);
    }

    const usersWithoutGroup: OnlineRailUser[] = [];

    for (const member of sortedUsers) {
      const assignedRoleId = String(member.assignedRoleId ?? "").trim();
      if (assignedRoleId && groupIdSet.has(assignedRoleId)) {
        groupedUsers.get(assignedRoleId)?.push(member);
        continue;
      }

      const assignedRoleName = String(member.assignedRoleName ?? "").trim().toLowerCase();
      if (!assignedRoleName) {
        usersWithoutGroup.push(member);
        continue;
      }

      const matchedGroupId = groupIdByNormalizedName.get(assignedRoleName);
      if (!matchedGroupId) {
        usersWithoutGroup.push(member);
        continue;
      }

      groupedUsers.get(matchedGroupId)?.push(member);
    }

    return {
      usersByRoleGroup: groupedUsers,
      unassignedUsers: usersWithoutGroup,
    };
  }, [orderedGroups, sortedUsers]);

  return (
    <>
      <Dialog open={Boolean(openMutualDetails)} onOpenChange={(open) => {
        if (!open) {
          setOpenMutualDetails(null);
        }
      }}>
        <DialogContent className="max-w-lg overflow-hidden border-black/30 bg-[#111214] p-0 text-[#dbdee1]">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>{openMutualDetails?.type === "servers" ? "Mutual Servers" : "Mutual Friends"}</DialogTitle>
            <DialogDescription className="text-[#949ba4]">
              Shared with {openMutualDetails?.displayName || "this user"}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[min(60vh,28rem)] px-6 pb-6">
            <div className="space-y-2">
              {openMutualDetails?.type === "servers" ? (
                openMutualDetails.mutualServers.length ? openMutualDetails.mutualServers.map((serverItem) => (
                  <button
                    key={serverItem.id}
                    type="button"
                    onClick={() => onOpenMutualServer(serverItem.id)}
                    className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2 text-left transition hover:bg-[#232428]"
                  >
                    <img src={serverItem.imageUrl} alt={serverItem.name} className="h-10 w-10 rounded-full object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#dbdee1]">{serverItem.name}</p>
                    </div>
                  </button>
                )) : (
                  <div className="rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-4 text-sm text-[#949ba4]">
                    No mutual servers found.
                  </div>
                )
              ) : (
                openMutualDetails?.mutualFriends.length ? openMutualDetails.mutualFriends.map((friendItem) => (
                  <button
                    key={friendItem.profileId}
                    type="button"
                    onClick={() => onOpenPrivateMessageByRoute({ serverId: friendItem.serverId, memberId: friendItem.memberId })}
                    disabled={!friendItem.serverId || !friendItem.memberId}
                    className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2 text-left transition hover:bg-[#232428] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <UserAvatar src={friendItem.imageUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#dbdee1]">{friendItem.displayName}</p>
                      <p className="truncate text-xs text-[#949ba4]">{friendItem.email || friendItem.profileId}</p>
                    </div>
                  </button>
                )) : (
                  <div className="rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-4 text-sm text-[#949ba4]">
                    No mutual friends found.
                  </div>
                )
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      <div className="space-y-3">
        {orderedGroups.map((group) => {
        const groupUsers = usersByRoleGroup.get(group.id) ?? [];
        const isCollapsed = Boolean(collapsedByGroup[group.id]);

        return (
          <div
            key={group.id}
            className={`space-y-1.5 ${draggedGroupId && dragOverGroupId === group.id ? "rounded ring-1 ring-indigo-500/50" : ""}`}
            onDragOver={(event) => onGroupDragOver(event, group.id)}
            onDrop={(event) => void onGroupDrop(event, group.id)}
          >
            <button
              type="button"
              draggable={canReorderRoleGroups && !isSavingGroupOrder}
              onDragStart={(event) => onGroupDragStart(event, group.id)}
              onDragEnd={onGroupDragEnd}
              onClick={() =>
                isDraggingGroupRef.current
                  ? undefined
                  :
                setCollapsedByGroup((prev) => ({
                  ...prev,
                  [group.id]: !prev[group.id],
                }))
              }
              className={`flex w-full items-center justify-between rounded px-1 py-1 text-left hover:bg-[#2a2b2f] ${canReorderRoleGroups ? "cursor-grab active:cursor-grabbing" : ""}`}
              aria-expanded={!isCollapsed}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                {group.name} — {groupUsers.length}
              </span>
              <span className="text-xs text-[#949ba4]">{isCollapsed ? "▸" : "▾"}</span>
            </button>

            {isCollapsed ? null : groupUsers.map((member) => renderMember(member))}
          </div>
        );
      })}

        <div className="space-y-1.5">
        <button
          type="button"
          onClick={() =>
            setCollapsedByGroup((prev) => ({
              ...prev,
              __unassigned: !prev.__unassigned,
            }))
          }
          className="flex w-full items-center justify-between rounded px-1 py-1 text-left hover:bg-[#2a2b2f]"
          aria-expanded={!collapsedByGroup.__unassigned}
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
            Online — {unassignedUsers.length}
          </span>
          <span className="text-xs text-[#949ba4]">{collapsedByGroup.__unassigned ? "▸" : "▾"}</span>
        </button>

          {collapsedByGroup.__unassigned ? null : unassignedUsers.map((member) => renderMember(member))}
        </div>
      </div>
    </>
  );
};
