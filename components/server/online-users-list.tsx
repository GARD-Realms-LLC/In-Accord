"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/user-avatar";
import { MemberRole } from "@/lib/db/types";

type OnlineRailUser = {
  id: string;
  profileId: string;
  role: MemberRole;
  displayName: string;
  realName: string;
  profileName: string | null;
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
        <Popover key={`online-${member.profileId}`}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-[#2a2b2f]"
              title={`View ${member.displayName} profile`}
            >
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              <p className="truncate text-xs text-[#dbdee1]">{member.displayName}</p>
            </button>
          </PopoverTrigger>

          <PopoverContent
            side="left"
            align="start"
            className="w-72 rounded-xl border border-black/30 bg-[#111214] p-3 text-[#dbdee1] shadow-2xl shadow-black/50"
          >
            <div className="mb-3 rounded-lg border border-white/10 bg-[#1a1b1e] p-3">
              <div className="mb-2 flex items-center gap-2">
                <UserAvatar src={member.imageUrl ?? undefined} className="h-8 w-8" />
                <p className="truncate text-sm font-semibold text-white">{member.profileName || member.realName || member.displayName}</p>
              </div>

              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">In-Accord Profile</p>

              <div className="space-y-1 text-xs text-[#dbdee1]">
                <p>Users ID: {member.profileId}</p>
                <p>Name: {member.realName || "Unknown User"}</p>
                <p>In-Accord Profile Name: {member.profileName || "Not set"}</p>
                <p>Email: {member.email || "N/A"}</p>
                <p>Role: {member.role}</p>
                <p>Last logon: {formatDate(member.lastLogonAt)}</p>
                <p>Created: {formatDate(member.joinedAt)}</p>
              </div>
            </div>

            <div className="flex items-center text-xs text-[#b5bac1]">
              {roleIconMap[member.role]}
              Online member
            </div>
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
};
