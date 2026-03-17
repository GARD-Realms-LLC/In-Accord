"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";

import { SettingsButton } from "@/components/settings/settings-button";
import { UserStatusMenu } from "@/components/settings/user-status-menu";
import { UserAudioControls } from "@/components/settings/user-audio-controls";

type GlobalUserStatusDockProps = {
  profileId: string;
  profileRealName?: string | null;
  profileName?: string | null;
  profilePronouns?: string | null;
  profileRole?: string | null;
  profileEmail?: string | null;
  profileImageUrl?: string | null;
  profileAvatarDecorationUrl?: string | null;
  profileEffectUrl?: string | null;
  profileNameplateLabel?: string | null;
  profileNameplateColor?: string | null;
  profileNameplateImageUrl?: string | null;
  profileBannerUrl?: string | null;
  profilePresenceStatus?: string | null;
  profileCurrentGame?: string | null;
  profileJoinedAt?: string | null;
  profileLastLogonAt?: string | null;
};

const STATUS_DOCK_WIDTH_PX = 348;
const DEFAULT_CHAT_LEFT_EDGE_PX = 364;
const SERVER_STATUS_DOCK_FORMULA = `max(8px, calc((var(--inaccord-chat-left-edge, ${DEFAULT_CHAT_LEFT_EDGE_PX}px) - ${STATUS_DOCK_WIDTH_PX}px) / 2))`;

export const GlobalUserStatusDock = ({
  profileId,
  profileRealName,
  profileName,
  profilePronouns,
  profileRole,
  profileEmail,
  profileImageUrl,
  profileAvatarDecorationUrl,
  profileEffectUrl,
  profileNameplateLabel,
  profileNameplateColor,
  profileNameplateImageUrl,
  profileBannerUrl,
  profilePresenceStatus,
  profileCurrentGame,
  profileJoinedAt,
  profileLastLogonAt,
}: GlobalUserStatusDockProps) => {
  const pathname = usePathname();

  const dockStyle = useMemo(() => {
    if ((pathname ?? "").startsWith("/servers/")) {
      return { left: SERVER_STATUS_DOCK_FORMULA };
    }

    return { left: "8px" };
  }, [pathname]);

  return (
    <div
      className="fixed bottom-2 z-90 w-87 rounded-3xl border border-black/20 bg-[#232428] px-2 py-2 shadow-xl shadow-black/35"
      style={dockStyle}
    >
      <div className="flex items-center justify-start rounded-[20px] bg-[#1e1f22] px-2 py-1.5">
        <UserStatusMenu
          profileId={profileId}
          profileRealName={profileRealName}
          profileName={profileName}
          profilePronouns={profilePronouns}
          profileRole={profileRole}
          profileEmail={profileEmail}
          profileImageUrl={profileImageUrl}
          profileAvatarDecorationUrl={profileAvatarDecorationUrl}
          profileEffectUrl={profileEffectUrl}
          profileNameplateLabel={profileNameplateLabel}
          profileNameplateColor={profileNameplateColor}
          profileNameplateImageUrl={profileNameplateImageUrl}
          profileBannerUrl={profileBannerUrl}
          profilePresenceStatus={profilePresenceStatus}
          profileCurrentGame={profileCurrentGame}
          profileJoinedAt={profileJoinedAt}
          profileLastLogonAt={profileLastLogonAt}
        />
        <div className="ml-auto flex items-center gap-1 text-[#b5bac1]">
          <UserAudioControls />
          <SettingsButton
            profileId={profileId}
            profileRealName={profileRealName}
            profileName={profileName}
            profileRole={profileRole}
            profileEmail={profileEmail}
            profileImageUrl={profileImageUrl}
            profileAvatarDecorationUrl={profileAvatarDecorationUrl}
            profileEffectUrl={profileEffectUrl}
            profileNameplateLabel={profileNameplateLabel}
            profileNameplateColor={profileNameplateColor}
            profileNameplateImageUrl={profileNameplateImageUrl}
            profileBannerUrl={profileBannerUrl}
            profilePresenceStatus={profilePresenceStatus}
            profileCurrentGame={profileCurrentGame}
            profileJoinedAt={profileJoinedAt}
            profileLastLogonAt={profileLastLogonAt}
          />
        </div>
      </div>
    </div>
  );
};
