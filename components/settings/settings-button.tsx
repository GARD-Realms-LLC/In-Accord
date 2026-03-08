"use client";

import { Settings } from "lucide-react";

import { useModal } from "@/hooks/use-modal-store";

interface SettingsButtonProps {
  profileId?: string | null;
  profileRealName?: string | null;
  profileName?: string | null;
  profileRole?: string | null;
  profileEmail?: string | null;
  profileImageUrl?: string | null;
  profileAvatarDecorationUrl?: string | null;
  profileNameplateLabel?: string | null;
  profileNameplateColor?: string | null;
  profileNameplateImageUrl?: string | null;
  profileBannerUrl?: string | null;
  profilePresenceStatus?: string | null;
  profileJoinedAt?: string | null;
  profileLastLogonAt?: string | null;
}

export const SettingsButton = ({
  profileId,
  profileRealName,
  profileName,
  profileRole,
  profileEmail,
  profileImageUrl,
  profileAvatarDecorationUrl,
  profileNameplateLabel,
  profileNameplateColor,
  profileNameplateImageUrl,
  profileBannerUrl,
  profilePresenceStatus,
  profileJoinedAt,
  profileLastLogonAt,
}: SettingsButtonProps) => {
  const { onOpen } = useModal();

  return (
    <button
      type="button"
      title="Settings"
      onClick={() =>
        onOpen("settings", {
          profileId,
          profileRealName,
          profileName,
          profileRole,
          profileEmail,
          profileImageUrl,
          profileAvatarDecorationUrl,
          profileNameplateLabel,
          profileNameplateColor,
          profileNameplateImageUrl,
          profileBannerUrl,
          profilePresenceStatus,
          profileJoinedAt,
          profileLastLogonAt,
        })
      }
      className="rounded p-1 hover:bg-[#3f4248]"
    >
      <Settings className="h-3.5 w-3.5" suppressHydrationWarning />
    </button>
  );
};
