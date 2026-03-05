"use client";

import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface NavigationItemProps {
  id: string;
  imageUrl?: string | null;
  updatedAt?: string | Date | null;
  name: string;
}

type ServerProfileCard = {
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

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return "N/A";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "N/A";
  }

  return parsed.toLocaleString();
};

export const NavigationItem = ({ id, imageUrl, updatedAt, name }: NavigationItemProps) => {
  const params = useParams();
  const router = useRouter();
  const [imageFailed, setImageFailed] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [serverProfile, setServerProfile] = useState<ServerProfileCard | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const normalizedImageUrl = useMemo(() => {
    const candidate = String(imageUrl ?? "").trim();
    if (!candidate) {
      return "";
    }
    // Avoid showing the global app logo for every server button.
    if (candidate === "/in-accord-steampunk-logo.png") {
      return "";
    }
    if (candidate.startsWith("/") || /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
    return "";
  }, [imageUrl]);

  const resolvedImageSrc = useMemo(() => {
    if (!normalizedImageUrl) {
      return "";
    }

    const updatedAtKey = updatedAt ? new Date(updatedAt).getTime() : 0;
    const cacheKey = `${id}-${Number.isFinite(updatedAtKey) ? updatedAtKey : 0}`;
    const joiner = normalizedImageUrl.includes("?") ? "&" : "?";

    return `${normalizedImageUrl}${joiner}sv=${encodeURIComponent(cacheKey)}`;
  }, [normalizedImageUrl, id, updatedAt]);

  const initials = (name?.trim()?.[0] ?? "S").toUpperCase();
  const showImage = !!resolvedImageSrc && !imageFailed;

  const onClick = () => {
    router.push(`/servers/${id}`);
  };

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openPopover = () => {
    clearCloseTimer();
    setIsPopoverOpen(true);

    if (serverProfile || isLoadingProfile) {
      return;
    }

    const loadServerProfile = async () => {
      try {
        setIsLoadingProfile(true);
        setProfileError(null);

        const response = await fetch(`/api/servers/${id}/profile-card`, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Failed to load server profile (${response.status})`);
        }

        const payload = (await response.json()) as ServerProfileCard;
        setServerProfile(payload);
      } catch (error) {
        console.error("[SERVER_RAIL_PROFILE_LOAD]", error);
        setProfileError("Unable to load server profile.");
      } finally {
        setIsLoadingProfile(false);
      }
    };

    void loadServerProfile();
  };

  const scheduleClosePopover = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setIsPopoverOpen(false);
    }, 120);
  };

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={onClick}
          onMouseEnter={openPopover}
          onMouseLeave={scheduleClosePopover}
          className="group relative flex items-center shadow-none ring-0 outline-none border-0 bg-transparent"
          style={{ boxShadow: "none", filter: "none", WebkitAppearance: "none", appearance: "none" }}
          title={name}
          aria-label={`Open ${name} server`}
        >
          <div
            className={cn(
              "absolute left-0 bg-primary rounded-r-full transition-all w-[4px]",
              params?.serverId !== id && "group-hover:h-[20px]",
              params?.serverId === id ? "h-[36px]" : "h-[8px]"
            )}
          />
          <div
            className={cn(
              "relative group flex mx-3 h-[48px] w-[48px] rounded-[24px] group-hover:rounded-[16px] transition-all overflow-hidden",
              params?.serverId === id && "bg-primary/10 text-primary rounded-[16px]"
            )}
          >
            {showImage ? (
              <img
                src={resolvedImageSrc}
                alt={name}
                className="h-full w-full object-cover"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <div className="h-full w-full bg-zinc-700 text-white flex items-center justify-center text-sm font-bold">
                {initials}
              </div>
            )}
          </div>
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="right"
        align="start"
        sideOffset={10}
        className="w-[340px] overflow-hidden rounded-xl border border-black/30 bg-[#111214] p-0 text-[#dbdee1] shadow-2xl shadow-black/50"
        onMouseEnter={openPopover}
        onMouseLeave={scheduleClosePopover}
      >
        {isLoadingProfile ? (
          <div className="p-4 text-sm text-[#b5bac1]">Loading server profile...</div>
        ) : profileError ? (
          <div className="p-4 text-sm text-rose-300">{profileError}</div>
        ) : serverProfile ? (
          <>
            <div className="relative h-24 bg-gradient-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
              {serverProfile.bannerUrl ? (
                <Image
                  src={serverProfile.bannerUrl}
                  alt="Server banner"
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : null}
            </div>

            <div className="relative p-3 pt-7">
              <div className="absolute -top-5 left-3 rounded-full border-4 border-[#111214]">
                <div className="h-10 w-10 overflow-hidden rounded-full">
                  {showImage ? (
                    <img
                      src={resolvedImageSrc}
                      alt={serverProfile.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-700 text-sm font-bold text-white">
                      {initials}
                    </div>
                  )}
                </div>
              </div>

              <p className="truncate text-base font-bold text-white">{serverProfile.name}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-[#949ba4]">Server Profile</p>

              <div className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] p-3 text-xs">
                <div className="space-y-1 text-[#dbdee1]">
                  <p>Server ID: {serverProfile.id}</p>
                  <p>Owner: {serverProfile.ownerName || "Unknown Owner"}</p>
                  <p>Owner Email: {serverProfile.ownerEmail || "N/A"}</p>
                  <p>Invite Code: {serverProfile.inviteCode || "N/A"}</p>
                  <p>Members: {serverProfile.memberCount}</p>
                  <p>Channels: {serverProfile.channelCount}</p>
                  <p>Created: {formatDateTime(serverProfile.createdAt)}</p>
                  <p>Updated: {formatDateTime(serverProfile.updatedAt)}</p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="p-4 text-sm text-[#b5bac1]">Hover to load server profile.</div>
        )}
      </PopoverContent>
    </Popover>
  );
};
