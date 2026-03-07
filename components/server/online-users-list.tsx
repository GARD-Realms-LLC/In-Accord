"use client";

import { Ban, Crown, Flag, MessageCircle, UserPlus, Wrench } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ActionTooltip } from "@/components/action-tooltip";
import { BotAppBadge } from "@/components/bot-app-badge";
import { ModeratorLineIcon } from "@/components/moderator-line-icon";
import { NewUserCloverBadge } from "@/components/new-user-clover-badge";
import { UserAvatar } from "@/components/user-avatar";
import { MemberRole } from "@/lib/db/types";
import { isInAccordAdministrator, isInAccordDeveloper, isInAccordModerator } from "@/lib/in-accord-admin";
import { isBotUser } from "@/lib/is-bot-user";
import { normalizePresenceStatus, presenceStatusDotClassMap, presenceStatusLabelMap } from "@/lib/presence-status";

type OnlineRailUser = {
  id: string;
  profileId: string;
  role: MemberRole;
  globalRole: string | null;
  displayName: string;
  realName: string;
  profileName: string | null;
  bannerUrl: string | null;
  presenceStatus: string;
  email: string | null;
  imageUrl: string | null;
  joinedAt: string | null;
  lastLogonAt: string | null;
};

interface OnlineUsersListProps {
  users: OnlineRailUser[];
}

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

export const OnlineUsersList = ({ users }: OnlineUsersListProps) => {
  const params = useParams();
  const router = useRouter();
  const [profileCardCache, setProfileCardCache] = useState<
    Record<
      string,
      {
        selectedServerTag: {
          serverId: string;
          serverName: string;
          tagCode: string;
          iconKey: string;
          iconEmoji: string;
        } | null;
      }
    >
  >({});
  const [loadingProfileCardId, setLoadingProfileCardId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<MemberRole, boolean>>({
    [MemberRole.ADMIN]: false,
    [MemberRole.MODERATOR]: false,
    [MemberRole.GUEST]: false,
  });

  const loadProfileCard = async (memberId: string, profileId: string) => {
    if (!profileId || profileCardCache[profileId]) {
      return;
    }

    try {
      setLoadingProfileCardId(profileId);

      const response = await axios.get<{
        selectedServerTag?: {
          serverId: string;
          serverName: string;
          tagCode: string;
          iconKey: string;
          iconEmoji: string;
        } | null;
      }>(
        `/api/profile/${encodeURIComponent(profileId)}/card`,
        {
          params: { memberId },
        }
      );

      const selectedServerTag =
        response.data?.selectedServerTag &&
        typeof response.data.selectedServerTag.serverId === "string" &&
        typeof response.data.selectedServerTag.tagCode === "string"
          ? response.data.selectedServerTag
          : null;

      setProfileCardCache((prev) => ({
        ...prev,
        [profileId]: {
          selectedServerTag,
        },
      }));
    } catch {
      setProfileCardCache((prev) => ({
        ...prev,
        [profileId]: {
          selectedServerTag: null,
        },
      }));
    } finally {
      setLoadingProfileCardId((prev) => (prev === profileId ? null : prev));
    }
  };

  const normalizeRole = (role: unknown): MemberRole => {
    const normalized = String(role ?? "").trim().toUpperCase();

    if (
      normalized === MemberRole.ADMIN ||
      normalized.includes("ADMIN")
    ) {
      return MemberRole.ADMIN;
    }

    if (
      normalized === MemberRole.MODERATOR ||
      normalized.includes("MODERATOR") ||
      normalized === "MOD"
    ) {
      return MemberRole.MODERATOR;
    }

    return MemberRole.GUEST;
  };

  const roleRank = (role: string) => {
    const normalized = String(normalizeRole(role));
    if (normalized === "ADMIN") return 1;
    if (normalized === "MODERATOR") return 2;
    return 3;
  };

  const sortedUsers = [...users].sort((a, b) => {
    const byRole = roleRank(a.role) - roleRank(b.role);
    if (byRole !== 0) {
      return byRole;
    }

    const aName = (a.profileName || a.realName || a.displayName || a.email || a.profileId || "").toLowerCase();
    const bName = (b.profileName || b.realName || b.displayName || b.email || b.profileId || "").toLowerCase();
    return aName.localeCompare(bName);
  });

  const usersByRole: Record<MemberRole, OnlineRailUser[]> = {
    [MemberRole.ADMIN]: [],
    [MemberRole.MODERATOR]: [],
    [MemberRole.GUEST]: [],
  };

  for (const item of sortedUsers) {
    usersByRole[normalizeRole(item.role)].push(item);
  }

  const roleSections: Array<{ role: MemberRole; label: string }> = [
    { role: MemberRole.ADMIN, label: "Admins" },
    { role: MemberRole.MODERATOR, label: "Moderators" },
    { role: MemberRole.GUEST, label: "Guests" },
  ];

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
    const profileCard = profileCardCache[member.profileId];
    const normalizedPresenceStatus = normalizePresenceStatus(member.presenceStatus);
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
    const onStartDirectMessage = () => {
      const serverIdFromRoute =
        typeof params?.serverId === "string"
          ? params.serverId
          : Array.isArray(params?.serverId)
            ? (params?.serverId[0] ?? "")
            : "";

      if (!serverIdFromRoute) {
        window.alert("Unable to open DM from this view.");
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

    return (
      <Popover
        key={`online-${member.profileId}`}
        onOpenChange={(open) => {
          if (open) {
            void loadProfileCard(member.id, member.profileId);
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
              <UserAvatar src={member.imageUrl ?? undefined} className="h-6 w-6" />
              <span
                className={`absolute -bottom-0.5 -right-0.5 inline-flex h-2.5 w-2.5 rounded-full border border-[#111214] ${presenceStatusDotClassMap[normalizedPresenceStatus]}`}
                aria-hidden="true"
              />
            </span>
            <div className="flex min-w-0 items-center gap-1">
              <p className="min-w-0 truncate text-xs text-[#dbdee1]">{member.profileName || "No profile name"}</p>
              {profileCard?.selectedServerTag ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-[#5865f2]/35 bg-[#5865f2]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#d7dcff]"
                  title={`Server tag from ${profileCard.selectedServerTag.serverName}`}
                >
                  <span>{profileCard.selectedServerTag.iconEmoji}</span>
                  <span>{profileCard.selectedServerTag.tagCode}</span>
                </span>
              ) : null}
              <NewUserCloverBadge createdAt={member.joinedAt} className="text-[11px]" />
              {showBotBadge ? <BotAppBadge className="h-4 px-1 text-[9px]" /> : null}
              {highestRoleIcon && highestRoleLabel ? (
                <ActionTooltip label={highestRoleLabel} align="center">
                  {highestRoleIcon}
                </ActionTooltip>
              ) : null}
            </div>
          </button>
        </PopoverTrigger>

        <PopoverContent
          side="left"
          align="start"
          className="w-[320px] overflow-hidden rounded-xl border border-black/30 bg-[#111214] p-0 text-[#dbdee1] shadow-2xl shadow-black/50"
        >
          <div className="relative h-24 bg-linear-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
            {member.bannerUrl ? (
              <Image
                src={member.bannerUrl}
                alt="User banner"
                fill
                className="object-cover"
                unoptimized
              />
            ) : null}
          </div>

          <div className="relative p-3 pt-7">
            <div className="absolute -top-5 left-3 rounded-full border-4 border-[#111214]">
              <UserAvatar src={member.imageUrl ?? undefined} className="h-10 w-10" />
            </div>

            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-base font-bold text-white">{member.profileName || member.realName || member.displayName}</p>
              {profileCard?.selectedServerTag ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-[#5865f2]/35 bg-[#5865f2]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#d7dcff]"
                  title={`Server tag from ${profileCard.selectedServerTag.serverName}`}
                >
                  <span>{profileCard.selectedServerTag.iconEmoji}</span>
                  <span>{profileCard.selectedServerTag.tagCode}</span>
                </span>
              ) : null}
              {highestRoleIcon && highestRoleLabel ? (
                <ActionTooltip label={highestRoleLabel} align="center">
                  {highestRoleIcon}
                </ActionTooltip>
              ) : null}
              <NewUserCloverBadge createdAt={member.joinedAt} className="text-sm" />
              {showBotBadge ? <BotAppBadge className="h-4 px-1 text-[9px]" /> : null}
            </div>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-[#949ba4]">In-Accord Profile</p>

            <div className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] p-3 text-xs">
              <div className="space-y-1 text-[#dbdee1]">
                <p>Users ID: {member.profileId}</p>
                <p>Name: {member.realName || member.profileName || member.displayName || "Unknown User"}</p>
                <p>Email: {member.email || "N/A"}</p>
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
                    <span className="text-[#bfc5ff]">{profileCard.selectedServerTag.serverName}</span>
                  </span>
                </div>
              </div>
            ) : null}

            <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
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

              <ActionTooltip label="Direct Message" align="center">
                <button
                  type="button"
                  onClick={onStartDirectMessage}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-[#1e1f22] text-[#dbdee1] transition hover:bg-[#2a2b30]"
                  aria-label="Open direct message"
                  title="Direct Message"
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
            {presenceStatusLabelMap[normalizedPresenceStatus]} member
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <div className="space-y-3">
      {roleSections.map(({ role, label }) => {
        const sectionUsers = usersByRole[role];
        if (!sectionUsers.length) {
          return null;
        }

        const onlineSectionUsers = sectionUsers.filter(
          (item) => String(item.presenceStatus ?? "ONLINE").toUpperCase() !== "OFFLINE"
        );
        const offlineSectionUsers = sectionUsers.filter(
          (item) => String(item.presenceStatus ?? "ONLINE").toUpperCase() === "OFFLINE"
        );

        const isCollapsed = collapsed[role];

        return (
          <div key={role} className="space-y-1.5">
            <button
              type="button"
              onClick={() =>
                setCollapsed((prev) => ({
                  ...prev,
                  [role]: !prev[role],
                }))
              }
              className="flex w-full items-center justify-between rounded px-1 py-1 text-left hover:bg-[#2a2b2f]"
              aria-expanded={!isCollapsed}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                {label} — {sectionUsers.length}
              </span>
              <span className="text-xs text-[#949ba4]">{isCollapsed ? "▸" : "▾"}</span>
            </button>

            {isCollapsed ? null : sectionUsers.map((member) => renderMember(member))}
          </div>
        );
      })}
    </div>
  );
};
