"use client";

import { Crown, ShieldAlert, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BotAppBadge } from "@/components/bot-app-badge";
import { UserAvatar } from "@/components/user-avatar";
import { MemberRole } from "@/lib/db/types";
import { isInAccordAdministrator } from "@/lib/in-accord-admin";
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
  const [collapsed, setCollapsed] = useState<Record<MemberRole, boolean>>({
    [MemberRole.ADMIN]: false,
    [MemberRole.MODERATOR]: false,
    [MemberRole.GUEST]: false,
  });

  const normalizeRole = (role: unknown): MemberRole => {
    const normalized = String(role ?? "").trim().toUpperCase();

    if (
      normalized === MemberRole.ADMIN ||
      normalized === "ADMINISTRATOR" ||
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

  const roleIconMap = {
    [MemberRole.GUEST]: null,
    [MemberRole.MODERATOR]: <ShieldCheck className="h-4 w-4 mr-2 text-indigo-500" />,
    [MemberRole.ADMIN]: <ShieldAlert className="h-4 w-4 mr-2 text-rose-500" />,
  };

  const renderMember = (member: OnlineRailUser) => {
    const normalizedPresenceStatus = normalizePresenceStatus(member.presenceStatus);
    const isGlobalAdmin = isInAccordAdministrator(member.globalRole);
    const showBotBadge = isBotUser({
      role: member.globalRole,
      name: member.profileName || member.realName || member.displayName,
      email: member.email,
    });

    return (
      <Popover key={`online-${member.profileId}`}>
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
              {showBotBadge ? <BotAppBadge className="h-4 px-1 text-[9px]" /> : null}
              {isGlobalAdmin ? (
                <Crown className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-label="Administrator" />
              ) : null}
            </div>
          </button>
        </PopoverTrigger>

        <PopoverContent
          side="left"
          align="start"
          className="w-[320px] overflow-hidden rounded-xl border border-black/30 bg-[#111214] p-0 text-[#dbdee1] shadow-2xl shadow-black/50"
        >
          <div className="relative h-24 bg-gradient-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
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
              {showBotBadge ? <BotAppBadge className="h-4 px-1 text-[9px]" /> : null}
              {isGlobalAdmin ? (
                <Crown className="h-4 w-4 shrink-0 text-rose-500" aria-label="In-Accord Administrator" />
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-[#949ba4]">
              {member.profileName || "In-Accord Profile"}
            </p>

            <div className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] p-3 text-xs">
              <div className="space-y-1 text-[#dbdee1]">
                <p>Users ID: {member.profileId}</p>
                <p>Name: {member.realName || "Unknown User"}</p>
                <p>In-Accord Profile Name: {member.profileName || "Not set"}</p>
                <p>Email: {member.email || "N/A"}</p>
                <p>Status: {presenceStatusLabelMap[normalizedPresenceStatus]}</p>
                <p>Role: {member.role}</p>
                <p>Last logon: {formatDate(member.lastLogonAt)}</p>
                <p>Created: {formatDate(member.joinedAt)}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center border-t border-white/10 p-3 pt-2 text-xs text-[#b5bac1]">
            {roleIconMap[member.role]}
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
