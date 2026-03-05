import { NavigationSidebar } from "@/components/navigation/navigation-sidebar";
import { Headphones, Mic } from "lucide-react";

import { currentProfile } from "@/lib/current-profile";
import { SettingsButton } from "@/components/settings/settings-button";
import { UserStatusMenu } from "@/components/settings/user-status-menu";

const MainLayout = async ({ children }: { children: React.ReactNode }) => {
  const profile = await currentProfile();

  return (
    <div className="h-full">
      <div className="flex w-[88px] z-50 flex-col fixed top-0 bottom-[84px] left-0">
        <NavigationSidebar />
      </div>
      {profile ? (
        <div className="fixed bottom-0 left-0 z-[90] w-[328px] rounded-t-[24px] border border-black/20 bg-[#232428] px-2 py-2 shadow-xl shadow-black/35">
          <div className="flex items-center justify-start rounded-[20px] bg-[#1e1f22] px-2 py-1.5">
            <UserStatusMenu
              profileId={profile.id}
              profileRealName={profile.realName ?? null}
              profileName={profile.profileName ?? null}
              profileRole={profile.role}
              profileEmail={profile.email}
              profileImageUrl={profile.imageUrl}
              profileJoinedAt={profile.createdAt ? profile.createdAt.toISOString() : null}
              profileLastLogonAt={profile.updatedAt ? profile.updatedAt.toISOString() : null}
            />
            <div className="ml-auto flex items-center gap-1 text-[#b5bac1]">
              <button title="Mute" className="rounded p-1 hover:bg-[#3f4248]"><Mic className="h-3.5 w-3.5" /></button>
              <button title="Deafen" className="rounded p-1 hover:bg-[#3f4248]"><Headphones className="h-3.5 w-3.5" /></button>
              <SettingsButton
                profileId={profile.id}
                profileRealName={profile.realName ?? null}
                profileName={profile.profileName ?? null}
                profileEmail={profile.email}
                profileImageUrl={profile.imageUrl}
                profileJoinedAt={profile.createdAt ? profile.createdAt.toISOString() : null}
                profileLastLogonAt={profile.updatedAt ? profile.updatedAt.toISOString() : null}
              />
            </div>
          </div>
        </div>
      ) : null}
      <main className="pl-[88px] h-full">{children}</main>
    </div>
  );
};

export default MainLayout;
