import { NavigationSidebar } from "@/components/navigation/navigation-sidebar";
import { LastLocationTracker } from "@/components/navigation/last-location-tracker";

import { currentProfile } from "@/lib/current-profile";
import { SettingsButton } from "@/components/settings/settings-button";
import { UserStatusMenu } from "@/components/settings/user-status-menu";
import { UserActivityPopup } from "@/components/settings/user-activity-popup";
import { UserLocalTime } from "@/components/server/user-local-time";
import { UserAudioControls } from "@/components/settings/user-audio-controls";

const MainLayout = async ({ children }: { children: React.ReactNode }) => {
  const profile = await currentProfile();

  return (
    <div className="h-full">
      <LastLocationTracker />
      <div className="fixed bottom-23.5 left-0 top-0 z-50 flex w-27 flex-col">
        <NavigationSidebar />
      </div>
      {profile ? (
        <UserActivityPopup initialCurrentGame={profile.currentGame ?? null} />
      ) : null}
      {profile ? (
        <div className="fixed bottom-2 left-2 z-90 w-87 rounded-3xl border border-black/20 bg-[#232428] px-2 py-2 shadow-xl shadow-black/35">
          <div className="flex items-center justify-start rounded-[20px] bg-[#1e1f22] px-2 py-1.5">
            <UserStatusMenu
              profileId={profile.id}
              profileRealName={profile.realName ?? null}
              profileName={profile.profileName ?? null}
              profilePronouns={profile.pronouns ?? null}
              profileComment={profile.comment ?? null}
              profileRole={profile.role}
              profileEmail={profile.email}
              profileImageUrl={profile.imageUrl}
              profileAvatarDecorationUrl={profile.avatarDecorationUrl ?? null}
              profileNameplateLabel={profile.nameplateLabel ?? null}
              profileNameplateColor={profile.nameplateColor ?? null}
              profileNameplateImageUrl={(profile as { nameplateImageUrl?: string | null }).nameplateImageUrl ?? null}
              profileBannerUrl={profile.bannerUrl ?? null}
              profilePresenceStatus={profile.presenceStatus ?? "ONLINE"}
              profileCurrentGame={profile.currentGame ?? null}
              profileJoinedAt={profile.createdAt ? profile.createdAt.toISOString() : null}
              profileLastLogonAt={profile.updatedAt ? profile.updatedAt.toISOString() : null}
            />
            <div className="ml-auto flex items-center gap-1 text-[#b5bac1]">
              <UserAudioControls />
              <SettingsButton
                profileId={profile.id}
                profileRealName={profile.realName ?? null}
                profileName={profile.profileName ?? null}
                profileRole={profile.role}
                profileEmail={profile.email}
                profileImageUrl={profile.imageUrl}
                profileAvatarDecorationUrl={profile.avatarDecorationUrl ?? null}
                profileNameplateLabel={profile.nameplateLabel ?? null}
                profileNameplateColor={profile.nameplateColor ?? null}
                profileNameplateImageUrl={(profile as { nameplateImageUrl?: string | null }).nameplateImageUrl ?? null}
                profileBannerUrl={profile.bannerUrl ?? null}
                profilePresenceStatus={profile.presenceStatus ?? "ONLINE"}
                profileCurrentGame={profile.currentGame ?? null}
                profileJoinedAt={profile.createdAt ? profile.createdAt.toISOString() : null}
                profileLastLogonAt={profile.updatedAt ? profile.updatedAt.toISOString() : null}
              />
            </div>
          </div>
        </div>
      ) : null}
      {profile ? (
        <aside className="fixed bottom-2 right-0 z-30 flex h-21 w-72 items-center justify-center px-2 pb-2">
          <UserLocalTime />
        </aside>
      ) : null}
      <main className="h-full pl-27">{children}</main>
    </div>
  );
};

export default MainLayout;
