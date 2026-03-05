"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import Image from "next/image";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/user-avatar";
import { MemberRole } from "@/lib/db/types";
import { normalizePresenceStatus, presenceStatusDotClassMap, presenceStatusLabelMap } from "@/lib/presence-status";

type OnlineRailUser = {
  id: string;
  profileId: string;
  role: MemberRole;
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
  const roleIconMap = {
    [MemberRole.GUEST]: null,
    [MemberRole.MODERATOR]: <ShieldCheck className="h-4 w-4 mr-2 text-indigo-500" />,
    [MemberRole.ADMIN]: <ShieldAlert className="h-4 w-4 mr-2 text-rose-500" />,
  };

  return (
    <div className="space-y-1">
      {users.map((member) => (
        (() => {
          const normalizedPresenceStatus = normalizePresenceStatus(member.presenceStatus);
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
              <p className="min-w-0 truncate text-xs text-[#dbdee1]">{member.profileName || "No profile name"}</p>
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

              <p className="truncate text-base font-bold text-white">{member.profileName || member.realName || member.displayName}</p>
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
        })()
      ))}
    </div>
  );
};
