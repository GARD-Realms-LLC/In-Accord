"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import qs from "query-string";
import axios from "axios";
import { useRouter } from "next/navigation";
import {
  Check,
  Clock3,
  Copy,
  Gavel,
  List,
  Loader2,
  MessageCircle,
  MoreVertical,
  Network,
  Plus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Users,
  UserX,
  X,
} from "lucide-react";

import { BotAppBadge } from "@/components/bot-app-badge";
import { NewUserCloverBadge } from "@/components/new-user-clover-badge";
import { ProfileEffectLayer } from "@/components/profile-effect-layer";
import { ProfileNameWithServerTag } from "@/components/profile-name-with-server-tag";
import { useModal } from "@/hooks/use-modal-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuTrigger,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ServerWithMembersWithProfiles } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/user-avatar";
import { MemberRole } from "@/lib/db/types";
import { isBotUser } from "@/lib/is-bot-user";

type MembersMutualServer = {
  id: string;
  name: string;
  imageUrl: string;
};

type MembersMutualFriend = {
  profileId: string;
  memberId: string | null;
  serverId: string | null;
  displayName: string;
  email: string | null;
  imageUrl: string;
};

type MembersModalRole = {
  id: string;
  label: string;
  source: "owner" | "assigned" | "base";
};

type MembersModalMember = ServerWithMembersWithProfiles["members"][number] & {
  joinedServerAt?: string | Date | null;
  joinedInAccordAt?: string | Date | null;
  joinedBy?: string | null;
  joinedByProfileId?: string | null;
  isServerOwner?: boolean;
  topRole?: MembersModalRole | null;
  roles?: MembersModalRole[];
};

type MembersResponse = {
  serverId: string;
  memberCount: number;
  members: MembersModalMember[];
};

type ServerRoleItem = {
  id: string;
  name: string;
  color: string;
  iconUrl: string | null;
  isMentionable: boolean;
  showInOnlineMembers: boolean;
  position: number;
  isManaged: boolean;
  memberCount: number;
};

type ServerRolesResponse = {
  roles: ServerRoleItem[];
  totalMembers: number;
  canManageRoles: boolean;
};

type MembersProfileCardData = {
  id: string;
  realName: string | null;
  profileName: string | null;
  pronouns?: string | null;
  comment?: string | null;
  effectiveProfileName?: string | null;
  effectiveImageUrl?: string | null;
  avatarDecorationUrl?: string | null;
  effectiveAvatarDecorationUrl?: string | null;
  profileEffectUrl?: string | null;
  effectiveProfileEffectUrl?: string | null;
  bannerUrl: string | null;
  effectiveBannerUrl?: string | null;
  role: string | null;
  email: string;
  imageUrl: string;
  isDirectFriend?: boolean;
  directFriendStatus?: "self" | "friends" | "not_friends";
  mutualServersPercent?: number;
  mutualServersCount?: number;
  mutualFriendsCount?: number;
  mutualServers?: MembersMutualServer[];
  mutualFriends?: MembersMutualFriend[];
  createdAt: string | null;
  lastLogonAt: string | null;
};

type MutualDetailsModalState = {
  type: "servers" | "friends";
  memberId: string;
} | null;

type MembersMutualProfileData = Pick<
  MembersProfileCardData,
  | "isDirectFriend"
  | "directFriendStatus"
  | "mutualServersPercent"
  | "mutualServersCount"
  | "mutualFriendsCount"
  | "mutualServers"
  | "mutualFriends"
>;

const createEmptyMembersMutualProfileData = (): MembersMutualProfileData => ({
  isDirectFriend: false,
  directFriendStatus: "not_friends",
  mutualServersPercent: 0,
  mutualServersCount: 0,
  mutualFriendsCount: 0,
  mutualServers: [],
  mutualFriends: [],
});

const createEmptyMembersProfileCard = (): MembersProfileCardData => ({
  id: "",
  realName: null,
  profileName: null,
  pronouns: null,
  comment: null,
  effectiveProfileName: null,
  effectiveImageUrl: null,
  avatarDecorationUrl: null,
  effectiveAvatarDecorationUrl: null,
  profileEffectUrl: null,
  effectiveProfileEffectUrl: null,
  bannerUrl: null,
  effectiveBannerUrl: null,
  role: null,
  email: "",
  imageUrl: "/in-accord-steampunk-logo.png",
  isDirectFriend: false,
  directFriendStatus: "not_friends",
  mutualServersPercent: 0,
  mutualServersCount: 0,
  mutualFriendsCount: 0,
  mutualServers: [],
  mutualFriends: [],
  createdAt: null,
  lastLogonAt: null,
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

const fetchMembersProfileCard = async ({
  profileId,
  memberId,
  viewerProfileId,
  viewerMemberId,
}: {
  profileId: string;
  memberId: string;
  viewerProfileId: string;
  viewerMemberId?: string | null;
}) => {
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
    axios.get<MembersProfileCardData>(`/api/profile/${encodeURIComponent(profileId)}/card`, requestConfig),
    axios.get<MembersMutualProfileData>(`/api/profile/${encodeURIComponent(profileId)}/mutuals`, requestConfig),
  ]);

  if (cardResult.status === "rejected" && mutualsResult.status === "rejected") {
    throw mutualsResult.reason ?? cardResult.reason ?? new Error("Live profile data is unavailable.");
  }

  const cardData = cardResult.status === "fulfilled"
    ? cardResult.value.data
    : createEmptyMembersProfileCard();
  const mutualData = mutualsResult.status === "fulfilled"
    ? mutualsResult.value.data
    : null;

  return {
    ...cardData,
    isDirectFriend: mutualData
      ? Boolean(mutualData.isDirectFriend)
      : Boolean(cardData.isDirectFriend),
    directFriendStatus:
      mutualData?.directFriendStatus === "friends" || mutualData?.directFriendStatus === "self"
        ? mutualData.directFriendStatus
        : cardData.directFriendStatus === "friends" || cardData.directFriendStatus === "self"
          ? cardData.directFriendStatus
          : "not_friends",
    mutualServersPercent:
      typeof mutualData?.mutualServersPercent === "number"
        ? mutualData.mutualServersPercent
        : typeof cardData.mutualServersPercent === "number"
          ? cardData.mutualServersPercent
          : 0,
    mutualServersCount:
      typeof mutualData?.mutualServersCount === "number"
        ? mutualData.mutualServersCount
        : typeof cardData.mutualServersCount === "number"
          ? cardData.mutualServersCount
          : 0,
    mutualFriendsCount:
      typeof mutualData?.mutualFriendsCount === "number"
        ? mutualData.mutualFriendsCount
        : typeof cardData.mutualFriendsCount === "number"
          ? cardData.mutualFriendsCount
          : 0,
    mutualServers: Array.isArray(mutualData?.mutualServers)
      ? mutualData?.mutualServers ?? []
      : Array.isArray(cardData.mutualServers)
        ? cardData.mutualServers
        : [],
    mutualFriends: Array.isArray(mutualData?.mutualFriends)
      ? mutualData?.mutualFriends ?? []
      : Array.isArray(cardData.mutualFriends)
        ? cardData.mutualFriends
        : [],
  } satisfies MembersProfileCardData;
};

const roleIconMap = {
  GUEST: null,
  MODERATOR: <ShieldCheck className="h-4 w-4 ml-2 text-indigo-500" />,
  ADMIN: <ShieldAlert className="h-4 w-4 text-rose-500" />,
};

const baseRoleLabelMap = {
  ADMIN: "Admin",
  MODERATOR: "Moderator",
  GUEST: "Guest",
} as const;

const MEMBERS_PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 25, 50, 100] as const;

const getMemberTopRoleLabel = (member: MembersModalMember) => (
  member.topRole?.label ?? baseRoleLabelMap[member.role as keyof typeof baseRoleLabelMap] ?? "Guest"
);

type MembersSortMode =
  | "joined-server-asc"
  | "joined-server-desc"
  | "joined-in-accord-asc"
  | "joined-in-accord-desc"
  | "joined-by-asc"
  | "joined-by-desc"
  | "name-asc"
  | "name-desc"
  | "role-asc"
  | "role-desc";

const getSortIndicator = (sortMode: MembersSortMode, ascMode: MembersSortMode, descMode: MembersSortMode) => {
  if (sortMode === ascMode) {
    return "▲";
  }

  if (sortMode === descMode) {
    return "▼";
  }

  return "↕";
};

export const MembersModal = () => {
  const profileCardRequestSequenceRef = useRef(0);
  const router = useRouter();
  const { isOpen, onClose, type, data } = useModal();
  const [loadingId, setLoadingId] = useState("");
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isBulkKicking, setIsBulkKicking] = useState(false);
  const [members, setMembers] = useState<MembersModalMember[]>([]);
  const [rolesMember, setRolesMember] = useState<MembersModalMember | null>(null);
  const [availableRoles, setAvailableRoles] = useState<ServerRoleItem[]>([]);
  const [isLoadingAvailableRoles, setIsLoadingAvailableRoles] = useState(false);
  const [canManageAssignedRoles, setCanManageAssignedRoles] = useState(false);
  const [isAddRolesOpen, setIsAddRolesOpen] = useState(false);
  const [rolesSearchQuery, setRolesSearchQuery] = useState("");
  const [addRoleSearchQuery, setAddRoleSearchQuery] = useState("");
  const [roleMutationKey, setRoleMutationKey] = useState("");
  const [roleMutationError, setRoleMutationError] = useState("");
  const [openProfileMemberId, setOpenProfileMemberId] = useState<string | null>(null);
  const [openMutualDetails, setOpenMutualDetails] = useState<MutualDetailsModalState>(null);
  const [selectedProfileCardData, setSelectedProfileCardData] = useState<MembersProfileCardData | null>(null);
  const [loadingProfileMemberId, setLoadingProfileMemberId] = useState<string | null>(null);
  const [selectedProfileCardLoadError, setSelectedProfileCardLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<MembersSortMode>("joined-server-asc");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [membersPerPage, setMembersPerPage] = useState<(typeof MEMBERS_PAGE_SIZE_OPTIONS)[number]>(25);
  const [currentPage, setCurrentPage] = useState(1);

  const { server, viewerProfileId, viewerMemberId } = data as {
    server: ServerWithMembersWithProfiles;
    viewerProfileId?: string | null;
    viewerMemberId?: string | null;
  };

  const isModalOpen = isOpen && type === "members";

  const toggleSortMode = (ascMode: MembersSortMode, descMode: MembersSortMode) => {
    setSortMode((current) => current === ascMode ? descMode : ascMode);
  };

  const formatDate = (value: string | Date | null | undefined) => {
    if (!value) {
      return "Unknown";
    }

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "Unknown";
    }

    return parsed.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const memberCount = members.length || server?.members?.length || 0;

  const displayedMembers = useMemo(() => {
    const sourceMembers = members.length > 0
      ? members
      : ((server?.members ?? []) as MembersModalMember[]);

    const normalizedQuery = searchQuery.trim().toLowerCase();

    const filteredMembers = sourceMembers.filter((memberItem) => {
      if (!normalizedQuery) {
        return true;
      }

      const searchableParts = [
        memberItem.profile?.name,
        memberItem.profile?.email,
        memberItem.joinedBy,
        memberItem.topRole?.label,
      ]
        .map((value) => String(value ?? "").trim().toLowerCase())
        .filter(Boolean);

      return searchableParts.some((value) => value.includes(normalizedQuery));
    });

    return [...filteredMembers].sort((left, right) => {
      const leftServerTime = new Date(left.joinedServerAt ?? left.createdAt ?? 0).getTime() || 0;
      const rightServerTime = new Date(right.joinedServerAt ?? right.createdAt ?? 0).getTime() || 0;
      const leftInAccordTime = new Date(left.joinedInAccordAt ?? left.profile?.createdAt ?? 0).getTime() || 0;
      const rightInAccordTime = new Date(right.joinedInAccordAt ?? right.profile?.createdAt ?? 0).getTime() || 0;
      const leftName = String(left.profile?.name ?? left.profile?.email ?? left.profileId ?? "");
      const rightName = String(right.profile?.name ?? right.profile?.email ?? right.profileId ?? "");
      const leftRole = getMemberTopRoleLabel(left);
      const rightRole = getMemberTopRoleLabel(right);
      const leftJoinedBy = String(left.joinedBy ?? (left.profileId === server?.profileId ? "Server owner" : "Invite link"));
      const rightJoinedBy = String(right.joinedBy ?? (right.profileId === server?.profileId ? "Server owner" : "Invite link"));

      if (sortMode === "joined-server-desc") {
        if (leftServerTime !== rightServerTime) {
          return rightServerTime - leftServerTime;
        }

        return leftName.localeCompare(rightName);
      }

      if (sortMode === "joined-in-accord-asc") {
        if (leftInAccordTime !== rightInAccordTime) {
          return leftInAccordTime - rightInAccordTime;
        }

        return leftName.localeCompare(rightName);
      }

      if (sortMode === "joined-in-accord-desc") {
        if (leftInAccordTime !== rightInAccordTime) {
          return rightInAccordTime - leftInAccordTime;
        }

        return leftName.localeCompare(rightName);
      }

      if (sortMode === "name-asc") {
        return leftName.localeCompare(rightName) || leftServerTime - rightServerTime;
      }

      if (sortMode === "name-desc") {
        return rightName.localeCompare(leftName) || leftServerTime - rightServerTime;
      }

      if (sortMode === "joined-by-asc") {
        return leftJoinedBy.localeCompare(rightJoinedBy) || leftName.localeCompare(rightName) || leftServerTime - rightServerTime;
      }

      if (sortMode === "joined-by-desc") {
        return rightJoinedBy.localeCompare(leftJoinedBy) || leftName.localeCompare(rightName) || leftServerTime - rightServerTime;
      }

      if (sortMode === "role-asc") {
        return leftRole.localeCompare(rightRole) || leftName.localeCompare(rightName) || leftServerTime - rightServerTime;
      }

      if (sortMode === "role-desc") {
        return rightRole.localeCompare(leftRole) || leftName.localeCompare(rightName) || leftServerTime - rightServerTime;
      }

      if (leftServerTime !== rightServerTime) {
        return leftServerTime - rightServerTime;
      }

      return leftName.localeCompare(rightName);
    });
  }, [members, searchQuery, server?.members, server?.profileId, sortMode]);

  const selectedMemberCount = selectedMemberIds.length;
  const totalPages = Math.max(1, Math.ceil(displayedMembers.length / membersPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = displayedMembers.length === 0 ? 0 : (safeCurrentPage - 1) * membersPerPage;
  const pagedMembers = displayedMembers.slice(pageStartIndex, pageStartIndex + membersPerPage);
  const visibleRangeStart = displayedMembers.length === 0 ? 0 : pageStartIndex + 1;
  const visibleRangeEnd = displayedMembers.length === 0 ? 0 : Math.min(pageStartIndex + membersPerPage, displayedMembers.length);
  const assignedRoleIds = useMemo(
    () => new Set((rolesMember?.roles ?? []).filter((role) => role.source === "assigned").map((role) => role.id)),
    [rolesMember?.roles]
  );
  const unassignedServerRoles = useMemo(
    () => availableRoles.filter((role) => !assignedRoleIds.has(role.id)),
    [assignedRoleIds, availableRoles]
  );
  const filteredUnassignedServerRoles = useMemo(() => {
    const normalizedQuery = addRoleSearchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return unassignedServerRoles;
    }

    return unassignedServerRoles.filter((role) => {
      const haystack = [role.name, role.color]
        .map((value) => String(value ?? "").trim().toLowerCase())
        .filter(Boolean)
        .join(" ");

      return haystack.includes(normalizedQuery);
    });
  }, [addRoleSearchQuery, unassignedServerRoles]);
  const filteredMemberRoles = useMemo(() => {
    const normalizedQuery = rolesSearchQuery.trim().toLowerCase();
    const sourceRoles = rolesMember?.roles ?? [];

    if (!normalizedQuery) {
      return sourceRoles;
    }

    return sourceRoles.filter((role) => {
      const haystack = [role.label, role.source]
        .map((value) => String(value ?? "").trim().toLowerCase())
        .filter(Boolean)
        .join(" ");

      return haystack.includes(normalizedQuery);
    });
  }, [rolesMember?.roles, rolesSearchQuery]);
  const sourceMembers = members.length > 0
    ? members
    : ((server?.members ?? []) as MembersModalMember[]);
  const selectedProfileMember = useMemo(
    () => sourceMembers.find((memberItem) => memberItem.id === openProfileMemberId) ?? null,
    [openProfileMemberId, sourceMembers]
  );
  const selectedProfileCard = selectedProfileMember && selectedProfileCardData ? selectedProfileCardData : null;
  const selectedProfileDisplayName = selectedProfileCard?.effectiveProfileName
    || selectedProfileCard?.realName
    || selectedProfileCard?.profileName
    || selectedProfileMember?.profile.name
    || selectedProfileMember?.profile.email
    || "Unknown member";
  const selectedMutualServers = selectedProfileCard?.mutualServers ?? [];
  const selectedMutualFriends = selectedProfileCard?.mutualFriends ?? [];
  const selectedMutualServersCount = selectedMutualServers.length || (typeof selectedProfileCard?.mutualServersCount === "number" ? selectedProfileCard.mutualServersCount : 0);
  const selectedMutualFriendsCount = selectedMutualFriends.length || (typeof selectedProfileCard?.mutualFriendsCount === "number" ? selectedProfileCard.mutualFriendsCount : 0);
  const selectedMutualServersPercent = typeof selectedProfileCard?.mutualServersPercent === "number" ? selectedProfileCard.mutualServersPercent : 0;
  const hasSelectedProfileCardLoadError = Boolean(selectedProfileCardLoadError);
  const isSelectedSelfProfileCard = selectedProfileCard?.directFriendStatus === "self";
  const selectedMutualServersLabel = selectedMutualServersCount > 0
    ? `${selectedMutualServersPercent}% in common · ${selectedMutualServersCount}`
    : "NOT WORKING";
  const selectedMutualFriendsLabel = selectedMutualFriendsCount > 0
    ? `${selectedMutualFriendsCount} in common`
    : "NOT WORKING";
  const selectedDirectFriendRelationshipLabel = selectedProfileCard?.directFriendStatus === "self"
    ? "This is you"
    : selectedProfileCard?.isDirectFriend
      ? "Direct friends"
      : "Not direct friends";

  const fetchMembers = async () => {
    if (!server?.id) {
      setMembers([]);
      return;
    }

    try {
      setIsLoadingMembers(true);
      const response = await axios.get<MembersResponse>(`/api/servers/${server.id}/members`, {
        params: { _t: Date.now() },
      });
      setMembers(Array.isArray(response.data?.members) ? response.data.members : []);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const fetchServerRoles = async () => {
    if (!server?.id) {
      setAvailableRoles([]);
      setCanManageAssignedRoles(false);
      return;
    }

    try {
      setIsLoadingAvailableRoles(true);
      const response = await axios.get<ServerRolesResponse>(`/api/servers/${server.id}/roles`, {
        params: { _t: Date.now() },
      });

      setAvailableRoles(Array.isArray(response.data?.roles) ? response.data.roles : []);
      setCanManageAssignedRoles(Boolean(response.data?.canManageRoles));
    } catch (error) {
      console.error(error);
      setAvailableRoles([]);
      setCanManageAssignedRoles(false);
    } finally {
      setIsLoadingAvailableRoles(false);
    }
  };

  useEffect(() => {
    if (!isModalOpen) {
      setRolesMember(null);
      setAvailableRoles([]);
      setCanManageAssignedRoles(false);
      setIsAddRolesOpen(false);
      setRolesSearchQuery("");
      setAddRoleSearchQuery("");
      setRoleMutationKey("");
      setRoleMutationError("");
      setOpenProfileMemberId(null);
      setOpenMutualDetails(null);
      setSelectedProfileCardData(null);
      setLoadingProfileMemberId(null);
      setSelectedProfileCardLoadError(null);
      setSearchQuery("");
      setSortMode("joined-server-asc");
      setSelectedMemberIds([]);
      setMembersPerPage(25);
      setCurrentPage(1);
      return;
    }

    void fetchMembers();
  }, [isModalOpen, server?.id]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortMode, membersPerPage]);

  useEffect(() => {
    setCurrentPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setSelectedMemberIds((current) => {
      const kickableMemberIds = new Set(
        displayedMembers
          .filter((memberItem) => memberItem.profileId !== server?.profileId)
          .map((memberItem) => memberItem.id)
      );

      return current.filter((memberId) => kickableMemberIds.has(memberId));
    });
  }, [displayedMembers, server?.profileId]);

  useEffect(() => {
    if (!rolesMember) {
      setIsAddRolesOpen(false);
      setRolesSearchQuery("");
      setAddRoleSearchQuery("");
      setRoleMutationKey("");
      setRoleMutationError("");
      return;
    }

    void fetchServerRoles();
  }, [rolesMember?.id, server?.id]);

  useEffect(() => {
    if (!rolesMember) {
      return;
    }

    const sourceMembers = members.length > 0
      ? members
      : ((server?.members ?? []) as MembersModalMember[]);
    const nextRolesMember = sourceMembers.find((memberItem) => memberItem.id === rolesMember.id) ?? null;

    if (!nextRolesMember) {
      setRolesMember(null);
      setIsAddRolesOpen(false);
      setRolesSearchQuery("");
      return;
    }

    if (nextRolesMember !== rolesMember) {
      setRolesMember(nextRolesMember);
    }
  }, [members, rolesMember, server?.members]);

  const kickMemberRequest = async (memberId: string) => {
    const url = qs.stringifyUrl({
      url: `/api/members/${memberId}`,
      query: {
        serverId: server.id,
      }
    });

    await axios.delete(url);
  };

  const onKick = async (memberId: string) => {
    try {
      setLoadingId(memberId);
      await kickMemberRequest(memberId);
      setSelectedMemberIds((current) => current.filter((id) => id !== memberId));
      router.refresh();
      await fetchMembers();
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingId("");
    }
  };

  const onOpenPrivateMessage = (memberId: string) => {
    const normalizedServerId = String(server?.id ?? "").trim();
    const normalizedMemberId = String(memberId ?? "").trim();

    if (!normalizedServerId || !normalizedMemberId) {
      return;
    }

    router.push(`/users?serverId=${encodeURIComponent(normalizedServerId)}&memberId=${encodeURIComponent(normalizedMemberId)}`);
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
    setOpenProfileMemberId(null);
    router.push(`/users?serverId=${encodeURIComponent(normalizedServerId)}&memberId=${encodeURIComponent(normalizedMemberId)}`);
  };

  const onOpenMutualServer = (serverId: string) => {
    const normalizedServerId = String(serverId ?? "").trim();
    if (!normalizedServerId) {
      return;
    }

    setOpenMutualDetails(null);
    setOpenProfileMemberId(null);
    router.push(`/servers/${encodeURIComponent(normalizedServerId)}`);
  };

  const onIgnoreMember = async (profileId: string) => {
    const normalizedProfileId = String(profileId ?? "").trim();
    if (!normalizedProfileId) {
      return;
    }

    try {
      await axios.post("/api/friends/blocked", {
        profileId: normalizedProfileId,
      });
      router.refresh();
      window.alert("User ignored.");
    } catch (error) {
      console.error(error);
      window.alert("Failed to ignore user.");
    }
  };

  const onCopyUserId = async (profileId: string) => {
    const normalizedProfileId = String(profileId ?? "").trim();
    if (!normalizedProfileId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(normalizedProfileId);
      window.alert("User ID copied.");
    } catch (error) {
      console.error(error);
      window.alert("Failed to copy user ID.");
    }
  };

  const onBulkKick = async () => {
    const targetMemberIds = selectedMemberIds.filter((memberId) => memberId.trim().length > 0);
    if (!targetMemberIds.length || isBulkKicking) {
      return;
    }

    try {
      setIsBulkKicking(true);

      for (const memberId of targetMemberIds) {
        await kickMemberRequest(memberId);
      }

      setSelectedMemberIds([]);
      router.refresh();
      await fetchMembers();
    } catch (error) {
      console.error(error);
    } finally {
      setIsBulkKicking(false);
    }
  };

  const onRoleChange = async (memberId: string, role: MemberRole) => {
    try {
      setLoadingId(memberId);

      const url = qs.stringifyUrl({
        url: `/api/members/${memberId}`,
        query: {
          serverId: server.id,
        }
      });

      const response = await axios.patch(url, { role });

      void response;
      router.refresh();
      await fetchMembers();
    } catch (error) {
      console.log(error);
    } finally {
      setLoadingId("");
    }
  };

  const onRemoveAssignedRole = async (roleId: string) => {
    if (!rolesMember || !server?.id || !roleId || roleMutationKey) {
      return;
    }

    try {
      setRoleMutationError("");
      setRoleMutationKey(`remove:${roleId}`);
      await axios.delete(`/api/servers/${server.id}/roles/${roleId}/members`, {
        data: { memberId: rolesMember.id },
      });
      router.refresh();
      await fetchMembers();
    } catch (error) {
      console.error(error);
      setRoleMutationError("Failed to remove role.");
    } finally {
      setRoleMutationKey("");
    }
  };

  const onAddAssignedRole = async (roleId: string) => {
    if (!rolesMember || !server?.id || !roleId || roleMutationKey) {
      return;
    }

    try {
      setRoleMutationError("");
      setRoleMutationKey(`add:${roleId}`);
      await axios.post(`/api/servers/${server.id}/roles/${roleId}/members`, {
        memberId: rolesMember.id,
      });
      router.refresh();
      await fetchMembers();
    } catch (error) {
      console.error(error);
      setRoleMutationError("Failed to add role.");
    } finally {
      setRoleMutationKey("");
    }
  };

  const onProfileClick = async (member: MembersModalMember, nextOpen: boolean) => {
    if (!nextOpen) {
      profileCardRequestSequenceRef.current += 1;
      setOpenMutualDetails(null);
      setSelectedProfileCardData(null);
      setLoadingProfileMemberId(null);
      setSelectedProfileCardLoadError(null);
      setOpenProfileMemberId((current) => current === member.id ? null : current);
      return;
    }

    setOpenProfileMemberId(member.id);
    setOpenMutualDetails(null);
    setSelectedProfileCardData(null);
    setSelectedProfileCardLoadError(null);

    const trimmedProfileId = String(member.profileId ?? "").trim();
    const trimmedMemberId = String(member.id ?? "").trim();
    const trimmedViewerProfileId = String(viewerProfileId ?? "").trim();
    const trimmedViewerMemberId = String(viewerMemberId ?? "").trim();
    if (!trimmedProfileId || !trimmedMemberId || (!trimmedViewerProfileId && !trimmedViewerMemberId)) {
      setSelectedProfileCardData(null);
      setSelectedProfileCardLoadError("Live profile data is unavailable.");
      setLoadingProfileMemberId(null);
      return;
    }

    try {
      const requestSequence = profileCardRequestSequenceRef.current + 1;
      profileCardRequestSequenceRef.current = requestSequence;
      setLoadingProfileMemberId(trimmedMemberId);
      const loadingTimeout = window.setTimeout(() => {
        if (profileCardRequestSequenceRef.current !== requestSequence) {
          return;
        }

        setSelectedProfileCardData(null);
        setSelectedProfileCardLoadError("Live profile data timed out.");
        setLoadingProfileMemberId((current) => current === trimmedMemberId ? null : current);
      }, 5500);

      try {
        const data = await fetchMembersProfileCard({
          profileId: trimmedProfileId,
          memberId: trimmedMemberId,
          viewerProfileId: trimmedViewerProfileId,
          viewerMemberId: trimmedViewerMemberId,
        });
        if (profileCardRequestSequenceRef.current === requestSequence) {
          setSelectedProfileCardData(data);
          setSelectedProfileCardLoadError(null);
        }
      } catch (error) {
        if (profileCardRequestSequenceRef.current === requestSequence) {
          setSelectedProfileCardData(null);
          setSelectedProfileCardLoadError(getProfileCardLoadErrorMessage(error));
        }
      } finally {
        window.clearTimeout(loadingTimeout);
      }
    } finally {
      setLoadingProfileMemberId((current) => current === trimmedMemberId ? null : current);
    }
  };

  const onProfileDialogChange = (open: boolean) => {
    if (!open) {
      profileCardRequestSequenceRef.current += 1;
      setOpenMutualDetails(null);
      setOpenProfileMemberId(null);
      setSelectedProfileCardData(null);
      setLoadingProfileMemberId(null);
      setSelectedProfileCardLoadError(null);
    }
  };

  const onOpenMutualDetails = (type: "servers" | "friends") => {
    if (!selectedProfileMember) {
      return;
    }

    setOpenMutualDetails({ type, memberId: selectedProfileMember.id });
  };

  return (
    <>
      <Dialog open={isModalOpen} onOpenChange={onClose}>
        <DialogContent
          overlayClassName="bg-background"
          className="theme-members-shell grid-rows-[auto_auto_1fr] h-[70vh] max-h-[70vh] w-[min(calc(100vw-2rem),75vw)] max-w-[min(calc(100vw-2rem),75vw)] overflow-hidden border-border text-foreground"
        >
          <DialogHeader className="pt-8 px-6">
            <DialogTitle className="text-2xl text-center font-bold">
              Our Members - {memberCount}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-2 px-6">
            <div className="flex items-center gap-2">
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search members"
                className="theme-members-tile min-w-0 flex-1 border-border text-foreground placeholder:text-muted-foreground"
                disabled={isLoadingMembers || isBulkKicking}
              />
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as MembersSortMode)}
                className="theme-members-tile h-10 w-40 shrink-0 rounded-md border border-border px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-48 lg:w-56"
                disabled={isLoadingMembers || isBulkKicking}
                aria-label="Sort members"
              >
                <option value="joined-server-asc">Joined server: oldest first</option>
                <option value="joined-server-desc">Joined server: newest first</option>
                <option value="joined-in-accord-asc">Joined In-Accord: oldest first</option>
                <option value="joined-in-accord-desc">Joined In-Accord: newest first</option>
                <option value="joined-by-asc">Joined by A-Z</option>
                <option value="joined-by-desc">Joined by Z-A</option>
                <option value="name-asc">Name A-Z</option>
                <option value="name-desc">Name Z-A</option>
                <option value="role-asc">Role A-Z</option>
                <option value="role-desc">Role Z-A</option>
              </select>
              <select
                value={membersPerPage}
                onChange={(event) => setMembersPerPage(Number(event.target.value) as (typeof MEMBERS_PAGE_SIZE_OPTIONS)[number])}
                className="theme-members-tile h-10 w-24 shrink-0 rounded-md border border-border px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-28"
                disabled={isLoadingMembers || isBulkKicking}
                aria-label="Members per page"
              >
                {MEMBERS_PAGE_SIZE_OPTIONS.map((pageSizeOption) => (
                  <option key={pageSizeOption} value={pageSizeOption}>{pageSizeOption}/page</option>
                ))}
              </select>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => void onBulkKick()}
                disabled={selectedMemberCount === 0 || isLoadingMembers || isBulkKicking}
                className="shrink-0 whitespace-nowrap"
              >
                {isBulkKicking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gavel className="mr-2 h-4 w-4" />}
                Bulk KICK
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedMemberCount > 0
                ? `${selectedMemberCount} member${selectedMemberCount === 1 ? "" : "s"} selected`
                : "Search, sort, then select members with the checkboxes to bulk kick."}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <p>
                Showing {visibleRangeStart}-{visibleRangeEnd} of {displayedMembers.length} member{displayedMembers.length === 1 ? "" : "s"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
                  disabled={isLoadingMembers || safeCurrentPage <= 1}
                  className="h-8 px-3"
                >
                  Prev
                </Button>
                <span>
                  Page {safeCurrentPage} of {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((current) => Math.min(totalPages, current + 1))}
                  disabled={isLoadingMembers || safeCurrentPage >= totalPages}
                  className="h-8 px-3"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>

          <ScrollArea className="mt-6 min-h-0 px-6 pb-6">
          {isLoadingMembers ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading members...
            </div>
          ) : null}

          {!isLoadingMembers && displayedMembers.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No members match your search.
            </div>
          ) : null}

          {!isLoadingMembers && displayedMembers.length > 0 ? (
            <div className="w-full min-w-0 pb-2">
              <div className="theme-members-card sticky top-0 z-10 mb-3 grid w-full min-w-0 grid-cols-[28px_minmax(0,2.15fr)_minmax(0,0.9fr)_minmax(0,0.95fr)_minmax(0,1.05fr)_minmax(0,1fr)_56px] items-center gap-2 rounded-xl border border-border px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground shadow-sm">
                <span>Select</span>
                <button
                  type="button"
                  onClick={() => toggleSortMode("name-asc", "name-desc")}
                  className="flex min-w-0 items-center gap-1 text-left transition hover:text-foreground"
                  aria-label="Sort by member"
                >
                  <span className="truncate">Member</span>
                  <span aria-hidden="true">{getSortIndicator(sortMode, "name-asc", "name-desc")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSortMode("joined-server-asc", "joined-server-desc")}
                  className="flex min-w-0 items-center gap-1 text-left transition hover:text-foreground"
                  aria-label="Sort by joined server"
                >
                  <span className="truncate">Joined server</span>
                  <span aria-hidden="true">{getSortIndicator(sortMode, "joined-server-asc", "joined-server-desc")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSortMode("joined-in-accord-asc", "joined-in-accord-desc")}
                  className="flex min-w-0 items-center gap-1 text-left transition hover:text-foreground"
                  aria-label="Sort by joined In-Accord"
                >
                  <span className="truncate">Joined In-Accord</span>
                  <span aria-hidden="true">{getSortIndicator(sortMode, "joined-in-accord-asc", "joined-in-accord-desc")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSortMode("joined-by-asc", "joined-by-desc")}
                  className="flex min-w-0 items-center gap-1 text-left transition hover:text-foreground"
                  aria-label="Sort by joined by"
                >
                  <span className="truncate">Joined by</span>
                  <span aria-hidden="true">{getSortIndicator(sortMode, "joined-by-asc", "joined-by-desc")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSortMode("role-asc", "role-desc")}
                  className="flex min-w-0 items-center gap-1 text-left transition hover:text-foreground"
                  aria-label="Sort by role"
                >
                  <span className="truncate">Roles</span>
                  <span aria-hidden="true">{getSortIndicator(sortMode, "role-asc", "role-desc")}</span>
                </button>
                <span className="text-right">Actions</span>
              </div>

              <div className="space-y-3">

          {pagedMembers.map((member) => {
            const topRoleLabel = getMemberTopRoleLabel(member);
            const roleCount = Array.isArray(member.roles) ? member.roles.length : 0;
            const isKickableMember = member.profileId !== server.profileId;
            const isSelected = selectedMemberIds.includes(member.id);

            return (
            <div
              key={member.id}
              className="theme-members-card grid w-full min-w-0 grid-cols-[28px_minmax(0,2.15fr)_minmax(0,0.9fr)_minmax(0,0.95fr)_minmax(0,1.05fr)_minmax(0,1fr)_56px] items-center gap-2 rounded-xl border border-border px-3 py-3 shadow-sm"
            >
              <div className="flex items-center justify-center">
                <label className="mt-1 flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={!isKickableMember || isBulkKicking || loadingId === member.id}
                    onChange={(event) => {
                      setSelectedMemberIds((current) => {
                        if (event.target.checked) {
                          return current.includes(member.id) ? current : [...current, member.id];
                        }

                        return current.filter((id) => id !== member.id);
                      });
                    }}
                    className="theme-members-tile h-4 w-4 rounded border-border text-rose-600 focus:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Select ${member.profile.name} for bulk kick`}
                  />
                </label>
              </div>

              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => void onProfileClick(member, true)}
                  className="flex min-w-0 flex-1 items-start gap-x-2 rounded-md text-left transition hover:bg-accent/40"
                  aria-label={`Open profile for ${member.profile.name}`}
                  title={`View ${member.profile.name}'s profile`}
                >
                  <UserAvatar src={member.profile.imageUrl} />
                  <div className="min-w-0 flex-1 flex flex-col gap-y-1">
                    <div className="flex items-center gap-x-1 text-xs font-semibold">
                      <ProfileNameWithServerTag
                        name={member.profile.name}
                        profileId={member.profileId}
                        memberId={member.id}
                      />
                      <NewUserCloverBadge createdAt={member.profile.createdAt} className="text-xs" />
                      {isBotUser({ name: member.profile.name, email: member.profile.email }) ? (
                        <BotAppBadge className="h-4 px-1 text-[9px]" />
                      ) : null}
                      {roleIconMap[member.role]}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{member.profile.email}</p>
                  </div>
                </button>
              </div>

              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">{formatDate(member.joinedServerAt ?? member.createdAt)}</p>
              </div>

              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">{formatDate(member.joinedInAccordAt ?? member.profile.createdAt)}</p>
              </div>

              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">{member.joinedBy ?? (member.profileId === server.profileId ? "Server owner" : "Invite link")}</p>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRolesMember(member)}
                    className="theme-members-tile inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
                    title="Show full role list"
                    aria-label={`Show all roles for ${member.profile.name}`}
                  >
                    <List className="h-3.5 w-3.5" />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">{topRoleLabel}</p>
                    <p className="text-[10px] text-muted-foreground">{roleCount} role{roleCount === 1 ? "" : "s"}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end">
                {server.profileId !== member.profileId &&
                loadingId !== member.id && (
                  <div className="flex items-center justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        <button
                          type="button"
                          className="theme-members-tile inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
                          aria-label={`More actions for ${member.profile.name}`}
                          title={`More actions for ${member.profile.name}`}
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="left">
                        <DropdownMenuItem onClick={() => onOpenPrivateMessage(member.id)}>
                          <MessageCircle className="h-4 w-4 mr-2" />
                          PM
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void onIgnoreMember(member.profileId)}>
                          <UserX className="h-4 w-4 mr-2" />
                          Ignore
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void onCopyUserId(member.profileId)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy User ID
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onKick(member.id)}>
                          <Gavel className="h-4 w-4 mr-2" />
                          Kick
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled>
                          <ShieldAlert className="h-4 w-4 mr-2" />
                          Ban
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled>
                          <Clock3 className="h-4 w-4 mr-2" />
                          Time out
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className="flex items-center">
                            <ShieldQuestion className="h-4 w-4 mr-2" />
                            <span>Role</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuPortal>
                            <DropdownMenuSubContent>
                              <DropdownMenuItem onClick={() => onRoleChange(member.id, MemberRole.GUEST)}>
                                <Shield className="h-4 w-4 mr-2" />
                                Guest
                                {member.role == "GUEST" && (
                                  <Check className="h-4 w-4 ml-auto" />
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onRoleChange(member.id, MemberRole.MODERATOR)}>
                                <ShieldCheck className="h-4 w-4 mr-2" />
                                Moderator
                                {member.role == "MODERATOR" && (
                                  <Check className="h-4 w-4 ml-auto" />
                                )}
                              </DropdownMenuItem>
                            </DropdownMenuSubContent>
                          </DropdownMenuPortal>
                        </DropdownMenuSub>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
                {loadingId === member.id && (
                  <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
          )})}
              </div>
            </div>
          ) : null}
          </ScrollArea>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(openProfileMemberId && selectedProfileMember)} onOpenChange={onProfileDialogChange}>
        <DialogContent
          overlayClassName="bg-background"
          className="theme-members-shell w-[min(32rem,calc(100vw-2rem))] max-w-[min(32rem,calc(100vw-2rem))] overflow-hidden border-border p-0 text-foreground"
        >
          {selectedProfileMember ? (
            <ScrollArea className="max-h-[calc(100vh-2rem)]">
              <DialogHeader className="sr-only">
                <DialogTitle>Member Profile</DialogTitle>
                <DialogDescription>Profile details, mutual servers, and mutual friends.</DialogDescription>
              </DialogHeader>
              <div className="relative overflow-hidden">
                <ProfileEffectLayer src={selectedProfileCard?.effectiveProfileEffectUrl ?? selectedProfileCard?.profileEffectUrl ?? null} />
                <div className="relative h-28 bg-linear-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
                  {selectedProfileCard?.effectiveBannerUrl || selectedProfileCard?.bannerUrl ? (
                    <img
                      src={selectedProfileCard?.effectiveBannerUrl ?? selectedProfileCard?.bannerUrl ?? undefined}
                      alt="User banner"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
              </div>

              <div className="relative p-4 pt-12">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Member profile
                </p>
                <div className="absolute -top-12 left-4 rounded-full border-4 border-background">
                  <UserAvatar
                    src={selectedProfileCard?.effectiveImageUrl || selectedProfileCard?.imageUrl || selectedProfileMember.profile.imageUrl}
                    decorationSrc={selectedProfileCard?.effectiveAvatarDecorationUrl ?? selectedProfileCard?.avatarDecorationUrl ?? undefined}
                    className="h-24 w-24"
                  />
                </div>

                <div className="min-w-0">
                  <div className="flex w-full min-w-0 items-start gap-1.5">
                    <ProfileNameWithServerTag
                      name={selectedProfileDisplayName}
                      profileId={selectedProfileMember.profileId}
                      memberId={selectedProfileMember.id}
                      pronouns={selectedProfileCard?.pronouns?.trim() || null}
                      disableCardFetch
                      containerClassName="w-full min-w-0"
                      nameClassName="text-base font-bold text-foreground"
                    />
                  </div>
                </div>

                <div className="theme-members-tile mt-3 h-40 w-full overflow-y-auto rounded-md border border-border px-3 py-2.5">
                  <p
                    className="whitespace-pre-wrap text-[11px] text-foreground"
                    style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                  >
                    {loadingProfileMemberId === selectedProfileMember.id
                      ? "Loading profile..."
                      : selectedProfileCard?.comment?.trim() || "No comment set"}
                  </p>
                </div>

                <div className="theme-members-tile mt-3 rounded-lg border border-border p-3 text-xs">
                  <div className="space-y-1 text-foreground">
                    <p>Name: {selectedProfileDisplayName}</p>
                    <p>Pronouns: {selectedProfileCard?.pronouns || "Not set"}</p>
                    <p>Email: {selectedProfileCard?.email || selectedProfileMember.profile.email || "N/A"}</p>
                    <p>Role: {selectedProfileCard?.role || getMemberTopRoleLabel(selectedProfileMember)}</p>
                    <p>Joined In-Accord: {formatDate(selectedProfileCard?.createdAt ?? selectedProfileMember.profile.createdAt)}</p>
                    <p>Last Logon: {formatDate(selectedProfileCard?.lastLogonAt ?? null)}</p>
                  </div>
                </div>

                <div className={`mt-3 grid gap-2 ${isSelectedSelfProfileCard ? "grid-cols-1" : "grid-cols-2"}`}>
                  <div className="theme-members-tile col-span-2 rounded-lg border border-border px-3 py-2 text-xs text-foreground">
                    <span className="font-medium">Relationship: </span>
                    <span className="text-muted-foreground">
                      {loadingProfileMemberId === selectedProfileMember.id
                        ? "Loading..."
                        : hasSelectedProfileCardLoadError
                          ? selectedProfileCardLoadError
                          : selectedDirectFriendRelationshipLabel}
                    </span>
                  </div>
                  {!isSelectedSelfProfileCard ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onOpenMutualDetails("servers")}
                        disabled={loadingProfileMemberId === selectedProfileMember.id || hasSelectedProfileCardLoadError}
                        className="theme-members-tile flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-xs text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Network className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="font-medium">Mutual servers</p>
                          <p className="text-muted-foreground">
                            {loadingProfileMemberId === selectedProfileMember.id
                              ? "Loading..."
                              : hasSelectedProfileCardLoadError
                                ? selectedProfileCardLoadError
                                : selectedMutualServersLabel}
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenMutualDetails("friends")}
                        disabled={loadingProfileMemberId === selectedProfileMember.id || hasSelectedProfileCardLoadError}
                        className="theme-members-tile flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-xs text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="font-medium">Mutual friends</p>
                          <p className="text-muted-foreground">
                            {loadingProfileMemberId === selectedProfileMember.id
                              ? "Loading..."
                              : hasSelectedProfileCardLoadError
                                ? selectedProfileCardLoadError
                                : selectedMutualFriendsLabel}
                          </p>
                        </div>
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </ScrollArea>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(openMutualDetails && selectedProfileMember)} onOpenChange={(open) => {
        if (!open) {
          setOpenMutualDetails(null);
        }
      }}>
        <DialogContent
          overlayClassName="bg-background"
          className="theme-members-shell max-w-lg overflow-hidden border-border text-foreground"
        >
          <DialogHeader className="pt-8 px-6">
            <DialogTitle className="text-xl text-center font-bold">
              {openMutualDetails?.type === "servers" ? "Mutual Servers" : "Mutual Friends"}
            </DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              Shared with {selectedProfileDisplayName}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[min(60vh,28rem)] px-6 pb-6">
            <div className="space-y-2">
              {openMutualDetails?.type === "servers" ? (
                selectedMutualServers.length ? selectedMutualServers.map((serverItem) => (
                  <button
                    key={serverItem.id}
                    type="button"
                    onClick={() => onOpenMutualServer(serverItem.id)}
                    className="theme-members-card flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left transition hover:bg-accent hover:text-accent-foreground"
                  >
                    <img
                      src={serverItem.imageUrl}
                      alt={serverItem.name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{serverItem.name}</p>
                    </div>
                  </button>
                )) : (
                  <div className="theme-members-card rounded-lg border border-border px-3 py-4 text-sm text-muted-foreground">
                    No mutual servers found.
                  </div>
                )
              ) : (
                selectedMutualFriends.length ? selectedMutualFriends.map((friendItem) => (
                  <button
                    key={friendItem.profileId}
                    type="button"
                    onClick={() => onOpenPrivateMessageByRoute({
                      serverId: friendItem.serverId,
                      memberId: friendItem.memberId,
                    })}
                    disabled={!friendItem.serverId || !friendItem.memberId}
                    className="theme-members-card flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <UserAvatar src={friendItem.imageUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{friendItem.displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">{friendItem.email || friendItem.profileId}</p>
                    </div>
                  </button>
                )) : (
                  <div className="theme-members-card rounded-lg border border-border px-3 py-4 text-sm text-muted-foreground">
                    No mutual friends found.
                  </div>
                )
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(rolesMember)} onOpenChange={(open) => {
        if (!open) {
          setRolesMember(null);
          setIsAddRolesOpen(false);
          setRolesSearchQuery("");
          setAddRoleSearchQuery("");
        }
      }}>
        <DialogContent
          overlayClassName="bg-background"
          className="theme-members-shell max-w-lg overflow-hidden border-border text-foreground"
        >
          <DialogHeader className="pt-8 px-6">
            <DialogTitle className="text-xl text-center font-bold">
              {rolesMember?.profile.name} Roles
            </DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              Full role list for this member
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-3 px-6">
            <p className="text-xs text-muted-foreground">
              Manage assigned server roles for this member.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => setIsAddRolesOpen(true)}
              disabled={!canManageAssignedRoles || isLoadingAvailableRoles || Boolean(roleMutationKey)}
              className="shrink-0"
            >
              {isLoadingAvailableRoles ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add Roles
            </Button>
          </div>
          {roleMutationError ? (
            <p className="px-6 text-xs font-medium text-rose-500">{roleMutationError}</p>
          ) : null}
          <div className="px-6">
            <Input
              value={rolesSearchQuery}
              onChange={(event) => setRolesSearchQuery(event.target.value)}
              placeholder="Search member roles"
              className="theme-members-tile min-w-0 w-full border-border text-foreground placeholder:text-muted-foreground"
              disabled={Boolean(roleMutationKey)}
            />
          </div>
          <ScrollArea className="max-h-[50vh] px-6 pb-4">
            <div className="space-y-2">
              {filteredMemberRoles.length ? filteredMemberRoles.map((role) => (
                <div key={role.id} className="theme-members-card flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{role.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="theme-members-tile rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {role.source}
                    </span>
                    {canManageAssignedRoles && role.source === "assigned" ? (
                      <button
                        type="button"
                        onClick={() => void onRemoveAssignedRole(role.id)}
                        disabled={Boolean(roleMutationKey)}
                        className="theme-members-tile inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        title={`Remove ${role.label}`}
                        aria-label={`Remove ${role.label}`}
                      >
                        {roleMutationKey === `remove:${role.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      </button>
                    ) : null}
                  </div>
                </div>
              )) : (
                <div className="theme-members-card rounded-lg border border-border px-3 py-4 text-sm text-muted-foreground">
                  {(rolesMember?.roles ?? []).length
                    ? "No roles match your search."
                    : "No roles found."}
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter className="px-6 pb-6">
            <button
              type="button"
              onClick={() => setRolesMember(null)}
              className="theme-members-tile inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold text-foreground transition hover:bg-accent hover:text-accent-foreground"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(rolesMember) && isAddRolesOpen} onOpenChange={setIsAddRolesOpen}>
        <DialogContent
          overlayClassName="bg-background"
          className="theme-members-shell max-w-lg overflow-hidden border-border text-foreground"
        >
          <DialogHeader className="pt-8 px-6">
            <DialogTitle className="text-xl text-center font-bold">
              Add Roles for {rolesMember?.profile.name}
            </DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              Select a server role to assign from the list below.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6">
            <Input
              value={addRoleSearchQuery}
              onChange={(event) => setAddRoleSearchQuery(event.target.value)}
              placeholder="Search available roles"
              className="theme-members-tile min-w-0 w-full border-border text-foreground placeholder:text-muted-foreground"
              disabled={isLoadingAvailableRoles || Boolean(roleMutationKey)}
            />
          </div>
          <ScrollArea className="max-h-[50vh] px-6 pb-4">
            <div className="space-y-2">
              {filteredUnassignedServerRoles.length ? filteredUnassignedServerRoles.map((role) => (
                <div key={role.id} className="theme-members-card flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
                        style={{ backgroundColor: role.color }}
                      />
                      <span className="truncate text-sm font-medium text-foreground">{role.name}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {role.memberCount} member{role.memberCount === 1 ? "" : "s"} currently assigned
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void onAddAssignedRole(role.id)}
                    disabled={Boolean(roleMutationKey)}
                    className="shrink-0"
                  >
                    {roleMutationKey === `add:${role.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Add
                  </Button>
                </div>
              )) : (
                <div className="theme-members-card rounded-lg border border-border px-3 py-4 text-sm text-muted-foreground">
                  {unassignedServerRoles.length
                    ? "No roles match your search."
                    : "No more server roles are available to add for this member."}
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter className="px-6 pb-6">
            <button
              type="button"
              onClick={() => setIsAddRolesOpen(false)}
              className="theme-members-tile inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold text-foreground transition hover:bg-accent hover:text-accent-foreground"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
