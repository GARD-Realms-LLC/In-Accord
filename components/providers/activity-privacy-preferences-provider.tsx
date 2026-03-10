"use client";

import { useEffect, useState } from "react";

type ActivityPrivacyPreferences = {
  shareActivityStatus: boolean;
  shareCurrentGame: boolean;
  allowFriendJoinRequests: boolean;
  allowSpectateRequests: boolean;
  activityVisibility: "everyone" | "friends" | "none";
  logActivityHistory: boolean;
};

const defaultActivityPrivacyPreferences: ActivityPrivacyPreferences = {
  shareActivityStatus: true,
  shareCurrentGame: true,
  allowFriendJoinRequests: true,
  allowSpectateRequests: false,
  activityVisibility: "friends",
  logActivityHistory: true,
};

const normalizeActivityPrivacyPreferences = (value: unknown): ActivityPrivacyPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultActivityPrivacyPreferences };
  }

  const source = value as Partial<Record<keyof ActivityPrivacyPreferences, unknown>>;
  const activityVisibility =
    source.activityVisibility === "everyone" ||
    source.activityVisibility === "friends" ||
    source.activityVisibility === "none"
      ? source.activityVisibility
      : defaultActivityPrivacyPreferences.activityVisibility;

  return {
    shareActivityStatus:
      typeof source.shareActivityStatus === "boolean"
        ? source.shareActivityStatus
        : defaultActivityPrivacyPreferences.shareActivityStatus,
    shareCurrentGame:
      typeof source.shareCurrentGame === "boolean"
        ? source.shareCurrentGame
        : defaultActivityPrivacyPreferences.shareCurrentGame,
    allowFriendJoinRequests:
      typeof source.allowFriendJoinRequests === "boolean"
        ? source.allowFriendJoinRequests
        : defaultActivityPrivacyPreferences.allowFriendJoinRequests,
    allowSpectateRequests:
      typeof source.allowSpectateRequests === "boolean"
        ? source.allowSpectateRequests
        : defaultActivityPrivacyPreferences.allowSpectateRequests,
    activityVisibility,
    logActivityHistory:
      typeof source.logActivityHistory === "boolean"
        ? source.logActivityHistory
        : defaultActivityPrivacyPreferences.logActivityHistory,
  };
};

const applyActivityPrivacyToDocument = (preferences: ActivityPrivacyPreferences) => {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;

  root.classList.toggle("inaccord-activity-status-visible", preferences.shareActivityStatus);
  root.classList.toggle("inaccord-activity-game-visible", preferences.shareCurrentGame);
  root.classList.toggle("inaccord-activity-join-requests", preferences.allowFriendJoinRequests);
  root.classList.toggle("inaccord-activity-spectate-requests", preferences.allowSpectateRequests);
  root.classList.toggle("inaccord-activity-history-enabled", preferences.logActivityHistory);

  root.setAttribute("data-inaccord-activity-visibility", preferences.activityVisibility);
  root.setAttribute("data-inaccord-activity-status", preferences.shareActivityStatus ? "on" : "off");

  try {
    window.localStorage.setItem("inaccord:activity-privacy", JSON.stringify(preferences));
  } catch {
    // ignore storage failures
  }
};

export const ActivityPrivacyPreferencesProvider = () => {
  const [activityPrivacyPreferences, setActivityPrivacyPreferences] =
    useState<ActivityPrivacyPreferences>({
      ...defaultActivityPrivacyPreferences,
    });

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const response = await fetch("/api/profile/preferences", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { activityPrivacy?: unknown };
        if (!cancelled) {
          setActivityPrivacyPreferences(normalizeActivityPrivacyPreferences(payload.activityPrivacy));
        }
      } catch {
        if (!cancelled) {
          setActivityPrivacyPreferences({ ...defaultActivityPrivacyPreferences });
        }
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyActivityPrivacyToDocument(activityPrivacyPreferences);
  }, [activityPrivacyPreferences]);

  useEffect(() => {
    const onPreferencesUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ activityPrivacy?: unknown }>;
      setActivityPrivacyPreferences(normalizeActivityPrivacyPreferences(customEvent.detail?.activityPrivacy));
    };

    window.addEventListener(
      "inaccord:activity-privacy-preferences-updated",
      onPreferencesUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        "inaccord:activity-privacy-preferences-updated",
        onPreferencesUpdated as EventListener
      );
    };
  }, []);

  return null;
};