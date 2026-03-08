"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Crown, Eye, EyeOff, Flag, Link2, ScrollText, ShieldAlert, ShieldCheck, Smile, Sticker, Trash2, Webhook, Wrench } from "lucide-react";
import Image from "next/image";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BotAppBadge } from "@/components/bot-app-badge";
import { ModeratorLineIcon } from "@/components/moderator-line-icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProfileNameWithServerTag } from "@/components/profile-name-with-server-tag";
import { ProfileIconRow } from "@/components/profile-icon-row";
import { ServerProfilePopover } from "@/components/modals/server-profile-popover";
import { UserAvatar } from "@/components/user-avatar";
import { useModal } from "@/hooks/use-modal-store";
import { getInAccordStaffLabel, isInAccordAdministrator, isInAccordDeveloper, isInAccordModerator } from "@/lib/in-accord-admin";
import { resolveProfileIcons } from "@/lib/profile-icons";
import { isBotUser } from "@/lib/is-bot-user";
import { normalizePresenceStatus, presenceStatusLabelMap } from "@/lib/presence-status";
import { cn } from "@/lib/utils";

type AdminSection =
  | "general"
  | "members"
  | "servers"
  | "serverTags"
  | "reported"
  | "moderation"
  | "roles"
  | "auditLog"
  | "invites"
  | "emojiStickers"
  | "webhooks"
  | "security"
  | "integrations";

type AdminUser = {
  id: string;
  userId: string;
  name: string;
  profileName: string | null;
  pronouns: string | null;
  comment: string | null;
  bannerUrl: string | null;
  presenceStatus: string;
  email: string;
  role: string;
  phoneNumber: string;
  dateOfBirth: string | null;
  imageUrl: string;
  joinedAt: string | null;
  lastLogin: string | null;
  ownedServerCount: number;
  joinedServerCount: number;
};

type AdminServer = {
  id: string;
  name: string;
  imageUrl: string;
  bannerUrl: string | null;
  inviteCode: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  createdAt: string | null;
  updatedAt: string | null;
  memberCount: number;
  channelCount: number;
};

type AdminServerTag = {
  serverId: string;
  serverName: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  tagCode: string | null;
  iconKey: string | null;
  iconEmoji: string;
  selectedProfileCount: number;
};

type ServerTagIconOption = {
  key: string;
  label: string;
  emoji: string;
};

type AdminSecuritySummary = {
  totalUsers: number;
  adminUsers: number;
  neverLoggedIn: number;
  inactive30d: number;
  serversWithoutValidOwner: number;
};

type AdminRecentLogin = {
  userId: string;
  name: string;
  email: string;
  role: string;
  lastLogin: string | null;
};

type AdminIntegrationsSummary = {
  usersWithConnections: number;
  totalLinkedAccounts: number;
};

type AdminIntegrationProvider = {
  key: string;
  connectedUsers: number;
};

type AdminTopConnectedUser = {
  userId: string;
  providers: string[];
  count: number;
};

type AdminReport = {
  id: string;
  reporterProfileId: string;
  reporterName: string;
  reporterEmail: string;
  targetType: "USER" | "SERVER" | "MESSAGE";
  targetId: string;
  targetName: string;
  reason: string;
  details: string;
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";
  adminNote: string;
  assignedAdminProfileId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type AdminEmojiStickerServer = {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  assetCount: number;
  emojiCount: number;
  stickerCount: number;
  activeCount: number;
};

type AdminEmojiStickerAsset = {
  id: string;
  serverId: string;
  serverName: string;
  assetType: "EMOJI" | "STICKER";
  name: string;
  emoji: string | null;
  imageUrl: string | null;
  isEnabled: boolean;
  createdByProfileId: string | null;
  createdByName: string;
  createdAt: string | null;
  updatedAt: string | null;
};

type AdminEmojiStickerSummary = {
  totalAssets: number;
  emojiAssets: number;
  stickerAssets: number;
  activeAssets: number;
};

const normalizeAdminRoleForDisplay = (role: string | null | undefined) => {
  const normalized = String(role ?? "USER").trim().toUpperCase();

  if (
    normalized === "ADMIN" ||
    normalized === "ADMINISTRATOR" ||
    normalized === "IN-ACCORD ADMINISTRATOR" ||
    normalized === "IN_ACCORD_ADMINISTRATOR"
  ) {
    return "ADMINISTRATOR";
  }

  if (
    normalized === "DEVELOPER" ||
    normalized === "IN-ACCORD DEVELOPER" ||
    normalized === "IN_ACCORD_DEVELOPER"
  ) {
    return "DEVELOPER";
  }

  if (
    normalized === "MODERATOR" ||
    normalized === "IN-ACCORD MODERATOR" ||
    normalized === "IN_ACCORD_MODERATOR" ||
    normalized === "MOD"
  ) {
    return "MODERATOR";
  }

  return "USER";
};

const getAdminRoleIcon = (role: string | null | undefined, className = "h-3.5 w-3.5") => {
  const normalizedRole = normalizeAdminRoleForDisplay(role);

  if (normalizedRole === "ADMINISTRATOR") {
    return <Crown className={`${className} shrink-0 text-rose-500`} aria-label="Administrator" />;
  }

  if (normalizedRole === "DEVELOPER") {
    return <Wrench className={`${className} shrink-0 text-cyan-400`} aria-label="Developer" />;
  }

  if (normalizedRole === "MODERATOR") {
    return <ModeratorLineIcon className={`${className} shrink-0 text-indigo-500`} aria-label="Moderator" />;
  }

  return null;
};

export const InAccordAdminModal = () => {
  const { isOpen, onClose, type, data } = useModal();
  const [activeSection, setActiveSection] = useState<AdminSection>("general");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [servers, setServers] = useState<AdminServer[]>([]);
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [serversError, setServersError] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberRoleFilter, setMemberRoleFilter] = useState("ALL");
  const [serverSearch, setServerSearch] = useState("");
  const [serverOwnerFilter, setServerOwnerFilter] = useState("ALL");
  const [serverTags, setServerTags] = useState<AdminServerTag[]>([]);
  const [serverTagIconOptions, setServerTagIconOptions] = useState<ServerTagIconOption[]>([]);
  const [serverTagsError, setServerTagsError] = useState<string | null>(null);
  const [isLoadingServerTags, setIsLoadingServerTags] = useState(false);
  const [serverTagSearch, setServerTagSearch] = useState("");
  const [serverTagOwnerFilter, setServerTagOwnerFilter] = useState("ALL");
  const [serverTagDrafts, setServerTagDrafts] = useState<
    Record<string, { tagCode: string; iconKey: string }>
  >({});
  const [savingServerTagServerId, setSavingServerTagServerId] = useState<string | null>(null);
  const [serverTagsActionError, setServerTagsActionError] = useState<string | null>(null);
  const [serverTagsActionSuccess, setServerTagsActionSuccess] = useState<string | null>(null);
  const [columnWidths, setColumnWidths] = useState([320, 210, 230, 220, 100, 100]);
  const [serverColumnWidths, setServerColumnWidths] = useState([240, 220, 220, 180, 110, 110]);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [newUserRole, setNewUserRole] = useState("USER");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [createUserSuccess, setCreateUserSuccess] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [updatingUserRoleId, setUpdatingUserRoleId] = useState<string | null>(null);
  const [updatingUserDetailsId, setUpdatingUserDetailsId] = useState<string | null>(null);
  const [userRoleDrafts, setUserRoleDrafts] = useState<Record<string, string>>({});
  const [userPhoneDrafts, setUserPhoneDrafts] = useState<Record<string, string>>({});
  const [userDateOfBirthDrafts, setUserDateOfBirthDrafts] = useState<Record<string, string>>({});
  const [securitySummary, setSecuritySummary] = useState<AdminSecuritySummary | null>(null);
  const [securityRecentLogins, setSecurityRecentLogins] = useState<AdminRecentLogin[]>([]);
  const [isLoadingSecurity, setIsLoadingSecurity] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [integrationsSummary, setIntegrationsSummary] = useState<AdminIntegrationsSummary | null>(null);
  const [integrationProviders, setIntegrationProviders] = useState<AdminIntegrationProvider[]>([]);
  const [topConnectedUsers, setTopConnectedUsers] = useState<AdminTopConnectedUser[]>([]);
  const [isLoadingIntegrations, setIsLoadingIntegrations] = useState(false);
  const [integrationsError, setIntegrationsError] = useState<string | null>(null);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [reportStatusFilter, setReportStatusFilter] = useState<"ALL" | AdminReport["status"]>("ALL");
  const [reportTargetTypeFilter, setReportTargetTypeFilter] = useState<"ALL" | "USER" | "SERVER" | "MESSAGE">("ALL");
  const [updatingReportId, setUpdatingReportId] = useState<string | null>(null);
  const [emojiStickerServers, setEmojiStickerServers] = useState<AdminEmojiStickerServer[]>([]);
  const [emojiStickerAssets, setEmojiStickerAssets] = useState<AdminEmojiStickerAsset[]>([]);
  const [emojiStickerSummary, setEmojiStickerSummary] = useState<AdminEmojiStickerSummary | null>(null);
  const [emojiStickerServerFilter, setEmojiStickerServerFilter] = useState("ALL");
  const [emojiStickerTypeFilter, setEmojiStickerTypeFilter] = useState<"ALL" | "EMOJI" | "STICKER">("ALL");
  const [emojiStickerStatusFilter, setEmojiStickerStatusFilter] = useState<"ALL" | "ACTIVE" | "DISABLED">("ALL");
  const [isLoadingEmojiStickers, setIsLoadingEmojiStickers] = useState(false);
  const [emojiStickersError, setEmojiStickersError] = useState<string | null>(null);
  const [emojiStickerActionSuccess, setEmojiStickerActionSuccess] = useState<string | null>(null);
  const [creatingEmojiSticker, setCreatingEmojiSticker] = useState(false);
  const [emojiStickerActionItemId, setEmojiStickerActionItemId] = useState<string | null>(null);
  const [newEmojiStickerServerId, setNewEmojiStickerServerId] = useState("");
  const [newEmojiStickerType, setNewEmojiStickerType] = useState<"EMOJI" | "STICKER">("EMOJI");
  const [newEmojiStickerName, setNewEmojiStickerName] = useState("");
  const [newEmojiStickerValue, setNewEmojiStickerValue] = useState("");


  const isModalOpen = isOpen && type === "inAccordAdmin";

  const loadUsers = async () => {
    try {
      setIsLoadingUsers(true);
      setUsersError(null);

      const response = await fetch("/api/admin/users", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load users (${response.status})`);
      }

      const payload = (await response.json()) as { users?: AdminUser[] };
      const nextUsers = payload.users ?? [];
      setUsers(nextUsers);
      setUserRoleDrafts(
        nextUsers.reduce<Record<string, string>>((acc, user) => {
          acc[user.userId] = normalizeAdminRoleForDisplay(user.role);
          return acc;
        }, {})
      );
      setUserPhoneDrafts(
        nextUsers.reduce<Record<string, string>>((acc, user) => {
          acc[user.userId] = user.phoneNumber ?? "";
          return acc;
        }, {})
      );
      setUserDateOfBirthDrafts(
        nextUsers.reduce<Record<string, string>>((acc, user) => {
          acc[user.userId] = user.dateOfBirth ?? "";
          return acc;
        }, {})
      );
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_USERS_LOAD]", error);
      setUsersError("Unable to load users right now.");
      setUsers([]);
      setUserRoleDrafts({});
      setUserPhoneDrafts({});
      setUserDateOfBirthDrafts({});
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (!isModalOpen || (activeSection !== "members" && activeSection !== "roles")) {
      return;
    }

    loadUsers();
  }, [activeSection, isModalOpen]);

  const loadServerTags = async () => {
    try {
      setIsLoadingServerTags(true);
      setServerTagsError(null);

      const response = await fetch("/api/admin/server-tags", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load server tags (${response.status})`);
      }

      const payload = (await response.json()) as {
        serverTags?: AdminServerTag[];
        iconOptions?: ServerTagIconOption[];
      };

      const rows = payload.serverTags ?? [];
      const iconOptions = payload.iconOptions ?? [];
      const fallbackIconKey = iconOptions[0]?.key ?? "";

      const drafts: Record<string, { tagCode: string; iconKey: string }> = {};
      rows.forEach((item) => {
        drafts[item.serverId] = {
          tagCode: item.tagCode ?? "",
          iconKey: item.iconKey ?? fallbackIconKey,
        };
      });

      setServerTags(rows);
      setServerTagIconOptions(iconOptions);
      setServerTagDrafts(drafts);
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_SERVER_TAGS_LOAD]", error);
      setServerTagsError("Unable to load server tags right now.");
      setServerTags([]);
      setServerTagIconOptions([]);
      setServerTagDrafts({});
    } finally {
      setIsLoadingServerTags(false);
    }
  };

  useEffect(() => {
    if (!isModalOpen || activeSection !== "serverTags") {
      return;
    }

    void loadServerTags();
  }, [activeSection, isModalOpen]);

  const loadSecurity = useCallback(async () => {
    try {
      setIsLoadingSecurity(true);
      setSecurityError(null);

      const response = await fetch("/api/admin/security", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load security insights (${response.status})`);
      }

      const payload = (await response.json()) as {
        summary?: AdminSecuritySummary;
        recentLogins?: AdminRecentLogin[];
      };

      setSecuritySummary(payload.summary ?? null);
      setSecurityRecentLogins(payload.recentLogins ?? []);
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_SECURITY_LOAD]", error);
      setSecuritySummary(null);
      setSecurityRecentLogins([]);
      setSecurityError("Unable to load security insights right now.");
    } finally {
      setIsLoadingSecurity(false);
    }
  }, []);

  const loadIntegrations = useCallback(async () => {
    try {
      setIsLoadingIntegrations(true);
      setIntegrationsError(null);

      const response = await fetch("/api/admin/integrations", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load integrations insights (${response.status})`);
      }

      const payload = (await response.json()) as {
        summary?: AdminIntegrationsSummary;
        providers?: AdminIntegrationProvider[];
        topConnectedUsers?: AdminTopConnectedUser[];
      };

      setIntegrationsSummary(payload.summary ?? null);
      setIntegrationProviders(payload.providers ?? []);
      setTopConnectedUsers(payload.topConnectedUsers ?? []);
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_INTEGRATIONS_LOAD]", error);
      setIntegrationsSummary(null);
      setIntegrationProviders([]);
      setTopConnectedUsers([]);
      setIntegrationsError("Unable to load integrations insights right now.");
    } finally {
      setIsLoadingIntegrations(false);
    }
  }, []);

  const loadReports = useCallback(async () => {
    try {
      setIsLoadingReports(true);
      setReportsError(null);

      const query = new URLSearchParams();
      query.set("status", reportStatusFilter);
      query.set("targetType", reportTargetTypeFilter);

      const response = await fetch(`/api/admin/reports?${query.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load reports (${response.status})`);
      }

      const payload = (await response.json()) as { reports?: AdminReport[] };
      setReports(payload.reports ?? []);
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_REPORTS_LOAD]", error);
      setReports([]);
      setReportsError("Unable to load reports right now.");
    } finally {
      setIsLoadingReports(false);
    }
  }, [reportStatusFilter, reportTargetTypeFilter]);

  const loadServers = useCallback(async () => {
    try {
      setIsLoadingServers(true);
      setServersError(null);

      const response = await fetch("/api/admin/servers", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load servers (${response.status})`);
      }

      const payload = (await response.json()) as { servers?: AdminServer[] };
      setServers(payload.servers ?? []);
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_SERVERS_LOAD]", error);
      setServersError("Unable to load servers right now.");
      setServers([]);
    } finally {
      setIsLoadingServers(false);
    }
  }, []);

  const loadEmojiStickers = useCallback(async () => {
    try {
      setIsLoadingEmojiStickers(true);
      setEmojiStickersError(null);

      const query = new URLSearchParams();
      if (emojiStickerServerFilter !== "ALL") {
        query.set("serverId", emojiStickerServerFilter);
      }
      query.set("assetType", emojiStickerTypeFilter);
      query.set("status", emojiStickerStatusFilter);

      const response = await fetch(`/api/admin/emoji-stickers?${query.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load emoji/stickers (${response.status})`);
      }

      const payload = (await response.json()) as {
        servers?: AdminEmojiStickerServer[];
        assets?: AdminEmojiStickerAsset[];
        summary?: AdminEmojiStickerSummary;
      };

      const serversFromApi = payload.servers ?? [];
      setEmojiStickerServers(serversFromApi);
      setEmojiStickerAssets(payload.assets ?? []);
      setEmojiStickerSummary(
        payload.summary ?? {
          totalAssets: 0,
          emojiAssets: 0,
          stickerAssets: 0,
          activeAssets: 0,
        }
      );

      if (!newEmojiStickerServerId && serversFromApi.length > 0) {
        setNewEmojiStickerServerId(serversFromApi[0].id);
      }
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_EMOJI_STICKERS_LOAD]", error);
      setEmojiStickersError("Unable to load emoji and sticker inventory right now.");
      setEmojiStickerServers([]);
      setEmojiStickerAssets([]);
      setEmojiStickerSummary(null);
    } finally {
      setIsLoadingEmojiStickers(false);
    }
  }, [emojiStickerServerFilter, emojiStickerStatusFilter, emojiStickerTypeFilter, newEmojiStickerServerId]);

  useEffect(() => {
    if (
      !isModalOpen ||
      (activeSection !== "security" && activeSection !== "moderation" && activeSection !== "auditLog")
    ) {
      return;
    }

    let isCancelled = false;

    void (async () => {
      await loadSecurity();
      if (isCancelled) {
        return;
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [activeSection, isModalOpen, loadSecurity]);

  useEffect(() => {
    if (!isModalOpen || activeSection !== "integrations") {
      return;
    }

    let isCancelled = false;

    void (async () => {
      await loadIntegrations();
      if (isCancelled) {
        return;
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [activeSection, isModalOpen, loadIntegrations]);

  useEffect(() => {
    if (!isModalOpen || (activeSection !== "servers" && activeSection !== "invites")) {
      return;
    }

    void loadServers();
  }, [activeSection, isModalOpen, loadServers]);

  useEffect(() => {
    if (!isModalOpen || activeSection !== "emojiStickers") {
      return;
    }

    void loadEmojiStickers();
  }, [activeSection, isModalOpen, loadEmojiStickers]);

  useEffect(() => {
    if (!isModalOpen || activeSection !== "reported") {
      return;
    }

    void loadReports();
  }, [activeSection, isModalOpen, loadReports]);

  useEffect(() => {
    if (!isModalOpen) {
      setActiveSection("general");
      setUsers([]);
      setUsersError(null);
      setIsLoadingUsers(false);
      setMemberSearch("");
      setMemberRoleFilter("ALL");
      setServers([]);
      setServersError(null);
      setIsLoadingServers(false);
      setServerSearch("");
      setServerOwnerFilter("ALL");
      setServerTags([]);
      setServerTagIconOptions([]);
      setServerTagsError(null);
      setIsLoadingServerTags(false);
      setServerTagSearch("");
      setServerTagOwnerFilter("ALL");
      setServerTagDrafts({});
      setSavingServerTagServerId(null);
      setServerTagsActionError(null);
      setServerTagsActionSuccess(null);
      setColumnWidths([320, 210, 230, 220, 100, 100]);
      setServerColumnWidths([240, 220, 220, 180, 110, 110]);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setShowNewUserPassword(false);
      setNewUserRole("USER");
      setCreateUserError(null);
      setCreateUserSuccess(null);
      setIsCreatingUser(false);
      setDeletingUserId(null);
      setUpdatingUserRoleId(null);
      setUpdatingUserDetailsId(null);
      setUserRoleDrafts({});
      setUserPhoneDrafts({});
      setUserDateOfBirthDrafts({});
      setSecuritySummary(null);
      setSecurityRecentLogins([]);
      setIsLoadingSecurity(false);
      setSecurityError(null);
      setIntegrationsSummary(null);
      setIntegrationProviders([]);
      setTopConnectedUsers([]);
      setIsLoadingIntegrations(false);
      setIntegrationsError(null);
      setReports([]);
      setIsLoadingReports(false);
      setReportsError(null);
      setReportStatusFilter("ALL");
      setReportTargetTypeFilter("ALL");
      setUpdatingReportId(null);
      setEmojiStickerServers([]);
      setEmojiStickerAssets([]);
      setEmojiStickerSummary(null);
      setEmojiStickerServerFilter("ALL");
      setEmojiStickerTypeFilter("ALL");
      setEmojiStickerStatusFilter("ALL");
      setIsLoadingEmojiStickers(false);
      setEmojiStickersError(null);
      setEmojiStickerActionSuccess(null);
      setCreatingEmojiSticker(false);
      setEmojiStickerActionItemId(null);
      setNewEmojiStickerServerId("");
      setNewEmojiStickerType("EMOJI");
      setNewEmojiStickerName("");
      setNewEmojiStickerValue("");
    }
  }, [isModalOpen]);

  const onUpdateReportStatus = async (reportId: string, status: AdminReport["status"]) => {
    try {
      setUpdatingReportId(reportId);

      const response = await fetch("/api/admin/reports", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reportId, status }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to update report (${response.status})`;
        throw new Error(message);
      }

      await loadReports();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_REPORTS_PATCH]", error);
      setReportsError(error instanceof Error ? error.message : "Unable to update report.");
    } finally {
      setUpdatingReportId(null);
    }
  };

  const onCreateEmojiSticker = async () => {
    const serverId = newEmojiStickerServerId.trim();
    const name = newEmojiStickerName.trim().toLowerCase();
    const value = newEmojiStickerValue.trim();

    setEmojiStickersError(null);
    setEmojiStickerActionSuccess(null);

    if (!serverId) {
      setEmojiStickersError("Select a server first.");
      return;
    }

    if (!/^[a-z0-9_]{2,32}$/.test(name)) {
      setEmojiStickersError("Name must be 2-32 chars and use lowercase letters, numbers, or underscore.");
      return;
    }

    if (newEmojiStickerType === "EMOJI" && !value) {
      setEmojiStickersError("Enter an emoji character.");
      return;
    }

    if (newEmojiStickerType === "STICKER" && !value) {
      setEmojiStickersError("Enter a sticker URL or app-relative path.");
      return;
    }

    try {
      setCreatingEmojiSticker(true);

      const response = await fetch("/api/admin/emoji-stickers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serverId,
          assetType: newEmojiStickerType,
          name,
          emoji: newEmojiStickerType === "EMOJI" ? value : undefined,
          imageUrl: newEmojiStickerType === "STICKER" ? value : undefined,
        }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to create asset (${response.status})`;
        throw new Error(message);
      }

      setNewEmojiStickerName("");
      setNewEmojiStickerValue("");
      setEmojiStickerActionSuccess(`${newEmojiStickerType === "EMOJI" ? "Emoji" : "Sticker"} saved.`);
      await loadEmojiStickers();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_EMOJI_STICKERS_CREATE]", error);
      setEmojiStickersError(error instanceof Error ? error.message : "Unable to create emoji/sticker asset.");
    } finally {
      setCreatingEmojiSticker(false);
    }
  };

  const onEmojiStickerAction = async (itemId: string, action: "ENABLE" | "DISABLE" | "DELETE") => {
    setEmojiStickersError(null);
    setEmojiStickerActionSuccess(null);

    try {
      setEmojiStickerActionItemId(itemId);

      const response = await fetch("/api/admin/emoji-stickers", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemId,
          action,
        }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to apply action (${response.status})`;
        throw new Error(message);
      }

      setEmojiStickerActionSuccess(
        action === "DELETE"
          ? "Asset deleted."
          : action === "ENABLE"
            ? "Asset enabled."
            : "Asset disabled."
      );
      await loadEmojiStickers();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_EMOJI_STICKERS_ACTION]", error);
      setEmojiStickersError(error instanceof Error ? error.message : "Unable to update asset.");
    } finally {
      setEmojiStickerActionItemId(null);
    }
  };

  const createUserRoleOptions = [
    "USER",
    "ADMINISTRATOR",
    "DEVELOPER",
    "MODERATOR",
  ];

  const onCreateUser = async () => {
    const name = newUserName.trim();
    const email = newUserEmail.trim().toLowerCase();
    const password = newUserPassword;
    const role = newUserRole.trim().toUpperCase() || "USER";

    setCreateUserError(null);
    setCreateUserSuccess(null);

    if (!name || !email || !password) {
      setCreateUserError("Name, email and password are required.");
      return;
    }

    if (password.length < 8) {
      setCreateUserError("Password must be at least 8 characters.");
      return;
    }

    try {
      setIsCreatingUser(true);
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, password, role }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to create user (${response.status})`;
        throw new Error(message);
      }

      setCreateUserSuccess(`User ${email} created.`);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("USER");
      await loadUsers();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_CREATE_USER]", error);
      setCreateUserError(error instanceof Error ? error.message : "Unable to create user.");
    } finally {
      setIsCreatingUser(false);
    }
  };

  const onDeleteUser = async (user: AdminUser) => {
    const confirmed = window.confirm(
      `Delete user ${user.email || user.userId}? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setCreateUserError(null);
    setCreateUserSuccess(null);

    try {
      setDeletingUserId(user.userId);

      const response = await fetch(
        `/api/admin/users?userId=${encodeURIComponent(user.userId)}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const message = (await response.text()) || `Failed to delete user (${response.status})`;
        throw new Error(message);
      }

      setCreateUserSuccess(`User ${user.email || user.userId} deleted.`);
      await loadUsers();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_DELETE_USER]", error);
      setCreateUserError(error instanceof Error ? error.message : "Unable to delete user.");
    } finally {
      setDeletingUserId(null);
    }
  };

  const onChangeUserRoleDraft = (userId: string, role: string) => {
    setUserRoleDrafts((current) => ({
      ...current,
      [userId]: normalizeAdminRoleForDisplay(role),
    }));
  };

  const onChangeUserPhoneDraft = (userId: string, phone: string) => {
    setUserPhoneDrafts((current) => ({
      ...current,
      [userId]: phone,
    }));
  };

  const onChangeUserDateOfBirthDraft = (userId: string, dateOfBirth: string) => {
    setUserDateOfBirthDrafts((current) => ({
      ...current,
      [userId]: dateOfBirth,
    }));
  };

  const onUpdateUserRole = async (user: AdminUser) => {
    const role = normalizeAdminRoleForDisplay(userRoleDrafts[user.userId] ?? user.role);

    setCreateUserError(null);
    setCreateUserSuccess(null);

    if (role === normalizeAdminRoleForDisplay(user.role)) {
      return;
    }

    try {
      setUpdatingUserRoleId(user.userId);

      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.userId,
          role,
        }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to update user role (${response.status})`;
        throw new Error(message);
      }

      setCreateUserSuccess(`Updated role for ${user.email || user.userId} to ${role}.`);
      await loadUsers();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_UPDATE_USER_ROLE]", error);
      setCreateUserError(error instanceof Error ? error.message : "Unable to update user role.");
    } finally {
      setUpdatingUserRoleId(null);
    }
  };

  const onUpdateUserDetails = async (user: AdminUser) => {
    const phoneNumber = (userPhoneDrafts[user.userId] ?? user.phoneNumber ?? "").trim();
    const dateOfBirth = (userDateOfBirthDrafts[user.userId] ?? user.dateOfBirth ?? "").trim();
    const canEditDateOfBirth = isInAccordAdministrator(data.profileRole);

    const hasPhoneChanged = phoneNumber !== (user.phoneNumber ?? "");
    const hasDateOfBirthChanged = dateOfBirth !== (user.dateOfBirth ?? "");

    setCreateUserError(null);
    setCreateUserSuccess(null);

    if (!hasPhoneChanged && !hasDateOfBirthChanged) {
      return;
    }

    if (phoneNumber.length > 32) {
      setCreateUserError("Phone number must be 32 characters or less.");
      return;
    }

    if (hasDateOfBirthChanged && !canEditDateOfBirth) {
      setCreateUserError("Only Administrators can edit Date Of Birth.");
      return;
    }

    try {
      setUpdatingUserDetailsId(user.userId);

      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.userId,
          phoneNumber,
          dateOfBirth,
        }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to update user details (${response.status})`;
        throw new Error(message);
      }

      setCreateUserSuccess(`Updated profile details for ${user.email || user.userId}.`);
      await loadUsers();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_UPDATE_USER_DETAILS]", error);
      setCreateUserError(error instanceof Error ? error.message : "Unable to update user details.");
    } finally {
      setUpdatingUserDetailsId(null);
    }
  };

  const minColumnWidths = [200, 140, 200, 160, 80, 80];

  const gridTemplateColumns = useMemo(
    () => columnWidths.map((width) => `${width}px`).join(" "),
    [columnWidths]
  );

  const startColumnResize = (index: number, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    const startX = event.clientX;
    const startWidths = [...columnWidths];

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidths = [...startWidths];
      nextWidths[index] = Math.max(minColumnWidths[index], startWidths[index] + delta);
      setColumnWidths(nextWidths);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const minServerColumnWidths = [180, 180, 170, 130, 80, 80];

  const serverGridTemplateColumns = useMemo(
    () => serverColumnWidths.map((width) => `${width}px`).join(" "),
    [serverColumnWidths]
  );

  const startServerColumnResize = (index: number, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    const startX = event.clientX;
    const startWidths = [...serverColumnWidths];

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidths = [...startWidths];
      nextWidths[index] = Math.max(minServerColumnWidths[index], startWidths[index] + delta);
      setServerColumnWidths(nextWidths);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const filteredUsers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();

    return users.filter((user) => {
      const roleMatches =
        memberRoleFilter === "ALL" || normalizeAdminRoleForDisplay(user.role) === memberRoleFilter;

      if (!query) {
        return roleMatches;
      }

      const haystack = [user.name, user.email, user.userId, user.role]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return roleMatches && haystack.includes(query);
    });
  }, [memberRoleFilter, memberSearch, users]);

  const roleOptions = useMemo(() => {
    const uniqueRoles = Array.from(new Set(users.map((user) => normalizeAdminRoleForDisplay(user.role))));
    return ["ALL", ...uniqueRoles.sort()];
  }, [users]);

  const hasActiveMemberFilters = memberSearch.trim().length > 0 || memberRoleFilter !== "ALL";

  const ownerOptions = useMemo(() => {
    const uniqueOwners = Array.from(
      new Set(servers.map((server) => (server.ownerName || "Unknown Owner").trim()))
    ).filter(Boolean);
    return ["ALL", ...uniqueOwners.sort((a, b) => a.localeCompare(b))];
  }, [servers]);

  const filteredServers = useMemo(() => {
    const query = serverSearch.trim().toLowerCase();

    return servers.filter((server) => {
      const ownerMatches =
        serverOwnerFilter === "ALL" || (server.ownerName || "Unknown Owner") === serverOwnerFilter;

      if (!query) {
        return ownerMatches;
      }

      const haystack = [
        server.id,
        server.name,
        server.ownerName,
        server.ownerEmail,
        server.inviteCode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return ownerMatches && haystack.includes(query);
    });
  }, [serverOwnerFilter, serverSearch, servers]);

  const hasActiveServerFilters = serverSearch.trim().length > 0 || serverOwnerFilter !== "ALL";

  const roleDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    users.forEach((user) => {
      const role = normalizeAdminRoleForDisplay(user.role);
      counts.set(role, (counts.get(role) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([role, count]) => ({ role, count }))
      .sort((a, b) => b.count - a.count || a.role.localeCompare(b.role));
  }, [users]);

  const inviteCoverage = useMemo(() => {
    const withInvites = servers.filter((server) => server.inviteCode && server.inviteCode.trim().length > 0).length;
    const withoutInvites = Math.max(0, servers.length - withInvites);
    return {
      withInvites,
      withoutInvites,
    };
  }, [servers]);

  const emojiStickerServerOptions = useMemo(
    () => emojiStickerServers.map((item) => ({ id: item.id, name: item.name })),
    [emojiStickerServers]
  );

  const hasActiveEmojiStickerFilters =
    emojiStickerServerFilter !== "ALL" ||
    emojiStickerTypeFilter !== "ALL" ||
    emojiStickerStatusFilter !== "ALL";

  const serverTagOwnerOptions = useMemo(() => {
    const uniqueOwners = Array.from(
      new Set(serverTags.map((item) => (item.ownerName || "Unknown Owner").trim()))
    ).filter(Boolean);
    return ["ALL", ...uniqueOwners.sort((a, b) => a.localeCompare(b))];
  }, [serverTags]);

  const filteredServerTags = useMemo(() => {
    const query = serverTagSearch.trim().toLowerCase();

    return serverTags.filter((item) => {
      const ownerMatches =
        serverTagOwnerFilter === "ALL" || (item.ownerName || "Unknown Owner") === serverTagOwnerFilter;

      if (!query) {
        return ownerMatches;
      }

      const haystack = [
        item.serverId,
        item.serverName,
        item.ownerName,
        item.ownerEmail,
        item.tagCode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return ownerMatches && haystack.includes(query);
    });
  }, [serverTagOwnerFilter, serverTagSearch, serverTags]);

  const hasActiveServerTagFilters =
    serverTagSearch.trim().length > 0 || serverTagOwnerFilter !== "ALL";

  const setServerTagDraft = (
    serverId: string,
    updates: Partial<{ tagCode: string; iconKey: string }>
  ) => {
    setServerTagDrafts((current) => {
      const existing = current[serverId] ?? {
        tagCode: "",
        iconKey: serverTagIconOptions[0]?.key ?? "",
      };

      return {
        ...current,
        [serverId]: {
          ...existing,
          ...updates,
        },
      };
    });
  };

  const applyServerTagPayload = (payload: {
    serverTags?: AdminServerTag[];
    iconOptions?: ServerTagIconOption[];
  }) => {
    const rows = payload.serverTags ?? [];
    const iconOptions = payload.iconOptions ?? [];
    const fallbackIconKey = iconOptions[0]?.key ?? "";

    const drafts: Record<string, { tagCode: string; iconKey: string }> = {};
    rows.forEach((item) => {
      drafts[item.serverId] = {
        tagCode: item.tagCode ?? "",
        iconKey: item.iconKey ?? fallbackIconKey,
      };
    });

    setServerTags(rows);
    setServerTagIconOptions(iconOptions);
    setServerTagDrafts(drafts);
  };

  const onSaveServerTag = async (serverId: string, remove = false) => {
    const draft = serverTagDrafts[serverId] ?? {
      tagCode: "",
      iconKey: serverTagIconOptions[0]?.key ?? "",
    };

    const tagCode = remove ? "" : draft.tagCode.trim().toUpperCase();
    const iconKey = (draft.iconKey || serverTagIconOptions[0]?.key || "").trim();

    setServerTagsActionError(null);
    setServerTagsActionSuccess(null);

    try {
      setSavingServerTagServerId(serverId);

      const response = await fetch("/api/admin/server-tags", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serverId,
          tagCode,
          iconKey,
        }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to save server tag (${response.status})`;
        throw new Error(message);
      }

      const payload = (await response.json()) as {
        serverTags?: AdminServerTag[];
        iconOptions?: ServerTagIconOption[];
      };

      applyServerTagPayload(payload);
      setServerTagsActionSuccess(remove ? "Server tag removed." : "Server tag saved.");
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_SERVER_TAGS_SAVE]", error);
      setServerTagsActionError(error instanceof Error ? error.message : "Unable to save server tag.");
    } finally {
      setSavingServerTagServerId(null);
    }
  };

  const menuButtonClass = (section: AdminSection) =>
    cn(
      "w-full rounded-md px-3 py-2 text-left text-sm transition",
      activeSection === section
        ? "bg-indigo-500/15 font-medium text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-200"
        : "text-zinc-700 hover:bg-zinc-200/70 dark:text-zinc-200 dark:hover:bg-zinc-800"
    );

  const formatDateTime = (value: string | null) => {
    if (!value) {
      return "N/A";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "N/A";
    }

    return parsed.toLocaleString();
  };

  const toCsvCell = (value: string | number | null | undefined) => {
    const raw = String(value ?? "");
    return `"${raw.replace(/"/g, '""')}"`;
  };

  const downloadCsv = (filename: string, headers: string[], rows: Array<Array<string | number | null>>) => {
    const content = [
      headers.map((header) => toCsvCell(header)).join(","),
      ...rows.map((row) => row.map((cell) => toCsvCell(cell)).join(",")),
    ].join("\n");

    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(objectUrl);
  };

  const exportSecurityLoginsCsv = () => {
    const rows = securityRecentLogins.map((row) => [
      row.userId,
      row.name,
      row.email || "N/A",
      row.role,
      row.lastLogin ? formatDateTime(row.lastLogin) : "N/A",
    ]);

    downloadCsv(
      `admin-security-recent-logins-${new Date().toISOString().slice(0, 10)}.csv`,
      ["user_id", "name", "email", "role", "last_login"],
      rows
    );
  };

  const exportIntegrationsUsersCsv = () => {
    const rows = topConnectedUsers.map((row) => [
      row.userId,
      row.providers.join("; "),
      row.count,
    ]);

    downloadCsv(
      `admin-integrations-users-${new Date().toISOString().slice(0, 10)}.csv`,
      ["user_id", "providers", "count"],
      rows
    );
  };

  const normalizedNewUserRole = normalizeAdminRoleForDisplay(newUserRole);
  const canEditUsersDateOfBirth = isInAccordAdministrator(data.profileRole);

  return (
    <Dialog open={isModalOpen} onOpenChange={onClose}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] w-[85vw] max-w-[85vw] flex-col overflow-hidden bg-white p-0 text-black dark:bg-[#313338] dark:text-white">
        <DialogHeader className="border-b border-zinc-200 px-6 pb-4 pt-6 dark:border-zinc-700">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <ShieldAlert className="h-5 w-5 text-amber-400" />
            In-Accord Staff Panel
          </DialogTitle>
          <DialogDescription className="text-zinc-600 dark:text-zinc-300">
            Administration for In-Accord staff area.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr]">
          <aside className="border-r border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
            <p className="px-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              Admin Menu
            </p>
            <nav className="mt-3 space-y-1">
              <button type="button" onClick={() => setActiveSection("general")} className={menuButtonClass("general")}>
                General Settings
              </button>
              <button type="button" onClick={() => setActiveSection("members")} className={menuButtonClass("members")}>
                Members & Roles
              </button>
              <button type="button" onClick={() => setActiveSection("servers")} className={menuButtonClass("servers")}>
                Servers
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("serverTags")}
                className={menuButtonClass("serverTags")}
              >
                Server Tags
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("reported")}
                className={menuButtonClass("reported")}
              >
                Reported
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("moderation")}
                className={menuButtonClass("moderation")}
              >
                Moderation
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("roles")}
                className={menuButtonClass("roles")}
              >
                Roles
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("auditLog")}
                className={menuButtonClass("auditLog")}
              >
                Audit Log
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("invites")}
                className={menuButtonClass("invites")}
              >
                Invites
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("emojiStickers")}
                className={menuButtonClass("emojiStickers")}
              >
                Emoji & Stickers
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("webhooks")}
                className={menuButtonClass("webhooks")}
              >
                Webhooks
              </button>
              <button type="button" onClick={() => setActiveSection("security")} className={menuButtonClass("security")}>
                Security & Audit
              </button>
              <button type="button" onClick={() => setActiveSection("integrations")} className={menuButtonClass("integrations")}>
                Integrations
              </button>
            </nav>
          </aside>

          <section className="min-h-0 space-y-4 overflow-y-auto p-6">
            {activeSection === "general" && (
              <>
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-300">Access Status</p>
                  <div className="mt-2 flex items-center gap-2 text-sm text-amber-200">
                    <ShieldCheck className="h-4 w-4" />
                    Staff access confirmed for
                    <span className="inline-flex items-center gap-1.5">
                      <span>{data.profileName || "current user"}</span>
                      {isInAccordAdministrator(data.profileRole) ? (
                        isInAccordDeveloper(data.profileRole)
                          ? <Wrench className="h-4 w-4 shrink-0 text-cyan-400" aria-label={getInAccordStaffLabel(data.profileRole) ?? "In-Accord Staff"} />
                          : <Crown className="h-4 w-4 shrink-0 text-rose-500" aria-label={getInAccordStaffLabel(data.profileRole) ?? "In-Accord Staff"} />
                      ) : null}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-200">
                  <p className="font-semibold">Profile Context</p>
                  <p className="mt-1">User ID: {data.profileId || "N/A"}</p>
                  <p>Email: {data.profileEmail || "N/A"}</p>
                  <p>Role: {data.profileRole || "User"}</p>
                </div>
              </>
            )}

            {activeSection === "members" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-600 dark:bg-zinc-900/40">
                  <p className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">Create New User</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      type="text"
                      value={newUserName}
                      onChange={(event) => setNewUserName(event.target.value)}
                      placeholder="Name"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <input
                      type="email"
                      value={newUserEmail}
                      onChange={(event) => setNewUserEmail(event.target.value)}
                      placeholder="Email"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <div className="relative">
                      <input
                        type={showNewUserPassword ? "text" : "password"}
                        value={newUserPassword}
                        onChange={(event) => setNewUserPassword(event.target.value)}
                        placeholder="Password"
                        className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 pr-10 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewUserPassword((current) => !current)}
                        className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                        aria-label={showNewUserPassword ? "Hide password" : "Show password"}
                        title={showNewUserPassword ? "Hide password" : "Show password"}
                      >
                        {showNewUserPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <select
                      value={newUserRole}
                      onChange={(event) => setNewUserRole(event.target.value)}
                      className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      {createUserRoleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <div className="col-span-full mt-1 flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                      {getAdminRoleIcon(normalizedNewUserRole, "h-4 w-4")}
                      <span>Selected role: {normalizedNewUserRole}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void onCreateUser()}
                      disabled={isCreatingUser}
                      className="h-9 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCreatingUser ? "Creating..." : "Create user"}
                    </button>
                    {createUserError ? <p className="text-xs text-rose-500">{createUserError}</p> : null}
                    {createUserSuccess ? <p className="text-xs text-emerald-500">{createUserSuccess}</p> : null}
                  </div>
                </div>

                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Users</p>
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                    {filteredUsers.length}
                  </span>
                </div>

                <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(event) => setMemberSearch(event.target.value)}
                    placeholder="Search by name, email, user ID, or role"
                    className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                  />
                  <select
                    value={memberRoleFilter}
                    onChange={(event) => setMemberRoleFilter(event.target.value)}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role === "ALL" ? "All roles" : role}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      setMemberSearch("");
                      setMemberRoleFilter("ALL");
                    }}
                    disabled={!hasActiveMemberFilters}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Clear filters
                  </button>
                </div>

                {isLoadingUsers ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading users...</p>
                ) : usersError ? (
                  <p className="text-sm text-rose-500">{usersError}</p>
                ) : filteredUsers.length === 0 ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    No users found{hasActiveMemberFilters ? " for the current filters" : ""}.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
                    <div className="overflow-x-auto">
                      <div className="min-w-max">
                        <div
                          className="grid gap-2 bg-zinc-200/80 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          style={{ gridTemplateColumns }}
                        >
                          <div className="relative pr-2">
                            <p>user_id</p>
                            <button
                              type="button"
                              aria-label="Resize user_id column"
                              onMouseDown={(event) => startColumnResize(0, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <div className="relative pr-2">
                            <p>name</p>
                            <button
                              type="button"
                              aria-label="Resize name column"
                              onMouseDown={(event) => startColumnResize(1, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <div className="relative pr-2">
                            <p>role</p>
                            <button
                              type="button"
                              aria-label="Resize role column"
                              onMouseDown={(event) => startColumnResize(2, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <div className="relative pr-2">
                            <p>joined / profile</p>
                            <button
                              type="button"
                              aria-label="Resize joined_at column"
                              onMouseDown={(event) => startColumnResize(3, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <div className="relative pr-2">
                            <p>owned</p>
                            <button
                              type="button"
                              aria-label="Resize owned column"
                              onMouseDown={(event) => startColumnResize(4, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <p>joined</p>
                        </div>

                        <div className="max-h-105 overflow-y-auto bg-white/70 font-mono text-[12pt] leading-none text-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200">
                          {filteredUsers.map((user, index) => (
                            (() => {
                              const normalizedPresenceStatus = normalizePresenceStatus(user.presenceStatus);
                              const hasAdminCrown = isInAccordAdministrator(user.role);
                              const hasDeveloperWrench = isInAccordDeveloper(user.role);
                              const hasModeratorShield = isInAccordModerator(user.role);
                              const inAccordStaffRoleLabel = getInAccordStaffLabel(user.role);
                              const showBotBadge = isBotUser({
                                role: user.role,
                                name: user.profileName || user.name,
                                email: user.email,
                              });
                              const profileIcons = resolveProfileIcons({
                                userId: user.userId,
                                role: user.role,
                                email: user.email,
                                createdAt: user.joinedAt,
                              });
                              const phoneNumberDraft = userPhoneDrafts[user.userId] ?? user.phoneNumber ?? "";
                              const dateOfBirthDraft = userDateOfBirthDrafts[user.userId] ?? user.dateOfBirth ?? "";
                              const hasDetailsChanges =
                                phoneNumberDraft.trim() !== (user.phoneNumber ?? "") ||
                                dateOfBirthDraft.trim() !== (user.dateOfBirth ?? "");
                              const isSavingRole = updatingUserRoleId === user.userId;
                              const isSavingDetails = updatingUserDetailsId === user.userId;
                              return (
                            <div
                              key={user.id}
                              className={cn(
                                "grid gap-2 px-3 py-2",
                                index % 2 === 0
                                  ? "bg-white/70 dark:bg-zinc-950/25"
                                  : "bg-zinc-100/70 dark:bg-zinc-900/35"
                              )}
                              style={{ gridTemplateColumns }}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                      aria-label={`Open profile for ${user.name}`}
                                      title={`View ${user.name} profile`}
                                    >
                                      <UserAvatar src={user.imageUrl} className="h-5 w-5" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    side="right"
                                    align="start"
                                    className="w-[320px] overflow-hidden rounded-xl border border-black/30 bg-[#111214] p-0 text-[#dbdee1] shadow-2xl shadow-black/50"
                                  >
                                    <div className="relative h-24 bg-linear-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
                                      {user.bannerUrl ? (
                                        <Image
                                          src={user.bannerUrl}
                                          alt="User banner"
                                          fill
                                          className="object-cover"
                                          unoptimized
                                        />
                                      ) : null}
                                    </div>

                                    <div className="relative p-3 pt-9">
                                      <div className="absolute -top-10 left-3 rounded-full border-4 border-[#111214]">
                                        <UserAvatar src={user.imageUrl} className="h-20 w-20" />
                                      </div>

                                      <ProfileIconRow icons={profileIcons} />
                                      <div className="flex min-w-0 items-center gap-1.5">
                                        <ProfileNameWithServerTag
                                          name={user.profileName || user.name}
                                          profileId={user.userId}
                                          nameClassName="text-base font-bold text-white"
                                        />
                                        {showBotBadge ? <BotAppBadge className="h-4 px-1 text-[9px]" /> : null}
                                        {hasAdminCrown ? (
                                          hasDeveloperWrench
                                            ? <Wrench className="h-4 w-4 shrink-0 text-cyan-400" aria-label={inAccordStaffRoleLabel ?? "In-Accord Staff"} />
                                            : <Crown className="h-4 w-4 shrink-0 text-rose-500" aria-label={inAccordStaffRoleLabel ?? "In-Accord Staff"} />
                                        ) : hasModeratorShield ? (
                                          <ModeratorLineIcon className="h-4 w-4 shrink-0 text-indigo-500" aria-label={inAccordStaffRoleLabel ?? "Moderator"} />
                                        ) : null}
                                      </div>
                                      <p className="mt-0.5 text-[11px] text-[#949ba4]">{user.pronouns?.trim() || "Pronouns not set"}</p>
                                      <div className="mt-2 min-h-36 w-full max-w-55 resize-y overflow-auto rounded-md border border-white/10 bg-[#1a1b1e] px-2.5 py-2">
                                        <p
                                          className="whitespace-pre-wrap wrap-break-word align-top text-[11px] text-[#dbdee1]"
                                          style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                                        >
                                          {user.comment?.trim() || "No comment set"}
                                        </p>
                                      </div>

                                      <div className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] p-3 text-xs">
                                        <div className="space-y-1 text-[#dbdee1]">
                                          <p>Name: {user.name}</p>
                                          <p>Profile Name: {user.profileName || "Not set"}</p>
                                          <p>Status: {presenceStatusLabelMap[normalizedPresenceStatus]}</p>
                                          <p>Role: {user.role || "USER"}</p>
                                          <p>Joined: {formatDateTime(user.joinedAt)}</p>
                                          <p>Last Login: {formatDateTime(user.lastLogin)}</p>
                                          <p>Owned Servers: {user.ownedServerCount}</p>
                                          <p>Joined Servers: {user.joinedServerCount}</p>
                                        </div>
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                                <p className="truncate text-[12pt] leading-none" title={user.userId}>{user.userId}</p>
                                <button
                                  type="button"
                                  onClick={() => void onDeleteUser(user)}
                                  disabled={deletingUserId === user.userId}
                                  className="ml-auto rounded p-1 text-rose-500 transition hover:bg-rose-500/10 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                                  aria-label={`Delete ${user.email || user.userId}`}
                                  title="Delete user"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                              <div className="flex min-w-0 items-center gap-1.5">
                                <ProfileNameWithServerTag
                                  name={user.name}
                                  profileId={user.userId}
                                  nameClassName=""
                                />
                                {isBotUser({ role: user.role, name: user.name, email: user.email }) ? (
                                  <BotAppBadge className="h-4 px-1 text-[9px]" />
                                ) : null}
                              </div>
                              <div className="flex min-w-0 items-center gap-1.5">
                                {getAdminRoleIcon(userRoleDrafts[user.userId] ?? user.role, "h-4 w-4")}
                                <select
                                  value={normalizeAdminRoleForDisplay(userRoleDrafts[user.userId] ?? user.role)}
                                  onChange={(event) => onChangeUserRoleDraft(user.userId, event.target.value)}
                                  disabled={updatingUserRoleId === user.userId || deletingUserId === user.userId}
                                  className="h-7 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 text-[10px] font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                                >
                                  {createUserRoleOptions.map((role) => (
                                    <option key={`${user.userId}-${role}`} value={role}>
                                      {role}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => void onUpdateUserRole(user)}
                                  disabled={
                                    isSavingRole ||
                                    isSavingDetails ||
                                    deletingUserId === user.userId ||
                                    normalizeAdminRoleForDisplay(userRoleDrafts[user.userId] ?? user.role) === normalizeAdminRoleForDisplay(user.role)
                                  }
                                  className="h-7 rounded-md bg-indigo-600 px-2 text-[10px] font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isSavingRole ? "Saving..." : "Save"}
                                </button>
                              </div>
                              <div className="space-y-1 text-[10px] leading-tight">
                                <p className="truncate" title={formatDateTime(user.joinedAt)}>{formatDateTime(user.joinedAt)}</p>
                                <input
                                  type="text"
                                  value={phoneNumberDraft}
                                  onChange={(event) => onChangeUserPhoneDraft(user.userId, event.target.value)}
                                  maxLength={32}
                                  placeholder="Phone"
                                  disabled={isSavingRole || isSavingDetails || deletingUserId === user.userId}
                                  className="h-6 w-full rounded-md border border-zinc-300 bg-white px-2 text-[10px] text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                                />
                                <input
                                  type="date"
                                  value={dateOfBirthDraft}
                                  onChange={(event) => onChangeUserDateOfBirthDraft(user.userId, event.target.value)}
                                  disabled={
                                    isSavingRole ||
                                    isSavingDetails ||
                                    deletingUserId === user.userId ||
                                    !canEditUsersDateOfBirth
                                  }
                                  className="h-6 w-full rounded-md border border-zinc-300 bg-white px-2 text-[10px] text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                                />
                                <button
                                  type="button"
                                  onClick={() => void onUpdateUserDetails(user)}
                                  disabled={
                                    isSavingRole ||
                                    isSavingDetails ||
                                    deletingUserId === user.userId ||
                                    !hasDetailsChanges
                                  }
                                  className="h-6 w-full rounded-md bg-zinc-900 px-2 text-[10px] font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                                >
                                  {isSavingDetails ? "Saving..." : "Save details"}
                                </button>
                                {!canEditUsersDateOfBirth ? (
                                  <p className="text-[9px] text-amber-500">DOB edit: Administrator only</p>
                                ) : null}
                              </div>
                              <p>{user.ownedServerCount}</p>
                              <p>{user.joinedServerCount}</p>
                            </div>
                              );
                            })()
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeSection === "servers" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Servers</p>
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                    {filteredServers.length}
                  </span>
                </div>

                <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_220px_auto]">
                  <input
                    type="text"
                    value={serverSearch}
                    onChange={(event) => setServerSearch(event.target.value)}
                    placeholder="Search by server name, ID, invite code, owner"
                    className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                  />

                  <select
                    value={serverOwnerFilter}
                    onChange={(event) => setServerOwnerFilter(event.target.value)}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    {ownerOptions.map((owner) => (
                      <option key={owner} value={owner}>
                        {owner === "ALL" ? "All owners" : owner}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      setServerSearch("");
                      setServerOwnerFilter("ALL");
                    }}
                    disabled={!hasActiveServerFilters}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Clear filters
                  </button>
                </div>

                {isLoadingServers ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading servers...</p>
                ) : serversError ? (
                  <p className="text-sm text-rose-500">{serversError}</p>
                ) : filteredServers.length === 0 ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    No servers found{hasActiveServerFilters ? " for the current filters" : ""}.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
                    <div className="overflow-x-auto">
                      <div className="min-w-max">
                        <div
                          className="grid gap-2 bg-zinc-200/80 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          style={{ gridTemplateColumns: serverGridTemplateColumns }}
                        >
                          <div className="relative pr-2">
                            <p>server_id</p>
                            <button
                              type="button"
                              aria-label="Resize server_id column"
                              onMouseDown={(event) => startServerColumnResize(0, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <div className="relative pr-2">
                            <p>name</p>
                            <button
                              type="button"
                              aria-label="Resize name column"
                              onMouseDown={(event) => startServerColumnResize(1, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <div className="relative pr-2">
                            <p>owner</p>
                            <button
                              type="button"
                              aria-label="Resize owner column"
                              onMouseDown={(event) => startServerColumnResize(2, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <div className="relative pr-2">
                            <p>created_at</p>
                            <button
                              type="button"
                              aria-label="Resize created_at column"
                              onMouseDown={(event) => startServerColumnResize(3, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <div className="relative pr-2">
                            <p>members</p>
                            <button
                              type="button"
                              aria-label="Resize members column"
                              onMouseDown={(event) => startServerColumnResize(4, event)}
                              className="absolute -right-1 top-0 h-full w-2 cursor-col-resize"
                            />
                          </div>
                          <p>channels</p>
                        </div>

                        <div className="max-h-105 overflow-y-auto bg-white/70 font-mono text-[12pt] leading-none text-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200">
                          {filteredServers.map((serverItem) => (
                            <div
                              key={serverItem.id}
                              className="grid gap-2 border-b border-zinc-200/80 bg-white/85 px-3 py-2 text-zinc-900 transition-colors hover:bg-indigo-50/70 last:border-b-0 dark:border-zinc-800 dark:bg-zinc-950/35 dark:text-zinc-100 dark:hover:bg-zinc-800/55"
                              style={{ gridTemplateColumns: serverGridTemplateColumns }}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <ServerProfilePopover server={serverItem} />
                                <p className="truncate text-[12pt] leading-none" title={serverItem.id}>{serverItem.id}</p>
                              </div>
                              <p className="truncate" title={serverItem.name}>{serverItem.name}</p>
                              <p className="truncate" title={`${serverItem.ownerName}${serverItem.ownerEmail ? ` (${serverItem.ownerEmail})` : ""}`}>
                                {serverItem.ownerName}
                              </p>
                              <p className="truncate" title={formatDateTime(serverItem.createdAt)}>{formatDateTime(serverItem.createdAt)}</p>
                              <p>{serverItem.memberCount}</p>
                              <p>{serverItem.channelCount}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeSection === "serverTags" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Server Tags</p>
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                    {filteredServerTags.length}
                  </span>
                </div>

                <p className="mb-4 text-xs text-zinc-600 dark:text-zinc-300">
                  Configure the 3–4 letter tag and icon for any server. Removing a tag clears selected profile tags for that
                  server.
                </p>

                <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_220px_auto]">
                  <input
                    type="text"
                    value={serverTagSearch}
                    onChange={(event) => setServerTagSearch(event.target.value)}
                    placeholder="Search by server, owner, ID, or tag"
                    className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                  />

                  <select
                    value={serverTagOwnerFilter}
                    onChange={(event) => setServerTagOwnerFilter(event.target.value)}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    {serverTagOwnerOptions.map((owner) => (
                      <option key={owner} value={owner}>
                        {owner === "ALL" ? "All owners" : owner}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      setServerTagSearch("");
                      setServerTagOwnerFilter("ALL");
                    }}
                    disabled={!hasActiveServerTagFilters}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Clear filters
                  </button>
                </div>

                {serverTagsActionError ? (
                  <p className="mb-3 text-xs text-rose-500">{serverTagsActionError}</p>
                ) : null}
                {serverTagsActionSuccess ? (
                  <p className="mb-3 text-xs text-emerald-500">{serverTagsActionSuccess}</p>
                ) : null}

                {isLoadingServerTags ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading server tags...</p>
                ) : serverTagsError ? (
                  <p className="text-sm text-rose-500">{serverTagsError}</p>
                ) : filteredServerTags.length === 0 ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    No server tags found{hasActiveServerTagFilters ? " for the current filters" : ""}.
                  </p>
                ) : (
                  <div className="max-h-130 space-y-2 overflow-y-auto pr-1">
                    {filteredServerTags.map((item) => {
                      const draft = serverTagDrafts[item.serverId] ?? {
                        tagCode: item.tagCode ?? "",
                        iconKey: item.iconKey ?? serverTagIconOptions[0]?.key ?? "",
                      };
                      const isSaving = savingServerTagServerId === item.serverId;

                      return (
                        <div
                          key={item.serverId}
                          className="rounded-lg border border-zinc-300 bg-white/85 p-3 dark:border-zinc-700 dark:bg-zinc-900/45"
                        >
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.serverName}</p>
                              <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{item.serverId}</p>
                            </div>
                            <div className="text-right text-xs text-zinc-600 dark:text-zinc-300">
                              <p>{item.ownerName}</p>
                              {item.ownerEmail ? <p>{item.ownerEmail}</p> : null}
                            </div>
                          </div>

                          <div className="grid gap-2 md:grid-cols-[120px_1fr_auto]">
                            <input
                              type="text"
                              value={draft.tagCode}
                              onChange={(event) =>
                                setServerTagDraft(item.serverId, {
                                  tagCode: event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4),
                                })
                              }
                              placeholder="TAG"
                              maxLength={4}
                              className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold uppercase tracking-wider text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                            />

                            <div className="flex items-center gap-2">
                              <select
                                value={draft.iconKey}
                                onChange={(event) =>
                                  setServerTagDraft(item.serverId, {
                                    iconKey: event.target.value,
                                  })
                                }
                                className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                              >
                                {serverTagIconOptions.map((option) => (
                                  <option key={option.key} value={option.key}>
                                    {option.emoji} {option.label}
                                  </option>
                                ))}
                              </select>

                              <span className="inline-flex h-9 min-w-18 items-center justify-center gap-1 rounded-md border border-zinc-300 bg-zinc-100 px-2 text-sm font-semibold dark:border-zinc-600 dark:bg-zinc-800">
                                {serverTagIconOptions.find((option) => option.key === draft.iconKey)?.emoji ?? "🏷️"}
                                {(draft.tagCode || item.tagCode || "TAG").slice(0, 4)}
                              </span>
                            </div>

                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => void onSaveServerTag(item.serverId)}
                                disabled={isSaving}
                                className="h-9 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isSaving ? "Saving..." : "Save"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void onSaveServerTag(item.serverId, true)}
                                disabled={isSaving}
                                className="h-9 rounded-md border border-rose-300 bg-rose-50 px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/40"
                              >
                                Remove
                              </button>
                            </div>
                          </div>

                          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                            Selected by <span className="font-semibold">{item.selectedProfileCount}</span> profile
                            {item.selectedProfileCount === 1 ? "" : "s"}.
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeSection === "reported" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Reported Queue</p>
                  <button
                    type="button"
                    onClick={() => void loadReports()}
                    className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Refresh
                  </button>
                </div>

                <div className="mb-4 grid gap-2 sm:grid-cols-[180px_180px_auto]">
                  <select
                    value={reportStatusFilter}
                    onChange={(event) => setReportStatusFilter(event.target.value as typeof reportStatusFilter)}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="ALL">All statuses</option>
                    <option value="OPEN">Open</option>
                    <option value="IN_REVIEW">In review</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="DISMISSED">Dismissed</option>
                  </select>

                  <select
                    value={reportTargetTypeFilter}
                    onChange={(event) => setReportTargetTypeFilter(event.target.value as typeof reportTargetTypeFilter)}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="ALL">All targets</option>
                    <option value="USER">Users</option>
                    <option value="SERVER">Servers</option>
                    <option value="MESSAGE">Messages</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      setReportStatusFilter("ALL");
                      setReportTargetTypeFilter("ALL");
                    }}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Clear filters
                  </button>
                </div>

                {isLoadingReports ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading reports...</p>
                ) : reportsError ? (
                  <p className="text-sm text-rose-500">{reportsError}</p>
                ) : reports.length === 0 ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">No reports found for current filters.</p>
                ) : (
                  <div className="space-y-2">
                    {reports.map((report) => {
                      const statusClassName =
                        report.status === "OPEN"
                          ? "border-amber-500/30 bg-amber-500/15 text-amber-200"
                          : report.status === "IN_REVIEW"
                            ? "border-indigo-500/30 bg-indigo-500/15 text-indigo-200"
                            : report.status === "RESOLVED"
                              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
                              : "border-zinc-500/30 bg-zinc-500/15 text-zinc-200";

                      return (
                        <div
                          key={report.id}
                          className="rounded-lg border border-zinc-300 bg-white/85 p-3 dark:border-zinc-700 dark:bg-zinc-900/45"
                        >
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                <span className="inline-flex items-center gap-1">
                                  <Flag className="h-3.5 w-3.5" />
                                  {report.targetType === "USER"
                                    ? "Reported User"
                                    : report.targetType === "SERVER"
                                      ? "Reported Server"
                                      : "Reported Message"}
                                </span>
                                <span className="ml-2">{report.targetName}</span>
                              </p>
                              <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{report.targetId}</p>
                            </div>
                            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", statusClassName)}>
                              {report.status.replace("_", " ")}
                            </span>
                          </div>

                          <div className="grid gap-2 text-xs text-zinc-700 dark:text-zinc-300 md:grid-cols-2">
                            <p>
                              Reporter: <span className="font-semibold">{report.reporterName}</span>
                              {report.reporterEmail ? ` (${report.reporterEmail})` : ""}
                            </p>
                            <p>
                              Created: <span className="font-semibold">{formatDateTime(report.createdAt)}</span>
                            </p>
                            <p className="md:col-span-2">
                              Reason: <span className="font-semibold">{report.reason || "No reason provided"}</span>
                            </p>
                            {report.details ? (
                              <p className="md:col-span-2">
                                Details: <span className="text-zinc-600 dark:text-zinc-200">{report.details}</span>
                              </p>
                            ) : null}
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-300/70 pt-3 dark:border-zinc-700/70">
                            <button
                              type="button"
                              onClick={() => void onUpdateReportStatus(report.id, "IN_REVIEW")}
                              disabled={updatingReportId === report.id || report.status === "IN_REVIEW"}
                              className="h-8 rounded-md border border-indigo-500/35 bg-indigo-500/15 px-3 text-xs font-medium text-indigo-200 transition hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              In Review
                            </button>
                            <button
                              type="button"
                              onClick={() => void onUpdateReportStatus(report.id, "RESOLVED")}
                              disabled={updatingReportId === report.id || report.status === "RESOLVED"}
                              className="h-8 rounded-md border border-emerald-500/35 bg-emerald-500/15 px-3 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Resolve
                            </button>
                            <button
                              type="button"
                              onClick={() => void onUpdateReportStatus(report.id, "DISMISSED")}
                              disabled={updatingReportId === report.id || report.status === "DISMISSED"}
                              className="h-8 rounded-md border border-zinc-500/35 bg-zinc-500/15 px-3 text-xs font-medium text-zinc-200 transition hover:bg-zinc-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Dismiss
                            </button>
                            {updatingReportId === report.id ? (
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Updating...</p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeSection === "moderation" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Moderation</p>
                  <button
                    type="button"
                    onClick={() => void loadSecurity()}
                    className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Refresh
                  </button>
                </div>

                {isLoadingSecurity ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading moderation insights...</p>
                ) : securityError ? (
                  <p className="text-sm text-rose-500">{securityError}</p>
                ) : (
                  <div className="grid gap-2 md:grid-cols-3">
                    <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Potential Review Queue</p>
                      <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{(securitySummary?.inactive30d ?? 0) + (securitySummary?.neverLoggedIn ?? 0)}</p>
                      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">inactive or never-logged accounts to review</p>
                    </div>
                    <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Admin Coverage</p>
                      <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{securitySummary?.adminUsers ?? 0}</p>
                      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">users with elevated role permissions</p>
                    </div>
                    <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Owner Issues</p>
                      <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{securitySummary?.serversWithoutValidOwner ?? 0}</p>
                      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">servers with missing/invalid owner linkage</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeSection === "roles" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Roles</p>
                  <button
                    type="button"
                    onClick={() => void loadUsers()}
                    className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Refresh
                  </button>
                </div>

                {isLoadingUsers ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading role distribution...</p>
                ) : usersError ? (
                  <p className="text-sm text-rose-500">{usersError}</p>
                ) : roleDistribution.length === 0 ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">No role data available.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {roleDistribution.map((entry) => (
                      <div
                        key={`role-card-${entry.role}`}
                        className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45"
                      >
                        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                          {getAdminRoleIcon(entry.role, "h-4 w-4")}
                          {entry.role}
                        </p>
                        <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-100">{entry.count}</p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">members assigned this role</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeSection === "auditLog" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Audit Log</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={exportSecurityLoginsCsv}
                      disabled={securityRecentLogins.length === 0}
                      className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Export CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadSecurity()}
                      className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                {isLoadingSecurity ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading audit entries...</p>
                ) : securityError ? (
                  <p className="text-sm text-rose-500">{securityError}</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
                    <div className="grid grid-cols-[1.2fr_1fr_0.8fr_1fr] gap-2 bg-zinc-200/80 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      <p><span className="inline-flex items-center gap-1"><ScrollText className="h-3.5 w-3.5" /> User</span></p>
                      <p>Email</p>
                      <p>Role</p>
                      <p>Last Login</p>
                    </div>
                    <div className="max-h-80 overflow-y-auto bg-white/80 text-xs text-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200">
                      {securityRecentLogins.length === 0 ? (
                        <p className="px-3 py-3 text-zinc-600 dark:text-zinc-300">No audit-like activity found.</p>
                      ) : (
                        securityRecentLogins.map((row, index) => (
                          <div
                            key={`audit-row-${row.userId}-${index}`}
                            className={cn(
                              "grid grid-cols-[1.2fr_1fr_0.8fr_1fr] gap-2 px-3 py-2",
                              index % 2 === 0
                                ? "bg-white/70 dark:bg-zinc-950/25"
                                : "bg-zinc-100/70 dark:bg-zinc-900/35"
                            )}
                          >
                            <p className="truncate" title={`${row.name} (${row.userId})`}>{row.name}</p>
                            <p className="truncate" title={row.email || "N/A"}>{row.email || "N/A"}</p>
                            <p className="truncate" title={row.role}>{row.role}</p>
                            <p className="truncate" title={formatDateTime(row.lastLogin)}>{formatDateTime(row.lastLogin)}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeSection === "invites" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Invites</p>
                  <button
                    type="button"
                    onClick={() => void loadServers()}
                    className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Refresh
                  </button>
                </div>

                {isLoadingServers ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading invites overview...</p>
                ) : serversError ? (
                  <p className="text-sm text-rose-500">{serversError}</p>
                ) : (
                  <>
                    <div className="mb-4 grid gap-2 md:grid-cols-2">
                      <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Servers with Invite</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{inviteCoverage.withInvites}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Servers without Invite</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{inviteCoverage.withoutInvites}</p>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
                      <div className="grid grid-cols-[1fr_0.8fr_1fr] gap-2 bg-zinc-200/80 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        <p>Server</p>
                        <p><span className="inline-flex items-center gap-1"><Link2 className="h-3.5 w-3.5" /> Invite</span></p>
                        <p>Owner</p>
                      </div>
                      <div className="max-h-80 overflow-y-auto bg-white/80 text-xs text-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200">
                        {servers.length === 0 ? (
                          <p className="px-3 py-3 text-zinc-600 dark:text-zinc-300">No servers available.</p>
                        ) : (
                          servers.map((row, index) => (
                            <div
                              key={`invite-row-${row.id}`}
                              className={cn(
                                "grid grid-cols-[1fr_0.8fr_1fr] gap-2 px-3 py-2",
                                index % 2 === 0
                                  ? "bg-white/70 dark:bg-zinc-950/25"
                                  : "bg-zinc-100/70 dark:bg-zinc-900/35"
                              )}
                            >
                              <p className="truncate" title={row.name}>{row.name}</p>
                              <p className="truncate font-mono" title={row.inviteCode || "N/A"}>{row.inviteCode || "N/A"}</p>
                              <p className="truncate" title={row.ownerName}>{row.ownerName}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeSection === "emojiStickers" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    <Smile className="h-4 w-4" />
                    <Sticker className="h-4 w-4" />
                    Emoji & Stickers
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadEmojiStickers()}
                    className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Refresh
                  </button>
                </div>

                <div className="mb-4 grid gap-2 md:grid-cols-4">
                  <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Visible Assets</p>
                    <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{emojiStickerSummary?.totalAssets ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Emoji</p>
                    <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{emojiStickerSummary?.emojiAssets ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Stickers</p>
                    <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{emojiStickerSummary?.stickerAssets ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Active</p>
                    <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{emojiStickerSummary?.activeAssets ?? 0}</p>
                  </div>
                </div>

                <div className="mb-4 rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                  <p className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">Add Asset</p>

                  <div className="grid gap-2 md:grid-cols-[1fr_130px_180px_1fr_auto]">
                    <select
                      value={newEmojiStickerServerId}
                      onChange={(event) => setNewEmojiStickerServerId(event.target.value)}
                      className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value="">Select server</option>
                      {emojiStickerServerOptions.map((serverOption) => (
                        <option key={`new-emoji-server-${serverOption.id}`} value={serverOption.id}>
                          {serverOption.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={newEmojiStickerType}
                      onChange={(event) => setNewEmojiStickerType(event.target.value as typeof newEmojiStickerType)}
                      className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value="EMOJI">Emoji</option>
                      <option value="STICKER">Sticker</option>
                    </select>

                    <input
                      type="text"
                      value={newEmojiStickerName}
                      onChange={(event) => setNewEmojiStickerName(event.target.value.toLowerCase())}
                      placeholder="name (e.g. party_blob)"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />

                    <input
                      type="text"
                      value={newEmojiStickerValue}
                      onChange={(event) => setNewEmojiStickerValue(event.target.value)}
                      placeholder={newEmojiStickerType === "EMOJI" ? "emoji character" : "sticker URL or /uploads/..."}
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />

                    <button
                      type="button"
                      onClick={() => void onCreateEmojiSticker()}
                      disabled={creatingEmojiSticker}
                      className="h-9 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {creatingEmojiSticker ? "Saving..." : "Add"}
                    </button>
                  </div>

                  <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Sticker tip: upload through your media flow first, then paste the URL here to track and moderate it per server.
                  </p>
                </div>

                <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_160px_160px_auto]">
                  <select
                    value={emojiStickerServerFilter}
                    onChange={(event) => setEmojiStickerServerFilter(event.target.value)}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="ALL">All servers</option>
                    {emojiStickerServerOptions.map((serverOption) => (
                      <option key={`emoji-filter-server-${serverOption.id}`} value={serverOption.id}>
                        {serverOption.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={emojiStickerTypeFilter}
                    onChange={(event) => setEmojiStickerTypeFilter(event.target.value as typeof emojiStickerTypeFilter)}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="ALL">All types</option>
                    <option value="EMOJI">Emoji</option>
                    <option value="STICKER">Sticker</option>
                  </select>

                  <select
                    value={emojiStickerStatusFilter}
                    onChange={(event) => setEmojiStickerStatusFilter(event.target.value as typeof emojiStickerStatusFilter)}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="ALL">All status</option>
                    <option value="ACTIVE">Active</option>
                    <option value="DISABLED">Disabled</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      setEmojiStickerServerFilter("ALL");
                      setEmojiStickerTypeFilter("ALL");
                      setEmojiStickerStatusFilter("ALL");
                    }}
                    disabled={!hasActiveEmojiStickerFilters}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Clear filters
                  </button>
                </div>

                {emojiStickersError ? (
                  <p className="mb-3 text-xs text-rose-500">{emojiStickersError}</p>
                ) : null}
                {emojiStickerActionSuccess ? (
                  <p className="mb-3 text-xs text-emerald-500">{emojiStickerActionSuccess}</p>
                ) : null}

                {isLoadingEmojiStickers ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading emoji/sticker inventory...</p>
                ) : emojiStickerAssets.length === 0 ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">No assets found for current filters.</p>
                ) : (
                  <div className="space-y-2">
                    {emojiStickerAssets.map((asset) => {
                      const isActionPending = emojiStickerActionItemId === asset.id;

                      return (
                        <div
                          key={asset.id}
                          className="rounded-lg border border-zinc-300 bg-white/85 p-3 dark:border-zinc-700 dark:bg-zinc-900/45"
                        >
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                {asset.assetType === "EMOJI" ? "Emoji" : "Sticker"} • {asset.name}
                              </p>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                {asset.serverName} · added by {asset.createdByName}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
                                asset.isEnabled
                                  ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-200"
                                  : "border-zinc-500/35 bg-zinc-500/15 text-zinc-200"
                              )}
                            >
                              {asset.isEnabled ? "ACTIVE" : "DISABLED"}
                            </span>
                          </div>

                          <div className="grid gap-2 text-xs text-zinc-700 dark:text-zinc-300 md:grid-cols-[auto_1fr]">
                            {asset.assetType === "EMOJI" ? (
                              <p className="text-2xl leading-none">{asset.emoji || "🙂"}</p>
                            ) : asset.imageUrl ? (
                              <a
                                href={asset.imageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
                              >
                                <Image
                                  src={asset.imageUrl}
                                  alt={asset.name}
                                  width={64}
                                  height={64}
                                  className="h-full w-full object-contain"
                                  unoptimized
                                />
                              </a>
                            ) : (
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">No preview</p>
                            )}

                            <div className="min-w-0">
                              {asset.imageUrl ? (
                                <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400" title={asset.imageUrl}>
                                  {asset.imageUrl}
                                </p>
                              ) : null}
                              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                                Updated: {formatDateTime(asset.updatedAt)}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-300/70 pt-3 dark:border-zinc-700/70">
                            <button
                              type="button"
                              onClick={() => void onEmojiStickerAction(asset.id, asset.isEnabled ? "DISABLE" : "ENABLE")}
                              disabled={isActionPending}
                              className={cn(
                                "h-8 rounded-md px-3 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
                                asset.isEnabled
                                  ? "border border-zinc-500/35 bg-zinc-500/15 text-zinc-200 hover:bg-zinc-500/25"
                                  : "border border-emerald-500/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                              )}
                            >
                              {asset.isEnabled ? "Disable" : "Enable"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void onEmojiStickerAction(asset.id, "DELETE")}
                              disabled={isActionPending}
                              className="h-8 rounded-md border border-rose-500/35 bg-rose-500/15 px-3 text-xs font-medium text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Delete
                            </button>
                            {isActionPending ? (
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Updating...</p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeSection === "webhooks" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  <Webhook className="h-4 w-4" />
                  Webhooks
                </div>
                <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/45 dark:text-zinc-200">
                  Webhooks area added.
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Next step: add create/revoke/list webhook endpoints and per-server secret rotation controls.</p>
                </div>
              </div>
            )}

            {activeSection === "security" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Security & Audit</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={exportSecurityLoginsCsv}
                      disabled={securityRecentLogins.length === 0}
                      className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Export CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadSecurity()}
                      className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                {isLoadingSecurity ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading security insights...</p>
                ) : securityError ? (
                  <p className="text-sm text-rose-500">{securityError}</p>
                ) : (
                  <>
                    <div className="grid gap-2 md:grid-cols-5">
                      <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Users</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{securitySummary?.totalUsers ?? 0}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Admins</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{securitySummary?.adminUsers ?? 0}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Inactive 30d</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{securitySummary?.inactive30d ?? 0}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Never Logged In</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{securitySummary?.neverLoggedIn ?? 0}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Servers Missing Owner</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{securitySummary?.serversWithoutValidOwner ?? 0}</p>
                      </div>
                    </div>

                    <div className="mt-4 overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
                      <div className="grid grid-cols-[1.2fr_1fr_0.8fr_1fr] gap-2 bg-zinc-200/80 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        <p>User</p>
                        <p>Email</p>
                        <p>Role</p>
                        <p>Last Login</p>
                      </div>
                      <div className="max-h-80 overflow-y-auto bg-white/80 text-xs text-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200">
                        {securityRecentLogins.length === 0 ? (
                          <p className="px-3 py-3 text-zinc-600 dark:text-zinc-300">No login activity found.</p>
                        ) : (
                          securityRecentLogins.map((row, index) => (
                            <div
                              key={`security-login-${row.userId}-${index}`}
                              className={cn(
                                "grid grid-cols-[1.2fr_1fr_0.8fr_1fr] gap-2 px-3 py-2",
                                index % 2 === 0
                                  ? "bg-white/70 dark:bg-zinc-950/25"
                                  : "bg-zinc-100/70 dark:bg-zinc-900/35"
                              )}
                            >
                              <p className="truncate" title={`${row.name} (${row.userId})`}>{row.name}</p>
                              <p className="truncate" title={row.email || "N/A"}>{row.email || "N/A"}</p>
                              <p className="truncate" title={row.role}>{row.role}</p>
                              <p className="truncate" title={formatDateTime(row.lastLogin)}>{formatDateTime(row.lastLogin)}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeSection === "integrations" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Integrations</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={exportIntegrationsUsersCsv}
                      disabled={topConnectedUsers.length === 0}
                      className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Export CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadIntegrations()}
                      className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                {isLoadingIntegrations ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading integration insights...</p>
                ) : integrationsError ? (
                  <p className="text-sm text-rose-500">{integrationsError}</p>
                ) : (
                  <>
                    <div className="mb-4 grid gap-2 md:grid-cols-2">
                      <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Users with Connections</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{integrationsSummary?.usersWithConnections ?? 0}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Total Linked Accounts</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{integrationsSummary?.totalLinkedAccounts ?? 0}</p>
                      </div>
                    </div>

                    <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {integrationProviders.map((provider) => (
                        <div
                          key={`integration-provider-${provider.key}`}
                          className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45"
                        >
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">{provider.key}</p>
                          <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-100">{provider.connectedUsers}</p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">connected users</p>
                        </div>
                      ))}
                    </div>

                    <div className="overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
                      <div className="grid grid-cols-[1fr_1fr_80px] gap-2 bg-zinc-200/80 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        <p>User ID</p>
                        <p>Providers</p>
                        <p>Count</p>
                      </div>
                      <div className="max-h-80 overflow-y-auto bg-white/80 text-xs text-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200">
                        {topConnectedUsers.length === 0 ? (
                          <p className="px-3 py-3 text-zinc-600 dark:text-zinc-300">No linked accounts found.</p>
                        ) : (
                          topConnectedUsers.map((row, index) => (
                            <div
                              key={`integration-user-${row.userId}-${index}`}
                              className={cn(
                                "grid grid-cols-[1fr_1fr_80px] gap-2 px-3 py-2",
                                index % 2 === 0
                                  ? "bg-white/70 dark:bg-zinc-950/25"
                                  : "bg-zinc-100/70 dark:bg-zinc-900/35"
                              )}
                            >
                              <p className="truncate" title={row.userId}>{row.userId}</p>
                              <p className="truncate" title={row.providers.join(", ")}>{row.providers.join(", ")}</p>
                              <p>{row.count}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};
