"use client";

import { Copy, Crown, Settings, ShieldAlert, UserCircle2 } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import axios from "axios";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { useModal } from "@/hooks/use-modal-store";
import { isInAccordAdministrator } from "@/lib/in-accord-admin";
import { PresenceStatus, presenceStatusLabelMap, normalizePresenceStatus, presenceStatusValues } from "@/lib/presence-status";

interface UserStatusMenuProps {
  profileId?: string | null;
  profileRealName?: string | null;
  profileName?: string | null;
  profileRole?: string | null;
  profileEmail?: string | null;
  profileImageUrl?: string | null;
  profileBannerUrl?: string | null;
  profilePresenceStatus?: string | null;
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
  profilePresenceStatus,
  profileJoinedAt,
  profileLastLogonAt,
}: UserStatusMenuProps) => {
  const { onOpen } = useModal();
  const [copied, setCopied] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isProfileCardOpen, setIsProfileCardOpen] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [menuRealName, setMenuRealName] = useState(profileRealName ?? "Unknown User");
  const [menuProfileName, setMenuProfileName] = useState<string | null>(profileName ?? null);
  const [menuBannerUrl, setMenuBannerUrl] = useState<string | null>(profileBannerUrl ?? null);
  const [menuProfileRole, setMenuProfileRole] = useState<string | null>(profileRole ?? null);
  const [menuPresenceStatus, setMenuPresenceStatus] = useState<PresenceStatus>(
    normalizePresenceStatus(profilePresenceStatus)
  );

  useEffect(() => {
    setMenuRealName(profileRealName ?? "Unknown User");
    setMenuProfileName(profileName ?? null);
    setMenuBannerUrl(profileBannerUrl ?? null);
    setMenuProfileRole(profileRole ?? null);
    setMenuPresenceStatus(normalizePresenceStatus(profilePresenceStatus));
  }, [profileBannerUrl, profileName, profilePresenceStatus, profileRealName, profileRole]);

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
          role?: string | null;
          presenceStatus?: string | null;
        };

        if (!cancelled) {
          setMenuRealName(payload.realName?.trim() || "Unknown User");
          setMenuProfileName(payload.profileName ?? null);
          setMenuBannerUrl(payload.bannerUrl ?? null);
          setMenuProfileRole(payload.role ?? profileRole ?? null);
          setMenuPresenceStatus(normalizePresenceStatus(payload.presenceStatus));
        }
      } catch (error) {
        console.error("[USER_STATUS_PROFILE_REFRESH]", error);
      }
    };

    void loadFreshProfile();

    return () => {
      cancelled = true;
    };
  }, [isPopoverOpen, profileRole]);

  useEffect(() => {
    const handleProfileUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{
        realName?: string;
        profileName?: string;
        bannerUrl?: string | null;
        profileRole?: string | null;
        presenceStatus?: string;
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

      if (customEvent.detail?.profileRole === null || typeof customEvent.detail?.profileRole === "string") {
        setMenuProfileRole(customEvent.detail.profileRole ?? null);
      }

      if (typeof customEvent.detail?.presenceStatus === "string") {
        setMenuPresenceStatus(normalizePresenceStatus(customEvent.detail.presenceStatus));
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
      profileRole: menuProfileRole ?? profileRole,
      profileEmail,
      profileImageUrl,
      profileBannerUrl,
      profilePresenceStatus: menuPresenceStatus,
      profileJoinedAt,
      profileLastLogonAt,
    });
  };

  const openInAccordAdminPanel = () => {
    onOpen("inAccordAdmin", {
      profileId,
      profileRealName: menuRealName,
      profileName: menuProfileName,
      profileRole: menuProfileRole ?? profileRole,
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

  const statusDotClassMap: Record<PresenceStatus, string> = {
    ONLINE: "bg-emerald-500",
    DND: "bg-rose-500",
    INVISIBLE: "bg-yellow-400",
    OFFLINE: "bg-black border border-zinc-400",
  };

  const onChangeStatus = async (nextStatus: PresenceStatus) => {
    if (nextStatus === menuPresenceStatus || isSavingStatus) {
      return;
    }

    const previousStatus = menuPresenceStatus;
    setMenuPresenceStatus(nextStatus);

    try {
      setIsSavingStatus(true);
      await axios.patch("/api/profile/status", { status: nextStatus });

      window.dispatchEvent(
        new CustomEvent("inaccord:profile-updated", {
          detail: {
            presenceStatus: nextStatus,
          },
        })
      );
    } catch (error) {
      setMenuPresenceStatus(previousStatus);
      console.error("[USER_STATUS_UPDATE]", error);
      window.alert("Failed to update status.");
    } finally {
      setIsSavingStatus(false);
    }
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
  const hasAdminCrown = isInAccordAdministrator(menuProfileRole ?? profileRole);
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
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-xs font-semibold text-white">{displayStatusName}</p>
              {hasAdminCrown ? (
                <Crown className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-label="In-Accord Administrator" />
              ) : null}
            </div>
            <p className="truncate text-[10px] text-[#b5bac1]">{presenceStatusLabelMap[menuPresenceStatus]}</p>
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

          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-base font-bold text-white">{displayStatusName}</p>
            {hasAdminCrown ? (
              <Crown className="h-4 w-4 shrink-0 text-rose-500" aria-label="In-Accord Administrator" />
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-[#949ba4]">In-Accord Profile</p>

          <div className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] p-3 text-xs">
            <div className="space-y-1 text-[#dbdee1]">
              <p>Users ID: {profileId || ""}</p>
              <p>Name: {menuRealName || "Unknown User"}</p>
              <p>Profile Name: {menuProfileName || "Not set"}</p>
              <p>Email: {profileEmail || ""}</p>
              <p>Status: {presenceStatusLabelMap[menuPresenceStatus]}</p>
              <p>Last logon: {lastLogon}</p>
              <p>Created: {created}</p>
            </div>

            <div className="mt-3 rounded-md border border-white/10 bg-[#15161a] p-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">User Status</p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={isSavingStatus}
                    className="flex w-full items-center justify-between rounded-md border border-white/10 bg-[#1e1f22] px-2 py-2 text-xs text-white transition hover:bg-[#2a2b30] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${statusDotClassMap[menuPresenceStatus]}`} />
                      {presenceStatusLabelMap[menuPresenceStatus]}
                    </span>
                    <span className="text-[10px] text-[#949ba4]">{isSavingStatus ? "Saving..." : "Change"}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44 border border-black/40 bg-[#1e1f22] p-1 text-white">
                  {presenceStatusValues.map((status) => (
                    <DropdownMenuItem
                      key={status}
                      onClick={() => onChangeStatus(status)}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-white focus:bg-[#2f3136]"
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${statusDotClassMap[status]}`} />
                      <span>{presenceStatusLabelMap[status]}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div className="space-y-1 border-t border-white/10 p-3 pt-2">
          {hasAdminCrown ? (
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

            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-base font-bold text-white">{displayStatusName}</p>
              {hasAdminCrown ? (
                <Crown className="h-4 w-4 shrink-0 text-rose-500" aria-label="In-Accord Administrator" />
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-[#949ba4]">In-Accord Profile</p>

            <div className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] p-3 text-xs">
              <div className="space-y-1 text-[#dbdee1]">
                <p>Users ID: {profileId || ""}</p>
                <p>Name: {menuRealName || "Unknown User"}</p>
                <p>Profile Name: {menuProfileName || "Not set"}</p>
                <p>Email: {profileEmail || ""}</p>
                <p>Status: {presenceStatusLabelMap[menuPresenceStatus]}</p>
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
