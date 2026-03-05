import { redirect } from "next/navigation";
import { Crown } from "lucide-react";

import { currentProfile } from "@/lib/current-profile";
import { isInAccordAdministrator } from "@/lib/in-accord-admin";

const SettingsPage = async () => {
  const profile = await currentProfile();

  if (!profile) {
    return redirect("/sign-in");
  }

  const hasAdminCrown = isInAccordAdministrator(profile.role);

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
              <span className="text-white">{profile.realName || "Unknown User"}</span>
            </p>
            <p>
              <span className="text-[#949ba4]">Profile Name:</span>{" "}
              <span className="inline-flex items-center gap-1.5 text-white">
                <span>{profile.profileName || "Not set"}</span>
                {hasAdminCrown ? (
                  <Crown className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-label="In-Accord Administrator" />
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
      </div>
    </div>
  );
};

export default SettingsPage;
