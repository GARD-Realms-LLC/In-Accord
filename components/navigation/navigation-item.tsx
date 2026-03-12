"use client";

import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buildServerPath, matchesRouteParam } from "@/lib/route-slugs";

interface NavigationItemProps {
  id: string;
  imageUrl?: string | null;
  updatedAt?: string | Date | null;
  name: string;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
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

export const NavigationItem = ({
  id,
  imageUrl,
  updatedAt,
  name,
  draggable = false,
  onDragStart,
  onDragEnd,
  onContextMenu,
}: NavigationItemProps) => {
  const SERVER_TAB_DRAG_MIME = "application/x-inaccord-server-tab";
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
  const isActiveServer = matchesRouteParam(String(params?.serverId ?? ""), { id, name });

  const onClick = () => {
    router.push(buildServerPath({ id, name }));
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
          onContextMenu={onContextMenu}
          draggable={draggable}
          onDragStart={(event) => {
            if (!draggable) {
              return;
            }

            event.dataTransfer.setData("text/plain", id);
            event.dataTransfer.setData(
              SERVER_TAB_DRAG_MIME,
              JSON.stringify({
                serverId: id,
                serverName: name,
                source: "server-rail",
              })
            );
            event.dataTransfer.effectAllowed = "copyMove";
            onDragStart?.();
          }}
          onDragEnd={() => {
            onDragEnd?.();
          }}
          onMouseEnter={openPopover}
          onMouseLeave={scheduleClosePopover}
          className="group relative flex items-center justify-center rounded-md border-0 bg-transparent p-0 shadow-none outline-none ring-0"
          style={{ boxShadow: "none", filter: "none", WebkitAppearance: "none", appearance: "none" }}
          suppressHydrationWarning
          title={name}
          aria-label={`Open ${name} server`}
        >
          <div
            className={cn(
              "relative mx-3 flex h-12 w-12 overflow-hidden rounded-3xl border border-zinc-500/20 bg-[#2b2d31] transition-all duration-150 group-hover:rounded-2xl group-hover:border-[#5865f2]/55",
              isActiveServer && "rounded-2xl border-[#5865f2]/80 bg-[#5865f2]/20 ring-2 ring-[#5865f2]/80 ring-offset-2 ring-offset-transparent"
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
              <div className="flex h-full w-full items-center justify-center bg-[#313338] text-sm font-bold text-[#dbdee1]">
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
        className="w-85 overflow-hidden rounded-xl border border-black/30 bg-[#111214] p-0 text-[#dbdee1] shadow-2xl shadow-black/50"
        onMouseEnter={openPopover}
        onMouseLeave={scheduleClosePopover}
      >
        {isLoadingProfile ? (
          <div className="p-4 text-sm text-[#b5bac1]">Loading server profile...</div>
        ) : profileError ? (
          <div className="p-4 text-sm text-rose-300">{profileError}</div>
        ) : serverProfile ? (
          <>
            <div className="relative h-24 bg-linear-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
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

            <div className="relative p-3 pt-14">
              <div className="absolute -top-10 left-3 rounded-full border-4 border-[#111214]">
                <div className="h-20 w-20 overflow-hidden rounded-full">
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
