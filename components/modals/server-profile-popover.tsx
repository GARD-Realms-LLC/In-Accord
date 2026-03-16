"use client";

import { BannerImage } from "@/components/ui/banner-image";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/user-avatar";
import { resolveBannerUrl } from "@/lib/asset-url";

type ServerProfileData = {
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

interface ServerProfilePopoverProps {
  server: ServerProfileData;
}

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

export const ServerProfilePopover = ({ server }: ServerProfilePopoverProps) => {
  const resolvedBannerUrl = resolveBannerUrl(server.bannerUrl);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          aria-label={`Open server profile for ${server.name}`}
          title={`View ${server.name} profile`}
        >
          <UserAvatar src={server.imageUrl} className="h-5 w-5" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="right"
        align="start"
        className="w-[340px] overflow-hidden rounded-xl border border-black/30 bg-[#111214] p-0 text-[#dbdee1] shadow-2xl shadow-black/50"
      >
        <div className="relative h-24 bg-gradient-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
          {resolvedBannerUrl ? (
            <BannerImage
              src={resolvedBannerUrl}
              alt="Server banner"
              className="object-cover"
            />
          ) : null}
        </div>

        <div className="relative p-3 pt-14">
          <div className="absolute -top-10 left-3 rounded-full border-4 border-[#111214]">
            <UserAvatar src={server.imageUrl} className="h-20 w-20" />
          </div>

          <p className="truncate text-base font-bold text-white">{server.name}</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-[#949ba4]">Server Profile</p>

          <div className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] p-3 text-xs">
            <div className="space-y-1 text-[#dbdee1]">
              <p>Server ID: {server.id}</p>
              <p>Name: {server.name}</p>
              <p>Owner: {server.ownerName || "Unknown Owner"}</p>
              <p>Owner ID: {server.ownerId || "N/A"}</p>
              <p>Owner Email: {server.ownerEmail || "N/A"}</p>
              <p>Invite Code: {server.inviteCode || "N/A"}</p>
              <p>Members: {server.memberCount}</p>
              <p>Channels: {server.channelCount}</p>
              <p>Created: {formatDateTime(server.createdAt)}</p>
              <p>Updated: {formatDateTime(server.updatedAt)}</p>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
