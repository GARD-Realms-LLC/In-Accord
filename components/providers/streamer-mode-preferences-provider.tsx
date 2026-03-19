"use client";

import { useEffect, useState } from "react";
import { CLIENT_PERSISTENCE_DISABLED } from "@/lib/client-persistence-policy";

type StreamerModePreferences = {
  enabled: boolean;
  hidePersonalInfo: boolean;
  hideInviteLinks: boolean;
  hideNotificationContent: boolean;
  suppressSounds: boolean;
};

const defaultStreamerModePreferences: StreamerModePreferences = {
  enabled: false,
  hidePersonalInfo: true,
  hideInviteLinks: true,
  hideNotificationContent: true,
  suppressSounds: false,
};

const normalizeStreamerModePreferences = (value: unknown): StreamerModePreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultStreamerModePreferences };
  }

  const source = value as Partial<Record<keyof StreamerModePreferences, unknown>>;

  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : defaultStreamerModePreferences.enabled,
    hidePersonalInfo:
      typeof source.hidePersonalInfo === "boolean"
        ? source.hidePersonalInfo
        : defaultStreamerModePreferences.hidePersonalInfo,
    hideInviteLinks:
      typeof source.hideInviteLinks === "boolean"
        ? source.hideInviteLinks
        : defaultStreamerModePreferences.hideInviteLinks,
    hideNotificationContent:
      typeof source.hideNotificationContent === "boolean"
        ? source.hideNotificationContent
        : defaultStreamerModePreferences.hideNotificationContent,
    suppressSounds:
      typeof source.suppressSounds === "boolean"
        ? source.suppressSounds
        : defaultStreamerModePreferences.suppressSounds,
  };
};

const applyStreamerModeToDocument = (preferences: StreamerModePreferences) => {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  const enabled = preferences.enabled;

  root.classList.toggle("inaccord-streamer-mode", enabled);
  root.classList.toggle("inaccord-streamer-mode-hide-personal", enabled && preferences.hidePersonalInfo);
  root.classList.toggle("inaccord-streamer-mode-hide-invites", enabled && preferences.hideInviteLinks);
  root.classList.toggle("inaccord-streamer-mode-hide-notification-content", enabled && preferences.hideNotificationContent);
  root.classList.toggle("inaccord-streamer-mode-suppress-sounds", enabled && preferences.suppressSounds);

  root.setAttribute("data-inaccord-streamer-mode", enabled ? "on" : "off");

  if (!CLIENT_PERSISTENCE_DISABLED) {
    try {
      window.localStorage.setItem("inaccord:streamer-mode", JSON.stringify(preferences));
    } catch {
      // ignore storage failures
    }
  }
};

export const StreamerModePreferencesProvider = () => {
  const [streamerModePreferences, setStreamerModePreferences] = useState<StreamerModePreferences>({
    ...defaultStreamerModePreferences,
  });

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const response = await fetch("/api/profile/preferences", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { streamerMode?: unknown };
        if (!cancelled) {
          setStreamerModePreferences(normalizeStreamerModePreferences(payload.streamerMode));
        }
      } catch {
        if (!cancelled) {
          setStreamerModePreferences({ ...defaultStreamerModePreferences });
        }
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyStreamerModeToDocument(streamerModePreferences);
  }, [streamerModePreferences]);

  useEffect(() => {
    const onPreferencesUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ streamerMode?: unknown }>;
      setStreamerModePreferences(normalizeStreamerModePreferences(customEvent.detail?.streamerMode));
    };

    window.addEventListener("inaccord:streamer-mode-preferences-updated", onPreferencesUpdated as EventListener);

    return () => {
      window.removeEventListener("inaccord:streamer-mode-preferences-updated", onPreferencesUpdated as EventListener);
    };
  }, []);

  return null;
};
