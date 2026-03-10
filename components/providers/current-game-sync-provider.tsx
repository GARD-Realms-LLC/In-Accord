"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ActivityPrivacyPreferences = {
  shareActivityStatus: boolean;
  shareCurrentGame: boolean;
};

const defaultActivityPrivacyPreferences: ActivityPrivacyPreferences = {
  shareActivityStatus: true,
  shareCurrentGame: true,
};

const SYNC_INTERVAL_MS = 12_000;

type RuntimeActivity = {
  type?: "game" | "video" | "music";
  title?: string;
} | null;

const normalizeActivityPrivacyPreferences = (value: unknown): ActivityPrivacyPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultActivityPrivacyPreferences };
  }

  const source = value as Partial<Record<keyof ActivityPrivacyPreferences, unknown>>;

  return {
    shareActivityStatus:
      typeof source.shareActivityStatus === "boolean"
        ? source.shareActivityStatus
        : defaultActivityPrivacyPreferences.shareActivityStatus,
    shareCurrentGame:
      typeof source.shareCurrentGame === "boolean"
        ? source.shareCurrentGame
        : defaultActivityPrivacyPreferences.shareCurrentGame,
  };
};

const getRuntimeActivityFromElectron = async (): Promise<RuntimeActivity> => {
  if (typeof window === "undefined") {
    return null;
  }

  const electronApi = (window as any)?.electronAPI;
  if (!electronApi || typeof electronApi.getRuntimeActivity !== "function") {
    return null;
  }

  try {
    const payload = await electronApi.getRuntimeActivity();
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const type = String((payload as { type?: string }).type ?? "").trim().toLowerCase();
    const title = String((payload as { title?: string }).title ?? "").trim();

    if (!title) {
      return null;
    }

    if (type !== "game" && type !== "video" && type !== "music") {
      return null;
    }

    return {
      type: type as "game" | "video" | "music",
      title,
    };
  } catch {
    return null;
  }
};

const resolveCurrentGame = (
  activityPrivacy: ActivityPrivacyPreferences,
  runtimeActivity: RuntimeActivity
): string | null => {
  if (!activityPrivacy.shareActivityStatus || !activityPrivacy.shareCurrentGame) {
    return null;
  }

  if (runtimeActivity?.type === "game") {
    return String(runtimeActivity.title ?? "").trim().slice(0, 120) || null;
  }

  return null;
};

export const CurrentGameSyncProvider = () => {
  const [activityPrivacyPreferences, setActivityPrivacyPreferences] = useState<ActivityPrivacyPreferences>({
    ...defaultActivityPrivacyPreferences,
  });
  const lastSyncedGameRef = useRef<string | null | undefined>(undefined);

  const hydratePreferences = useCallback(async () => {
    try {
      const response = await fetch("/api/profile/preferences", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        activityPrivacy?: unknown;
      };

      setActivityPrivacyPreferences(normalizeActivityPrivacyPreferences(payload.activityPrivacy));
    } catch {
      // no-op: best effort
    }
  }, []);

  const syncCurrentGame = useCallback(async () => {
    try {
      const runtimeActivity = await getRuntimeActivityFromElectron();
      const nextCurrentGame = resolveCurrentGame(activityPrivacyPreferences, runtimeActivity);

      if (nextCurrentGame === lastSyncedGameRef.current) {
        return;
      }

      const updateResponse = await fetch("/api/profile/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentGame: nextCurrentGame,
        }),
      });

      if (!updateResponse.ok) {
        return;
      }

      lastSyncedGameRef.current = nextCurrentGame;

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("inaccord:profile-updated", {
            detail: {
              currentGame: nextCurrentGame,
              runtimeActivity,
            },
          })
        );
      }
    } catch {
      // no-op: best effort
    }
  }, [activityPrivacyPreferences]);

  useEffect(() => {
    void hydratePreferences();
  }, [hydratePreferences]);

  useEffect(() => {
    const onActivityPrivacyUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ activityPrivacy?: unknown }>;
      setActivityPrivacyPreferences(
        normalizeActivityPrivacyPreferences(customEvent.detail?.activityPrivacy)
      );
    };

    window.addEventListener(
      "inaccord:activity-privacy-preferences-updated",
      onActivityPrivacyUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        "inaccord:activity-privacy-preferences-updated",
        onActivityPrivacyUpdated as EventListener
      );
    };
  }, []);

  useEffect(() => {
    void syncCurrentGame();

    const interval = window.setInterval(() => {
      void syncCurrentGame();
    }, SYNC_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [syncCurrentGame]);

  return null;
};
