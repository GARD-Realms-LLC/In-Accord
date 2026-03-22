"use client";

import { useEffect, useMemo, useState } from "react";

type NotificationPreferences = {
  enableDesktopNotifications: boolean;
  enableSoundEffects: boolean;
  emailNotifications: boolean;
  notifyOnDirectMessages: boolean;
  notifyOnReplies: boolean;
  notifyOnServerMessages: boolean;
};

type NotificationPreferencesResponse = {
  notifications?: Partial<NotificationPreferences> | null;
};

const defaultNotificationPreferences: NotificationPreferences = {
  enableDesktopNotifications: true,
  enableSoundEffects: true,
  emailNotifications: false,
  notifyOnDirectMessages: true,
  notifyOnReplies: true,
  notifyOnServerMessages: true,
};

const normalizeNotificationPreferences = (
  value: Partial<NotificationPreferences> | null | undefined
): NotificationPreferences => ({
  enableDesktopNotifications:
    typeof value?.enableDesktopNotifications === "boolean"
      ? value.enableDesktopNotifications
      : defaultNotificationPreferences.enableDesktopNotifications,
  enableSoundEffects:
    typeof value?.enableSoundEffects === "boolean"
      ? value.enableSoundEffects
      : defaultNotificationPreferences.enableSoundEffects,
  emailNotifications:
    typeof value?.emailNotifications === "boolean"
      ? value.emailNotifications
      : defaultNotificationPreferences.emailNotifications,
  notifyOnDirectMessages:
    typeof value?.notifyOnDirectMessages === "boolean"
      ? value.notifyOnDirectMessages
      : defaultNotificationPreferences.notifyOnDirectMessages,
  notifyOnReplies:
    typeof value?.notifyOnReplies === "boolean"
      ? value.notifyOnReplies
      : defaultNotificationPreferences.notifyOnReplies,
  notifyOnServerMessages:
    typeof value?.notifyOnServerMessages === "boolean"
      ? value.notifyOnServerMessages
      : defaultNotificationPreferences.notifyOnServerMessages,
});

const getErrorMessage = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim().length > 0) {
      return payload.error.trim();
    }
  } catch {
    // ignore JSON parse failure and fall back below
  }

  return fallback;
};

interface SettingsNotificationsPanelProps {
  recipientEmail: string;
}

export const SettingsNotificationsPanel = ({ recipientEmail }: SettingsNotificationsPanelProps) => {
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences);
  const [savedNotificationPreferences, setSavedNotificationPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadPreferences = async () => {
      try {
        setIsLoading(true);
        setStatus(null);

        const response = await fetch("/api/profile/preferences", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          const message = await getErrorMessage(response, "Could not load notification settings.");
          throw new Error(message);
        }

        const payload = (await response.json()) as NotificationPreferencesResponse;
        const nextPreferences = normalizeNotificationPreferences(payload.notifications);

        if (!isCancelled) {
          setNotificationPreferences(nextPreferences);
          setSavedNotificationPreferences(nextPreferences);
        }
      } catch (error) {
        if (!isCancelled) {
          setStatus(error instanceof Error ? error.message : "Could not load notification settings.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadPreferences();

    return () => {
      isCancelled = true;
    };
  }, []);

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(notificationPreferences) !== JSON.stringify(savedNotificationPreferences),
    [notificationPreferences, savedNotificationPreferences]
  );

  const notificationRows: Array<{
    key: keyof NotificationPreferences;
    title: string;
    description: string;
  }> = [
    {
      key: "enableDesktopNotifications",
      title: "Desktop Notifications",
      description: "Show system notifications when In-Accord is open.",
    },
    {
      key: "enableSoundEffects",
      title: "Sound Effects",
      description: "Play sounds for message and app events.",
    },
    {
      key: "emailNotifications",
      title: "Email Notifications",
      description: "Send summary notifications to your account email.",
    },
    {
      key: "notifyOnDirectMessages",
      title: "Direct Message Alerts",
      description: "Notify when someone sends you a direct message.",
    },
    {
      key: "notifyOnReplies",
      title: "Reply Alerts",
      description: "Notify when someone replies to one of your messages.",
    },
    {
      key: "notifyOnServerMessages",
      title: "Server Message Alerts",
      description: "Notify for server channel activity based on your subscriptions.",
    },
  ];

  const savePreferences = async ({ silent = false }: { silent?: boolean } = {}) => {
    setIsSaving(true);

    try {
      const response = await fetch("/api/profile/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notifications: notificationPreferences,
        }),
      });

      if (!response.ok) {
        const message = await getErrorMessage(response, "Could not save notification settings.");
        throw new Error(message);
      }

      const payload = (await response.json()) as NotificationPreferencesResponse;
      const persistedPreferences = normalizeNotificationPreferences(payload.notifications ?? notificationPreferences);

      setNotificationPreferences(persistedPreferences);
      setSavedNotificationPreferences(persistedPreferences);

      if (!silent) {
        setStatus("Notification settings saved.");
      }

      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save notification settings.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const sendTestEmail = async () => {
    if (!notificationPreferences.emailNotifications) {
      setStatus("Enable Email Notifications before sending a test email.");
      return;
    }

    setIsSendingTestEmail(true);
    setStatus(null);

    try {
      if (hasUnsavedChanges) {
        const didSave = await savePreferences({ silent: true });
        if (!didSave) {
          return;
        }
      }

      const response = await fetch("/api/profile/preferences/test-email", {
        method: "POST",
      });

      if (!response.ok) {
        const message = await getErrorMessage(response, "Could not send the test email.");
        throw new Error(message);
      }

      const payload = (await response.json()) as { recipientEmail?: unknown };
      const deliveredTo =
        typeof payload.recipientEmail === "string" && payload.recipientEmail.trim().length > 0
          ? payload.recipientEmail.trim()
          : recipientEmail;

      setStatus(deliveredTo ? `Test email sent to ${deliveredTo}.` : "Test email sent.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send the test email.");
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  return (
    <div className="rounded-xl border border-black/20 bg-[#2b2d31] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-[#949ba4]">Notifications</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Email & alert settings</h2>
          <p className="mt-1 text-sm text-[#b5bac1]">
            Manage notification delivery and send a test email to confirm your setup.
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
          Account email: <span className="font-semibold text-white">{recipientEmail || "No email on account"}</span>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {notificationRows.map((item) => {
          const enabled = notificationPreferences[item.key];

          return (
            <div
              key={`settings-page-notification-${item.key}`}
              className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-3"
            >
              <div>
                <p className="text-sm font-medium text-white">{item.title}</p>
                <p className="mt-1 text-xs text-[#949ba4]">{item.description}</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setNotificationPreferences((current) => ({
                    ...current,
                    [item.key]: !current[item.key],
                  }));
                  setStatus(null);
                }}
                disabled={isLoading || isSaving || isSendingTestEmail}
                className={`inline-flex h-7 w-12 items-center rounded-full border transition ${
                  enabled ? "border-emerald-400/50 bg-emerald-500/40" : "border-zinc-600 bg-zinc-700"
                } disabled:cursor-not-allowed disabled:opacity-60`}
                aria-pressed={enabled}
                aria-label={`Toggle ${item.title}`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                    enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
          {isLoading
            ? "Loading notification settings..."
            : hasUnsavedChanges
              ? "You have unsaved notification changes."
              : "Notification settings are up to date."}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void sendTestEmail()}
            disabled={isLoading || isSaving || isSendingTestEmail || !recipientEmail}
            className="inline-flex h-8 items-center rounded-md border border-white/20 bg-transparent px-3 text-xs font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSendingTestEmail ? "Sending Test..." : "Send Test Email"}
          </button>
          <button
            type="button"
            onClick={() => void savePreferences()}
            disabled={isLoading || isSaving || isSendingTestEmail}
            className="inline-flex h-8 items-center rounded-md bg-[#5865f2] px-3 text-xs font-medium text-white transition hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save Notifications"}
          </button>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-[#949ba4]">
        Test emails are sent to your account email after <span className="font-semibold text-white">Email Notifications</span> is enabled.
      </p>

      {status ? (
        <p className="mt-3 rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
          {status}
        </p>
      ) : null}
    </div>
  );
};
