"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ActivityPrivacyPreferences = {
  shareActivityStatus: boolean;
  shareCurrentGame: boolean;
};

type RegisteredGameEntry = {
  id: string;
  name: string;
  provider?: string;
};

type RegisteredGamesPreferences = {
  showDetectedGames: boolean;
  manualGames: RegisteredGameEntry[];
  hiddenGameIds: string[];
};

const defaultActivityPrivacyPreferences: ActivityPrivacyPreferences = {
  shareActivityStatus: true,
  shareCurrentGame: true,
};

const defaultRegisteredGamesPreferences: RegisteredGamesPreferences = {
  showDetectedGames: true,
  manualGames: [],
  hiddenGameIds: [],
};

const SYNC_INTERVAL_MS = 3_000;

type RuntimeActivity = {
  type?: "game" | "video" | "music";
  title?: string;
  details?: string | null;
  state?: string | null;
  startedAt?: string;
  detectedAt?: string;
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

const normalizeRegisteredGamesPreferences = (value: unknown): RegisteredGamesPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultRegisteredGamesPreferences };
  }

  const source = value as Partial<Record<keyof RegisteredGamesPreferences, unknown>>;

  return {
    showDetectedGames:
      typeof source.showDetectedGames === "boolean"
        ? source.showDetectedGames
        : defaultRegisteredGamesPreferences.showDetectedGames,
    manualGames: Array.isArray(source.manualGames)
      ? source.manualGames
          .filter((entry): entry is RegisteredGameEntry => Boolean(entry && typeof entry === "object"))
          .map((entry) => ({
            id: String(entry.id ?? "").trim().slice(0, 160),
            name: String(entry.name ?? "").trim().slice(0, 120),
            provider: String(entry.provider ?? "").trim().slice(0, 60),
          }))
          .filter((entry) => entry.id.length > 0 || entry.name.length > 0)
      : defaultRegisteredGamesPreferences.manualGames,
    hiddenGameIds: Array.isArray(source.hiddenGameIds)
      ? source.hiddenGameIds
          .map((entry) => String(entry ?? "").trim())
          .filter((entry) => entry.length > 0)
      : defaultRegisteredGamesPreferences.hiddenGameIds,
  };
};

const getRuntimeActivity = async (): Promise<RuntimeActivity> => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const payload = await fetch("/api/profile/runtime-activity", { cache: "no-store" }).then((response) =>
      response.ok ? response.json() : null
    );
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
  const [registeredGamesPreferences, setRegisteredGamesPreferences] = useState<RegisteredGamesPreferences>({
    ...defaultRegisteredGamesPreferences,
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
        registeredGames?: unknown;
      };

      setActivityPrivacyPreferences(normalizeActivityPrivacyPreferences(payload.activityPrivacy));
      setRegisteredGamesPreferences(normalizeRegisteredGamesPreferences(payload.registeredGames));
    } catch {
      // no-op: best effort
    }
  }, []);

  const syncCurrentGame = useCallback(async () => {
    try {
      const runtimeActivity = await getRuntimeActivity();
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

    const onRegisteredGamesUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ registeredGames?: unknown }>;
      setRegisteredGamesPreferences(
        normalizeRegisteredGamesPreferences(customEvent.detail?.registeredGames)
      );
    };

    window.addEventListener(
      "inaccord:activity-privacy-preferences-updated",
      onActivityPrivacyUpdated as EventListener
    );
    window.addEventListener(
      "inaccord:registered-games-preferences-updated",
      onRegisteredGamesUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        "inaccord:activity-privacy-preferences-updated",
        onActivityPrivacyUpdated as EventListener
      );
      window.removeEventListener(
        "inaccord:registered-games-preferences-updated",
        onRegisteredGamesUpdated as EventListener
      );
    };
  }, []);

  useEffect(() => {
    void syncCurrentGame();

    const onWindowFocus = () => {
      void syncCurrentGame();
    };

    const onVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void syncCurrentGame();
      }
    };

    const interval = window.setInterval(() => {
      void syncCurrentGame();
    }, SYNC_INTERVAL_MS);

    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [syncCurrentGame]);

  return null;
};
