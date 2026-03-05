"use client";

import { Copy, Settings, UserCircle2 } from "lucide-react";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/user-avatar";
import { useModal } from "@/hooks/use-modal-store";

interface UserStatusMenuProps {
  profileId?: string | null;
  profileName?: string | null;
  profileEmail?: string | null;
  profileImageUrl?: string | null;
  profileJoinedAt?: string | null;
  profileLastLogonAt?: string | null;
}

export const UserStatusMenu = ({
  profileId,
  profileName,
  profileEmail,
  profileImageUrl,
  profileJoinedAt,
  profileLastLogonAt,
}: UserStatusMenuProps) => {
  const { onOpen } = useModal();
  const [copied, setCopied] = useState(false);

  const handleCopyId = async () => {
    if (!profileId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(profileId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch (error) {
      console.error("[USER_STATUS_COPY_ID]", error);
    }
  };

  const openSettings = () => {
    onOpen("settings", {
      profileId,
      profileName,
      profileEmail,
      profileImageUrl,
      profileJoinedAt,
      profileLastLogonAt,
    });
  };

  const formatDate = (value?: string | null) => {
    if (!value) {
      return "";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return parsed.toLocaleString();
  };

  const lastLogon = formatDate(profileLastLogonAt);
  const created = formatDate(profileJoinedAt);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex min-w-0 items-center gap-4 rounded-xl px-1 py-1 text-left transition hover:bg-[#2a2b2f]"
          aria-label="Open user menu"
        >
          <UserAvatar src={profileImageUrl ?? undefined} className="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate text-[10px] uppercase tracking-[0.08em] text-[#949ba4]">
              Users ID: {profileId}
            </p>
            <p className="truncate text-xs font-semibold text-white">{profileName || "User"}</p>
            <p className="truncate text-[10px] text-[#b5bac1]">Online</p>
          </div>
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={10}
        className="w-[280px] rounded-xl border border-black/30 bg-[#111214] p-3 text-[#dbdee1] shadow-2xl shadow-black/50"
      >
        <div className="mb-3 rounded-lg border border-white/10 bg-[#1a1b1e] p-3">
          <div className="mb-2 flex items-center gap-2">
            <UserAvatar src={profileImageUrl ?? undefined} className="h-8 w-8" />
            <p className="truncate text-sm font-semibold text-white">{profileName || "User"}</p>
          </div>

          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Profile</p>

          <div className="space-y-1 text-xs text-[#dbdee1]">
            <p>Users ID: {profileId || ""}</p>
            <p>Name: {profileName || ""}</p>
            <p>Email: {profileEmail || ""}</p>
            <p>Status: Online</p>
            <p>Last logon: {lastLogon}</p>
            <p>Created: {created}</p>
          </div>
        </div>

        <div className="space-y-1">
          <button
            type="button"
            onClick={openSettings}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-[#dbdee1] transition hover:bg-[#2f3136]"
          >
            <Settings className="h-4 w-4" />
            User Settings
          </button>

          <button
            type="button"
            onClick={handleCopyId}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-[#dbdee1] transition hover:bg-[#2f3136]"
          >
            <Copy className="h-4 w-4" />
            {copied ? "Copied User ID" : "Copy User ID"}
          </button>

          <div className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-[#b5bac1]">
            <UserCircle2 className="h-4 w-4" />
            View profile card
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
