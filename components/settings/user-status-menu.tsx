"use client";

import { Copy, Settings, ShieldAlert, UserCircle2 } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/user-avatar";
import { useModal } from "@/hooks/use-modal-store";

interface UserStatusMenuProps {
  profileId?: string | null;
  profileRealName?: string | null;
  profileName?: string | null;
  profileRole?: string | null;
  profileEmail?: string | null;
  profileImageUrl?: string | null;
  profileBannerUrl?: string | null;
  profileJoinedAt?: string | null;
  profileLastLogonAt?: string | null;
}

export const UserStatusMenu = ({
  profileId,
  profileRealName,
  profileName,
  profileRole,
  profileEmail,
  profileImageUrl,
  profileBannerUrl,
  profileJoinedAt,
  profileLastLogonAt,
}: UserStatusMenuProps) => {
  const { onOpen } = useModal();
  const [copied, setCopied] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isProfileCardOpen, setIsProfileCardOpen] = useState(false);
  const [menuRealName, setMenuRealName] = useState(profileRealName ?? "Unknown User");
  const [menuProfileName, setMenuProfileName] = useState<string | null>(profileName ?? null);
  const [menuBannerUrl, setMenuBannerUrl] = useState<string | null>(profileBannerUrl ?? null);

  useEffect(() => {
    setMenuRealName(profileRealName ?? "Unknown User");
    setMenuProfileName(profileName ?? null);
    setMenuBannerUrl(profileBannerUrl ?? null);
  }, [profileBannerUrl, profileName, profileRealName]);

  useEffect(() => {
    if (!isPopoverOpen) {
      return;
    }

    let cancelled = false;

    const loadFreshProfile = async () => {
      try {
        const response = await fetch("/api/profile/me", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          realName?: string | null;
          profileName?: string | null;
          bannerUrl?: string | null;
        };

        if (!cancelled) {
          setMenuRealName(payload.realName?.trim() || "Unknown User");
          setMenuProfileName(payload.profileName ?? null);
          setMenuBannerUrl(payload.bannerUrl ?? null);
        }
      } catch (error) {
        console.error("[USER_STATUS_PROFILE_REFRESH]", error);
      }
    };

    void loadFreshProfile();

    return () => {
      cancelled = true;
    };
  }, [isPopoverOpen]);

  useEffect(() => {
    const handleProfileUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{
        realName?: string;
        profileName?: string;
        bannerUrl?: string | null;
      }>;

      if (typeof customEvent.detail?.realName === "string") {
        setMenuRealName(customEvent.detail.realName || "Unknown User");
      }

      if (typeof customEvent.detail?.profileName === "string") {
        setMenuProfileName(customEvent.detail.profileName || null);
      }

      if (customEvent.detail?.bannerUrl === null || typeof customEvent.detail?.bannerUrl === "string") {
        setMenuBannerUrl(customEvent.detail.bannerUrl ?? null);
      }
    };

    window.addEventListener("inaccord:profile-updated", handleProfileUpdated);

    return () => {
      window.removeEventListener("inaccord:profile-updated", handleProfileUpdated);
    };
  }, []);

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
      profileRealName: menuRealName,
      profileName: menuProfileName,
      profileRole,
      profileEmail,
      profileImageUrl,
      profileBannerUrl,
      profileJoinedAt,
      profileLastLogonAt,
    });
  };

  const openInAccordAdminPanel = () => {
    onOpen("inAccordAdmin", {
      profileId,
      profileRealName: menuRealName,
      profileName: menuProfileName,
      profileRole,
      profileEmail,
      profileImageUrl,
      profileBannerUrl: menuBannerUrl,
      profileJoinedAt,
      profileLastLogonAt,
    });
  };

  const openProfileCardPopup = () => {
    setIsPopoverOpen(false);
    setIsProfileCardOpen(true);
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
  const normalizedRole = (profileRole ?? "").trim().toUpperCase();
  const isInAccordAdministrator =
    normalizedRole === "ADMINISTRATOR" ||
    normalizedRole === "IN-ACCORD ADMINISTRATOR" ||
    normalizedRole === "IN_ACCORD_ADMINISTRATOR" ||
    normalizedRole === "ADMIN";
  const displayStatusName = menuProfileName?.trim() || menuRealName || "Unknown User";

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
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
            <p className="truncate text-xs font-semibold text-white">{displayStatusName}</p>
            <p className="truncate text-[10px] text-[#b5bac1]">Online</p>
          </div>
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={10}
        className="w-[320px] overflow-hidden rounded-xl border border-black/30 bg-[#111214] p-0 text-[#dbdee1] shadow-2xl shadow-black/50"
      >
        <div className="relative h-24 bg-gradient-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
          {menuBannerUrl ? (
            <Image
              src={menuBannerUrl}
              alt="User banner"
              fill
              className="object-cover"
              unoptimized
            />
          ) : null}
        </div>

        <div className="relative p-3 pt-7">
          <div className="absolute -top-5 left-3 rounded-full border-4 border-[#111214]">
            <UserAvatar src={profileImageUrl ?? undefined} className="h-10 w-10" />
          </div>

          <p className="truncate text-base font-bold text-white">{displayStatusName}</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-[#949ba4]">In-Accord Profile</p>

          <div className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] p-3 text-xs">
            <div className="space-y-1 text-[#dbdee1]">
              <p>Users ID: {profileId || ""}</p>
              <p>Name: {menuRealName || "Unknown User"}</p>
              <p>Profile Name: {menuProfileName || "Not set"}</p>
              <p>Email: {profileEmail || ""}</p>
              <p>Status: Online</p>
              <p>Last logon: {lastLogon}</p>
              <p>Created: {created}</p>
            </div>
          </div>
        </div>

        <div className="space-y-1 border-t border-white/10 p-3 pt-2">
          {isInAccordAdministrator ? (
            <button
              type="button"
              onClick={openInAccordAdminPanel}
              className="flex w-full items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-500/20"
            >
              <ShieldAlert className="h-4 w-4" />
              In-Accord Admin
            </button>
          ) : null}

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

          <button
            type="button"
            onClick={openProfileCardPopup}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[#dbdee1] transition hover:bg-[#2f3136]"
          >
            <UserCircle2 className="h-4 w-4" />
            View In-Accord profile card
          </button>
        </div>
      </PopoverContent>

      <Dialog open={isProfileCardOpen} onOpenChange={setIsProfileCardOpen}>
        <DialogContent className="w-[360px] overflow-hidden rounded-xl border border-black/30 bg-[#111214] p-0 text-[#dbdee1] shadow-2xl shadow-black/50">
          <DialogTitle className="sr-only">In-Accord Profile Card</DialogTitle>

          <div className="relative h-24 bg-gradient-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
            {menuBannerUrl ? (
              <Image
                src={menuBannerUrl}
                alt="User banner"
                fill
                className="object-cover"
                unoptimized
              />
            ) : null}
          </div>

          <div className="relative p-4 pt-8">
            <div className="absolute -top-6 left-4 rounded-full border-4 border-[#111214]">
              <UserAvatar src={profileImageUrl ?? undefined} className="h-12 w-12" />
            </div>

            <p className="truncate text-base font-bold text-white">{displayStatusName}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-[#949ba4]">In-Accord Profile</p>

            <div className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] p-3 text-xs">
              <div className="space-y-1 text-[#dbdee1]">
                <p>Users ID: {profileId || ""}</p>
                <p>Name: {menuRealName || "Unknown User"}</p>
                <p>Profile Name: {menuProfileName || "Not set"}</p>
                <p>Email: {profileEmail || ""}</p>
                <p>Status: Online</p>
                <p>Last logon: {lastLogon}</p>
                <p>Created: {created}</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Popover>
  );
};
