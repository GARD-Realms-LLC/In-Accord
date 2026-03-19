"use client";

import { useEffect, useState } from "react";
import { CLIENT_PERSISTENCE_DISABLED } from "@/lib/client-persistence-policy";

type GameOverlayPreferences = {
  enabled: boolean;
  showPerformanceStats: boolean;
  enableClickThrough: boolean;
  opacity: number;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
};

const defaultGameOverlayPreferences: GameOverlayPreferences = {
  enabled: false,
  showPerformanceStats: false,
  enableClickThrough: false,
  opacity: 85,
  position: "top-right",
};

const normalizeGameOverlayPreferences = (value: unknown): GameOverlayPreferences => {
  if (!value || typeof value !== "object") {
    return { ...defaultGameOverlayPreferences };
  }

  const source = value as Partial<Record<keyof GameOverlayPreferences, unknown>>;
  const position =
    source.position === "top-left" ||
    source.position === "top-right" ||
    source.position === "bottom-left" ||
    source.position === "bottom-right"
      ? source.position
      : defaultGameOverlayPreferences.position;
  const opacity =
    typeof source.opacity === "number" && Number.isFinite(source.opacity)
      ? Math.max(20, Math.min(100, Math.round(source.opacity)))
      : defaultGameOverlayPreferences.opacity;

  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : defaultGameOverlayPreferences.enabled,
    showPerformanceStats:
      typeof source.showPerformanceStats === "boolean"
        ? source.showPerformanceStats
        : defaultGameOverlayPreferences.showPerformanceStats,
    enableClickThrough:
      typeof source.enableClickThrough === "boolean"
        ? source.enableClickThrough
        : defaultGameOverlayPreferences.enableClickThrough,
    opacity,
    position,
  };
};

const applyGameOverlayPreferencesToDocument = (preferences: GameOverlayPreferences) => {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;

  root.classList.toggle("inaccord-game-overlay", preferences.enabled);
  root.classList.toggle(
    "inaccord-game-overlay-performance-stats",
    preferences.enabled && preferences.showPerformanceStats
  );
  root.classList.toggle(
    "inaccord-game-overlay-click-through",
    preferences.enabled && preferences.enableClickThrough
  );

  root.setAttribute("data-inaccord-game-overlay", preferences.enabled ? "on" : "off");
  root.setAttribute("data-inaccord-game-overlay-opacity", String(preferences.opacity));
  root.setAttribute("data-inaccord-game-overlay-position", preferences.position);

  if (!CLIENT_PERSISTENCE_DISABLED) {
    try {
      window.localStorage.setItem("inaccord:game-overlay", JSON.stringify(preferences));
    } catch {
      // ignore storage failures
    }
  }
};

export const GameOverlayPreferencesProvider = () => {
  const [gameOverlayPreferences, setGameOverlayPreferences] = useState<GameOverlayPreferences>({
    ...defaultGameOverlayPreferences,
  });

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const response = await fetch("/api/profile/preferences", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { gameOverlay?: unknown };
        if (!cancelled) {
          setGameOverlayPreferences(normalizeGameOverlayPreferences(payload.gameOverlay));
        }
      } catch {
        if (!cancelled) {
          setGameOverlayPreferences({ ...defaultGameOverlayPreferences });
        }
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyGameOverlayPreferencesToDocument(gameOverlayPreferences);
  }, [gameOverlayPreferences]);

  useEffect(() => {
    const onPreferencesUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ gameOverlay?: unknown }>;
      setGameOverlayPreferences(normalizeGameOverlayPreferences(customEvent.detail?.gameOverlay));
    };

    window.addEventListener("inaccord:game-overlay-preferences-updated", onPreferencesUpdated as EventListener);

    return () => {
      window.removeEventListener(
        "inaccord:game-overlay-preferences-updated",
        onPreferencesUpdated as EventListener
      );
    };
  }, []);

  return null;
};
