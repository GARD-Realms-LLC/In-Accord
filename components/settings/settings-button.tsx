"use client";

import { Settings } from "lucide-react";

import { useModal } from "@/hooks/use-modal-store";

interface SettingsButtonProps {
  profileId?: string | null;
  profileName?: string | null;
  profileEmail?: string | null;
  profileImageUrl?: string | null;
  profileJoinedAt?: string | null;
  profileLastLogonAt?: string | null;
}

export const SettingsButton = ({
  profileId,
  profileName,
  profileEmail,
  profileImageUrl,
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
          profileName,
          profileEmail,
          profileImageUrl,
          profileJoinedAt,
          profileLastLogonAt,
        })
      }
      className="rounded p-1 hover:bg-[#3f4248]"
    >
      <Settings className="h-3.5 w-3.5" />
    </button>
  );
};
