import { redirect } from "next/navigation";
import { Crown, Wrench } from "lucide-react";

import { ModeratorLineIcon } from "@/components/moderator-line-icon";
import { ProfileNameWithServerTag } from "@/components/profile-name-with-server-tag";
import { SettingsNotificationsPanel } from "@/components/settings/settings-notifications-panel";
import { currentProfile } from "@/lib/current-profile";
import { isInAccordAdministrator, isInAccordDeveloper, isInAccordModerator } from "@/lib/in-accord-admin";

const SettingsPage = async () => {
  const profile = await currentProfile();

  if (!profile) {
    return redirect("/sign-in");
  }

  const isDeveloper = isInAccordDeveloper(profile.role);
  const isAdministrator = isInAccordAdministrator(profile.role);
  const isModerator = isInAccordModerator(profile.role);

  return (
    <div className="h-full bg-[#313338] p-6 text-[#dbdee1]">
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold text-white">User Settings</h1>
        <p className="text-sm text-[#b5bac1]">
          Manage your In-Accord profile settings.
        </p>

        <div className="rounded-xl border border-black/20 bg-[#2b2d31] p-4">
          <p className="text-xs uppercase tracking-wide text-[#949ba4]">Profile</p>
          <div className="mt-3 space-y-2 text-sm">
            <p>
              <span className="text-[#949ba4]">Name:</span>{" "}
              <span className="text-white">
                {profile.realName || profile.profileName || profile.email?.split("@")[0] || profile.id || "Deleted User"}
              </span>
            </p>
            <p>
              <span className="text-[#949ba4]">Profile Name:</span>{" "}
              <span className="inline-flex items-center gap-1.5 text-white">
                <ProfileNameWithServerTag
                  name={profile.profileName || "Not set"}
                  profileId={profile.id}
                  nameClassName=""
                />
                {isDeveloper ? (
                  <Wrench className="h-3.5 w-3.5 shrink-0 text-cyan-400" aria-label="Developer" />
                ) : isAdministrator ? (
                  <Crown className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-label="Administrator" />
                ) : isModerator ? (
                  <ModeratorLineIcon className="h-3.5 w-3.5 shrink-0 text-indigo-500" aria-label="Moderator" />
                ) : null}
              </span>
            </p>
            <p>
              <span className="text-[#949ba4]">Email:</span>{" "}
              <span className="text-white">{profile.email || "No email"}</span>
            </p>
            <p>
              <span className="text-[#949ba4]">Status:</span>{" "}
              <span className="text-white">Online</span>
            </p>
          </div>
        </div>

        <SettingsNotificationsPanel recipientEmail={profile.email ?? ""} />
      </div>
    </div>
  );
};

export default SettingsPage;
