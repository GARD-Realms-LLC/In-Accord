import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { getEmailConfigurationStatus } from "@/lib/email";
import { sendNotificationTestEmail } from "@/lib/email-notifications";
import { getUserPreferences } from "@/lib/user-preferences";

export async function POST() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const configurationStatus = getEmailConfigurationStatus();
    if (!configurationStatus.configured) {
      return NextResponse.json(
        {
          error: `Email transport is not configured. Missing: ${configurationStatus.missingKeys.join(", ")}.`,
        },
        { status: 503 }
      );
    }

    const recipientEmail = String(profile.email ?? "").trim();
    if (!recipientEmail) {
      return NextResponse.json(
        { error: "Your account does not have an email address to send to." },
        { status: 400 }
      );
    }

    const preferences = await getUserPreferences(profile.id);
    if (!preferences.notifications.emailNotifications) {
      return NextResponse.json(
        { error: "Enable Email Notifications before sending a test email." },
        { status: 400 }
      );
    }

    await sendNotificationTestEmail({
      recipientEmail,
      recipientDisplayName:
        String(profile.name ?? profile.email ?? "User").trim() || "User",
    });

    return NextResponse.json({
      ok: true,
      recipientEmail,
    });
  } catch (error) {
    console.error("[PROFILE_PREFERENCES_TEST_EMAIL_POST]", error);
    return NextResponse.json({ error: "Failed to send test email." }, { status: 500 });
  }
}