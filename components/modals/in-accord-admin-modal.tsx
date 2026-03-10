"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType, type MouseEvent as ReactMouseEvent } from "react";
import { Baby, Bot, Briefcase, Bug, ChevronDown, ChevronRight, Crown, Database, ExternalLink, Eye, EyeOff, Flag, Heart, Link2, Mail, MessageCircle, School, ScrollText, Server, Settings2, ShieldAlert, ShieldCheck, Smile, Trash2, Users, Webhook, Wrench } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BotAppBadge } from "@/components/bot-app-badge";
import { BusinessMemberIcon } from "@/components/business-member-icon";
import { ModeratorLineIcon } from "@/components/moderator-line-icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProfileNameWithServerTag } from "@/components/profile-name-with-server-tag";
import { ProfileIconRow } from "@/components/profile-icon-row";
import { ServerProfilePopover } from "@/components/modals/server-profile-popover";
import { UserAvatar } from "@/components/user-avatar";
import { useModal } from "@/hooks/use-modal-store";
import { getInAccordStaffLabel, isInAccordAdministrator, isInAccordDeveloper, isInAccordModerator } from "@/lib/in-accord-admin";
import { resolveProfileIcons } from "@/lib/profile-icons";
import { ADMINISTRATOR_ROLE_KEY, IMMUTABLE_ACCOUNT_USER_ID } from "@/lib/account-security-constants";
import { isBotUser } from "@/lib/is-bot-user";
import { normalizePresenceStatus, presenceStatusLabelMap } from "@/lib/presence-status";
import { cn } from "@/lib/utils";

type AdminSection =
  | "general"
  | "members"
  | "iaServerMenu"
  | "servers"
  | "serverTags"
  | "reported"
  | "issuesBugs"
  | "moderation"
  | "roles"
  | "familyCenter"
  | "businessCenter"
  | "schoolCenter"
  | "auditLog"
  | "invites"
  | "emojiStickers"
  | "webhooks"
  | "security"
  | "databaseManagement"
  | "integrations"
  | "patronage"
  | "OtherAppsBots";

const adminSections = [
  "general",
  "members",
  "iaServerMenu",
  "servers",
  "serverTags",
  "reported",
  "issuesBugs",
  "moderation",
  "roles",
  "familyCenter",
  "businessCenter",
  "schoolCenter",
  "patronage",
  "invites",
  "emojiStickers",
  "webhooks",
  "security",
  "databaseManagement",
  "integrations",
  "OtherAppsBots",
] as const;

const adminSectionSet = new Set<AdminSection>(adminSections);

const adminSectionMeta: Record<AdminSection, { label: string; description: string }> = {
  general: {
    label: "I-A Information",
    description: "View build status, profile context, and top-level administration details.",
  },
  members: {
    label: "I-A Accounts",
    description: "Manage member accounts, role assignments, and profile-level administration.",
  },
  iaServerMenu: {
    label: "I-A Server",
    description: "Quick access hub for server operations, invites, tags, and webhook controls.",
  },
  servers: {
    label: "Servers",
    description: "Browse servers, owners, and server activity details.",
  },
  serverTags: {
    label: "Server Tags",
    description: "Configure server tag codes and icon assignments.",
  },
  reported: {
    label: "Reports",
    description: "Review submitted reports and moderation targets.",
  },
  issuesBugs: {
    label: "Issues & Bugs",
    description: "Track bug reports and product issues from users.",
  },
  moderation: {
    label: "Moderation",
    description: "Handle moderation actions, case review, and policy enforcement.",
  },
  roles: {
    label: "I-A Roles",
    description: "Create, update, and maintain role definitions and permissions.",
  },
  familyCenter: {
    label: "Family Center",
    description: "Manage family safety settings and linked account relationships.",
  },
  businessCenter: {
    label: "Business Center",
    description: "Review business workspaces, members, and organization controls.",
  },
  schoolCenter: {
    label: "School Center",
    description: "Monitor school communities, users, and education-focused settings.",
  },
  auditLog: {
    label: "Audit Log",
    description: "Inspect historical admin activity and security-relevant events.",
  },
  invites: {
    label: "Invites",
    description: "Audit invite coverage and invite code availability.",
  },
  emojiStickers: {
    label: "Emoji & Stickers",
    description: "Moderate and manage server emoji and sticker assets.",
  },
  webhooks: {
    label: "Webhooks",
    description: "Configure webhook endpoints and monitor outbound integrations.",
  },
  security: {
    label: "Security & Audit",
    description: "Review security posture, login activity, and account protections.",
  },
  databaseManagement: {
    label: "I-A DB",
    description: "View database-related information and maintenance entry points.",
  },
  integrations: {
    label: "Integrations",
    description: "Manage third-party connections and integration health.",
  },
  patronage: {
    label: "Patronage",
    description: "Review support activity and patronage-related account insights.",
  },
  OtherAppsBots: {
    label: "Apps & Bots",
    description: "Manage app connections, bot presence, and automation settings.",
  },
};

type AdminMenuGroupId =
  | "workspace"
  | "serverOperations"
  | "moderationSafety"
  | "connections"
  | "communityPrograms"
  | "supportRevenue";

const adminMenuGroups: Array<{ id: AdminMenuGroupId; label: string; sections: AdminSection[] }> = [
  {
    id: "workspace",
    label: "Workspace",
    sections: ["general", "members", "roles", "iaServerMenu", "databaseManagement", "security"],
  },
  {
    id: "serverOperations",
    label: "Server Operations",
    sections: ["servers", "serverTags", "invites", "emojiStickers", "webhooks"],
  },
  {
    id: "moderationSafety",
    label: "Moderation & Safety",
    sections: ["moderation", "reported", "issuesBugs"],
  },
  {
    id: "connections",
    label: "Connections",
    sections: ["integrations", "OtherAppsBots"],
  },
  {
    id: "communityPrograms",
    label: "Community Programs",
    sections: ["familyCenter", "businessCenter", "schoolCenter"],
  },
  {
    id: "supportRevenue",
    label: "Support & Revenue",
    sections: ["patronage"],
  },
];

const adminMenuItemMeta: Record<AdminSection, { label: string; icon: ComponentType<{ className?: string }> }> = {
  general: { label: "I-A Information", icon: Settings2 },
  members: { label: "I-A Accounts", icon: Users },
  iaServerMenu: { label: "I-A Server", icon: Server },
  servers: { label: "Servers", icon: Server },
  serverTags: { label: "Server Tags", icon: Flag },
  reported: { label: "Reports", icon: Flag },
  issuesBugs: { label: "Issues & Bugs", icon: Bug },
  moderation: { label: "Moderation", icon: ShieldAlert },
  roles: { label: "I-A Roles", icon: Crown },
  familyCenter: { label: "Family Center", icon: Baby },
  businessCenter: { label: "Business Center", icon: Briefcase },
  schoolCenter: { label: "School Center", icon: School },
  auditLog: { label: "Audit Log", icon: ScrollText },
  invites: { label: "Invites", icon: Link2 },
  emojiStickers: { label: "Emoji & Stickers", icon: Smile },
  webhooks: { label: "Webhooks", icon: Webhook },
  security: { label: "Security & Audit", icon: ShieldCheck },
  databaseManagement: { label: "I-A DB", icon: Database },
  integrations: { label: "Integrations", icon: ExternalLink },
  patronage: { label: "Patronage", icon: Heart },
  OtherAppsBots: { label: "Apps & Bots", icon: Bot },
};

const normalizeAdminSection = (value: unknown): AdminSection | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  return adminSectionSet.has(normalized as AdminSection)
    ? (normalized as AdminSection)
    : null;
};

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
  appsTotal?: number;
  botsTotal?: number;
  enabledApps?: number;
  enabledBots?: number;
  usersWithOtherConfigs?: number;
};

type AdminOtherConfig = {
  id: string;
  userId: string;
  name: string;
  email: string;
  type: "APP" | "BOT";
  configName: string;
  applicationId: string;
  enabled: boolean;
  createdAt: string;
};

type OtherConfigSortKey = "createdAt" | "status" | "type";
type OtherSortDirection = "asc" | "desc";

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
  targetType: "USER" | "SERVER" | "MESSAGE" | "BUG";
  targetId: string;
  targetName: string;
  reason: string;
  details: string;
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";
  adminNote: string;
  assignedAdminProfileId: string | null;
  assignedAdminName?: string | null;
  assignedAdminEmail?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type AdminPatronageEntry = {
  id: string;
  donorProfileId: string | null;
  donorName: string | null;
  donorEmail: string | null;
  donationType: "ONE_TIME" | "MONTHLY";
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "REFUNDED";
  amountCents: number;
  currency: string;
  provider: string | null;
  providerReference: string | null;
  note: string | null;
  processedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type AdminPatronageSummary = {
  totalRecords: number;
  oneTimeCount: number;
  monthlyCount: number;
  successfulAmountCents: number;
  monthlyRecurringAmountCents: number;
};

type AdminPatronageSetup = {
  hasStripeSecretKey: boolean;
  hasStripePublishableKey: boolean;
  hasStripeWebhookSecret: boolean;
  stripeSecretKeyPreview: string;
  stripePublishableKeyPreview: string;
  stripeWebhookSecretPreview: string;
  payoutAccountLabel: string | null;
  payoutContactEmail: string | null;
  payoutNotice: string | null;
  updatedAt: string | null;
};

type AdminSiteUrlSetup = {
  appBaseUrl: string | null;
  hostingServiceName: string | null;
  hostingHostName: string | null;
  hostingHostUrl: string | null;
  hostingLogin: string | null;
  hostingPassword: string | null;
  hostingCost: string | null;
  databaseServiceName: string | null;
  databaseHostName: string | null;
  databaseHostUrl: string | null;
  databaseLogin: string | null;
  databasePassword: string | null;
  databaseCost: string | null;
  effectiveAppBaseUrl: string;
  envAppBaseUrl: string | null;
  usesOverride: boolean;
  updatedAt: string | null;
};

type AdminServerPerformance = {
  uptimeSeconds: number;
  nodeVersion: string;
  databasePingMs: number;
  totalMembers: number;
  totalServers: number;
  totalChannels: number;
  totalMessages: number;
  memoryRssMb: number;
  memoryHeapUsedMb: number;
  updatedAt: string | null;
};

type AdminManagedFile = {
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
  updatedAt: string;
  url: string | null;
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

type AdminManagedRole = {
  roleKey: string;
  roleLabel: string;
  isSystem: boolean;
  memberCount: number;
};

type AdminMetaInfo = {
  build: {
    appName: string;
    appVersion: string;
    sdkVersion: string;
    nextVersion: string;
    nodeEnv: string;
    buildTimestamp: string;
    commitSha: string | null;
    branch: string | null;
  };
  github: {
    repositoryUrl: string | null;
    homepageUrl: string | null;
    issuesUrl: string | null;
  };
  storage?: {
    documentStorageConfigured?: boolean;
    provider?: string;
    applicationsPath?: string;
  };
  commits: Array<{
    sha: string;
    shortSha: string;
    message: string;
    author: string;
    committedAt: string;
  }>;
  githubMainCommits?: Array<{
    sha: string;
    shortSha: string;
    message: string;
    url: string;
    committedAt: string;
  }>;
};

type AdminWebhook = {
  id: string;
  name: string;
  endpointUrl: string;
  eventType: string;
  serverId: string | null;
  serverName: string | null;
  enabled: boolean;
  secretPreview: string;
  createdByProfileId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type AdminFamilyCenterEntry = {
  applicationId: string;
  submittedBy: string;
  imageUrl: string;
  userId: string;
  displayName: string;
  email: string;
  role: string;
  businessMembersCount?: number;
  businessDesignation?: string;
  businessSection?: string;
  familyMembersCount: number;
  familyDesignation: string;
  applicationStatus: string;
  applicationSubmittedAt: string | null;
  applicationFiles: Array<{
    name: string;
    url: string;
    mimeType: string;
    size: number;
    uploadedAt: string;
  }>;
  preferenceUpdatedAt: string | null;
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

  const normalizedCustom = normalized.replace(/[\s-]+/g, "_");
  if (/^[A-Z][A-Z0-9_]{1,63}$/.test(normalizedCustom)) {
    return normalizedCustom;
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

const isNetworkFetchFailure = (error: unknown) => {
  if (!(error instanceof TypeError)) {
    return false;
  }

  return /failed to fetch|networkerror|load failed/i.test(String(error.message ?? ""));
};

const formatManagedRoleLabelFromKey = (roleKey: string) =>
  roleKey
    .split("_")
    .filter(Boolean)
    .map((token) => token.slice(0, 1) + token.slice(1).toLowerCase())
    .join(" ") || roleKey;

const isInAccordOtherConfig = (row: Pick<AdminOtherConfig, "configName" | "applicationId">) => {
  const source = `${row.configName} ${row.applicationId}`.toLowerCase();
  return (
    source.includes("in-accord") ||
    source.includes("in accord") ||
    source.includes("inaccord")
  );
};

export const InAccordAdminModal = () => {
  const { isOpen, onClose, type, data } = useModal();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<AdminSection>("general");
  const [collapsedMenuGroups, setCollapsedMenuGroups] = useState<Record<AdminMenuGroupId, boolean>>({
    workspace: false,
    serverOperations: false,
    moderationSafety: false,
    connections: false,
    communityPrograms: true,
    supportRevenue: true,
  });
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
  const [columnWidths, setColumnWidths] = useState([240, 210, 230, 180, 100, 100]);
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
  const [isAssigningBotsRole, setIsAssigningBotsRole] = useState(false);
  const [userRoleDrafts, setUserRoleDrafts] = useState<Record<string, string>>({});
  const [userPhoneDrafts, setUserPhoneDrafts] = useState<Record<string, string>>({});
  const [userDateOfBirthDrafts, setUserDateOfBirthDrafts] = useState<Record<string, string>>({});
  const [securitySummary, setSecuritySummary] = useState<AdminSecuritySummary | null>(null);
  const [securityRecentLogins, setSecurityRecentLogins] = useState<AdminRecentLogin[]>([]);
  const [isLoadingSecurity, setIsLoadingSecurity] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [moderationFocus, setModerationFocus] = useState<"REVIEW_QUEUE" | "ADMIN_COVERAGE" | "OWNER_ISSUES">("REVIEW_QUEUE");
  const [moderationSearch, setModerationSearch] = useState("");
  const [integrationsSummary, setIntegrationsSummary] = useState<AdminIntegrationsSummary | null>(null);
  const [integrationProviders, setIntegrationProviders] = useState<AdminIntegrationProvider[]>([]);
  const [topConnectedUsers, setTopConnectedUsers] = useState<AdminTopConnectedUser[]>([]);
  const [recentOtherConfigs, setRecentOtherConfigs] = useState<AdminOtherConfig[]>([]);
  const [OtherConfigQuery, setOtherConfigQuery] = useState("");
  const [OtherConfigTypeFilter, setOtherConfigTypeFilter] = useState<"ALL" | "APP" | "BOT">("ALL");
  const [OtherConfigStatusFilter, setOtherConfigStatusFilter] = useState<"ALL" | "ENABLED" | "DISABLED">("ALL");
  const [editingOtherConfigKey, setEditingOtherConfigKey] = useState<string | null>(null);
  const [OtherConfigDrafts, setOtherConfigDrafts] = useState<Record<string, { configName: string; applicationId: string }>>({});
  const [OtherConfigActionPendingKey, setOtherConfigActionPendingKey] = useState<string | null>(null);
  const [OtherConfigActionError, setOtherConfigActionError] = useState<string | null>(null);
  const [OtherConfigActionSuccess, setOtherConfigActionSuccess] = useState<string | null>(null);
  const [OtherConfigSortKey, setOtherConfigSortKey] = useState<OtherConfigSortKey>("createdAt");
  const [OtherConfigSortDirection, setOtherConfigSortDirection] = useState<OtherSortDirection>("desc");
  const [isLoadingIntegrations, setIsLoadingIntegrations] = useState(false);
  const [integrationsError, setIntegrationsError] = useState<string | null>(null);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [reportStatusFilter, setReportStatusFilter] = useState<"ALL" | AdminReport["status"]>("ALL");
  const [reportTargetTypeFilter, setReportTargetTypeFilter] = useState<"ALL" | "USER" | "SERVER" | "MESSAGE" | "BUG">("ALL");
  const [updatingReportId, setUpdatingReportId] = useState<string | null>(null);
  const [reportStatusDrafts, setReportStatusDrafts] = useState<Record<string, AdminReport["status"]>>({});
  const [reportNoteDrafts, setReportNoteDrafts] = useState<Record<string, string>>({});
  const [reportPostNoteDrafts, setReportPostNoteDrafts] = useState<Record<string, string>>({});
  const [reportSeverityDrafts, setReportSeverityDrafts] = useState<Record<string, "LOW" | "MEDIUM" | "HIGH" | "CRITICAL">>({});
  const [viewingIssueReport, setViewingIssueReport] = useState<AdminReport | null>(null);
  const [viewingReportNotes, setViewingReportNotes] = useState<AdminReport | null>(null);
  const [viewingReportNoteEntry, setViewingReportNoteEntry] = useState<string | null>(null);
  const [patronageEntries, setPatronageEntries] = useState<AdminPatronageEntry[]>([]);
  const [patronageSummary, setPatronageSummary] = useState<AdminPatronageSummary | null>(null);
  const [isLoadingPatronage, setIsLoadingPatronage] = useState(false);
  const [patronageError, setPatronageError] = useState<string | null>(null);
  const [patronageActionSuccess, setPatronageActionSuccess] = useState<string | null>(null);
  const [patronageSearch, setPatronageSearch] = useState("");
  const [patronageTypeFilter, setPatronageTypeFilter] = useState<"ALL" | "ONE_TIME" | "MONTHLY">("ALL");
  const [patronageStatusFilter, setPatronageStatusFilter] = useState<"ALL" | "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "REFUNDED">("ALL");
  const [patronageSetup, setPatronageSetup] = useState<AdminPatronageSetup | null>(null);
  const [isLoadingPatronageSetup, setIsLoadingPatronageSetup] = useState(false);
  const [isSavingPatronageSetup, setIsSavingPatronageSetup] = useState(false);
  const [patronageSetupSecretDraft, setPatronageSetupSecretDraft] = useState("");
  const [patronageSetupPublishableDraft, setPatronageSetupPublishableDraft] = useState("");
  const [patronageSetupWebhookDraft, setPatronageSetupWebhookDraft] = useState("");
  const [patronagePayoutLabelDraft, setPatronagePayoutLabelDraft] = useState("");
  const [patronagePayoutContactEmailDraft, setPatronagePayoutContactEmailDraft] = useState("");
  const [patronagePayoutNoticeDraft, setPatronagePayoutNoticeDraft] = useState("");
  const [siteUrlSetup, setSiteUrlSetup] = useState<AdminSiteUrlSetup | null>(null);
  const [siteUrlDraft, setSiteUrlDraft] = useState("");
  const [hostingServiceNameDraft, setHostingServiceNameDraft] = useState("");
  const [hostingHostNameDraft, setHostingHostNameDraft] = useState("");
  const [hostingHostUrlDraft, setHostingHostUrlDraft] = useState("");
  const [hostingLoginDraft, setHostingLoginDraft] = useState("");
  const [hostingPasswordDraft, setHostingPasswordDraft] = useState("");
  const [hostingCostDraft, setHostingCostDraft] = useState("");
  const [databaseServiceNameDraft, setDatabaseServiceNameDraft] = useState("");
  const [databaseHostNameDraft, setDatabaseHostNameDraft] = useState("");
  const [databaseHostUrlDraft, setDatabaseHostUrlDraft] = useState("");
  const [databaseLoginDraft, setDatabaseLoginDraft] = useState("");
  const [databasePasswordDraft, setDatabasePasswordDraft] = useState("");
  const [databaseCostDraft, setDatabaseCostDraft] = useState("");
  const [isLoadingSiteUrlSetup, setIsLoadingSiteUrlSetup] = useState(false);
  const [isSavingSiteUrlSetup, setIsSavingSiteUrlSetup] = useState(false);
  const [siteUrlError, setSiteUrlError] = useState<string | null>(null);
  const [siteUrlSuccess, setSiteUrlSuccess] = useState<string | null>(null);
  const [serverPerformance, setServerPerformance] = useState<AdminServerPerformance | null>(null);
  const [isLoadingServerPerformance, setIsLoadingServerPerformance] = useState(false);
  const [serverPerformanceError, setServerPerformanceError] = useState<string | null>(null);
  const [managedFiles, setManagedFiles] = useState<AdminManagedFile[]>([]);
  const [managedFilesFolderDraft, setManagedFilesFolderDraft] = useState("");
  const [isLoadingManagedFiles, setIsLoadingManagedFiles] = useState(false);
  const [managedFilesError, setManagedFilesError] = useState<string | null>(null);
  const [managedFilesSuccess, setManagedFilesSuccess] = useState<string | null>(null);
  const [managedFileUpload, setManagedFileUpload] = useState<File | null>(null);
  const [isUploadingManagedFile, setIsUploadingManagedFile] = useState(false);
  const [deletingManagedFilePath, setDeletingManagedFilePath] = useState<string | null>(null);
  const [selectedManagedFilePaths, setSelectedManagedFilePaths] = useState<string[]>([]);
  const [newPatronageDonorName, setNewPatronageDonorName] = useState("");
  const [newPatronageDonorEmail, setNewPatronageDonorEmail] = useState("");
  const [newPatronageType, setNewPatronageType] = useState<"ONE_TIME" | "MONTHLY">("ONE_TIME");
  const [newPatronageAmount, setNewPatronageAmount] = useState("");
  const [newPatronageCurrency, setNewPatronageCurrency] = useState("USD");
  const [newPatronageProvider, setNewPatronageProvider] = useState("");
  const [newPatronageReference, setNewPatronageReference] = useState("");
  const [newPatronageNote, setNewPatronageNote] = useState("");
  const [isCreatingPatronage, setIsCreatingPatronage] = useState(false);
  const [updatingPatronageId, setUpdatingPatronageId] = useState<string | null>(null);
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
  const [managedRoles, setManagedRoles] = useState<AdminManagedRole[]>([]);
  const [isLoadingManagedRoles, setIsLoadingManagedRoles] = useState(false);
  const [managedRolesError, setManagedRolesError] = useState<string | null>(null);
  const [managedRolesActionError, setManagedRolesActionError] = useState<string | null>(null);
  const [managedRolesActionSuccess, setManagedRolesActionSuccess] = useState<string | null>(null);
  const [newRoleKey, setNewRoleKey] = useState("");
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [updatingRoleKey, setUpdatingRoleKey] = useState<string | null>(null);
  const [deletingRoleKey, setDeletingRoleKey] = useState<string | null>(null);
  const [roleLabelDrafts, setRoleLabelDrafts] = useState<Record<string, string>>({});
  const [metaInfo, setMetaInfo] = useState<AdminMetaInfo | null>(null);
  const [isLoadingMetaInfo, setIsLoadingMetaInfo] = useState(false);
  const [metaInfoError, setMetaInfoError] = useState<string | null>(null);
  const [webhooks, setWebhooks] = useState<AdminWebhook[]>([]);
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false);
  const [webhooksError, setWebhooksError] = useState<string | null>(null);
  const [webhooksActionError, setWebhooksActionError] = useState<string | null>(null);
  const [webhooksActionSuccess, setWebhooksActionSuccess] = useState<string | null>(null);
  const [newWebhookName, setNewWebhookName] = useState("");
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookEventType, setNewWebhookEventType] = useState("MESSAGE_CREATE");
  const [newWebhookServerId, setNewWebhookServerId] = useState("GLOBAL");
  const [isCreatingWebhook, setIsCreatingWebhook] = useState(false);
  const [webhookActionPendingId, setWebhookActionPendingId] = useState<string | null>(null);
  const [familyCenterEntries, setFamilyCenterEntries] = useState<AdminFamilyCenterEntry[]>([]);
  const [isLoadingFamilyCenter, setIsLoadingFamilyCenter] = useState(false);
  const [familyCenterError, setFamilyCenterError] = useState<string | null>(null);
  const [familyCenterSuccess, setFamilyCenterSuccess] = useState<string | null>(null);
  const [familyCenterSearch, setFamilyCenterSearch] = useState("");
  const [familyCenterStatusFilter, setFamilyCenterStatusFilter] = useState<"ALL" | "SUBMITTED" | "APROVED" | "DENIED">("ALL");
  const [businessSectionFilter, setBusinessSectionFilter] = useState<string>("ALL");
  const [listRowDensity, setListRowDensity] = useState<"COMPACT" | "COMFORTABLE" | "SPACIOUS">("COMFORTABLE");
  const [familyCenterRowDensity, setFamilyCenterRowDensity] = useState<"COMPACT" | "COMFORTABLE" | "SPACIOUS">("COMFORTABLE");
  const [deletingFamilyApplicationUserId, setDeletingFamilyApplicationUserId] = useState<string | null>(null);
  const [reviewingFamilyApplicationActionUserId, setReviewingFamilyApplicationActionUserId] = useState<string | null>(null);
  const [reviewingFamilyApplication, setReviewingFamilyApplication] = useState<AdminFamilyCenterEntry | null>(null);
  const [previewingFamilyApplicationFile, setPreviewingFamilyApplicationFile] = useState<{
    name: string;
    url: string;
    mimeType: string;
  } | null>(null);


  const isModalOpen = isOpen && type === "inAccordAdmin";

  const notifyAdminTotalsRefresh = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(new Event("inaccord:admin-totals-refresh"));
  }, []);

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
      notifyAdminTotalsRefresh();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_USERS_LOAD]", error);
      setUsersError("Unable to load users right now.");
      setUsers([]);
      setUserRoleDrafts({});
      setUserPhoneDrafts({});
      setUserDateOfBirthDrafts({});
      notifyAdminTotalsRefresh();
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const loadMetaInfo = useCallback(async () => {
    try {
      setIsLoadingMetaInfo(true);
      setMetaInfoError(null);

      const response = await fetch("/api/admin/meta", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load build info (${response.status})`);
      }

      const payload = (await response.json()) as AdminMetaInfo;
      setMetaInfo(payload);
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_META_LOAD]", error);
      setMetaInfo(null);
      setMetaInfoError("Unable to load build and GitHub information right now.");
    } finally {
      setIsLoadingMetaInfo(false);
    }
  }, []);

  const loadManagedRoles = async () => {
    try {
      setIsLoadingManagedRoles(true);
      setManagedRolesError(null);

      const response = await fetch("/api/admin/roles", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load roles (${response.status})`);
      }

      const payload = (await response.json()) as { roles?: AdminManagedRole[] };
      const nextRoles = (payload.roles ?? []).map((role) => ({
        ...role,
        roleKey: normalizeAdminRoleForDisplay(role.roleKey),
        roleLabel: String(role.roleLabel ?? "").trim() || normalizeAdminRoleForDisplay(role.roleKey),
      }));

      setManagedRoles(nextRoles);
      setRoleLabelDrafts(
        nextRoles.reduce<Record<string, string>>((acc, role) => {
          acc[role.roleKey] = role.roleLabel;
          return acc;
        }, {})
      );
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_ROLES_LOAD]", error);
      setManagedRoles([]);
      setRoleLabelDrafts({});
      setManagedRolesError("Unable to load managed roles right now.");
    } finally {
      setIsLoadingManagedRoles(false);
    }
  };

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    const requestedSection = normalizeAdminSection(data.query?.adminSection);
    if (!requestedSection) {
      return;
    }

    setActiveSection(requestedSection);
  }, [data.query, isModalOpen]);

  useEffect(() => {
    if (!isModalOpen || (activeSection !== "members" && activeSection !== "roles")) {
      return;
    }

    loadUsers();
  }, [activeSection, isModalOpen]);

  useEffect(() => {
    if (!isModalOpen || (activeSection !== "members" && activeSection !== "roles")) {
      return;
    }

    void loadManagedRoles();
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
        recentOtherConfigs?: AdminOtherConfig[];
      };

      setIntegrationsSummary(payload.summary ?? null);
      setIntegrationProviders(payload.providers ?? []);
      setTopConnectedUsers(payload.topConnectedUsers ?? []);
      setRecentOtherConfigs(payload.recentOtherConfigs ?? []);
    } catch (error) {
      if (!isNetworkFetchFailure(error)) {
        console.error("[IN_ACCORD_ADMIN_INTEGRATIONS_LOAD]", error);
      }
      setIntegrationsSummary(null);
      setIntegrationProviders([]);
      setTopConnectedUsers([]);
      setRecentOtherConfigs([]);
      setIntegrationsError(
        isNetworkFetchFailure(error)
          ? "Network issue: could not reach integrations insights right now."
          : "Unable to load integrations insights right now."
      );
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
      const effectiveTargetTypeFilter =
        activeSection === "issuesBugs"
          ? "BUG"
          : (activeSection === "reported" && reportTargetTypeFilter === "BUG"
              ? "ALL"
              : reportTargetTypeFilter);
      query.set("targetType", effectiveTargetTypeFilter);

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
      const nextReports = payload.reports ?? [];
      setReports(nextReports);
      setReportStatusDrafts(
        Object.fromEntries(nextReports.map((item) => [item.id, item.status]))
      );
      setReportNoteDrafts(
        Object.fromEntries(nextReports.map((item) => [item.id, item.adminNote ?? ""]))
      );
      setReportSeverityDrafts(
        Object.fromEntries(
          nextReports.map((item) => [item.id, parseReportSeverity(item.reason) ?? "LOW"])
        ) as Record<string, "LOW" | "MEDIUM" | "HIGH" | "CRITICAL">
      );
      notifyAdminTotalsRefresh();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_REPORTS_LOAD]", error);
      setReports([]);
      setReportStatusDrafts({});
      setReportNoteDrafts({});
      setReportSeverityDrafts({});
      setReportsError("Unable to load reports right now.");
      notifyAdminTotalsRefresh();
    } finally {
      setIsLoadingReports(false);
    }
  }, [activeSection, notifyAdminTotalsRefresh, reportStatusFilter, reportTargetTypeFilter]);

  const loadPatronage = useCallback(async () => {
    try {
      setIsLoadingPatronage(true);
      setPatronageError(null);

      const query = new URLSearchParams();
      query.set("type", patronageTypeFilter);
      query.set("status", patronageStatusFilter);
      query.set("search", patronageSearch.trim());

      const response = await fetch(`/api/admin/patronage?${query.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load patronage (${response.status})`);
      }

      const payload = (await response.json()) as {
        entries?: AdminPatronageEntry[];
        summary?: AdminPatronageSummary;
      };

      setPatronageEntries(payload.entries ?? []);
      setPatronageSummary(payload.summary ?? null);
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_PATRONAGE_LOAD]", error);
      setPatronageEntries([]);
      setPatronageSummary(null);
      setPatronageError("Unable to load patronage records right now.");
    } finally {
      setIsLoadingPatronage(false);
    }
  }, [patronageSearch, patronageStatusFilter, patronageTypeFilter]);

  const loadPatronageSetup = useCallback(async () => {
    try {
      setIsLoadingPatronageSetup(true);

      const response = await fetch("/api/admin/patronage-settings", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load patronage setup (${response.status})`);
      }

      const payload = (await response.json()) as { setup?: AdminPatronageSetup };
      const setup = payload.setup ?? null;

      setPatronageSetup(setup);
      setPatronagePayoutLabelDraft(setup?.payoutAccountLabel ?? "");
      setPatronagePayoutContactEmailDraft(setup?.payoutContactEmail ?? "");
      setPatronagePayoutNoticeDraft(setup?.payoutNotice ?? "");
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_PATRONAGE_SETUP_LOAD]", error);
      setPatronageSetup(null);
      setPatronageError("Unable to load payment setup right now.");
    } finally {
      setIsLoadingPatronageSetup(false);
    }
  }, []);

  const onSavePatronageSetup = async () => {
    try {
      setIsSavingPatronageSetup(true);
      setPatronageError(null);
      setPatronageActionSuccess(null);

      const response = await fetch("/api/admin/patronage-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          stripeSecretKey: patronageSetupSecretDraft || undefined,
          stripePublishableKey: patronageSetupPublishableDraft || undefined,
          stripeWebhookSecret: patronageSetupWebhookDraft || undefined,
          payoutAccountLabel: patronagePayoutLabelDraft,
          payoutContactEmail: patronagePayoutContactEmailDraft,
          payoutNotice: patronagePayoutNoticeDraft,
        }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to save payment setup (${response.status})`;
        throw new Error(message);
      }

      const payload = (await response.json()) as { setup?: AdminPatronageSetup };
      setPatronageSetup(payload.setup ?? null);
      setPatronageSetupSecretDraft("");
      setPatronageSetupPublishableDraft("");
      setPatronageSetupWebhookDraft("");
      setPatronageActionSuccess("Payment setup updated.");
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_PATRONAGE_SETUP_SAVE]", error);
      setPatronageError(error instanceof Error ? error.message : "Unable to save payment setup.");
    } finally {
      setIsSavingPatronageSetup(false);
    }
  };

  const loadSiteUrlSetup = useCallback(async () => {
    try {
      setIsLoadingSiteUrlSetup(true);
      setSiteUrlError(null);

      const response = await fetch("/api/admin/site-url", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load site URL setup (${response.status})`);
      }

      const payload = (await response.json()) as { setup?: AdminSiteUrlSetup };
      const setup = payload.setup ?? null;

      setSiteUrlSetup(setup);
      setSiteUrlDraft(setup?.appBaseUrl ?? setup?.effectiveAppBaseUrl ?? "");
      setHostingServiceNameDraft(setup?.hostingServiceName ?? "");
      setHostingHostNameDraft(setup?.hostingHostName ?? "");
      setHostingHostUrlDraft(setup?.hostingHostUrl ?? "");
      setHostingLoginDraft(setup?.hostingLogin ?? "");
      setHostingPasswordDraft(setup?.hostingPassword ?? "");
      setHostingCostDraft(setup?.hostingCost ?? "");
      setDatabaseServiceNameDraft(setup?.databaseServiceName ?? "");
      setDatabaseHostNameDraft(setup?.databaseHostName ?? "");
      setDatabaseHostUrlDraft(setup?.databaseHostUrl ?? "");
      setDatabaseLoginDraft(setup?.databaseLogin ?? "");
      setDatabasePasswordDraft(setup?.databasePassword ?? "");
      setDatabaseCostDraft(setup?.databaseCost ?? "");
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_SITE_URL_LOAD]", error);
      setSiteUrlSetup(null);
      setSiteUrlError("Unable to load In-Accord URL setup right now.");
    } finally {
      setIsLoadingSiteUrlSetup(false);
    }
  }, []);

  const onSaveSiteUrlSetup = async () => {
    try {
      setIsSavingSiteUrlSetup(true);
      setSiteUrlError(null);
      setSiteUrlSuccess(null);

      const response = await fetch("/api/admin/site-url", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          appBaseUrl: siteUrlDraft.trim(),
          hostingServiceName: hostingServiceNameDraft.trim(),
          hostingHostName: hostingHostNameDraft.trim(),
          hostingHostUrl: hostingHostUrlDraft.trim(),
          hostingLogin: hostingLoginDraft.trim(),
          hostingPassword: hostingPasswordDraft,
          hostingCost: hostingCostDraft.trim(),
          databaseServiceName: databaseServiceNameDraft.trim(),
          databaseHostName: databaseHostNameDraft.trim(),
          databaseHostUrl: databaseHostUrlDraft.trim(),
          databaseLogin: databaseLoginDraft.trim(),
          databasePassword: databasePasswordDraft,
          databaseCost: databaseCostDraft.trim(),
        }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to save site URL (${response.status})`;
        throw new Error(message);
      }

      const payload = (await response.json()) as { setup?: AdminSiteUrlSetup };
      const setup = payload.setup ?? null;

      setSiteUrlSetup(setup);
      setSiteUrlDraft(setup?.appBaseUrl ?? setup?.effectiveAppBaseUrl ?? "");
      setHostingServiceNameDraft(setup?.hostingServiceName ?? "");
      setHostingHostNameDraft(setup?.hostingHostName ?? "");
      setHostingHostUrlDraft(setup?.hostingHostUrl ?? "");
      setHostingLoginDraft(setup?.hostingLogin ?? "");
      setHostingPasswordDraft(setup?.hostingPassword ?? "");
      setHostingCostDraft(setup?.hostingCost ?? "");
      setDatabaseServiceNameDraft(setup?.databaseServiceName ?? "");
      setDatabaseHostNameDraft(setup?.databaseHostName ?? "");
      setDatabaseHostUrlDraft(setup?.databaseHostUrl ?? "");
      setDatabaseLoginDraft(setup?.databaseLogin ?? "");
      setDatabasePasswordDraft(setup?.databasePassword ?? "");
      setDatabaseCostDraft(setup?.databaseCost ?? "");
      setSiteUrlSuccess("Hosting and URL settings updated.");
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_SITE_URL_SAVE]", error);
      setSiteUrlError(error instanceof Error ? error.message : "Unable to save In-Accord URL.");
    } finally {
      setIsSavingSiteUrlSetup(false);
    }
  };

  const loadServerPerformance = useCallback(async () => {
    try {
      setIsLoadingServerPerformance(true);
      setServerPerformanceError(null);

      const response = await fetch("/api/admin/server-performance", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load server performance (${response.status})`);
      }

      const payload = (await response.json()) as AdminServerPerformance;
      setServerPerformance(payload);
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_SERVER_PERFORMANCE_LOAD]", error);
      setServerPerformance(null);
      setServerPerformanceError("Unable to load server performance right now.");
    } finally {
      setIsLoadingServerPerformance(false);
    }
  }, []);

  const loadManagedFiles = useCallback(async (folderInput?: string) => {
    try {
      setIsLoadingManagedFiles(true);
      setManagedFilesError(null);

      const folder = String(folderInput ?? managedFilesFolderDraft ?? "").trim();
      const query = new URLSearchParams();
      if (folder) {
        query.set("folder", folder);
      }

      const response = await fetch(`/api/admin/file-manager${query.toString() ? `?${query.toString()}` : ""}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load file manager (${response.status})`);
      }

      const payload = (await response.json()) as {
        folder?: string;
        files?: AdminManagedFile[];
      };

      const nextFiles = payload.files ?? [];
      setManagedFiles(nextFiles);
      setManagedFilesFolderDraft(payload.folder ?? folder);
      setSelectedManagedFilePaths((current) =>
        current.filter((selectedPath) => nextFiles.some((entry) => entry.path === selectedPath))
      );
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_FILE_MANAGER_LOAD]", error);
      setManagedFiles([]);
      setManagedFilesError("Unable to load files right now.");
    } finally {
      setIsLoadingManagedFiles(false);
    }
  }, [managedFilesFolderDraft]);

  const onUploadManagedFile = async () => {
    if (!managedFileUpload) {
      setManagedFilesError("Select a file first.");
      return;
    }

    try {
      setIsUploadingManagedFile(true);
      setManagedFilesError(null);
      setManagedFilesSuccess(null);

      const formData = new FormData();
      formData.append("file", managedFileUpload);
      formData.append("folder", managedFilesFolderDraft.trim());

      const response = await fetch("/api/admin/file-manager", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to upload file (${response.status})`;
        throw new Error(message);
      }

      setManagedFileUpload(null);
      setManagedFilesSuccess("File uploaded.");
      await loadManagedFiles(managedFilesFolderDraft);
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_FILE_MANAGER_UPLOAD]", error);
      setManagedFilesError(error instanceof Error ? error.message : "Unable to upload file.");
    } finally {
      setIsUploadingManagedFile(false);
    }
  };

  const onDeleteManagedFile = async (file: AdminManagedFile) => {
    const confirmed = window.confirm(`Delete ${file.path}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    try {
      setDeletingManagedFilePath(file.path);
      setManagedFilesError(null);
      setManagedFilesSuccess(null);

      const response = await fetch("/api/admin/file-manager", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: file.path }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to delete file (${response.status})`;
        throw new Error(message);
      }

      setManagedFilesSuccess("File deleted.");
      await loadManagedFiles(managedFilesFolderDraft);
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_FILE_MANAGER_DELETE]", error);
      setManagedFilesError(error instanceof Error ? error.message : "Unable to delete file.");
    } finally {
      setDeletingManagedFilePath(null);
    }
  };

  const onOpenCheckedFolder = async () => {
    const selectedFolders = managedFiles.filter(
      (file) => selectedManagedFilePaths.includes(file.path) && file.isDirectory
    );

    if (selectedFolders.length === 0) {
      setManagedFilesError("Select at least one folder checkbox first.");
      return;
    }

    if (selectedFolders.length > 1) {
      setManagedFilesError("Select only one folder to open.");
      return;
    }

    const targetFolder = selectedFolders[0]?.path ?? "";
    setManagedFilesError(null);
    setManagedFilesSuccess(null);
    await loadManagedFiles(targetFolder);
  };

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
      notifyAdminTotalsRefresh();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_SERVERS_LOAD]", error);
      setServersError("Unable to load servers right now.");
      setServers([]);
      notifyAdminTotalsRefresh();
    } finally {
      setIsLoadingServers(false);
    }
  }, [notifyAdminTotalsRefresh]);

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

  const loadWebhooks = useCallback(async () => {
    try {
      setIsLoadingWebhooks(true);
      setWebhooksError(null);

      const response = await fetch("/api/admin/webhooks", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load webhooks (${response.status})`);
      }

      const payload = (await response.json()) as { webhooks?: AdminWebhook[] };
      setWebhooks(payload.webhooks ?? []);
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_WEBHOOKS_LOAD]", error);
      setWebhooks([]);
      setWebhooksError("Unable to load webhooks right now.");
    } finally {
      setIsLoadingWebhooks(false);
    }
  }, []);

  const loadFamilyCenter = useCallback(async () => {
    try {
      setIsLoadingFamilyCenter(true);
      setFamilyCenterError(null);

      const centerApiPath = activeSection === "businessCenter" ? "/api/admin/business-center" : activeSection === "schoolCenter" ? "/api/admin/school-center" : "/api/admin/family-center";

      const response = await fetch(centerApiPath, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load ${activeSection === "businessCenter" ? "business" : activeSection === "schoolCenter" ? "school" : "family"} center records (${response.status})`);
      }

      const payload = (await response.json()) as { entries?: AdminFamilyCenterEntry[] };
      setFamilyCenterEntries(payload.entries ?? []);
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_FAMILY_CENTER_LOAD]", error);
      setFamilyCenterEntries([]);
      setFamilyCenterError(
        `Unable to load ${activeSection === "businessCenter" ? "Business" : activeSection === "schoolCenter" ? "School" : "Family"} Center records right now.`
      );
    } finally {
      setIsLoadingFamilyCenter(false);
    }
  }, [activeSection]);

  useEffect(() => {
    if (
      !isModalOpen ||
      (activeSection !== "security" && activeSection !== "moderation")
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
    if (!isModalOpen || (activeSection !== "integrations" && activeSection !== "OtherAppsBots")) {
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
    if (!isModalOpen || activeSection !== "general") {
      return;
    }

    void loadMetaInfo();
  }, [activeSection, isModalOpen, loadMetaInfo]);

  useEffect(() => {
    if (!isModalOpen || (activeSection !== "servers" && activeSection !== "invites" && activeSection !== "webhooks")) {
      return;
    }

    void loadServers();
  }, [activeSection, isModalOpen, loadServers]);

  useEffect(() => {
    if (!isModalOpen || activeSection !== "webhooks") {
      return;
    }

    void loadWebhooks();
  }, [activeSection, isModalOpen, loadWebhooks]);

  useEffect(() => {
    if (!isModalOpen || (activeSection !== "familyCenter" && activeSection !== "businessCenter" && activeSection !== "schoolCenter")) {
      return;
    }

    void loadFamilyCenter();
  }, [activeSection, isModalOpen, loadFamilyCenter]);

  useEffect(() => {
    if (!isModalOpen || activeSection !== "emojiStickers") {
      return;
    }

    void loadEmojiStickers();
  }, [activeSection, isModalOpen, loadEmojiStickers]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    if (activeSection === "issuesBugs" && reportTargetTypeFilter !== "BUG") {
      setReportTargetTypeFilter("BUG");
      return;
    }

    if (activeSection === "reported" && reportTargetTypeFilter === "BUG") {
      setReportTargetTypeFilter("ALL");
    }
  }, [activeSection, isModalOpen, reportTargetTypeFilter]);

  useEffect(() => {
    if (!isModalOpen || (activeSection !== "reported" && activeSection !== "issuesBugs")) {
      return;
    }

    void loadReports();
  }, [activeSection, isModalOpen, loadReports]);

  useEffect(() => {
    if (!isModalOpen || activeSection !== "patronage") {
      return;
    }

    void loadPatronage();
    void loadPatronageSetup();
  }, [activeSection, isModalOpen, loadPatronage, loadPatronageSetup]);

  useEffect(() => {
    if (!isModalOpen || (activeSection !== "iaServerMenu" && activeSection !== "databaseManagement")) {
      return;
    }

    void loadSiteUrlSetup();
  }, [activeSection, isModalOpen, loadSiteUrlSetup]);

  useEffect(() => {
    if (!isModalOpen || activeSection !== "iaServerMenu") {
      return;
    }

    void loadServerPerformance();
    void loadManagedFiles();
  }, [activeSection, isModalOpen, loadManagedFiles, loadServerPerformance]);

  useEffect(() => {
    const activeGroup = adminMenuGroups.find((group) => group.sections.includes(activeSection));
    if (!activeGroup) {
      return;
    }

    setCollapsedMenuGroups((current) => {
      if (!current[activeGroup.id]) {
        return current;
      }

      return {
        ...current,
        [activeGroup.id]: false,
      };
    });
  }, [activeSection]);

  useEffect(() => {
    if (!isModalOpen) {
      setActiveSection("general");
      setCollapsedMenuGroups({
        workspace: false,
        serverOperations: false,
        moderationSafety: false,
        connections: false,
        communityPrograms: true,
        supportRevenue: true,
      });
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
      setColumnWidths([240, 210, 230, 180, 100, 100]);
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
      setModerationFocus("REVIEW_QUEUE");
      setModerationSearch("");
      setIntegrationsSummary(null);
      setIntegrationProviders([]);
      setTopConnectedUsers([]);
      setRecentOtherConfigs([]);
      setOtherConfigQuery("");
      setOtherConfigTypeFilter("ALL");
      setOtherConfigStatusFilter("ALL");
      setEditingOtherConfigKey(null);
      setOtherConfigDrafts({});
      setOtherConfigActionPendingKey(null);
      setOtherConfigActionError(null);
      setOtherConfigActionSuccess(null);
      setOtherConfigSortKey("createdAt");
      setOtherConfigSortDirection("desc");
      setIsLoadingIntegrations(false);
      setIntegrationsError(null);
      setReports([]);
      setIsLoadingReports(false);
      setReportsError(null);
      setReportStatusFilter("ALL");
      setReportTargetTypeFilter("ALL");
      setUpdatingReportId(null);
      setReportStatusDrafts({});
      setReportNoteDrafts({});
      setReportPostNoteDrafts({});
      setReportSeverityDrafts({});
      setViewingIssueReport(null);
      setViewingReportNotes(null);
      setViewingReportNoteEntry(null);
      setPatronageEntries([]);
      setPatronageSummary(null);
      setIsLoadingPatronage(false);
      setPatronageError(null);
      setPatronageActionSuccess(null);
      setPatronageSearch("");
      setPatronageTypeFilter("ALL");
      setPatronageStatusFilter("ALL");
      setPatronageSetup(null);
      setIsLoadingPatronageSetup(false);
      setIsSavingPatronageSetup(false);
      setPatronageSetupSecretDraft("");
      setPatronageSetupPublishableDraft("");
      setPatronageSetupWebhookDraft("");
      setPatronagePayoutLabelDraft("");
      setPatronagePayoutContactEmailDraft("");
      setPatronagePayoutNoticeDraft("");
      setSiteUrlSetup(null);
      setSiteUrlDraft("");
      setHostingServiceNameDraft("");
      setHostingHostNameDraft("");
      setHostingHostUrlDraft("");
      setHostingLoginDraft("");
      setHostingPasswordDraft("");
      setHostingCostDraft("");
      setDatabaseServiceNameDraft("");
      setDatabaseHostNameDraft("");
      setDatabaseHostUrlDraft("");
      setDatabaseLoginDraft("");
      setDatabasePasswordDraft("");
      setDatabaseCostDraft("");
      setIsLoadingSiteUrlSetup(false);
      setIsSavingSiteUrlSetup(false);
      setSiteUrlError(null);
      setSiteUrlSuccess(null);
      setServerPerformance(null);
      setIsLoadingServerPerformance(false);
      setServerPerformanceError(null);
      setManagedFiles([]);
      setManagedFilesFolderDraft("");
      setIsLoadingManagedFiles(false);
      setManagedFilesError(null);
      setManagedFilesSuccess(null);
      setManagedFileUpload(null);
      setIsUploadingManagedFile(false);
      setDeletingManagedFilePath(null);
      setSelectedManagedFilePaths([]);
      setNewPatronageDonorName("");
      setNewPatronageDonorEmail("");
      setNewPatronageType("ONE_TIME");
      setNewPatronageAmount("");
      setNewPatronageCurrency("USD");
      setNewPatronageProvider("");
      setNewPatronageReference("");
      setNewPatronageNote("");
      setIsCreatingPatronage(false);
      setUpdatingPatronageId(null);
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
      setManagedRoles([]);
      setIsLoadingManagedRoles(false);
      setManagedRolesError(null);
      setManagedRolesActionError(null);
      setManagedRolesActionSuccess(null);
      setNewRoleKey("");
      setNewRoleLabel("");
      setIsCreatingRole(false);
      setUpdatingRoleKey(null);
      setDeletingRoleKey(null);
      setRoleLabelDrafts({});
      setMetaInfo(null);
      setIsLoadingMetaInfo(false);
      setMetaInfoError(null);
      setWebhooks([]);
      setIsLoadingWebhooks(false);
      setWebhooksError(null);
      setWebhooksActionError(null);
      setWebhooksActionSuccess(null);
      setNewWebhookName("");
      setNewWebhookUrl("");
      setNewWebhookEventType("MESSAGE_CREATE");
      setNewWebhookServerId("GLOBAL");
      setIsCreatingWebhook(false);
      setWebhookActionPendingId(null);
      setFamilyCenterEntries([]);
      setIsLoadingFamilyCenter(false);
      setFamilyCenterError(null);
      setFamilyCenterSuccess(null);
      setFamilyCenterSearch("");
      setFamilyCenterStatusFilter("ALL");
      setBusinessSectionFilter("ALL");
      setListRowDensity("COMFORTABLE");
      setFamilyCenterRowDensity("COMFORTABLE");
      setDeletingFamilyApplicationUserId(null);
      setReviewingFamilyApplicationActionUserId(null);
      setReviewingFamilyApplication(null);
      setPreviewingFamilyApplicationFile(null);
    }
  }, [isModalOpen]);

  const onReviewFamilyApplicationDecision = async (
    entry: AdminFamilyCenterEntry,
    decision: "ACCEPT" | "DECLINE"
  ) => {
    try {
      setReviewingFamilyApplicationActionUserId(entry.userId);
      setFamilyCenterError(null);
      setFamilyCenterSuccess(null);

      const centerApiPath = activeSection === "businessCenter" ? "/api/admin/business-center" : activeSection === "schoolCenter" ? "/api/admin/school-center" : "/api/admin/family-center";

      const response = await fetch(centerApiPath, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: entry.userId,
          decision,
        }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to update application (${response.status})`;
        throw new Error(message);
      }

      const payload = (await response.json()) as {
        applicationStatus?: string;
      };

      const nextStatus = String(payload.applicationStatus ?? "").trim();

      if (nextStatus) {
        setReviewingFamilyApplication((current) =>
          current && current.userId === entry.userId
            ? {
                ...current,
                applicationStatus: nextStatus,
              }
            : current
        );
      }

      setReviewingFamilyApplication(null);
      setPreviewingFamilyApplicationFile(null);

      setFamilyCenterSuccess(
        `${decision === "ACCEPT" ? "Accepted" : "Declined"} application for ${entry.displayName}.`
      );
      await loadFamilyCenter();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_FAMILY_CENTER_REVIEW_ACTION]", error);
      setFamilyCenterError(error instanceof Error ? error.message : "Unable to update application.");
    } finally {
      setReviewingFamilyApplicationActionUserId(null);
    }
  };

  const onDeleteFamilyApplication = async (entry: AdminFamilyCenterEntry) => {
    const confirmed = window.confirm(
      `Delete ${activeSection === "businessCenter" ? "business" : activeSection === "schoolCenter" ? "school" : "family"} application ${entry.applicationId}? This clears the submitted application status and files for this user.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingFamilyApplicationUserId(entry.userId);
      setFamilyCenterError(null);
      setFamilyCenterSuccess(null);

      const centerApiPath = activeSection === "businessCenter" ? "/api/admin/business-center" : activeSection === "schoolCenter" ? "/api/admin/school-center" : "/api/admin/family-center";

      const response = await fetch(
        `${centerApiPath}?userId=${encodeURIComponent(entry.userId)}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const message = (await response.text()) || `Failed to delete application (${response.status})`;
        throw new Error(message);
      }

      if (reviewingFamilyApplication?.userId === entry.userId) {
        setReviewingFamilyApplication(null);
        setPreviewingFamilyApplicationFile(null);
      }

      setFamilyCenterSuccess(`Deleted application for ${entry.displayName}.`);
      await loadFamilyCenter();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_FAMILY_CENTER_DELETE]", error);
      setFamilyCenterError(error instanceof Error ? error.message : "Unable to delete application.");
    } finally {
      setDeletingFamilyApplicationUserId(null);
    }
  };

  const onUpdateReport = async (
    reportId: string,
    payload: {
      status?: AdminReport["status"];
      adminNote?: string;
      assignAction?: "SELF" | "UNASSIGN";
      severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    }
  ) => {
    try {
      setUpdatingReportId(reportId);

      const response = await fetch("/api/admin/reports", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reportId, ...payload }),
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

  const onSaveReportStatus = async (reportId: string) => {
    const status = reportStatusDrafts[reportId];
    if (!status) {
      return;
    }

    await onUpdateReport(reportId, { status });
  };

  const onSaveReportSeverity = async (reportId: string) => {
    const severity = reportSeverityDrafts[reportId];
    if (!severity) {
      return;
    }

    await onUpdateReport(reportId, { severity });
  };

  const onSaveReportNote = async (reportId: string) => {
    await onUpdateReport(reportId, {
      adminNote: reportNoteDrafts[reportId] ?? "",
    });
  };

  const onPostReportNote = async (reportId: string) => {
    const nextNote = (reportPostNoteDrafts[reportId] ?? "").trim();
    if (!nextNote) {
      return;
    }

    const currentReport = reports.find((item) => item.id === reportId);
    const existingNote = String(currentReport?.adminNote ?? "").trim();
    const author = String((data as { profileName?: string } | undefined)?.profileName ?? "Staff").trim() || "Staff";
    const timestamp = new Date().toLocaleString();
    const postedEntry = `[${timestamp}] ${author}: ${nextNote}`;
    const combinedNote = existingNote ? `${existingNote}\n---\n${postedEntry}` : postedEntry;

    await onUpdateReport(reportId, { adminNote: combinedNote });
    setReportPostNoteDrafts((current) => ({
      ...current,
      [reportId]: "",
    }));
  };

  const onCreatePatronage = async () => {
    setPatronageError(null);
    setPatronageActionSuccess(null);

    const amount = Number(newPatronageAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPatronageError("Enter a valid donation amount greater than 0.");
      return;
    }

    const amountCents = Math.round(amount * 100);
    if (amountCents <= 0) {
      setPatronageError("Amount is too small.");
      return;
    }

    try {
      setIsCreatingPatronage(true);

      const response = await fetch("/api/admin/patronage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          donorName: newPatronageDonorName,
          donorEmail: newPatronageDonorEmail,
          donationType: newPatronageType,
          status: "SUCCEEDED",
          amountCents,
          currency: newPatronageCurrency,
          provider: newPatronageProvider,
          providerReference: newPatronageReference,
          note: newPatronageNote,
        }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to record donation (${response.status})`;
        throw new Error(message);
      }

      setPatronageActionSuccess("Donation record saved.");
      setNewPatronageDonorName("");
      setNewPatronageDonorEmail("");
      setNewPatronageAmount("");
      setNewPatronageProvider("");
      setNewPatronageReference("");
      setNewPatronageNote("");
      await loadPatronage();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_PATRONAGE_CREATE]", error);
      setPatronageError(error instanceof Error ? error.message : "Unable to record donation.");
    } finally {
      setIsCreatingPatronage(false);
    }
  };

  const onUpdatePatronageStatus = async (
    id: string,
    status: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "REFUNDED"
  ) => {
    setPatronageError(null);
    setPatronageActionSuccess(null);

    try {
      setUpdatingPatronageId(id);

      const response = await fetch("/api/admin/patronage", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          status,
        }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to update donation (${response.status})`;
        throw new Error(message);
      }

      setPatronageActionSuccess(`Donation marked ${status.toLowerCase()}.`);
      await loadPatronage();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_PATRONAGE_STATUS]", error);
      setPatronageError(error instanceof Error ? error.message : "Unable to update donation status.");
    } finally {
      setUpdatingPatronageId(null);
    }
  };

  const onAssignReportToSelf = async (reportId: string) => {
    await onUpdateReport(reportId, { assignAction: "SELF" });
  };

  const onUnassignReport = async (reportId: string) => {
    await onUpdateReport(reportId, { assignAction: "UNASSIGN" });
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

  const onCreateWebhook = async () => {
    const name = newWebhookName.trim();
    const endpointUrl = newWebhookUrl.trim();
    const eventType = newWebhookEventType.trim().toUpperCase() || "MESSAGE_CREATE";
    const serverId = newWebhookServerId === "GLOBAL" ? null : newWebhookServerId;

    setWebhooksActionError(null);
    setWebhooksActionSuccess(null);

    if (!name) {
      setWebhooksActionError("Webhook name is required.");
      return;
    }

    if (!/^https?:\/\//i.test(endpointUrl)) {
      setWebhooksActionError("Endpoint URL must start with http:// or https://.");
      return;
    }

    try {
      setIsCreatingWebhook(true);

      const response = await fetch("/api/admin/webhooks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          endpointUrl,
          eventType,
          serverId,
        }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to create webhook (${response.status})`;
        throw new Error(message);
      }

      const payload = (await response.json()) as { secretKey?: string };
      setWebhooksActionSuccess(
        payload.secretKey
          ? `Webhook created. Secret: ${payload.secretKey}`
          : "Webhook created."
      );
      setNewWebhookName("");
      setNewWebhookUrl("");
      setNewWebhookEventType("MESSAGE_CREATE");
      setNewWebhookServerId("GLOBAL");
      await loadWebhooks();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_WEBHOOK_CREATE]", error);
      setWebhooksActionError(error instanceof Error ? error.message : "Unable to create webhook.");
    } finally {
      setIsCreatingWebhook(false);
    }
  };

  const onWebhookAction = async (
    webhook: AdminWebhook,
    action: "toggle" | "rotate-secret" | "delete"
  ) => {
    setWebhooksActionError(null);
    setWebhooksActionSuccess(null);

    if (action === "delete") {
      const confirmed = window.confirm(`Delete webhook ${webhook.name}? This cannot be undone.`);
      if (!confirmed) {
        return;
      }
    }

    try {
      setWebhookActionPendingId(webhook.id);

      if (action === "delete") {
        const response = await fetch(`/api/admin/webhooks?webhookId=${encodeURIComponent(webhook.id)}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const message = (await response.text()) || `Failed to delete webhook (${response.status})`;
          throw new Error(message);
        }

        setWebhooksActionSuccess("Webhook deleted.");
      } else {
        const response = await fetch("/api/admin/webhooks", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            webhookId: webhook.id,
            action,
            enabled: action === "toggle" ? !webhook.enabled : undefined,
          }),
        });

        if (!response.ok) {
          const message = (await response.text()) || `Failed to update webhook (${response.status})`;
          throw new Error(message);
        }

        const payload = (await response.json()) as { secretKey?: string };
        if (action === "toggle") {
          setWebhooksActionSuccess(`Webhook ${webhook.enabled ? "disabled" : "enabled"}.`);
        } else {
          setWebhooksActionSuccess(
            payload.secretKey
              ? `Webhook secret rotated. New secret: ${payload.secretKey}`
              : "Webhook secret rotated."
          );
        }
      }

      await loadWebhooks();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_WEBHOOK_ACTION]", error);
      setWebhooksActionError(error instanceof Error ? error.message : "Unable to update webhook.");
    } finally {
      setWebhookActionPendingId(null);
    }
  };

  const createUserRoleOptions = useMemo(() => {
    const keys = new Set<string>([
      "USER",
      "ADMINISTRATOR",
      "DEVELOPER",
      "MODERATOR",
      ...managedRoles.map((role) => normalizeAdminRoleForDisplay(role.roleKey)),
    ]);

    return Array.from(keys).sort((a, b) => {
      const priority: Record<string, number> = {
        USER: 0,
        MODERATOR: 1,
        DEVELOPER: 2,
        ADMINISTRATOR: 3,
      };

      const leftPriority = priority[a] ?? 10;
      const rightPriority = priority[b] ?? 10;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return a.localeCompare(b);
    });
  }, [managedRoles]);

  const parseNewRoleKeyInput = (input: string) => {
    const normalized = input.trim().toUpperCase().replace(/[\s-]+/g, "_");

    if (!normalized) {
      return null;
    }

    if (normalized === "ADMIN") {
      return "ADMINISTRATOR";
    }

    if (normalized === "MOD") {
      return "MODERATOR";
    }

    if (/^[A-Z][A-Z0-9_]{1,63}$/.test(normalized)) {
      return normalized;
    }

    return null;
  };

  const onCreateManagedRole = async () => {
    const roleKey = parseNewRoleKeyInput(newRoleKey);
    const roleLabel = newRoleLabel.trim();

    setManagedRolesActionError(null);
    setManagedRolesActionSuccess(null);

    if (!roleKey) {
      setManagedRolesActionError("Role key must be 2-64 chars and use letters, numbers, or underscore.");
      return;
    }

    try {
      setIsCreatingRole(true);

      const response = await fetch("/api/admin/roles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roleKey,
          roleLabel,
        }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to create role (${response.status})`;
        throw new Error(message);
      }

      setManagedRolesActionSuccess(`Role ${roleKey} added.`);
      setNewRoleKey("");
      setNewRoleLabel("");
      await loadManagedRoles();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_ROLE_CREATE]", error);
      setManagedRolesActionError(error instanceof Error ? error.message : "Unable to create role.");
    } finally {
      setIsCreatingRole(false);
    }
  };

  const onSaveManagedRoleLabel = async (roleKey: string) => {
    const roleLabel = (roleLabelDrafts[roleKey] ?? "").trim();

    setManagedRolesActionError(null);
    setManagedRolesActionSuccess(null);

    try {
      setUpdatingRoleKey(roleKey);

      const response = await fetch("/api/admin/roles", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roleKey,
          roleLabel,
        }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to update role (${response.status})`;
        throw new Error(message);
      }

      setManagedRolesActionSuccess(`Updated role label for ${roleKey}.`);
      await loadManagedRoles();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_ROLE_UPDATE]", error);
      setManagedRolesActionError(error instanceof Error ? error.message : "Unable to update role.");
    } finally {
      setUpdatingRoleKey(null);
    }
  };

  const onDeleteManagedRole = async (roleKey: string) => {
    const confirmed = window.confirm(`Delete role ${roleKey}? Users must be reassigned first.`);
    if (!confirmed) {
      return;
    }

    setManagedRolesActionError(null);
    setManagedRolesActionSuccess(null);

    try {
      setDeletingRoleKey(roleKey);

      const response = await fetch(`/api/admin/roles?roleKey=${encodeURIComponent(roleKey)}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to delete role (${response.status})`;
        throw new Error(message);
      }

      setManagedRolesActionSuccess(`Deleted role ${roleKey}.`);
      await loadManagedRoles();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_ROLE_DELETE]", error);
      setManagedRolesActionError(error instanceof Error ? error.message : "Unable to delete role.");
    } finally {
      setDeletingRoleKey(null);
    }
  };

  const onCreateUser = async () => {
    const name = newUserName.trim();
    const email = newUserEmail.trim().toLowerCase();
    const password = newUserPassword;
    const role = normalizeAdminRoleForDisplay(newUserRole);

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
    if (user.userId === IMMUTABLE_ACCOUNT_USER_ID) {
      setCreateUserError(`User ${IMMUTABLE_ACCOUNT_USER_ID} is a protected core account and cannot be deleted.`);
      return;
    }

    const canForceBotMembershipCleanup =
      isBotUser({
        role: user.role,
        name: user.profileName || user.name,
        email: user.email,
      }) &&
      user.ownedServerCount === 0 &&
      user.joinedServerCount > 0;

    const confirmed = window.confirm(
      canForceBotMembershipCleanup
        ? `Delete bot/app account ${user.email || user.userId} and remove all memberships first? This permanently removes the account from the system.`
        : `Delete user ${user.email || user.userId}? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setCreateUserError(null);
    setCreateUserSuccess(null);

    try {
      setDeletingUserId(user.userId);

      const response = await fetch(
        `/api/admin/users?userId=${encodeURIComponent(user.userId)}${canForceBotMembershipCleanup ? "&forceCleanup=true" : ""}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.status === 409) {
        const message =
          (await response.text()) ||
          "User cannot be deleted because they are linked to servers or memberships.";
        setCreateUserError(message);
        return;
      }

      if (!response.ok) {
        const message = (await response.text()) || `Failed to delete user (${response.status})`;
        throw new Error(message);
      }

      setCreateUserSuccess(
        canForceBotMembershipCleanup
          ? `Bot/app account ${user.email || user.userId} removed from the system.`
          : `User ${user.email || user.userId} deleted.`
      );
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
    const currentRole = normalizeAdminRoleForDisplay(user.role);

    setCreateUserError(null);
    setCreateUserSuccess(null);

    if (role === currentRole) {
      return;
    }

    if (user.userId === IMMUTABLE_ACCOUNT_USER_ID && role !== ADMINISTRATOR_ROLE_KEY) {
      setCreateUserError(`User ${IMMUTABLE_ACCOUNT_USER_ID} must remain ${ADMINISTRATOR_ROLE_KEY}.`);
      return;
    }

    if (currentRole === ADMINISTRATOR_ROLE_KEY && role !== ADMINISTRATOR_ROLE_KEY) {
      setCreateUserError("Administrator role cannot be removed from a user account.");
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

  const onAssignAllBotsToBotsRole = async () => {
    setCreateUserError(null);
    setCreateUserSuccess(null);

    try {
      setIsAssigningBotsRole(true);

      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "assignBotsRole",
        }),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to assign bots/apps role (${response.status})`;
        throw new Error(message);
      }

      const payload = (await response.json().catch(() => ({}))) as { updatedCount?: number };
      setCreateUserSuccess(`Assigned ${payload.updatedCount ?? 0} bot/app account(s) to BOTS role.`);
      await loadUsers();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_ASSIGN_BOTS_ROLE]", error);
      setCreateUserError(error instanceof Error ? error.message : "Unable to assign bot/app roles.");
    } finally {
      setIsAssigningBotsRole(false);
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

  const separatedFilteredUsers = useMemo(() => {
    const botsAndApps: AdminUser[] = [];
    const staff: AdminUser[] = [];
    const usersOnly: AdminUser[] = [];

    const compareByUserId = (left: AdminUser, right: AdminUser) =>
      String(left.userId ?? "").localeCompare(String(right.userId ?? ""), undefined, {
        numeric: true,
        sensitivity: "base",
      });

    filteredUsers.forEach((user) => {
      if (
        isBotUser({
          role: user.role,
          name: user.profileName || user.name,
          email: user.email,
        })
      ) {
        botsAndApps.push(user);
      } else if (
        isInAccordAdministrator(user.role) ||
        isInAccordDeveloper(user.role) ||
        isInAccordModerator(user.role)
      ) {
        staff.push(user);
      } else {
        usersOnly.push(user);
      }
    });

    return {
      usersOnly: [...usersOnly].sort(compareByUserId),
      staff: [...staff].sort(compareByUserId),
      botsAndApps: [...botsAndApps].sort(compareByUserId),
    };
  }, [filteredUsers]);

  const roleOptions = useMemo(() => {
    const uniqueRoles = Array.from(
      new Set([
        ...users.map((user) => normalizeAdminRoleForDisplay(user.role)),
        ...createUserRoleOptions,
      ])
    );
    return ["ALL", ...uniqueRoles.sort()];
  }, [createUserRoleOptions, users]);

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

  const moderationListData = useMemo(() => {
    const query = moderationSearch.trim().toLowerCase();

    if (moderationFocus === "OWNER_ISSUES") {
      const ownerIssueRows: Array<{
        key: string;
        signal: string;
        value: string | number;
        notes: string;
      }> = [];

      const invalidOwnerCount = securitySummary?.serversWithoutValidOwner ?? 0;
      if (invalidOwnerCount > 0) {
        ownerIssueRows.push({
          key: "servers-without-valid-owner",
          signal: "Servers with missing/invalid owner linkage",
          value: invalidOwnerCount,
          notes: "Review orphaned servers and reassign valid owners.",
        });
      }

      securityRecentLogins.forEach((row, index) => {
        const missingFields: string[] = [];

        if (!String(row.name ?? "").trim()) {
          missingFields.push("name");
        }

        if (!String(row.email ?? "").trim()) {
          missingFields.push("email");
        }

        if (!String(row.role ?? "").trim()) {
          missingFields.push("role");
        }

        if (!row.lastLogin) {
          missingFields.push("lastLogin");
        }

        if (missingFields.length === 0) {
          return;
        }

        ownerIssueRows.push({
          key: `missing-fields-${row.userId || index}`,
          signal: row.name || row.userId || "Unknown user",
          value: missingFields.join(", "),
          notes: row.email || row.userId || "No identifying email/userId",
        });
      });

      const filteredOwnerRows = ownerIssueRows.filter((row) => {
        if (!query) {
          return true;
        }

        const haystack = `${row.signal} ${row.value} ${row.notes}`.toLowerCase();
        return haystack.includes(query);
      });

      return {
        mode: "OWNER_ISSUES" as const,
        rows: filteredOwnerRows,
      };
    }

    const now = Date.now();
    const users = securityRecentLogins.filter((row) => {
      if (moderationFocus === "REVIEW_QUEUE") {
        if (!row.lastLogin) {
          return true;
        }

        const lastLoginTime = new Date(row.lastLogin).getTime();
        if (Number.isNaN(lastLoginTime)) {
          return true;
        }

        return now - lastLoginTime >= 30 * 24 * 60 * 60 * 1000;
      }

      const normalizedRole = String(row.role ?? "").trim().toUpperCase();
      return ["MODERATOR", "MOD", "ADMIN", "ADMINISTRATOR", "DEVELOPER"].includes(normalizedRole);
    });

    const filteredUsers = users.filter((row) => {
      if (!query) {
        return true;
      }

      const haystack = [row.userId, row.name, row.email, row.role, row.lastLogin ?? "Never"]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });

    return {
      mode: "USERS" as const,
      rows: filteredUsers,
    };
  }, [moderationFocus, moderationSearch, securityRecentLogins, securitySummary?.serversWithoutValidOwner]);

  const sectionReports = useMemo(() => {
    if (activeSection === "issuesBugs") {
      return reports.filter((report) => report.targetType === "BUG");
    }

    if (activeSection === "reported") {
      return reports.filter((report) => report.targetType !== "BUG");
    }

    return reports;
  }, [activeSection, reports]);

  const roleDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    users.forEach((user) => {
      const role = normalizeAdminRoleForDisplay(user.role);
      counts.set(role, (counts.get(role) ?? 0) + 1);
    });

    managedRoles.forEach((role) => {
      const normalizedRole = normalizeAdminRoleForDisplay(role.roleKey);
      if (!counts.has(normalizedRole)) {
        counts.set(normalizedRole, 0);
      }
    });

    return Array.from(counts.entries())
      .map(([role, count]) => ({ role, count }))
      .sort((a, b) => b.count - a.count || a.role.localeCompare(b.role));
  }, [managedRoles, users]);

  const inviteCoverage = useMemo(() => {
    const withInvites = servers.filter((server) => server.inviteCode && server.inviteCode.trim().length > 0).length;
    const withoutInvites = Math.max(0, servers.length - withInvites);
    return {
      withInvites,
      withoutInvites,
    };
  }, [servers]);

  const familyCenterSummary = useMemo(() => {
    const resolveMembersCount = (entry: AdminFamilyCenterEntry) =>
      activeSection === "businessCenter"
        ? (entry.businessMembersCount ?? 0)
        : (entry.familyMembersCount ?? 0);

    return {
      totalRecords: familyCenterEntries.length,
      totalMembersTracked: familyCenterEntries.reduce((sum, entry) => sum + resolveMembersCount(entry), 0),
      pendingApplications: familyCenterEntries.filter((entry) => /pending/i.test(entry.applicationStatus)).length,
      approvedApplications: familyCenterEntries.filter((entry) => /approved|aproved/i.test(entry.applicationStatus)).length,
    };
  }, [activeSection, familyCenterEntries]);

  const filteredFamilyCenterEntries = useMemo(() => {
    const query = familyCenterSearch.trim().toLowerCase();
    const normalizedBusinessSectionFilter = businessSectionFilter.trim().toLowerCase();

    return familyCenterEntries.filter((entry) => {
      const status = String(entry.applicationStatus || "").toLowerCase();
      const statusMatches =
        familyCenterStatusFilter === "ALL"
          ? true
          : familyCenterStatusFilter === "SUBMITTED"
            ? /submitted|pending/.test(status)
            : familyCenterStatusFilter === "APROVED"
              ? /aproved|approved/.test(status)
              : /denied|declined/.test(status);

      if (!statusMatches) {
        return false;
      }

      const sectionMatches =
        activeSection !== "businessCenter" ||
        businessSectionFilter === "ALL" ||
        String(entry.businessSection ?? "").trim().toLowerCase() === normalizedBusinessSectionFilter;

      if (!sectionMatches) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        entry.applicationId,
        entry.submittedBy,
        entry.displayName,
        entry.userId,
        entry.email,
        entry.businessDesignation,
        entry.businessSection,
        entry.familyDesignation,
        entry.applicationStatus,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [activeSection, businessSectionFilter, familyCenterEntries, familyCenterSearch, familyCenterStatusFilter]);

  const businessSectionFilterOptions = useMemo(() => {
    if (activeSection !== "businessCenter") {
      return ["ALL"];
    }

    const uniqueSections = Array.from(
      new Set(
        familyCenterEntries
          .map((entry) => String(entry.businessSection ?? "").trim())
          .filter((section) => section.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b));

    return ["ALL", ...uniqueSections];
  }, [activeSection, familyCenterEntries]);

  const hasActiveFamilyCenterFilters =
    familyCenterSearch.trim().length > 0 ||
    familyCenterStatusFilter !== "ALL" ||
    (activeSection === "businessCenter" && businessSectionFilter !== "ALL");

  const listRowDensityClass = useMemo(
    () =>
      listRowDensity === "COMPACT"
        ? "py-1.5"
        : listRowDensity === "SPACIOUS"
          ? "py-3"
          : "py-2",
    [listRowDensity]
  );

  const listCardDensityClass = useMemo(
    () =>
      listRowDensity === "COMPACT"
        ? "p-2.5"
        : listRowDensity === "SPACIOUS"
          ? "p-4"
          : "p-3",
    [listRowDensity]
  );

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

  const hasActiveOtherConfigFilters =
    OtherConfigQuery.trim().length > 0 ||
    OtherConfigTypeFilter !== "ALL" ||
    OtherConfigStatusFilter !== "ALL";

  const hasActivePatronageFilters =
    patronageSearch.trim().length > 0 ||
    patronageTypeFilter !== "ALL" ||
    patronageStatusFilter !== "ALL";

  const formatCurrencyFromCents = (amountCents: number, currency: string) => {
    const safeAmount = Number.isFinite(amountCents) ? amountCents : 0;
    const safeCurrency = String(currency || "USD").toUpperCase();

    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: safeCurrency,
      }).format(safeAmount / 100);
    } catch {
      return `${(safeAmount / 100).toFixed(2)} ${safeCurrency}`;
    }
  };

  const OtherConfigKey = (row: AdminOtherConfig) => `${row.type}:${row.userId}:${row.id}`;

  const roleLabelLookup = useMemo(() => {
    const lookup: Record<string, string> = {};
    managedRoles.forEach((role) => {
      const key = normalizeAdminRoleForDisplay(role.roleKey);
      lookup[key] = role.roleLabel || formatManagedRoleLabelFromKey(key);
    });
    return lookup;
  }, [managedRoles]);

  const filteredRecentOtherConfigs = useMemo(() => {
    const query = OtherConfigQuery.trim().toLowerCase();

    const filtered = recentOtherConfigs.filter((row) => {
      const typeMatches = OtherConfigTypeFilter === "ALL" || row.type === OtherConfigTypeFilter;
      const statusMatches =
        OtherConfigStatusFilter === "ALL" ||
        (OtherConfigStatusFilter === "ENABLED" ? row.enabled : !row.enabled);

      if (!typeMatches || !statusMatches) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        row.userId,
        row.name,
        row.email,
        row.configName,
        row.applicationId,
        row.type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });

    const sorted = [...filtered].sort((a, b) => {
      if (OtherConfigSortKey === "createdAt") {
        const left = new Date(a.createdAt).getTime();
        const right = new Date(b.createdAt).getTime();
        const safeLeft = Number.isNaN(left) ? 0 : left;
        const safeRight = Number.isNaN(right) ? 0 : right;
        return safeLeft - safeRight;
      }

      if (OtherConfigSortKey === "status") {
        const left = a.enabled ? 1 : 0;
        const right = b.enabled ? 1 : 0;
        return left - right;
      }

      return a.type.localeCompare(b.type);
    });

    return OtherConfigSortDirection === "asc" ? sorted : sorted.reverse();
  }, [
    OtherConfigQuery,
    OtherConfigSortDirection,
    OtherConfigSortKey,
    OtherConfigStatusFilter,
    OtherConfigTypeFilter,
    recentOtherConfigs,
  ]);

  const separatedOtherConfigs = useMemo(() => {
    const inAccord: AdminOtherConfig[] = [];
    const Other: AdminOtherConfig[] = [];

    filteredRecentOtherConfigs.forEach((row) => {
      if (isInAccordOtherConfig(row)) {
        inAccord.push(row);
      } else {
        Other.push(row);
      }
    });

    return {
      inAccord,
      Other,
    };
  }, [filteredRecentOtherConfigs]);

  const onOtherConfigSort = (key: OtherConfigSortKey) => {
    if (OtherConfigSortKey === key) {
      setOtherConfigSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setOtherConfigSortKey(key);
    setOtherConfigSortDirection(key === "createdAt" ? "desc" : "asc");
  };

  const getSortGlyph = (key: OtherConfigSortKey) => {
    if (OtherConfigSortKey !== key) {
      return "↕";
    }

    return OtherConfigSortDirection === "asc" ? "▲" : "▼";
  };

  const setOtherConfigDraft = (row: AdminOtherConfig) => {
    const key = OtherConfigKey(row);

    setOtherConfigDrafts((current) => ({
      ...current,
      [key]: {
        configName: row.configName,
        applicationId: row.applicationId,
      },
    }));
    setEditingOtherConfigKey(key);
  };

  const onAdminOtherConfigAction = async (
    row: AdminOtherConfig,
    action: "toggle" | "update" | "delete" | "purge"
  ) => {
    const key = OtherConfigKey(row);
    setOtherConfigActionError(null);
    setOtherConfigActionSuccess(null);

    if (action === "purge") {
      const confirmed = window.confirm(
        `Permanently remove ${row.type === "BOT" ? "bot" : "app"} ${row.configName} (${row.applicationId}) from all users across the system?`
      );

      if (!confirmed) {
        return;
      }
    }

    try {
      setOtherConfigActionPendingKey(key);

      const payload: {
        type: "APP" | "BOT";
        userId?: string;
        configId?: string;
        applicationId?: string;
        action: "toggle" | "update" | "delete" | "purge";
        enabled?: boolean;
        patch?: Record<string, unknown>;
      } = {
        type: row.type,
        action,
      };

      if (action === "purge") {
        payload.applicationId = row.applicationId;
      } else {
        payload.userId = row.userId;
        payload.configId = row.id;
      }

      if (action === "toggle") {
        payload.enabled = !row.enabled;
      }

      if (action === "update") {
        const draft = OtherConfigDrafts[key];
        if (!draft) {
          throw new Error("No draft found for this row.");
        }

        payload.patch = {
          name: draft.configName,
          applicationId: draft.applicationId,
        };
      }

      const response = await fetch("/api/admin/integrations", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = (await response.text()) || `Failed to update Other config (${response.status})`;
        throw new Error(message);
      }

      const responsePayload = (await response.json().catch(() => ({}))) as {
        removedCount?: number;
        affectedUsers?: number;
      };

      setOtherConfigActionSuccess(
        action === "purge"
          ? `Removed ${responsePayload.removedCount ?? 0} item(s) across ${responsePayload.affectedUsers ?? 0} user(s).`
          : action === "delete"
          ? "Other config deleted."
          : action === "toggle"
            ? `Other config ${row.enabled ? "disabled" : "enabled"}.`
            : "Other config updated."
      );

      if (action === "update") {
        setEditingOtherConfigKey(null);
      }

      await loadIntegrations();
    } catch (error) {
      console.error("[IN_ACCORD_ADMIN_Other_CONFIG_ACTION]", error);
      setOtherConfigActionError(
        error instanceof Error ? error.message : "Unable to update Other config."
      );
    } finally {
      setOtherConfigActionPendingKey(null);
    }
  };

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
      "block w-full rounded-md px-3 py-2 text-left text-sm transition",
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

  const renderOtherConfigTable = (
    rows: AdminOtherConfig[],
    emptyMessage: string
  ) => (
    <div className="overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
      <div className="border-b border-zinc-300/70 bg-white/70 px-3 py-2 dark:border-zinc-700/70 dark:bg-zinc-900/35">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Rows</span>
          {(["COMPACT", "COMFORTABLE", "SPACIOUS"] as const).map((density) => (
            <button
              key={`Other-config-row-density-${density}`}
              type="button"
              onClick={() => setListRowDensity(density)}
              className={cn(
                "h-7 rounded-md border px-2.5 text-[11px] font-semibold transition",
                listRowDensity === density
                  ? "border-indigo-500/45 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              )}
            >
              {density === "COMPACT" ? "Compact" : density === "SPACIOUS" ? "Spacious" : "Comfortable"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[1fr_1fr_0.55fr_1fr_0.8fr_1fr_1.3fr] gap-2 bg-zinc-200/80 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        <p>User</p>
        <p>Name</p>
        <button
          type="button"
          onClick={() => onOtherConfigSort("type")}
          className="inline-flex items-center gap-1 text-left hover:text-zinc-900 dark:hover:text-white"
          title="Sort by type"
        >
          Type <span>{getSortGlyph("type")}</span>
        </button>
        <p>Application ID</p>
        <button
          type="button"
          onClick={() => onOtherConfigSort("status")}
          className="inline-flex items-center gap-1 text-left hover:text-zinc-900 dark:hover:text-white"
          title="Sort by status"
        >
          Status <span>{getSortGlyph("status")}</span>
        </button>
        <button
          type="button"
          onClick={() => onOtherConfigSort("createdAt")}
          className="inline-flex items-center gap-1 text-left hover:text-zinc-900 dark:hover:text-white"
          title="Sort by created date"
        >
          Created <span>{getSortGlyph("createdAt")}</span>
        </button>
        <p>Actions</p>
      </div>
      <div className="max-h-80 overflow-y-auto bg-white/80 text-xs text-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200">
        {rows.length === 0 ? (
          <p className="px-3 py-3 text-zinc-600 dark:text-zinc-300">{emptyMessage}</p>
        ) : (
          rows.map((row, index) => {
            const key = OtherConfigKey(row);
            const isEditing = editingOtherConfigKey === key;
            const isPending = OtherConfigActionPendingKey === key;
            const draft = OtherConfigDrafts[key];
            const hasChanges =
              !!draft &&
              (draft.configName.trim() !== row.configName ||
                draft.applicationId.trim() !== row.applicationId);

            return (
              <div
                key={`Other-config-${row.userId}-${row.type}-${row.id}-${index}`}
                className={cn(
                  "grid grid-cols-[1fr_1fr_0.55fr_1fr_0.8fr_1fr_1.3fr] gap-2 px-3",
                  listRowDensityClass,
                  index % 2 === 0
                    ? "bg-white/70 dark:bg-zinc-950/25"
                    : "bg-zinc-100/70 dark:bg-zinc-900/35"
                )}
              >
                <p className="truncate" title={`${row.name} (${row.userId})`}>
                  {row.name || row.userId}
                </p>

                {isEditing ? (
                  <input
                    type="text"
                    value={draft?.configName ?? row.configName}
                    onChange={(event) =>
                      setOtherConfigDrafts((current) => ({
                        ...current,
                        [key]: {
                          configName: event.target.value,
                          applicationId: current[key]?.applicationId ?? row.applicationId,
                        },
                      }))
                    }
                    className="h-7 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                ) : (
                  <p className="truncate" title={row.configName}>{row.configName}</p>
                )}

                <p>{row.type}</p>

                {isEditing ? (
                  <input
                    type="text"
                    value={draft?.applicationId ?? row.applicationId}
                    onChange={(event) =>
                      setOtherConfigDrafts((current) => ({
                        ...current,
                        [key]: {
                          configName: current[key]?.configName ?? row.configName,
                          applicationId: event.target.value,
                        },
                      }))
                    }
                    className="h-7 rounded-md border border-zinc-300 bg-white px-2 font-mono text-xs text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                ) : (
                  <p className="truncate font-mono" title={row.applicationId}>{row.applicationId}</p>
                )}

                <p className={row.enabled ? "text-emerald-600 dark:text-emerald-300" : "text-zinc-500 dark:text-zinc-400"}>
                  {row.enabled ? "Enabled" : "Disabled"}
                </p>

                <p className="truncate" title={formatDateTime(row.createdAt)}>{formatDateTime(row.createdAt)}</p>

                <div className="flex flex-wrap items-center gap-1.5">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void onAdminOtherConfigAction(row, "update")}
                        disabled={isPending || !hasChanges}
                        className="h-7 rounded-md bg-indigo-600 px-2 text-[10px] font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingOtherConfigKey(null);
                          setOtherConfigDrafts((current) => {
                            const next = { ...current };
                            delete next[key];
                            return next;
                          });
                        }}
                        disabled={isPending}
                        className="h-7 rounded-md border border-zinc-300 bg-white px-2 text-[10px] font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOtherConfigDraft(row)}
                      disabled={isPending}
                      className="h-7 rounded-md border border-zinc-300 bg-white px-2 text-[10px] font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Edit
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void onAdminOtherConfigAction(row, "toggle")}
                    disabled={isPending}
                    className={cn(
                      "h-7 rounded-md px-2 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                      row.enabled
                        ? "border border-zinc-500/35 bg-zinc-500/15 text-zinc-200 hover:bg-zinc-500/25"
                        : "border border-emerald-500/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                    )}
                  >
                    {row.enabled ? "Disable" : "Enable"}
                  </button>

                  <button
                    type="button"
                    onClick={() => void onAdminOtherConfigAction(row, "delete")}
                    disabled={isPending}
                    className="h-7 rounded-md border border-rose-500/35 bg-rose-500/15 px-2 text-[10px] font-semibold text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => void onAdminOtherConfigAction(row, "purge")}
                    disabled={isPending}
                    className="h-7 rounded-md border border-rose-500/55 bg-rose-600/20 px-2 text-[10px] font-semibold text-rose-100 transition hover:bg-rose-600/30 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Remove this app/bot from all users in the system"
                  >
                    Remove System
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const parseReportSeverity = (reason: string | null | undefined): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null => {
    const source = String(reason ?? "").trim();
    const matched = source.match(/^\[(LOW|MEDIUM|HIGH|CRITICAL)\]/i)?.[1];
    if (!matched) {
      return null;
    }

    const normalized = matched.toUpperCase();
    if (normalized === "LOW" || normalized === "MEDIUM" || normalized === "HIGH" || normalized === "CRITICAL") {
      return normalized;
    }

    return null;
  };

  const getSeverityClassName = (severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") => {
    if (severity === "LOW") {
      return "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200";
    }

    if (severity === "MEDIUM") {
      return "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-200";
    }

    if (severity === "HIGH") {
      return "border-orange-500/45 bg-orange-500/15 text-orange-700 dark:text-orange-200";
    }

    return "border-rose-500/45 bg-rose-500/15 text-rose-700 dark:text-rose-200";
  };

  const getSeverityTextClassName = (severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") => {
    if (severity === "LOW") {
      return "text-emerald-700 dark:text-emerald-300";
    }

    if (severity === "MEDIUM") {
      return "text-amber-700 dark:text-amber-300";
    }

    if (severity === "HIGH") {
      return "text-orange-700 dark:text-orange-300";
    }

    return "text-rose-700 dark:text-rose-300";
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
  const recentMainCommits = metaInfo?.githubMainCommits ?? [];
  const renderMembersRows = (rows: AdminUser[]) =>
    rows.map((user, index) => (
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
              "grid gap-2 px-3",
              listRowDensityClass,
              index % 2 === 0
                ? "bg-white/70 dark:bg-zinc-950/25"
                : "bg-zinc-100/70 dark:bg-zinc-900/35"
            )}
            style={{ gridTemplateColumns }}
          >
            <div className="flex min-w-0 items-center gap-2">
              {(() => {
                const isBotAccount = isBotUser({
                  role: user.role,
                  name: user.profileName || user.name,
                  email: user.email,
                });
                const canForceBotDelete =
                  isBotAccount && user.ownedServerCount === 0 && user.joinedServerCount > 0;
                const deleteBlockedByLinks =
                  user.ownedServerCount > 0 || (user.joinedServerCount > 0 && !canForceBotDelete);

                return (
                  <>
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
                      disabled={
                        deletingUserId === user.userId ||
                        user.userId === IMMUTABLE_ACCOUNT_USER_ID ||
                        deleteBlockedByLinks ||
                        user.userId === data.profileId
                      }
                      className="ml-auto rounded p-1 text-rose-500 transition hover:bg-rose-500/10 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Delete ${user.email || user.userId}`}
                      title={
                        user.userId === IMMUTABLE_ACCOUNT_USER_ID
                          ? "Protected core account cannot be deleted"
                          : user.userId === data.profileId
                            ? "You cannot delete your own account"
                            : user.ownedServerCount > 0
                              ? "Cannot delete user that owns servers"
                              : user.joinedServerCount > 0 && canForceBotDelete
                                ? "Delete bot/app and auto-remove memberships"
                                : user.joinedServerCount > 0
                                  ? "Cannot delete user linked to memberships"
                                  : "Delete user"
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                );
              })()}
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
                disabled={
                  updatingUserRoleId === user.userId ||
                  deletingUserId === user.userId ||
                  normalizeAdminRoleForDisplay(user.role) === ADMINISTRATOR_ROLE_KEY
                }
                className="h-7 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 text-[10px] font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {createUserRoleOptions.map((role) => (
                  <option key={`${user.userId}-${role}`} value={role}>
                    {roleLabelLookup[role] ? `${roleLabelLookup[role]} (${role})` : role}
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
                  normalizeAdminRoleForDisplay(user.role) === ADMINISTRATOR_ROLE_KEY ||
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
                className="inline-flex h-5 w-fit items-center justify-center self-start whitespace-nowrap rounded-md bg-zinc-900 px-1.5 text-[9px] font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {isSavingDetails ? "Saving..." : "Save"}
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
    ));

  const renderMemberSectionTable = (
    sectionLabel: string,
    rows: AdminUser[],
    accent?: "indigo"
  ) => (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700",
        accent === "indigo" ? "border-indigo-400/55 bg-indigo-500/[0.04]" : ""
      )}
    >
      <div
        className={cn(
          "border-b border-zinc-300/70 bg-zinc-100/90 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-700 dark:border-zinc-700/70 dark:bg-zinc-900/55 dark:text-zinc-300",
          accent === "indigo" ? "text-indigo-700 dark:text-indigo-300" : ""
        )}
      >
        {sectionLabel} ({rows.length})
      </div>
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

          <div className="max-h-70 overflow-y-auto bg-white/70 font-mono text-[12pt] leading-none text-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200">
            {rows.length === 0 ? (
              <p className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">No {sectionLabel.toLowerCase()} found for current filters.</p>
            ) : (
              renderMembersRows(rows)
            )}
          </div>
        </div>
      </div>
    </div>
  );
  const selectedSectionMeta = adminSectionMeta[activeSection] ?? adminSectionMeta.general;
  return (
    <Dialog open={isModalOpen} onOpenChange={onClose}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden bg-white p-0 text-black dark:bg-[#313338] dark:text-white [&_input]:max-w-full [&_input]:min-w-0 [&_textarea]:max-w-full [&_textarea]:min-w-0 [&_button]:max-w-full [&_button]:min-w-0">
        <DialogHeader className="border-b border-zinc-200 px-6 pb-4 pt-6 dark:border-zinc-700">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <ShieldAlert className="h-5 w-5 text-amber-400" />
            In-Accord Staff Panel
          </DialogTitle>
          <DialogDescription className="text-zinc-600 dark:text-zinc-300">
            <span className="block text-sm font-semibold text-zinc-800 dark:text-zinc-100">{selectedSectionMeta.label}</span>
            <span className="mt-1 block text-xs text-zinc-600 dark:text-zinc-300">{selectedSectionMeta.description}</span>
          </DialogDescription>
        </DialogHeader>

        <div dir="ltr" className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
          <aside dir="ltr" className="order-1 border-r border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
            <p className="px-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              Admin Menu
            </p>
            <nav className="mt-3 flex flex-col gap-1">
              {adminMenuGroups.map((group) => {
                const isCollapsed = collapsedMenuGroups[group.id];

                return (
                  <div key={group.id} className="rounded-md border border-zinc-200/70 bg-white/70 p-1 dark:border-zinc-700/70 dark:bg-zinc-900/35">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedMenuGroups((current) => ({
                          ...current,
                          [group.id]: !current[group.id],
                        }))
                      }
                      className="flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 transition hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <span>{group.label}</span>
                      {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>

                    {!isCollapsed ? (
                      <div className="mt-1 flex flex-col gap-1">
                        {group.sections.map((section) => {
                          const menuItem = adminMenuItemMeta[section];
                          const Icon = menuItem.icon;

                          return (
                            <button
                              key={section}
                              type="button"
                              onClick={() => setActiveSection(section)}
                              className={menuButtonClass(section)}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <Icon className="h-3.5 w-3.5" />
                                <span>{menuItem.label}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>
          </aside>

          <section className="order-2 min-h-0 space-y-4 overflow-y-auto p-6">
            {activeSection === "general" && (
              <div className="flex h-full min-h-0 flex-col gap-4">
                <div className="grid gap-4 md:grid-cols-2">
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
                </div>

                <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-200">
                  <p className="font-semibold">Build Information</p>

                  {isLoadingMetaInfo ? (
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Loading build and GitHub details...</p>
                  ) : metaInfoError ? (
                    <p className="mt-2 text-xs text-rose-500">{metaInfoError}</p>
                  ) : metaInfo ? (
                    <div className="mt-2 flex min-h-0 flex-1 flex-col gap-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Build</p>
                          <p>App: {metaInfo.build.appName}</p>
                          <p>Version: {metaInfo.build.appVersion}</p>
                          <p>In-Accord SDK: {metaInfo.build.sdkVersion || "1.0.0.1"}</p>
                          <p>Next.js: {metaInfo.build.nextVersion}</p>
                          <p>Environment: {metaInfo.build.nodeEnv}</p>
                          <p>Built: {formatDateTime(metaInfo.build.buildTimestamp)}</p>
                          <p>Branch: {metaInfo.build.branch || "N/A"}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="text-xs">Document Storage:</span>
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
                                metaInfo.storage?.documentStorageConfigured
                                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200"
                                  : "border-rose-500/45 bg-rose-500/15 text-rose-700 dark:text-rose-200"
                              )}
                              title={
                                metaInfo.storage?.documentStorageConfigured
                                  ? `${metaInfo.storage?.provider || "Storage"} • ${metaInfo.storage?.applicationsPath || "Client/Applications/"}`
                                  : "Cloud storage is not configured"
                              }
                            >
                              {metaInfo.storage?.documentStorageConfigured ? "Configured" : "Not Configured"}
                            </span>
                          </div>
                          <p>
                            Commit:{" "}
                            {recentMainCommits.length > 0 ? (
                              recentMainCommits.map((entry, index) => (
                                <span key={`build-commit-main-${entry.sha}`}>
                                  {index > 0 ? ", " : ""}
                                  <a
                                    href={entry.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-indigo-600 hover:underline dark:text-indigo-300"
                                    title={entry.message || entry.sha}
                                  >
                                    {entry.shortSha || entry.sha.slice(0, 7)}
                                  </a>
                                </span>
                              ))
                            ) : (
                              "N/A"
                            )}
                          </p>
                        </div>

                        <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">GitHub</p>
                          <p className="truncate" title={metaInfo.github.repositoryUrl || "N/A"}>Repository: {metaInfo.github.repositoryUrl || "N/A"}</p>
                          <p className="truncate" title={metaInfo.github.homepageUrl || "N/A"}>Homepage: {metaInfo.github.homepageUrl || "N/A"}</p>
                          <p className="truncate" title={metaInfo.github.issuesUrl || "N/A"}>Issues: {metaInfo.github.issuesUrl || "N/A"}</p>
                        </div>
                      </div>

                      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Running Commit Log</p>
                          <button
                            type="button"
                            onClick={() => void loadMetaInfo()}
                            disabled={isLoadingMetaInfo}
                            className="h-7 rounded-md border border-zinc-300 bg-white px-2 text-[10px] font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            {isLoadingMetaInfo ? "Refreshing..." : "Refresh"}
                          </button>
                        </div>
                        {(metaInfo.commits ?? []).length === 0 ? (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">No local git history available.</p>
                        ) : (
                          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 text-xs">
                            {(metaInfo.commits ?? []).map((entry) => {
                              const commitHref = metaInfo.github.repositoryUrl
                                ? `${metaInfo.github.repositoryUrl}/commit/${entry.sha}`
                                : null;

                              return (
                                <div
                                  key={`general-meta-commit-${entry.sha}`}
                                  className="rounded border border-zinc-200 bg-zinc-50/70 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900/30"
                                >
                                  <p className="truncate font-semibold text-zinc-800 dark:text-zinc-100" title={entry.message}>{entry.message}</p>
                                  <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                                    {entry.author} • {formatDateTime(entry.committedAt)}
                                  </p>
                                  {commitHref ? (
                                    <a
                                      href={commitHref}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="mt-0.5 inline-block font-mono text-[11px] text-indigo-600 hover:underline dark:text-indigo-300"
                                    >
                                      {entry.shortSha}
                                    </a>
                                  ) : (
                                    <p className="mt-0.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{entry.shortSha}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">No build metadata available.</p>
                  )}
                </div>
              </div>
            )}

            {activeSection === "members" && (
              <div className="flex h-full min-h-0 flex-col rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
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
                          {roleLabelLookup[role] ? `${roleLabelLookup[role]} (${role})` : role}
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
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Users</p>
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                      {filteredUsers.length}
                    </span>
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                      Users: {separatedFilteredUsers.usersOnly.length}
                    </span>
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                      Staff: {separatedFilteredUsers.staff.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onAssignAllBotsToBotsRole()}
                    disabled={isAssigningBotsRole || separatedFilteredUsers.botsAndApps.length === 0}
                    className="h-8 rounded-md bg-indigo-600 px-3 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Assign all bot/app accounts to BOTS role"
                  >
                    {isAssigningBotsRole ? "Assigning..." : "Assign Bots/Apps to BOTS"}
                  </button>
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
                        {role === "ALL" ? "All roles" : (roleLabelLookup[role] ? `${roleLabelLookup[role]} (${role})` : role)}
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

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Rows</span>
                  {(["COMPACT", "COMFORTABLE", "SPACIOUS"] as const).map((density) => (
                    <button
                      key={`members-row-density-${density}`}
                      type="button"
                      onClick={() => setListRowDensity(density)}
                      className={cn(
                        "h-7 rounded-md border px-2.5 text-[11px] font-semibold transition",
                        listRowDensity === density
                          ? "border-indigo-500/45 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
                          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      )}
                    >
                      {density === "COMPACT" ? "Compact" : density === "SPACIOUS" ? "Spacious" : "Comfortable"}
                    </button>
                  ))}
                </div>

                <div className="min-h-0 flex-1">
                  {isLoadingUsers ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading users...</p>
                  ) : usersError ? (
                    <p className="text-sm text-rose-500">{usersError}</p>
                  ) : filteredUsers.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">
                      No users found{hasActiveMemberFilters ? " for the current filters" : ""}.
                    </p>
                  ) : (
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                      {renderMemberSectionTable("Users", separatedFilteredUsers.usersOnly)}
                      {renderMemberSectionTable("Bots & Apps", separatedFilteredUsers.botsAndApps, "indigo")}
                      {renderMemberSectionTable("Staff (Admin / Dev / Mod)", separatedFilteredUsers.staff)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeSection === "iaServerMenu" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">In-Accord URL Runtime Editor</p>
                  <button
                    type="button"
                    onClick={() => {
                      void loadSiteUrlSetup();
                      void loadServerPerformance();
                      void loadManagedFiles();
                    }}
                    className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Refresh
                  </button>
                </div>

                <div className="mb-3 rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Server Performance</p>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Updated: {formatDateTime(serverPerformance?.updatedAt ?? null)}</span>
                  </div>

                  {isLoadingServerPerformance ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading server performance...</p>
                  ) : serverPerformanceError ? (
                    <p className="text-xs text-rose-500">{serverPerformanceError}</p>
                  ) : serverPerformance ? (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                      <div className="rounded-md border border-zinc-300 bg-zinc-50/80 p-2 dark:border-zinc-700 dark:bg-zinc-800/45">
                        <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">DB Ping</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{serverPerformance.databasePingMs} ms</p>
                      </div>
                      <div className="rounded-md border border-zinc-300 bg-zinc-50/80 p-2 dark:border-zinc-700 dark:bg-zinc-800/45">
                        <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Uptime</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{Math.floor(serverPerformance.uptimeSeconds / 3600)}h {Math.floor((serverPerformance.uptimeSeconds % 3600) / 60)}m</p>
                      </div>
                      <div className="rounded-md border border-zinc-300 bg-zinc-50/80 p-2 dark:border-zinc-700 dark:bg-zinc-800/45">
                        <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Memory RSS</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{serverPerformance.memoryRssMb} MB</p>
                      </div>
                      <div className="rounded-md border border-zinc-300 bg-zinc-50/80 p-2 dark:border-zinc-700 dark:bg-zinc-800/45">
                        <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Servers / Channels</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{serverPerformance.totalServers} / {serverPerformance.totalChannels}</p>
                      </div>
                      <div className="rounded-md border border-zinc-300 bg-zinc-50/80 p-2 dark:border-zinc-700 dark:bg-zinc-800/45">
                        <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Members / Messages</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{serverPerformance.totalMembers} / {serverPerformance.totalMessages}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">No server performance data available.</p>
                  )}

                  {serverPerformance?.nodeVersion ? (
                    <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">Runtime: {serverPerformance.nodeVersion}</p>
                  ) : null}
                </div>

                <div className="mb-3 rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">File Manager</p>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Scope: Repository Root</span>
                    <button
                      type="button"
                      onClick={() => void loadManagedFiles()}
                      className="h-7 rounded-md border border-zinc-300 bg-white px-2 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Refresh Files
                    </button>
                  </div>

                  <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      type="text"
                      value={managedFilesFolderDraft}
                      onChange={(event) => setManagedFilesFolderDraft(event.target.value)}
                      placeholder="Folder inside repository root (leave blank for root)"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <button
                      type="button"
                      onClick={() => void loadManagedFiles(managedFilesFolderDraft)}
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Open Folder
                    </button>
                  </div>

                  <div className="mb-2 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => void onOpenCheckedFolder()}
                      className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Open Checked Folder
                    </button>
                  </div>

                  <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      type="file"
                      onChange={(event) => setManagedFileUpload(event.target.files?.[0] ?? null)}
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={() => void onUploadManagedFile()}
                      disabled={isUploadingManagedFile || !managedFileUpload}
                      className="h-9 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isUploadingManagedFile ? "Uploading..." : "Upload File"}
                    </button>
                  </div>

                  {managedFilesError ? <p className="mb-2 text-xs text-rose-500">{managedFilesError}</p> : null}
                  {managedFilesSuccess ? <p className="mb-2 text-xs text-emerald-500">{managedFilesSuccess}</p> : null}

                  {isLoadingManagedFiles ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading files...</p>
                  ) : managedFiles.length === 0 ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">No files in this folder.</p>
                  ) : (
                    <div className="max-h-52 overflow-y-auto rounded-md border border-zinc-300 dark:border-zinc-700">
                      <div className="grid grid-cols-[0.35fr_1.6fr_0.6fr_0.8fr_0.8fr] gap-2 bg-zinc-200/80 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={managedFiles.length > 0 && selectedManagedFilePaths.length === managedFiles.length}
                            onChange={(event) =>
                              setSelectedManagedFilePaths(
                                event.target.checked ? managedFiles.map((entry) => entry.path) : []
                              )
                            }
                          />
                          <span>Sel</span>
                        </label>
                        <p>Path</p>
                        <p>Size</p>
                        <p>Updated</p>
                        <p>Actions</p>
                      </div>
                      <div className="bg-white/70 text-xs text-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200">
                        {managedFiles.map((file, index) => (
                          <div
                            key={`managed-file-${file.path}-${index}`}
                            className={cn(
                              "grid grid-cols-[0.35fr_1.6fr_0.6fr_0.8fr_0.8fr] items-center gap-2 px-3 py-2",
                              index % 2 === 0
                                ? "bg-white/70 dark:bg-zinc-950/25"
                                : "bg-zinc-100/70 dark:bg-zinc-900/35"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selectedManagedFilePaths.includes(file.path)}
                              onChange={(event) =>
                                setSelectedManagedFilePaths((current) =>
                                  event.target.checked
                                    ? Array.from(new Set([...current, file.path]))
                                    : current.filter((entry) => entry !== file.path)
                                )
                              }
                            />
                            <p className="truncate font-mono" title={file.path}>{file.path}</p>
                            <p>{file.isDirectory ? "-" : `${Math.max(1, Math.round(file.sizeBytes / 1024))} KB`}</p>
                            <p className="truncate" title={formatDateTime(file.updatedAt)}>{formatDateTime(file.updatedAt)}</p>
                            <div className="flex items-center gap-1.5">
                              {file.url ? (
                                <a
                                  href={file.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex h-7 items-center rounded-md border border-zinc-300 bg-white px-2 text-[10px] font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                >
                                  Open
                                </a>
                              ) : (
                                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Folder</span>
                              )}
                              {!file.isDirectory ? (
                                <button
                                  type="button"
                                  onClick={() => void onDeleteManagedFile(file)}
                                  disabled={deletingManagedFilePath === file.path}
                                  className="h-7 rounded-md border border-rose-500/35 bg-rose-500/15 px-2 text-[10px] font-semibold text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {deletingManagedFilePath === file.path ? "Deleting..." : "Delete"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                  <p className="mb-2 text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">App Base URL (used for generated links)</p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <input
                      type="url"
                      value={siteUrlDraft}
                      onChange={(event) => setSiteUrlDraft(event.target.value)}
                      placeholder="https://app.your-domain.com"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <button
                      type="button"
                      onClick={() => setSiteUrlDraft(typeof window !== "undefined" ? window.location.origin : siteUrlDraft)}
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Use Current
                    </button>
                    <button
                      type="button"
                      onClick={() => void onSaveSiteUrlSetup()}
                      disabled={isSavingSiteUrlSetup}
                      className="h-9 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingSiteUrlSetup ? "Saving..." : "Save URL"}
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Leave blank to fall back to NEXT_PUBLIC_SITE_URL. This updates server-generated URLs for applications, uploads, and payment redirects.
                  </p>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Effective URL</p>
                    <p className="mt-1 break-all text-sm font-semibold text-zinc-900 dark:text-zinc-100">{siteUrlSetup?.effectiveAppBaseUrl ?? "N/A"}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Source</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {siteUrlSetup?.usesOverride ? "Runtime override" : "Environment fallback"}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">Updated: {formatDateTime(siteUrlSetup?.updatedAt ?? null)}</p>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                  <p className="mb-2 text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Hosting Service Information</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      type="text"
                      value={hostingServiceNameDraft}
                      onChange={(event) => setHostingServiceNameDraft(event.target.value)}
                      placeholder="Hosting Service"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <input
                      type="text"
                      value={hostingHostNameDraft}
                      onChange={(event) => setHostingHostNameDraft(event.target.value)}
                      placeholder="Host Name"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <input
                      type="url"
                      value={hostingHostUrlDraft}
                      onChange={(event) => setHostingHostUrlDraft(event.target.value)}
                      placeholder="Host URL (https://...)"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <input
                      type="text"
                      value={hostingLoginDraft}
                      onChange={(event) => setHostingLoginDraft(event.target.value)}
                      placeholder="Login"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <input
                      type="password"
                      value={hostingPasswordDraft}
                      onChange={(event) => setHostingPasswordDraft(event.target.value)}
                      placeholder="Password"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <input
                      type="text"
                      value={hostingCostDraft}
                      onChange={(event) => setHostingCostDraft(event.target.value)}
                      placeholder="Cost"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                  </div>
                </div>

                {isLoadingSiteUrlSetup ? (
                  <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Loading URL setup...</p>
                ) : null}
                {siteUrlError ? <p className="mt-3 text-xs text-rose-500">{siteUrlError}</p> : null}
                {siteUrlSuccess ? <p className="mt-3 text-xs text-emerald-500">{siteUrlSuccess}</p> : null}
              </div>
            )}

            {activeSection === "databaseManagement" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Database Information</p>
                  <button
                    type="button"
                    onClick={() => void loadSiteUrlSetup()}
                    className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Refresh
                  </button>
                </div>

                <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                  <p className="mb-2 text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Database Service</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      type="text"
                      value={databaseServiceNameDraft}
                      onChange={(event) => setDatabaseServiceNameDraft(event.target.value)}
                      placeholder="Database Service"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <input
                      type="text"
                      value={databaseHostNameDraft}
                      onChange={(event) => setDatabaseHostNameDraft(event.target.value)}
                      placeholder="Host Name"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <input
                      type="url"
                      value={databaseHostUrlDraft}
                      onChange={(event) => setDatabaseHostUrlDraft(event.target.value)}
                      placeholder="Host URL (https://...)"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <input
                      type="text"
                      value={databaseLoginDraft}
                      onChange={(event) => setDatabaseLoginDraft(event.target.value)}
                      placeholder="Login"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <input
                      type="password"
                      value={databasePasswordDraft}
                      onChange={(event) => setDatabasePasswordDraft(event.target.value)}
                      placeholder="Password"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <input
                      type="text"
                      value={databaseCostDraft}
                      onChange={(event) => setDatabaseCostDraft(event.target.value)}
                      placeholder="Cost"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void onSaveSiteUrlSetup()}
                      disabled={isSavingSiteUrlSetup}
                      className="h-9 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingSiteUrlSetup ? "Saving..." : "Save Database Info"}
                    </button>
                  </div>
                </div>

                {isLoadingSiteUrlSetup ? (
                  <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Loading database setup...</p>
                ) : null}
                {siteUrlError ? <p className="mt-3 text-xs text-rose-500">{siteUrlError}</p> : null}
                {siteUrlSuccess ? <p className="mt-3 text-xs text-emerald-500">{siteUrlSuccess}</p> : null}
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

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Rows</span>
                  {(["COMPACT", "COMFORTABLE", "SPACIOUS"] as const).map((density) => (
                    <button
                      key={`servers-row-density-${density}`}
                      type="button"
                      onClick={() => setListRowDensity(density)}
                      className={cn(
                        "h-7 rounded-md border px-2.5 text-[11px] font-semibold transition",
                        listRowDensity === density
                          ? "border-indigo-500/45 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
                          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      )}
                    >
                      {density === "COMPACT" ? "Compact" : density === "SPACIOUS" ? "Spacious" : "Comfortable"}
                    </button>
                  ))}
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
                              className={cn(
                                "grid gap-2 border-b border-zinc-200/80 bg-white/85 px-3 text-zinc-900 transition-colors hover:bg-indigo-50/70 last:border-b-0 dark:border-zinc-800 dark:bg-zinc-950/35 dark:text-zinc-100 dark:hover:bg-zinc-800/55",
                                listRowDensityClass
                              )}
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
              <div className="flex h-full min-h-0 flex-col rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
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

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Rows</span>
                  {(["COMPACT", "COMFORTABLE", "SPACIOUS"] as const).map((density) => (
                    <button
                      key={`server-tags-row-density-${density}`}
                      type="button"
                      onClick={() => setListRowDensity(density)}
                      className={cn(
                        "h-7 rounded-md border px-2.5 text-[11px] font-semibold transition",
                        listRowDensity === density
                          ? "border-indigo-500/45 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
                          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      )}
                    >
                      {density === "COMPACT" ? "Compact" : density === "SPACIOUS" ? "Spacious" : "Comfortable"}
                    </button>
                  ))}
                </div>

                {serverTagsActionError ? (
                  <p className="mb-3 text-xs text-rose-500">{serverTagsActionError}</p>
                ) : null}
                {serverTagsActionSuccess ? (
                  <p className="mb-3 text-xs text-emerald-500">{serverTagsActionSuccess}</p>
                ) : null}

                <div className="min-h-0 flex-1">
                  {isLoadingServerTags ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading server tags...</p>
                  ) : serverTagsError ? (
                    <p className="text-sm text-rose-500">{serverTagsError}</p>
                  ) : filteredServerTags.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">
                      No server tags found{hasActiveServerTagFilters ? " for the current filters" : ""}.
                    </p>
                  ) : (
                    <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1">
                      {filteredServerTags.map((item) => {
                      const draft = serverTagDrafts[item.serverId] ?? {
                        tagCode: item.tagCode ?? "",
                        iconKey: item.iconKey ?? serverTagIconOptions[0]?.key ?? "",
                      };
                      const isSaving = savingServerTagServerId === item.serverId;

                      return (
                        <div
                          key={item.serverId}
                          className={cn(
                            "rounded-lg border border-zinc-300 bg-white/85 dark:border-zinc-700 dark:bg-zinc-900/45",
                            listCardDensityClass
                          )}
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
              </div>
            )}

            {(activeSection === "reported" || activeSection === "issuesBugs") && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/65 p-5 dark:border-zinc-700 dark:bg-zinc-800/35">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-zinc-800 dark:text-zinc-100">
                      {activeSection === "issuesBugs" ? "Issues & Bugs Queue" : "Reports Queue"}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                      Review, assign, and resolve incoming tickets.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadReports()}
                    className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Refresh
                  </button>
                </div>

                <div className="mb-5 grid gap-2 rounded-lg border border-zinc-200/80 bg-white/65 p-3 dark:border-zinc-700/70 dark:bg-zinc-900/30 sm:grid-cols-[180px_180px_auto_auto]">
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

                  {activeSection === "reported" ? (
                    <select
                      value={reportTargetTypeFilter === "BUG" ? "ALL" : reportTargetTypeFilter}
                      onChange={(event) => setReportTargetTypeFilter(event.target.value as typeof reportTargetTypeFilter)}
                      className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value="ALL">All report targets</option>
                      <option value="USER">Users</option>
                      <option value="SERVER">Servers</option>
                      <option value="MESSAGE">Messages</option>
                    </select>
                  ) : (
                    <div className="inline-flex h-9 items-center rounded-md border border-rose-500/35 bg-rose-500/15 px-3 text-sm font-semibold text-rose-700 dark:text-rose-200">
                      Target: Bugs only
                    </div>
                  )}

                  {activeSection === "reported" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setReportTargetTypeFilter("ALL");
                      }}
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Reset target
                    </button>
                  ) : (
                    <div className="hidden sm:block" aria-hidden="true" />
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setReportStatusFilter("ALL");
                      setReportTargetTypeFilter(activeSection === "issuesBugs" ? "BUG" : "ALL");
                    }}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Clear filters
                  </button>
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Rows</span>
                  {(["COMPACT", "COMFORTABLE", "SPACIOUS"] as const).map((density) => (
                    <button
                      key={`reports-row-density-${density}`}
                      type="button"
                      onClick={() => setListRowDensity(density)}
                      className={cn(
                        "h-7 rounded-md border px-2.5 text-[11px] font-semibold transition",
                        listRowDensity === density
                          ? "border-indigo-500/45 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
                          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      )}
                    >
                      {density === "COMPACT" ? "Compact" : density === "SPACIOUS" ? "Spacious" : "Comfortable"}
                    </button>
                  ))}
                </div>

                {isLoadingReports ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading reports...</p>
                ) : reportsError ? (
                  <p className="text-sm text-rose-500">{reportsError}</p>
                ) : sectionReports.length === 0 ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">No reports found for current filters.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
                    <div className="grid grid-cols-[1.1fr_0.8fr_0.7fr_1fr_1.4fr_auto] gap-2 bg-zinc-200/80 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      <p>{activeSection === "issuesBugs" ? "Issue" : "Report"}</p>
                      <p>Status</p>
                      <p>Severity</p>
                      <p>Reporter</p>
                      <p>Created</p>
                      <p>Actions</p>
                    </div>
                    <div className="max-h-100 overflow-y-auto bg-white/80 text-xs text-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200">
                      {sectionReports.map((report, index) => {
                        const severity = parseReportSeverity(report.reason);
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
                            className={cn(
                              "grid grid-cols-[1.1fr_0.8fr_0.7fr_1fr_1.4fr_auto] items-center gap-2 px-3",
                              listRowDensityClass,
                              index % 2 === 0
                                ? "bg-white/70 dark:bg-zinc-950/25"
                                : "bg-zinc-100/70 dark:bg-zinc-900/35"
                            )}
                          >
                            <p className="truncate font-semibold" title={report.targetName}>{report.targetName}</p>
                            <div>
                              <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", statusClassName)}>
                                {report.status.replace("_", " ")}
                              </span>
                            </div>
                            <p
                              className={cn(
                                "truncate uppercase font-semibold",
                                severity ? getSeverityTextClassName(severity) : "text-zinc-500 dark:text-zinc-400"
                              )}
                              title={severity ?? "Not specified"}
                            >
                              {severity ? String(severity).toLowerCase() : "n/a"}
                            </p>
                            <p className="truncate" title={`${report.reporterName}${report.reporterEmail ? ` (${report.reporterEmail})` : ""}`}>
                              {report.reporterName}
                            </p>
                            <p className="truncate" title={formatDateTime(report.createdAt)}>{formatDateTime(report.createdAt)}</p>
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => setViewingIssueReport(report)}
                                className="h-7 rounded-md border border-indigo-300 bg-indigo-50 px-2.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-950/35 dark:text-indigo-200 dark:hover:bg-indigo-900/45"
                              >
                                View
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <Dialog
              open={Boolean(viewingIssueReport)}
              onOpenChange={(open) => {
                if (!open) {
                  setViewingIssueReport(null);
                }
              }}
            >
              <DialogContent className="max-w-240 bg-white text-black dark:bg-[#313338] dark:text-white">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Bug className="h-4 w-4" />
                    {viewingIssueReport?.targetType === "BUG" ? "Issue & Bug Review Panel" : "Report Review Panel"}
                  </DialogTitle>
                  <DialogDescription className="text-zinc-600 dark:text-zinc-300">
                    {viewingIssueReport?.targetType === "BUG"
                      ? "Review the selected bug report and update assignment, status, or notes."
                      : "Review the selected report and update assignment, status, or notes."}
                  </DialogDescription>
                </DialogHeader>

                {viewingIssueReport ? (
                  (() => {
                    const report = reports.find((item) => item.id === viewingIssueReport.id) ?? viewingIssueReport;
                    const severity = parseReportSeverity(report.reason);
                    const reporterUser = users.find((user) => user.userId === report.reporterProfileId || user.id === report.reporterProfileId);
                    const postedAdminNotes = String(report.adminNote ?? "")
                      .split(/\n---\n/g)
                      .map((item) => item.trim())
                      .filter(Boolean);
                    const statusClassName =
                      report.status === "OPEN"
                        ? "border-amber-500/30 bg-amber-500/15 text-amber-200"
                        : report.status === "IN_REVIEW"
                          ? "border-indigo-500/30 bg-indigo-500/15 text-indigo-200"
                          : report.status === "RESOLVED"
                            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
                            : "border-zinc-500/30 bg-zinc-500/15 text-zinc-200";

                    return (
                      <div className="admin-wrap-text space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold uppercase tracking-[0.08em] text-zinc-900 dark:text-zinc-100">
                            {report.targetName}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", statusClassName)}>
                              {report.status.replace("_", " ")}
                            </span>
                            <span
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
                                severity ? getSeverityClassName(severity) : "border-zinc-500/30 bg-zinc-500/15 text-zinc-200"
                              )}
                            >
                              {severity ? String(severity).toLowerCase() : "n/a"}
                            </span>
                          </div>
                        </div>

                        <div className="grid gap-2 md:grid-cols-3">
                          <div className="rounded-md border border-zinc-200 bg-zinc-50/80 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900/45">
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Reporter</p>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-zinc-300/70 bg-white/70 px-2 py-1 text-left font-semibold text-zinc-800 transition hover:bg-zinc-100/80 dark:border-zinc-700/70 dark:bg-zinc-900/55 dark:text-zinc-100 dark:hover:bg-zinc-800/70"
                                  title={`View profile for ${report.reporterName}`}
                                >
                                  <UserAvatar src={reporterUser?.imageUrl} className="h-5 w-5" />
                                  <span className="wrap-break-word">
                                    {report.reporterName}
                                    {report.reporterEmail ? ` (${report.reporterEmail})` : ""}
                                  </span>
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                side="top"
                                align="start"
                                className="w-80 rounded-xl border border-zinc-300 bg-white p-3 text-zinc-900 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                              >
                                <div className="flex items-center gap-2">
                                  <UserAvatar src={reporterUser?.imageUrl} className="h-10 w-10" />
                                  <div className="min-w-0">
                                    <p className="wrap-break-word text-sm font-semibold">{report.reporterName}</p>
                                    <p className="wrap-break-word text-xs text-zinc-500 dark:text-zinc-400">{report.reporterEmail || "No email available"}</p>
                                  </div>
                                </div>

                                <div className="mt-3 space-y-1 rounded-md border border-zinc-200 bg-zinc-50/80 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-800/50">
                                  <p><span className="font-semibold">Profile ID:</span> {report.reporterProfileId}</p>
                                  {reporterUser?.role ? <p><span className="font-semibold">Role:</span> {reporterUser.role}</p> : null}
                                  {reporterUser?.profileName ? <p><span className="font-semibold">Profile Name:</span> {reporterUser.profileName}</p> : null}
                                  {reporterUser?.joinedAt ? <p><span className="font-semibold">Joined:</span> {formatDateTime(reporterUser.joinedAt)}</p> : null}
                                  {reporterUser?.lastLogin ? <p><span className="font-semibold">Last Login:</span> {formatDateTime(reporterUser.lastLogin)}</p> : null}
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const dmQuery = report.reporterEmail || report.reporterName || report.reporterProfileId;
                                      router.push(`/users?view=friends&filter=all&q=${encodeURIComponent(dmQuery)}&source=admin-reports`);
                                    }}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-indigo-300 bg-indigo-50 px-2.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-950/35 dark:text-indigo-200 dark:hover:bg-indigo-900/45"
                                    title="Open DM view"
                                    aria-label="Open direct message view"
                                  >
                                    <MessageCircle className="h-3.5 w-3.5" />
                                    DM
                                  </button>

                                  <a
                                    href={report.reporterEmail ? `mailto:${report.reporterEmail}` : undefined}
                                    className={cn(
                                      "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition",
                                      report.reporterEmail
                                        ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-200 dark:hover:bg-emerald-900/45"
                                        : "pointer-events-none border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-500"
                                    )}
                                    title={report.reporterEmail ? "Email reporter" : "No email available"}
                                    aria-label="Email reporter"
                                  >
                                    <Mail className="h-3.5 w-3.5" />
                                    Email
                                  </a>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setViewingIssueReport(null);
                                      setActiveSection("members");
                                      setMemberSearch(report.reporterProfileId || report.reporterName || report.reporterEmail || "");
                                      if (users.length === 0) {
                                        void loadUsers();
                                      }
                                    }}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                    title="Open full profile in Members"
                                    aria-label="Open full profile"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="rounded-md border border-zinc-200 bg-zinc-50/80 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900/45">
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Created</p>
                            <p className="font-semibold wrap-break-word">{formatDateTime(report.createdAt)}</p>
                          </div>

                          <div className="rounded-md border border-zinc-200 bg-zinc-50/80 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900/45">
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Severity</p>
                            <div className="flex items-center gap-2">
                              <select
                                value={reportSeverityDrafts[report.id] ?? severity ?? "LOW"}
                                onChange={(event) =>
                                  setReportSeverityDrafts((current) => ({
                                    ...current,
                                    [report.id]: event.target.value as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
                                  }))
                                }
                                className={cn(
                                  "h-8 min-w-30 rounded-md border bg-white px-2 text-xs font-semibold uppercase outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-zinc-900",
                                  (reportSeverityDrafts[report.id] ?? severity)
                                    ? getSeverityClassName((reportSeverityDrafts[report.id] ?? severity) as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL")
                                    : "border-zinc-300 text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                                )}
                              >
                                <option value="LOW">LOW</option>
                                <option value="MEDIUM">MEDIUM</option>
                                <option value="HIGH">HIGH</option>
                                <option value="CRITICAL">CRITICAL</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => void onSaveReportSeverity(report.id)}
                                disabled={updatingReportId === report.id}
                                className="h-8 rounded-md border border-emerald-500/35 bg-emerald-500/15 px-2.5 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Save
                              </button>
                            </div>
                          </div>

                          <div className="rounded-md border border-zinc-200 bg-zinc-50/80 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900/45 md:col-span-3">
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Reason</p>
                            <p className="font-semibold wrap-break-word">{report.reason || "No reason provided"}</p>
                          </div>

                          {report.details ? (
                            <div className="rounded-md border border-zinc-200 bg-zinc-50/80 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900/45 md:col-span-3">
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Details</p>
                              <p className="whitespace-pre-wrap wrap-break-word">{report.details}</p>
                            </div>
                          ) : null}

                          <div className="rounded-md border border-zinc-200 bg-zinc-50/80 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900/45 md:col-span-3">
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Assigned</p>
                            <p className="font-semibold wrap-break-word">
                              {report.assignedAdminName
                                ? `${report.assignedAdminName}${report.assignedAdminEmail ? ` (${report.assignedAdminEmail})` : ""}`
                                : "Unassigned"}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                          <label className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                            Admin notes
                          </label>

                          {postedAdminNotes.length === 0 ? (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">No posted notes yet.</p>
                          ) : (
                            <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-zinc-200 bg-white/80 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/50">
                              {[...postedAdminNotes].reverse().map((note, index) => (
                                <div
                                  key={`issue-admin-note-${report.id}-${index}`}
                                  className="rounded-md border border-zinc-200/80 bg-zinc-50/80 px-2 py-1.5 text-zinc-700 dark:border-zinc-700/70 dark:bg-zinc-800/45 dark:text-zinc-200"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="whitespace-pre-wrap wrap-break-word">{note}</p>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setViewingReportNotes(report);
                                        setViewingReportNoteEntry(note);
                                      }}
                                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                    >
                                      <Eye className="h-3 w-3" />
                                      View
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <textarea
                            value={reportPostNoteDrafts[report.id] ?? ""}
                            onChange={(event) =>
                              setReportPostNoteDrafts((current) => ({
                                ...current,
                                [report.id]: event.target.value,
                              }))
                            }
                            rows={3}
                            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs leading-5 text-zinc-800 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                            placeholder="Write a new admin note to post..."
                          />

                          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                            <button
                              type="button"
                              onClick={() => void onPostReportNote(report.id)}
                              disabled={updatingReportId === report.id}
                              className="h-8 rounded-md border border-zinc-400/35 bg-zinc-500/15 px-3 text-xs font-medium text-zinc-200 transition hover:bg-zinc-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Post note
                            </button>
                            <button
                              type="button"
                              onClick={() => void onAssignReportToSelf(report.id)}
                              disabled={updatingReportId === report.id}
                              className="h-8 rounded-md border border-indigo-500/35 bg-indigo-500/15 px-3 text-xs font-medium text-indigo-200 transition hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Assign to me
                            </button>
                            <button
                              type="button"
                              onClick={() => void onUnassignReport(report.id)}
                              disabled={updatingReportId === report.id || !report.assignedAdminProfileId}
                              className="h-8 rounded-md border border-zinc-500/35 bg-zinc-500/15 px-3 text-xs font-medium text-zinc-200 transition hover:bg-zinc-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Unassign
                            </button>

                            <select
                              value={reportStatusDrafts[report.id] ?? report.status}
                              onChange={(event) =>
                                setReportStatusDrafts((current) => ({
                                  ...current,
                                  [report.id]: event.target.value as AdminReport["status"],
                                }))
                              }
                              className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                            >
                              <option value="OPEN">Open</option>
                              <option value="IN_REVIEW">In review</option>
                              <option value="RESOLVED">Resolved</option>
                              <option value="DISMISSED">Dismissed</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => void onSaveReportStatus(report.id)}
                              disabled={updatingReportId === report.id}
                              className="h-8 rounded-md border border-emerald-500/35 bg-emerald-500/15 px-3 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Save status
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : null}
              </DialogContent>
            </Dialog>

            <Dialog
              open={Boolean(viewingReportNotes)}
              onOpenChange={(open) => {
                if (!open) {
                  setViewingReportNotes(null);
                  setViewingReportNoteEntry(null);
                }
              }}
            >
              <DialogContent className="max-w-2xl bg-white text-black dark:bg-[#313338] dark:text-white">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <ScrollText className="h-4 w-4" />
                    Admin Notes
                  </DialogTitle>
                  <DialogDescription className="text-zinc-600 dark:text-zinc-300">
                    Posted notes history for this {viewingReportNotes?.targetType === "BUG" ? "issue" : "report"}.
                  </DialogDescription>
                </DialogHeader>

                {viewingReportNotes ? (
                  (() => {
                    const report = reports.find((item) => item.id === viewingReportNotes.id) ?? viewingReportNotes;
                    const postedAdminNotes = String(report.adminNote ?? "")
                      .split(/\n---\n/g)
                      .map((item) => item.trim())
                      .filter(Boolean);

                    if (viewingReportNoteEntry) {
                      return (
                        <div className="rounded-md border border-zinc-300 bg-zinc-50/90 p-3 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/45 dark:text-zinc-200">
                          <p className="whitespace-pre-wrap wrap-break-word">{viewingReportNoteEntry}</p>
                        </div>
                      );
                    }

                    return postedAdminNotes.length === 0 ? (
                      <p className="text-sm text-zinc-600 dark:text-zinc-300">No posted notes yet.</p>
                    ) : (
                      <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                        {[...postedAdminNotes].reverse().map((note, index) => (
                          <div
                            key={`admin-note-popup-${report.id}-${index}`}
                            className="rounded-md border border-zinc-300 bg-zinc-50/90 p-3 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/45 dark:text-zinc-200"
                          >
                            <p className="whitespace-pre-wrap wrap-break-word">{note}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                ) : null}
              </DialogContent>
            </Dialog>

            {activeSection === "moderation" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/65 p-5 dark:border-zinc-700 dark:bg-zinc-800/35">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-zinc-800 dark:text-zinc-100">Moderation</p>
                    <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                      Review moderation signals and account health trends.
                    </p>
                  </div>
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
                  <div className="space-y-4">
                    <div className="grid gap-2 md:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => setModerationFocus("REVIEW_QUEUE")}
                        className={cn(
                          "rounded-lg border bg-white/80 p-3 text-left transition dark:bg-zinc-900/45",
                          moderationFocus === "REVIEW_QUEUE"
                            ? "border-indigo-500/50 ring-1 ring-indigo-400/45 dark:border-indigo-400/60"
                            : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900/60"
                        )}
                      >
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Potential Review Queue</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{(securitySummary?.inactive30d ?? 0) + (securitySummary?.neverLoggedIn ?? 0)}</p>
                        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">inactive or never-logged accounts to review</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setModerationFocus("ADMIN_COVERAGE")}
                        className={cn(
                          "rounded-lg border bg-white/80 p-3 text-left transition dark:bg-zinc-900/45",
                          moderationFocus === "ADMIN_COVERAGE"
                            ? "border-indigo-500/50 ring-1 ring-indigo-400/45 dark:border-indigo-400/60"
                            : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900/60"
                        )}
                      >
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Admin Coverage</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{securitySummary?.adminUsers ?? 0}</p>
                        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">users with elevated role permissions</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setModerationFocus("OWNER_ISSUES")}
                        className={cn(
                          "rounded-lg border bg-white/80 p-3 text-left transition dark:bg-zinc-900/45",
                          moderationFocus === "OWNER_ISSUES"
                            ? "border-indigo-500/50 ring-1 ring-indigo-400/45 dark:border-indigo-400/60"
                            : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900/60"
                        )}
                      >
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Owner Issues</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{securitySummary?.serversWithoutValidOwner ?? 0}</p>
                        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">servers with missing/invalid owner linkage</p>
                      </button>
                    </div>

                    <div className="rounded-lg border border-zinc-200/80 bg-white/65 p-3 dark:border-zinc-700/70 dark:bg-zinc-900/30">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                          {moderationFocus === "REVIEW_QUEUE"
                            ? "Potential Review Queue"
                            : moderationFocus === "ADMIN_COVERAGE"
                              ? "Admin Coverage"
                              : "Owner Issues"}
                        </p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {moderationListData.rows.length} item{moderationListData.rows.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <input
                        type="text"
                        value={moderationSearch}
                        onChange={(event) => setModerationSearch(event.target.value)}
                        placeholder="Search selected moderation list"
                        className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Rows</span>
                      {(["COMPACT", "COMFORTABLE", "SPACIOUS"] as const).map((density) => (
                        <button
                          key={`moderation-row-density-${density}`}
                          type="button"
                          onClick={() => setListRowDensity(density)}
                          className={cn(
                            "h-7 rounded-md border px-2.5 text-[11px] font-semibold transition",
                            listRowDensity === density
                              ? "border-indigo-500/45 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
                              : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          )}
                        >
                          {density === "COMPACT" ? "Compact" : density === "SPACIOUS" ? "Spacious" : "Comfortable"}
                        </button>
                      ))}
                    </div>

                    <div className="overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
                      {moderationListData.mode === "USERS" ? (
                        <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 bg-zinc-200/80 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          <p>User</p>
                          <p>Email</p>
                          <p>Role</p>
                          <p>Last Login</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-[1.4fr_0.7fr_1fr] gap-2 bg-zinc-200/80 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          <p>Item</p>
                          <p>Missing / Value</p>
                          <p>Context</p>
                        </div>
                      )}
                      <div className="max-h-80 overflow-y-auto bg-white/80 text-xs text-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200">
                        {moderationListData.rows.length === 0 ? (
                          <p className="px-3 py-3 text-zinc-600 dark:text-zinc-300">
                            {moderationFocus === "OWNER_ISSUES"
                              ? "No missing or blank owner-related fields found."
                              : "No items found for this moderation list."}
                          </p>
                        ) : (
                          moderationListData.mode === "USERS"
                            ? (moderationListData.rows as AdminRecentLogin[]).map((row, index) => (
                                <div
                                  key={`moderation-login-${row.userId}-${index}`}
                                  className={cn(
                                    "grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 px-3",
                                    listRowDensityClass,
                                    index % 2 === 0
                                      ? "bg-white/70 dark:bg-zinc-950/25"
                                      : "bg-zinc-100/70 dark:bg-zinc-900/35"
                                  )}
                                >
                                  <p className="truncate" title={`${row.name} (${row.userId})`}>{row.name || row.userId}</p>
                                  <p className="truncate" title={row.email || "N/A"}>{row.email || "N/A"}</p>
                                  <p className="truncate" title={row.role || "USER"}>{row.role || "USER"}</p>
                                  <p className="truncate" title={row.lastLogin ? formatDateTime(row.lastLogin) : "Never"}>
                                    {row.lastLogin ? formatDateTime(row.lastLogin) : "Never"}
                                  </p>
                                </div>
                              ))
                            : (moderationListData.rows as Array<{ key: string; signal: string; value: string | number; notes: string }>).map((row, index) => (
                                <div
                                  key={`moderation-owner-issue-${row.key}-${index}`}
                                  className={cn(
                                    "grid grid-cols-[1.4fr_0.7fr_1fr] gap-2 px-3",
                                    listRowDensityClass,
                                    index % 2 === 0
                                      ? "bg-white/70 dark:bg-zinc-950/25"
                                      : "bg-zinc-100/70 dark:bg-zinc-900/35"
                                  )}
                                >
                                  <p className="truncate" title={row.signal}>{row.signal}</p>
                                  <p className="truncate" title={String(row.value)}>{row.value}</p>
                                  <p className="truncate" title={row.notes}>{row.notes}</p>
                                </div>
                              ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeSection === "roles" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Roles</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void loadUsers();
                        void loadManagedRoles();
                      }}
                      className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                <div className="mb-4 rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                  <p className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">Add role</p>
                  <div className="grid gap-2 md:grid-cols-[220px_1fr_auto]">
                    <input
                      type="text"
                      value={newRoleKey}
                      onChange={(event) => setNewRoleKey(event.target.value.toUpperCase())}
                      placeholder="Role key (e.g. HELPER)"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold uppercase tracking-wide text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <input
                      type="text"
                      value={newRoleLabel}
                      onChange={(event) => setNewRoleLabel(event.target.value)}
                      placeholder="Role label (optional)"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <button
                      type="button"
                      onClick={() => void onCreateManagedRole()}
                      disabled={isCreatingRole}
                      className="h-9 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCreatingRole ? "Adding..." : "Add role"}
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Use A-Z, 0-9, and _.
                  </p>
                </div>

                {managedRolesActionError ? <p className="mb-3 text-xs text-rose-500">{managedRolesActionError}</p> : null}
                {managedRolesActionSuccess ? <p className="mb-3 text-xs text-emerald-500">{managedRolesActionSuccess}</p> : null}

                {(isLoadingUsers || isLoadingManagedRoles) ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading role management...</p>
                ) : usersError ? (
                  <p className="text-sm text-rose-500">{usersError}</p>
                ) : managedRolesError ? (
                  <p className="text-sm text-rose-500">{managedRolesError}</p>
                ) : roleDistribution.length === 0 ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">No role data available.</p>
                ) : (
                  <div className="space-y-3">
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

                    <div className="overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
                      <div className="border-b border-zinc-300/70 bg-white/70 px-3 py-2 dark:border-zinc-700/70 dark:bg-zinc-900/35">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Rows</span>
                          {(["COMPACT", "COMFORTABLE", "SPACIOUS"] as const).map((density) => (
                            <button
                              key={`roles-row-density-${density}`}
                              type="button"
                              onClick={() => setListRowDensity(density)}
                              className={cn(
                                "h-7 rounded-md border px-2.5 text-[11px] font-semibold transition",
                                listRowDensity === density
                                  ? "border-indigo-500/45 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
                                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                              )}
                            >
                              {density === "COMPACT" ? "Compact" : density === "SPACIOUS" ? "Spacious" : "Comfortable"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-[180px_1fr_100px_130px] gap-2 bg-zinc-200/80 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        <p>Role Key</p>
                        <p>Label</p>
                        <p>Members</p>
                        <p>Actions</p>
                      </div>
                      <div className="max-h-85 overflow-y-auto bg-white/80 text-xs text-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200">
                        {managedRoles.map((role, index) => {
                          const memberCount = roleDistribution.find((entry) => entry.role === role.roleKey)?.count ?? role.memberCount ?? 0;
                          const isUpdating = updatingRoleKey === role.roleKey;
                          const isDeleting = deletingRoleKey === role.roleKey;
                          const isBusy = isUpdating || isDeleting;
                          const draftLabel = roleLabelDrafts[role.roleKey] ?? role.roleLabel ?? formatManagedRoleLabelFromKey(role.roleKey);

                          return (
                            <div
                              key={`managed-role-${role.roleKey}`}
                              className={cn(
                                "grid grid-cols-[180px_1fr_100px_130px] gap-2 px-3",
                                listRowDensityClass,
                                index % 2 === 0
                                  ? "bg-white/70 dark:bg-zinc-950/25"
                                  : "bg-zinc-100/70 dark:bg-zinc-900/35"
                              )}
                            >
                              <p className="truncate font-mono text-[11px]" title={role.roleKey}>{role.roleKey}</p>

                              <input
                                type="text"
                                value={draftLabel}
                                onChange={(event) =>
                                  setRoleLabelDrafts((current) => ({
                                    ...current,
                                    [role.roleKey]: event.target.value,
                                  }))
                                }
                                disabled={isBusy}
                                className="h-7 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                              />

                              <p className="text-sm font-semibold">{memberCount}</p>

                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void onSaveManagedRoleLabel(role.roleKey)}
                                  disabled={isBusy}
                                  className="h-7 rounded-md bg-indigo-600 px-2 text-[10px] font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isUpdating ? "Saving..." : "Save"}
                                </button>
                                {!role.isSystem ? (
                                  <button
                                    type="button"
                                    onClick={() => void onDeleteManagedRole(role.roleKey)}
                                    disabled={isBusy}
                                    className="h-7 rounded-md border border-rose-500/35 bg-rose-500/15 px-2 text-[10px] font-semibold text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {isDeleting ? "Deleting..." : "Delete"}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {(activeSection === "familyCenter" || activeSection === "businessCenter" || activeSection === "schoolCenter") && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    {activeSection === "businessCenter" ? <Briefcase className="h-4 w-4" /> : activeSection === "schoolCenter" ? <School className="h-4 w-4" /> : <Baby className="h-4 w-4" />}
                    {activeSection === "businessCenter" ? "Business Center" : activeSection === "schoolCenter" ? "School Center" : "Family Center"}
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadFamilyCenter()}
                    className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Refresh
                  </button>
                </div>

                {isLoadingFamilyCenter ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading {activeSection === "businessCenter" ? "Business Center" : activeSection === "schoolCenter" ? "School Center" : "Family Center"} records...</p>
                ) : familyCenterError ? (
                  <p className="text-sm text-rose-500">{familyCenterError}</p>
                ) : (
                  <>
                    {familyCenterSuccess ? (
                      <p className="mb-3 text-xs text-emerald-600 dark:text-emerald-300">{familyCenterSuccess}</p>
                    ) : null}

                    <div className="mb-4 grid gap-2 md:grid-cols-4">
                      <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Applications</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{familyCenterSummary.totalRecords}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Pending</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{familyCenterSummary.pendingApplications}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Approved</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{familyCenterSummary.approvedApplications}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                          {activeSection === "businessCenter" ? "Business Members Tracked" : activeSection === "schoolCenter" ? "School Members Tracked" : "Family Members Tracked"}
                        </p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{familyCenterSummary.totalMembersTracked}</p>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "mb-4 grid gap-2",
                        activeSection === "businessCenter"
                          ? "sm:grid-cols-[1fr_180px_200px_auto]"
                          : "sm:grid-cols-[1fr_180px_auto]"
                      )}
                    >
                      <input
                        type="text"
                        value={familyCenterSearch}
                        onChange={(event) => setFamilyCenterSearch(event.target.value)}
                        placeholder="Search by application ID, submitted by, user, or email"
                        className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                      />

                      <select
                        value={familyCenterStatusFilter}
                        onChange={(event) =>
                          setFamilyCenterStatusFilter(event.target.value as "ALL" | "SUBMITTED" | "APROVED" | "DENIED")
                        }
                        className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        <option value="ALL">All status</option>
                        <option value="SUBMITTED">Submitted</option>
                        <option value="APROVED">Aproved</option>
                        <option value="DENIED">Denied</option>
                      </select>

                      {activeSection === "businessCenter" ? (
                        <select
                          value={businessSectionFilter}
                          onChange={(event) => setBusinessSectionFilter(event.target.value)}
                          className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        >
                          {businessSectionFilterOptions.map((section) => (
                            <option key={`business-section-filter-${section}`} value={section}>
                              {section === "ALL" ? "All sections" : section}
                            </option>
                          ))}
                        </select>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => {
                          setFamilyCenterSearch("");
                          setFamilyCenterStatusFilter("ALL");
                          if (activeSection === "businessCenter") {
                            setBusinessSectionFilter("ALL");
                          }
                        }}
                        disabled={!hasActiveFamilyCenterFilters}
                        className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Clear filters
                      </button>
                    </div>

                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Rows</span>
                      {(["COMPACT", "COMFORTABLE", "SPACIOUS"] as const).map((density) => (
                        <button
                          key={`family-row-density-${density}`}
                          type="button"
                          onClick={() => setFamilyCenterRowDensity(density)}
                          className={cn(
                            "h-7 rounded-md border px-2.5 text-[11px] font-semibold transition",
                            familyCenterRowDensity === density
                              ? "border-indigo-500/45 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
                              : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          )}
                        >
                          {density === "COMPACT" ? "Compact" : density === "SPACIOUS" ? "Spacious" : "Comfortable"}
                        </button>
                      ))}
                    </div>

                    {filteredFamilyCenterEntries.length === 0 ? (
                      <p className="text-sm text-zinc-600 dark:text-zinc-300">
                        No {activeSection === "businessCenter" ? "Business Center" : activeSection === "schoolCenter" ? "School Center" : "Family Center"} applications found{hasActiveFamilyCenterFilters ? " for the current filters" : " yet"}.
                      </p>
                    ) : (
                      <div className="overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
                        <div
                          className={cn(
                            "grid gap-2 bg-zinc-200/80 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
                            activeSection === "businessCenter"
                              ? "grid-cols-[1.1fr_1fr_1fr_1fr_0.7fr_0.9fr_0.9fr_1fr_0.8fr]"
                              : "grid-cols-[1.1fr_1fr_1fr_1fr_0.7fr_0.9fr_1fr_0.8fr]"
                          )}
                        >
                          <p>Application ID</p>
                          <p>Submitted By</p>
                          <p>User</p>
                          <p>Email</p>
                          <p>Members</p>
                          <p>{activeSection === "businessCenter" ? "Business Role" : activeSection === "schoolCenter" ? "School Designation" : "Family Designation"}</p>
                          {activeSection === "businessCenter" ? <p>Business Section</p> : null}
                          <p>Status</p>
                          <p>Actions</p>
                        </div>
                        <div className="max-h-90 overflow-y-auto bg-white/80 text-xs text-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200">
                          {filteredFamilyCenterEntries.map((entry, index) => (
                            <div
                              key={`family-center-entry-${entry.userId}`}
                              className={cn(
                                activeSection === "businessCenter"
                                  ? "grid grid-cols-[1.1fr_1fr_1fr_1fr_0.7fr_0.9fr_0.9fr_1fr_0.8fr] gap-2 px-3"
                                  : "grid grid-cols-[1.1fr_1fr_1fr_1fr_0.7fr_0.9fr_1fr_0.8fr] gap-2 px-3",
                                familyCenterRowDensity === "COMPACT"
                                  ? "py-1.5"
                                  : familyCenterRowDensity === "SPACIOUS"
                                    ? "py-3"
                                    : "py-2",
                                index % 2 === 0
                                  ? "bg-white/70 dark:bg-zinc-950/25"
                                  : "bg-zinc-100/70 dark:bg-zinc-900/35"
                              )}
                            >
                              <p className="truncate font-mono text-[11px]" title={entry.applicationId}>{entry.applicationId}</p>
                              <div className="min-w-0">
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70"
                                      title={`View profile for ${entry.submittedBy}`}
                                    >
                                      <UserAvatar src={entry.imageUrl} className="h-5 w-5" />
                                      <span className="truncate">{entry.submittedBy}</span>
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    side="top"
                                    align="start"
                                    className="w-[280px] rounded-xl border border-zinc-300 bg-white p-3 text-zinc-900 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                                  >
                                    <div className="flex items-center gap-2">
                                      <UserAvatar src={entry.imageUrl} className="h-10 w-10" />
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold">{entry.displayName}</p>
                                        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{entry.email || "N/A"}</p>
                                      </div>
                                    </div>
                                    <div className="mt-3 space-y-1 rounded-md border border-zinc-200 bg-zinc-50/80 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-800/50">
                                      <p><span className="font-semibold">User ID:</span> {entry.userId}</p>
                                      <p><span className="font-semibold">Role:</span> {entry.role}</p>
                                      <p><span className="font-semibold">Submitted By:</span> {entry.submittedBy}</p>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </div>
                              <p className="truncate" title={`${entry.displayName} (${entry.userId})`}>
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="truncate">{entry.displayName}</span>
                                  {activeSection === "businessCenter" ? <BusinessMemberIcon className="h-4 px-1 text-[9px]" /> : null}
                                </span>
                              </p>
                              <p className="truncate" title={entry.email || "N/A"}>{entry.email || "N/A"}</p>
                              <p>{activeSection === "businessCenter" ? (entry.businessMembersCount ?? 0) : entry.familyMembersCount}</p>
                              <p className="truncate" title={(activeSection === "businessCenter" ? entry.businessDesignation : entry.familyDesignation) || "Not set"}>
                                {(activeSection === "businessCenter" ? entry.businessDesignation : entry.familyDesignation) || "Not set"}
                              </p>
                              {activeSection === "businessCenter" ? (
                                <p className="truncate" title={entry.businessSection || "Not set"}>
                                  {entry.businessSection || "Not set"}
                                </p>
                              ) : null}
                              <div className="min-w-0">
                                <span
                                  className={cn(
                                    "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                    /pending/i.test(entry.applicationStatus)
                                      ? "border-amber-500/35 bg-amber-500/15 text-amber-700 dark:text-amber-200"
                                      : /approved|aproved/i.test(entry.applicationStatus)
                                        ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200"
                                        : "border-zinc-500/35 bg-zinc-500/15 text-zinc-700 dark:text-zinc-200"
                                  )}
                                  title={entry.applicationSubmittedAt ? `Submitted: ${formatDateTime(entry.applicationSubmittedAt)}` : "No submission date"}
                                >
                                  {entry.applicationStatus || "No status"}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => setReviewingFamilyApplication(entry)}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-indigo-300 bg-indigo-50 text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200 dark:hover:bg-indigo-900/50"
                                  aria-label="View application"
                                  title="View application"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void onDeleteFamilyApplication(entry)}
                                  disabled={deletingFamilyApplicationUserId === entry.userId}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-300 bg-rose-50 text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-700 dark:bg-rose-950/35 dark:text-rose-200 dark:hover:bg-rose-900/45"
                                  aria-label="Delete application"
                                  title="Delete application"
                                >
                                  {deletingFamilyApplicationUserId === entry.userId ? (
                                    <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}



            <Dialog
              open={Boolean(reviewingFamilyApplication)}
              onOpenChange={(open) => {
                if (!open) {
                  setReviewingFamilyApplication(null);
                  setPreviewingFamilyApplicationFile(null);
                }
              }}
            >
              <DialogContent className="max-w-2xl bg-white text-black dark:bg-[#313338] dark:text-white">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <ScrollText className="h-4 w-4" />
                    {activeSection === "businessCenter" ? "Business Application Review" : activeSection === "schoolCenter" ? "School Application Review" : "Family Application Review"}
                  </DialogTitle>
                  <DialogDescription className="text-zinc-600 dark:text-zinc-300">
                    Review the selected {activeSection === "businessCenter" ? "Business Center" : activeSection === "schoolCenter" ? "School Center" : "Family Center"} application details.
                  </DialogDescription>
                </DialogHeader>

                {reviewingFamilyApplication ? (
                  <div className="grid gap-3 text-sm md:grid-cols-2">
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45 md:col-span-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Application ID</p>
                      <p className="mt-1 font-mono text-[12px] text-zinc-900 dark:text-zinc-100">{reviewingFamilyApplication.applicationId}</p>
                    </div>

                    <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Submitted By</p>
                      <p className="mt-1 text-zinc-900 dark:text-zinc-100">{reviewingFamilyApplication.submittedBy}</p>
                    </div>

                    <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">User</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <p className="text-zinc-900 dark:text-zinc-100" title={reviewingFamilyApplication.userId}>
                          {reviewingFamilyApplication.displayName}
                        </p>
                        {activeSection === "businessCenter" ? <BusinessMemberIcon /> : null}
                      </div>
                    </div>

                    <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Email</p>
                      <p className="mt-1 text-zinc-900 dark:text-zinc-100">{reviewingFamilyApplication.email || "N/A"}</p>
                    </div>

                    <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                        {activeSection === "businessCenter" ? "Business Members Tracked" : activeSection === "schoolCenter" ? "School Members Tracked" : "Family Members Tracked"}
                      </p>
                      <p className="mt-1 text-zinc-900 dark:text-zinc-100">
                        {activeSection === "businessCenter"
                          ? (reviewingFamilyApplication.businessMembersCount ?? 0)
                          : reviewingFamilyApplication.familyMembersCount}
                      </p>
                    </div>

                    <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                        {activeSection === "businessCenter" ? "Business Role" : activeSection === "schoolCenter" ? "School Designation" : "Family Designation"}
                      </p>
                      <p className="mt-1 text-zinc-900 dark:text-zinc-100">
                        {(activeSection === "businessCenter"
                          ? reviewingFamilyApplication.businessDesignation
                          : reviewingFamilyApplication.familyDesignation) || "Not set"}
                      </p>
                    </div>

                    {activeSection === "businessCenter" ? (
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                          Business Section
                        </p>
                        <p className="mt-1 text-zinc-900 dark:text-zinc-100">
                          {reviewingFamilyApplication.businessSection || "Not set"}
                        </p>
                      </div>
                    ) : null}

                    <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Application Status</p>
                      <p className="mt-1 text-zinc-900 dark:text-zinc-100">{reviewingFamilyApplication.applicationStatus || "No status"}</p>
                    </div>

                    <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Submitted At</p>
                      <p className="mt-1 text-zinc-900 dark:text-zinc-100">{formatDateTime(reviewingFamilyApplication.applicationSubmittedAt)}</p>
                    </div>

                    <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45 md:col-span-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Preference Updated</p>
                      <p className="mt-1 text-zinc-900 dark:text-zinc-100">{formatDateTime(reviewingFamilyApplication.preferenceUpdatedAt)}</p>
                    </div>

                    <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45 md:col-span-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                          Application Files ({reviewingFamilyApplication.applicationFiles.length})
                        </p>
                      </div>

                      {reviewingFamilyApplication.applicationFiles.length === 0 ? (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">No files attached to this application.</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                          {reviewingFamilyApplication.applicationFiles.map((file, index) => {
                            const isImage = /^image\//i.test(file.mimeType || "");
                            const isPdf = /pdf/i.test(file.mimeType || "") || /\.pdf($|\?)/i.test(file.url);

                            return (
                              <button
                                key={`family-application-file-${file.url}-${index}`}
                                type="button"
                                onClick={() =>
                                  setPreviewingFamilyApplicationFile({
                                    name: file.name,
                                    url: file.url,
                                    mimeType: file.mimeType,
                                  })
                                }
                                className="group overflow-hidden rounded-md border border-zinc-300 bg-white text-left transition hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/20"
                                title={`View ${file.name}`}
                              >
                                <div className="flex h-20 items-center justify-center bg-zinc-100 dark:bg-zinc-800/70">
                                  {isImage ? (
                                    <img src={file.url} alt={file.name} className="h-full w-full object-cover" loading="lazy" />
                                  ) : (
                                    <div className="flex flex-col items-center justify-center gap-1 text-zinc-600 dark:text-zinc-300">
                                      <ScrollText className="h-5 w-5" />
                                      <span className="text-[10px] font-semibold uppercase">{isPdf ? "PDF" : "File"}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="px-2 py-1.5">
                                  <p className="truncate text-[10px] font-medium text-zinc-800 dark:text-zinc-100">{file.name}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-2 flex items-center justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                      <button
                        type="button"
                        onClick={() => void onReviewFamilyApplicationDecision(reviewingFamilyApplication, "DECLINE")}
                        disabled={
                          reviewingFamilyApplicationActionUserId === reviewingFamilyApplication.userId ||
                          /declined|denied/i.test(reviewingFamilyApplication.applicationStatus)
                        }
                        className="h-8 rounded-md border border-rose-300 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-700 dark:bg-rose-950/35 dark:text-rose-200 dark:hover:bg-rose-900/45"
                      >
                        {reviewingFamilyApplicationActionUserId === reviewingFamilyApplication.userId
                          ? "Saving..."
                          : "Decline"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onReviewFamilyApplicationDecision(reviewingFamilyApplication, "ACCEPT")}
                        disabled={
                          reviewingFamilyApplicationActionUserId === reviewingFamilyApplication.userId ||
                          /approved|aproved/i.test(reviewingFamilyApplication.applicationStatus)
                        }
                        className="h-8 rounded-md border border-emerald-300 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-200 dark:hover:bg-emerald-900/45"
                      >
                        {reviewingFamilyApplicationActionUserId === reviewingFamilyApplication.userId
                          ? "Saving..."
                          : "Accept"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </DialogContent>
            </Dialog>

            <Dialog
              open={Boolean(previewingFamilyApplicationFile)}
              onOpenChange={(open) => {
                if (!open) {
                  setPreviewingFamilyApplicationFile(null);
                }
              }}
            >
              <DialogContent className="max-w-4xl bg-white text-black dark:bg-[#313338] dark:text-white">
                <DialogHeader>
                  <DialogTitle className="truncate text-base">
                    {previewingFamilyApplicationFile?.name || "Application file"}
                  </DialogTitle>
                  <DialogDescription className="text-zinc-600 dark:text-zinc-300">
                    Click the link below if the preview is limited.
                  </DialogDescription>
                </DialogHeader>

                {previewingFamilyApplicationFile ? (
                  <div className="space-y-3">
                    <div className="max-h-[65vh] overflow-auto rounded-md border border-zinc-300 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900/40">
                      {/^image\//i.test(previewingFamilyApplicationFile.mimeType || "") ? (
                        <img
                          src={previewingFamilyApplicationFile.url}
                          alt={previewingFamilyApplicationFile.name}
                          className="mx-auto h-auto max-h-[60vh] w-auto max-w-full rounded"
                        />
                      ) : /pdf/i.test(previewingFamilyApplicationFile.mimeType || "") || /\.pdf($|\?)/i.test(previewingFamilyApplicationFile.url) ? (
                        <iframe
                          src={previewingFamilyApplicationFile.url}
                          title={previewingFamilyApplicationFile.name}
                          className="h-[60vh] w-full rounded border border-zinc-300 dark:border-zinc-700"
                        />
                      ) : (
                        <div className="flex h-44 items-center justify-center text-sm text-zinc-600 dark:text-zinc-300">
                          Preview unavailable for this file type.
                        </div>
                      )}
                    </div>

                    <a
                      href={previewingFamilyApplicationFile.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300"
                    >
                      Open file in new tab
                    </a>
                  </div>
                ) : null}
              </DialogContent>
            </Dialog>

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
                    <div className="border-b border-zinc-300/70 bg-white/70 px-3 py-2 dark:border-zinc-700/70 dark:bg-zinc-900/35">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Rows</span>
                        {(["COMPACT", "COMFORTABLE", "SPACIOUS"] as const).map((density) => (
                          <button
                            key={`audit-row-density-${density}`}
                            type="button"
                            onClick={() => setListRowDensity(density)}
                            className={cn(
                              "h-7 rounded-md border px-2.5 text-[11px] font-semibold transition",
                              listRowDensity === density
                                ? "border-indigo-500/45 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
                                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            )}
                          >
                            {density === "COMPACT" ? "Compact" : density === "SPACIOUS" ? "Spacious" : "Comfortable"}
                          </button>
                        ))}
                      </div>
                    </div>
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
                              "grid grid-cols-[1.2fr_1fr_0.8fr_1fr] gap-2 px-3",
                              listRowDensityClass,
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
                      <div className="border-b border-zinc-300/70 bg-white/70 px-3 py-2 dark:border-zinc-700/70 dark:bg-zinc-900/35">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Rows</span>
                          {(["COMPACT", "COMFORTABLE", "SPACIOUS"] as const).map((density) => (
                            <button
                              key={`invites-row-density-${density}`}
                              type="button"
                              onClick={() => setListRowDensity(density)}
                              className={cn(
                                "h-7 rounded-md border px-2.5 text-[11px] font-semibold transition",
                                listRowDensity === density
                                  ? "border-indigo-500/45 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
                                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                              )}
                            >
                              {density === "COMPACT" ? "Compact" : density === "SPACIOUS" ? "Spacious" : "Comfortable"}
                            </button>
                          ))}
                        </div>
                      </div>
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
                                "grid grid-cols-[1fr_0.8fr_1fr] gap-2 px-3",
                                listRowDensityClass,
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

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Rows</span>
                  {(["COMPACT", "COMFORTABLE", "SPACIOUS"] as const).map((density) => (
                    <button
                      key={`emoji-stickers-row-density-${density}`}
                      type="button"
                      onClick={() => setListRowDensity(density)}
                      className={cn(
                        "h-7 rounded-md border px-2.5 text-[11px] font-semibold transition",
                        listRowDensity === density
                          ? "border-indigo-500/45 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
                          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      )}
                    >
                      {density === "COMPACT" ? "Compact" : density === "SPACIOUS" ? "Spacious" : "Comfortable"}
                    </button>
                  ))}
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
                          className={cn(
                            "rounded-lg border border-zinc-300 bg-white/85 dark:border-zinc-700 dark:bg-zinc-900/45",
                            listCardDensityClass
                          )}
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
              <div className="flex h-full min-h-0 flex-col rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    <Webhook className="h-4 w-4" />
                    Webhooks
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadWebhooks()}
                    className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Refresh
                  </button>
                </div>

                <div className="mb-4 rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                  <p className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">Create Webhook</p>
                  <div className="grid gap-2 md:grid-cols-[180px_180px_1fr_160px_auto]">
                    <select
                      value={newWebhookServerId}
                      onChange={(event) => setNewWebhookServerId(event.target.value)}
                      className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value="GLOBAL">Global webhook</option>
                      {servers.map((serverItem) => (
                        <option key={`webhook-server-${serverItem.id}`} value={serverItem.id}>
                          {serverItem.name}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      value={newWebhookName}
                      onChange={(event) => setNewWebhookName(event.target.value)}
                      placeholder="Webhook name"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />

                    <input
                      type="url"
                      value={newWebhookUrl}
                      onChange={(event) => setNewWebhookUrl(event.target.value)}
                      placeholder="https://example.com/webhook"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />

                    <select
                      value={newWebhookEventType}
                      onChange={(event) => setNewWebhookEventType(event.target.value)}
                      className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value="MESSAGE_CREATE">MESSAGE_CREATE</option>
                      <option value="MEMBER_JOIN">MEMBER_JOIN</option>
                      <option value="REPORT_CREATED">REPORT_CREATED</option>
                      <option value="SERVER_ACTIVITY">SERVER_ACTIVITY</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => void onCreateWebhook()}
                      disabled={isCreatingWebhook}
                      className="h-9 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCreatingWebhook ? "Creating..." : "Create"}
                    </button>
                  </div>
                </div>

                {webhooksActionError ? <p className="mb-3 text-xs text-rose-500">{webhooksActionError}</p> : null}
                {webhooksActionSuccess ? <p className="mb-3 text-xs text-emerald-500">{webhooksActionSuccess}</p> : null}

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Rows</span>
                  {(["COMPACT", "COMFORTABLE", "SPACIOUS"] as const).map((density) => (
                    <button
                      key={`webhooks-row-density-${density}`}
                      type="button"
                      onClick={() => setListRowDensity(density)}
                      className={cn(
                        "h-7 rounded-md border px-2.5 text-[11px] font-semibold transition",
                        listRowDensity === density
                          ? "border-indigo-500/45 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
                          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      )}
                    >
                      {density === "COMPACT" ? "Compact" : density === "SPACIOUS" ? "Spacious" : "Comfortable"}
                    </button>
                  ))}
                </div>

                <div className="min-h-0 flex-1">
                  {isLoadingWebhooks ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading webhooks...</p>
                  ) : webhooksError ? (
                    <p className="text-sm text-rose-500">{webhooksError}</p>
                  ) : webhooks.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">No webhooks configured yet.</p>
                  ) : (
                    <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1">
                      {webhooks.map((hook) => {
                        const isPending = webhookActionPendingId === hook.id;

                        return (
                          <div
                            key={`admin-webhook-${hook.id}`}
                            className={cn(
                              "rounded-lg border border-zinc-300 bg-white/85 dark:border-zinc-700 dark:bg-zinc-900/45",
                              listCardDensityClass
                            )}
                          >
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{hook.name}</p>
                              <span
                                className={cn(
                                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
                                  hook.enabled
                                    ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-200"
                                    : "border-zinc-500/35 bg-zinc-500/15 text-zinc-200"
                                )}
                              >
                                {hook.enabled ? "ENABLED" : "DISABLED"}
                              </span>
                            </div>

                            <div className="grid gap-1 text-xs text-zinc-600 dark:text-zinc-300">
                              <p className="truncate" title={hook.endpointUrl}>Endpoint: {hook.endpointUrl}</p>
                              <p>Event: {hook.eventType}</p>
                              <p>Scope: {hook.serverName || "Global"}</p>
                              <p className="font-mono">Secret: {hook.secretPreview}</p>
                              <p>Updated: {formatDateTime(hook.updatedAt ?? hook.createdAt)}</p>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-300/70 pt-3 dark:border-zinc-700/70">
                              <button
                                type="button"
                                onClick={() => void onWebhookAction(hook, "toggle")}
                                disabled={isPending}
                                className={cn(
                                  "h-8 rounded-md px-3 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
                                  hook.enabled
                                    ? "border border-zinc-500/35 bg-zinc-500/15 text-zinc-200 hover:bg-zinc-500/25"
                                    : "border border-emerald-500/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                                )}
                              >
                                {hook.enabled ? "Disable" : "Enable"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void onWebhookAction(hook, "rotate-secret")}
                                disabled={isPending}
                                className="h-8 rounded-md border border-indigo-500/35 bg-indigo-500/15 px-3 text-xs font-medium text-indigo-200 transition hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Rotate Secret
                              </button>
                              <button
                                type="button"
                                onClick={() => void onWebhookAction(hook, "delete")}
                                disabled={isPending}
                                className="h-8 rounded-md border border-rose-500/35 bg-rose-500/15 px-3 text-xs font-medium text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Delete
                              </button>
                              {isPending ? <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Updating...</p> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
                      <div className="border-b border-zinc-300/70 bg-white/70 px-3 py-2 dark:border-zinc-700/70 dark:bg-zinc-900/35">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Rows</span>
                          {(["COMPACT", "COMFORTABLE", "SPACIOUS"] as const).map((density) => (
                            <button
                              key={`security-row-density-${density}`}
                              type="button"
                              onClick={() => setListRowDensity(density)}
                              className={cn(
                                "h-7 rounded-md border px-2.5 text-[11px] font-semibold transition",
                                listRowDensity === density
                                  ? "border-indigo-500/45 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
                                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                              )}
                            >
                              {density === "COMPACT" ? "Compact" : density === "SPACIOUS" ? "Spacious" : "Comfortable"}
                            </button>
                          ))}
                        </div>
                      </div>
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
                                "grid grid-cols-[1.2fr_1fr_0.8fr_1fr] gap-2 px-3",
                                listRowDensityClass,
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
                      <div className="border-b border-zinc-300/70 bg-white/70 px-3 py-2 dark:border-zinc-700/70 dark:bg-zinc-900/35">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Rows</span>
                          {(["COMPACT", "COMFORTABLE", "SPACIOUS"] as const).map((density) => (
                            <button
                              key={`integrations-row-density-${density}`}
                              type="button"
                              onClick={() => setListRowDensity(density)}
                              className={cn(
                                "h-7 rounded-md border px-2.5 text-[11px] font-semibold transition",
                                listRowDensity === density
                                  ? "border-indigo-500/45 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
                                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                              )}
                            >
                              {density === "COMPACT" ? "Compact" : density === "SPACIOUS" ? "Spacious" : "Comfortable"}
                            </button>
                          ))}
                        </div>
                      </div>
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
                                "grid grid-cols-[1fr_1fr_80px] gap-2 px-3",
                                listRowDensityClass,
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

            {activeSection === "patronage" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Patronage</p>
                  <button
                    type="button"
                    onClick={() => {
                      void loadPatronage();
                      void loadPatronageSetup();
                    }}
                    className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Refresh
                  </button>
                </div>

                <div className="mb-4 rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                  <p className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">Payment Setup (Where money goes)</p>

                  {isLoadingPatronageSetup ? (
                    <p className="text-xs text-zinc-600 dark:text-zinc-300">Loading payment setup...</p>
                  ) : (
                    <>
                      <div className="mb-3 grid gap-2 md:grid-cols-3">
                        <div className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900">
                          <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Secret Key</p>
                          <p className="mt-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            {patronageSetup?.hasStripeSecretKey ? "Configured" : "Missing"}
                          </p>
                          <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">{patronageSetup?.stripeSecretKeyPreview || "Not set"}</p>
                        </div>
                        <div className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900">
                          <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Publishable Key</p>
                          <p className="mt-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            {patronageSetup?.hasStripePublishableKey ? "Configured" : "Missing"}
                          </p>
                          <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">{patronageSetup?.stripePublishableKeyPreview || "Not set"}</p>
                        </div>
                        <div className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900">
                          <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Webhook Secret</p>
                          <p className="mt-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            {patronageSetup?.hasStripeWebhookSecret ? "Configured" : "Missing"}
                          </p>
                          <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">{patronageSetup?.stripeWebhookSecretPreview || "Not set"}</p>
                        </div>
                      </div>

                      <div className="grid gap-2 md:grid-cols-3">
                        <input
                          type="password"
                          value={patronageSetupSecretDraft}
                          onChange={(event) => setPatronageSetupSecretDraft(event.target.value)}
                          placeholder="Set Stripe Secret Key (sk_...)"
                          className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                        />
                        <input
                          type="text"
                          value={patronageSetupPublishableDraft}
                          onChange={(event) => setPatronageSetupPublishableDraft(event.target.value)}
                          placeholder="Set Publishable Key (pk_...)"
                          className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                        />
                        <input
                          type="password"
                          value={patronageSetupWebhookDraft}
                          onChange={(event) => setPatronageSetupWebhookDraft(event.target.value)}
                          placeholder="Set Webhook Secret (whsec_...)"
                          className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                        />
                      </div>

                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <input
                          type="text"
                          value={patronagePayoutLabelDraft}
                          onChange={(event) => setPatronagePayoutLabelDraft(event.target.value)}
                          placeholder="Payout account label (e.g. In-Accord Stripe Live)"
                          className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                        />
                        <input
                          type="email"
                          value={patronagePayoutContactEmailDraft}
                          onChange={(event) => setPatronagePayoutContactEmailDraft(event.target.value)}
                          placeholder="Payout contact email"
                          className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                        />
                      </div>

                      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
                        <input
                          type="text"
                          value={patronagePayoutNoticeDraft}
                          onChange={(event) => setPatronagePayoutNoticeDraft(event.target.value)}
                          placeholder="Internal payout note (optional)"
                          className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                        />
                        <button
                          type="button"
                          onClick={() => void onSavePatronageSetup()}
                          disabled={isSavingPatronageSetup}
                          className="h-9 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSavingPatronageSetup ? "Saving..." : "Save Payment Setup"}
                        </button>
                      </div>

                      <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                        Tip: add your live Stripe keys here. User checkout, verification, and webhook reconciliation will use this setup automatically.
                      </p>
                    </>
                  )}
                </div>

                <div className="mb-4 grid gap-2 md:grid-cols-5">
                  <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Total Records</p>
                    <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{patronageSummary?.totalRecords ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">One-Time</p>
                    <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{patronageSummary?.oneTimeCount ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Monthly</p>
                    <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{patronageSummary?.monthlyCount ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Successful Total</p>
                    <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{formatCurrencyFromCents(patronageSummary?.successfulAmountCents ?? 0, "USD")}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Monthly Recurring</p>
                    <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{formatCurrencyFromCents(patronageSummary?.monthlyRecurringAmountCents ?? 0, "USD")}</p>
                  </div>
                </div>

                <div className="mb-4 rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                  <p className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">Record Donation</p>
                  <div className="grid gap-2 md:grid-cols-[1fr_1fr_130px_120px_110px_1fr]">
                    <input
                      type="text"
                      value={newPatronageDonorName}
                      onChange={(event) => setNewPatronageDonorName(event.target.value)}
                      placeholder="Donor name"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <input
                      type="email"
                      value={newPatronageDonorEmail}
                      onChange={(event) => setNewPatronageDonorEmail(event.target.value)}
                      placeholder="Donor email"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <select
                      value={newPatronageType}
                      onChange={(event) => setNewPatronageType(event.target.value as "ONE_TIME" | "MONTHLY")}
                      className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value="ONE_TIME">One-time</option>
                      <option value="MONTHLY">Monthly</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newPatronageAmount}
                      onChange={(event) => setNewPatronageAmount(event.target.value)}
                      placeholder="Amount"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <input
                      type="text"
                      value={newPatronageCurrency}
                      onChange={(event) => setNewPatronageCurrency(event.target.value.toUpperCase())}
                      placeholder="USD"
                      maxLength={8}
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm uppercase text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                    <input
                      type="text"
                      value={newPatronageProvider}
                      onChange={(event) => setNewPatronageProvider(event.target.value)}
                      placeholder="Provider (Stripe, PayPal...)"
                      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    />
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
                    <div className="grid gap-2 md:grid-cols-2">
                      <input
                        type="text"
                        value={newPatronageReference}
                        onChange={(event) => setNewPatronageReference(event.target.value)}
                        placeholder="Provider reference / transaction id"
                        className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                      />
                      <input
                        type="text"
                        value={newPatronageNote}
                        onChange={(event) => setNewPatronageNote(event.target.value)}
                        placeholder="Note (optional)"
                        className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void onCreatePatronage()}
                      disabled={isCreatingPatronage}
                      className="h-9 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCreatingPatronage ? "Saving..." : "Record"}
                    </button>
                  </div>
                </div>

                <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_160px_160px_auto]">
                  <input
                    type="text"
                    value={patronageSearch}
                    onChange={(event) => setPatronageSearch(event.target.value)}
                    placeholder="Search donor, provider, id, note"
                    className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                  />
                  <select
                    value={patronageTypeFilter}
                    onChange={(event) => setPatronageTypeFilter(event.target.value as typeof patronageTypeFilter)}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="ALL">All types</option>
                    <option value="ONE_TIME">One-time</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                  <select
                    value={patronageStatusFilter}
                    onChange={(event) => setPatronageStatusFilter(event.target.value as typeof patronageStatusFilter)}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="ALL">All status</option>
                    <option value="PENDING">Pending</option>
                    <option value="SUCCEEDED">Succeeded</option>
                    <option value="FAILED">Failed</option>
                    <option value="CANCELED">Canceled</option>
                    <option value="REFUNDED">Refunded</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setPatronageSearch("");
                      setPatronageTypeFilter("ALL");
                      setPatronageStatusFilter("ALL");
                    }}
                    disabled={!hasActivePatronageFilters}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Clear filters
                  </button>
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Rows</span>
                  {(["COMPACT", "COMFORTABLE", "SPACIOUS"] as const).map((density) => (
                    <button
                      key={`patronage-row-density-${density}`}
                      type="button"
                      onClick={() => setListRowDensity(density)}
                      className={cn(
                        "h-7 rounded-md border px-2.5 text-[11px] font-semibold transition",
                        listRowDensity === density
                          ? "border-indigo-500/45 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
                          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      )}
                    >
                      {density === "COMPACT" ? "Compact" : density === "SPACIOUS" ? "Spacious" : "Comfortable"}
                    </button>
                  ))}
                </div>

                {patronageError ? <p className="mb-3 text-xs text-rose-500">{patronageError}</p> : null}
                {patronageActionSuccess ? <p className="mb-3 text-xs text-emerald-500">{patronageActionSuccess}</p> : null}

                {isLoadingPatronage ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading patronage records...</p>
                ) : patronageEntries.length === 0 ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">No patronage records found for current filters.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
                    <div className="grid grid-cols-[1fr_0.8fr_0.8fr_0.9fr_0.8fr_1fr_1.2fr] gap-2 bg-zinc-200/80 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      <p>Donor</p>
                      <p>Type</p>
                      <p>Status</p>
                      <p>Amount</p>
                      <p>Currency</p>
                      <p>Provider</p>
                      <p>Actions</p>
                    </div>
                    <div className="max-h-95 overflow-y-auto bg-white/80 text-xs text-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200">
                      {patronageEntries.map((entry, index) => {
                        const statusClassName =
                          entry.status === "SUCCEEDED"
                            ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200"
                            : entry.status === "PENDING"
                              ? "border-amber-500/35 bg-amber-500/15 text-amber-700 dark:text-amber-200"
                              : entry.status === "REFUNDED"
                                ? "border-indigo-500/35 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
                                : "border-rose-500/35 bg-rose-500/15 text-rose-700 dark:text-rose-200";

                        return (
                          <div
                            key={`patronage-entry-${entry.id}`}
                            className={cn(
                              "grid grid-cols-[1fr_0.8fr_0.8fr_0.9fr_0.8fr_1fr_1.2fr] gap-2 px-3",
                              listRowDensityClass,
                              index % 2 === 0
                                ? "bg-white/70 dark:bg-zinc-950/25"
                                : "bg-zinc-100/70 dark:bg-zinc-900/35"
                            )}
                          >
                            <div className="min-w-0">
                              <p className="truncate font-semibold" title={entry.donorName || entry.donorEmail || entry.id}>
                                {entry.donorName || entry.donorEmail || entry.id}
                              </p>
                              <p className="truncate text-[10px] text-zinc-500 dark:text-zinc-400" title={entry.createdAt ? formatDateTime(entry.createdAt) : "N/A"}>
                                {entry.createdAt ? formatDateTime(entry.createdAt) : "N/A"}
                              </p>
                            </div>
                            <p>{entry.donationType === "ONE_TIME" ? "One-time" : "Monthly"}</p>
                            <div>
                              <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", statusClassName)}>
                                {entry.status}
                              </span>
                            </div>
                            <p title={formatCurrencyFromCents(entry.amountCents, entry.currency)}>
                              {formatCurrencyFromCents(entry.amountCents, entry.currency)}
                            </p>
                            <p>{entry.currency}</p>
                            <p className="truncate" title={entry.provider || "N/A"}>{entry.provider || "N/A"}</p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void onUpdatePatronageStatus(entry.id, "SUCCEEDED")}
                                disabled={updatingPatronageId === entry.id || entry.status === "SUCCEEDED"}
                                className="h-7 rounded-md border border-emerald-500/35 bg-emerald-500/15 px-2 text-[10px] font-semibold text-emerald-700 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-emerald-200"
                              >
                                Success
                              </button>
                              <button
                                type="button"
                                onClick={() => void onUpdatePatronageStatus(entry.id, "FAILED")}
                                disabled={updatingPatronageId === entry.id || entry.status === "FAILED"}
                                className="h-7 rounded-md border border-rose-500/35 bg-rose-500/15 px-2 text-[10px] font-semibold text-rose-700 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-200"
                              >
                                Fail
                              </button>
                              <button
                                type="button"
                                onClick={() => void onUpdatePatronageStatus(entry.id, "REFUNDED")}
                                disabled={updatingPatronageId === entry.id || entry.status === "REFUNDED"}
                                className="h-7 rounded-md border border-indigo-500/35 bg-indigo-500/15 px-2 text-[10px] font-semibold text-indigo-700 transition hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-indigo-200"
                              >
                                Refund
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeSection === "OtherAppsBots" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-100/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">In-Accord Apps & Bots</p>
                  <button
                    type="button"
                    onClick={() => void loadIntegrations()}
                    className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Refresh
                  </button>
                </div>

                {isLoadingIntegrations ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading Other configuration insights...</p>
                ) : integrationsError ? (
                  <p className="text-sm text-rose-500">{integrationsError}</p>
                ) : (
                  <>
                    <div className="mb-4 grid gap-2 md:grid-cols-5">
                      <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Users w/ Configs</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{integrationsSummary?.usersWithOtherConfigs ?? 0}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Apps</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{integrationsSummary?.appsTotal ?? 0}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Bots</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{integrationsSummary?.botsTotal ?? 0}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Enabled Apps</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{integrationsSummary?.enabledApps ?? 0}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-300 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/45">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Enabled Bots</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{integrationsSummary?.enabledBots ?? 0}</p>
                      </div>
                    </div>

                    <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_140px_140px_auto]">
                      <input
                        type="text"
                        value={OtherConfigQuery}
                        onChange={(event) => setOtherConfigQuery(event.target.value)}
                        placeholder="Search by user, email, name, app ID"
                        className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-background placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                      />

                      <select
                        value={OtherConfigTypeFilter}
                        onChange={(event) => setOtherConfigTypeFilter(event.target.value as typeof OtherConfigTypeFilter)}
                        className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        <option value="ALL">All types</option>
                        <option value="APP">Apps</option>
                        <option value="BOT">Bots</option>
                      </select>

                      <select
                        value={OtherConfigStatusFilter}
                        onChange={(event) => setOtherConfigStatusFilter(event.target.value as typeof OtherConfigStatusFilter)}
                        className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        <option value="ALL">All status</option>
                        <option value="ENABLED">Enabled</option>
                        <option value="DISABLED">Disabled</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => {
                          setOtherConfigQuery("");
                          setOtherConfigTypeFilter("ALL");
                          setOtherConfigStatusFilter("ALL");
                        }}
                        disabled={!hasActiveOtherConfigFilters}
                        className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Clear filters
                      </button>
                    </div>

                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                        Sort
                      </span>
                      <select
                        value={OtherConfigSortKey}
                        onChange={(event) => onOtherConfigSort(event.target.value as OtherConfigSortKey)}
                        className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        <option value="createdAt">Created date</option>
                        <option value="status">Status</option>
                        <option value="type">Type</option>
                      </select>
                      <select
                        value={OtherConfigSortDirection}
                        onChange={(event) =>
                          setOtherConfigSortDirection(event.target.value as OtherSortDirection)
                        }
                        className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        <option value="asc">Ascending</option>
                        <option value="desc">Descending</option>
                      </select>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Tip: click Type / Status / Created headers to toggle sorting.
                      </p>
                    </div>

                    {OtherConfigActionError ? (
                      <p className="mb-3 text-xs text-rose-500">{OtherConfigActionError}</p>
                    ) : null}
                    {OtherConfigActionSuccess ? (
                      <p className="mb-3 text-xs text-emerald-500">{OtherConfigActionSuccess}</p>
                    ) : null}

                    <div className="space-y-4">
                      <div className="rounded-lg border border-zinc-300 bg-zinc-100/60 p-3 dark:border-zinc-700 dark:bg-zinc-900/35">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-200">In-Accord Apps & Bots</p>
                          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            {separatedOtherConfigs.inAccord.length} item{separatedOtherConfigs.inAccord.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        {renderOtherConfigTable(
                          separatedOtherConfigs.inAccord,
                          `No In-Accord app or bot configs found${hasActiveOtherConfigFilters ? " for current filters" : ""}.`
                        )}
                      </div>

                      <div className="rounded-lg border border-zinc-300 bg-zinc-100/60 p-3 dark:border-zinc-700 dark:bg-zinc-900/35">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-200">Imported Apps & Bots</p>
                          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            {separatedOtherConfigs.Other.length} item{separatedOtherConfigs.Other.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        {renderOtherConfigTable(
                          separatedOtherConfigs.Other,
                          `No imported app or bot configs found${hasActiveOtherConfigFilters ? " for current filters" : ""}.`
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
