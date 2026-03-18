import { NavigationSidebar } from "@/components/navigation/navigation-sidebar";
import { LastLocationTracker } from "@/components/navigation/last-location-tracker";
import { SignInForm } from "@/components/auth/sign-in-form";

import { currentProfile } from "@/lib/current-profile";
import { INACCORD_BUILD_NUMBER, INACCORD_VERSION_LABEL } from "@/lib/build-version";
import { UserActivityPopup } from "@/components/settings/user-activity-popup";
import { UserLocalTime } from "@/components/server/user-local-time";
import { GlobalUserStatusDock } from "@/components/settings/global-user-status-dock";

const MainLayout = async ({ children }: { children: React.ReactNode }) => {
  const profile = await currentProfile();

  if (!profile) {
    return (
      <SignInForm
        contextMessage="Sign in is required to open this page."
        buildNumber={INACCORD_BUILD_NUMBER}
        versionLabel={INACCORD_VERSION_LABEL}
      />
    );
  }

  return (
    <div className="h-full">
      <LastLocationTracker />
      <div className="fixed bottom-23.5 left-0 top-0 z-50 flex w-27 flex-col">
        <NavigationSidebar />
      </div>
      <UserActivityPopup initialCurrentGame={profile.currentGame ?? null} />
      <GlobalUserStatusDock
        profileId={profile.id}
        profileRealName={profile.realName ?? null}
        profileName={profile.profileName ?? null}
        profilePronouns={profile.pronouns ?? null}
        profileRole={profile.role}
        profileEmail={profile.email}
        profileImageUrl={profile.imageUrl}
        profileAvatarDecorationUrl={profile.avatarDecorationUrl ?? null}
        profileEffectUrl={(profile as { profileEffectUrl?: string | null }).profileEffectUrl ?? null}
        profileNameplateLabel={profile.nameplateLabel ?? null}
        profileNameplateColor={profile.nameplateColor ?? null}
        profileNameplateImageUrl={(profile as { nameplateImageUrl?: string | null }).nameplateImageUrl ?? null}
        profileBannerUrl={profile.bannerUrl ?? null}
        profilePresenceStatus={profile.presenceStatus ?? "ONLINE"}
        profileCurrentGame={profile.currentGame ?? null}
        profileJoinedAt={profile.createdAt ? profile.createdAt.toISOString() : null}
        profileLastLogonAt={profile.updatedAt ? profile.updatedAt.toISOString() : null}
      />
      <aside className="fixed bottom-2 right-0 z-30 flex h-21 w-72 items-center justify-center px-2 pb-2">
        <UserLocalTime />
      </aside>
      <main className="h-full pl-27">{children}</main>
    </div>
  );
};

export default MainLayout;
