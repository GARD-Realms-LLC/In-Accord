"use client";

import { Clapperboard, Gamepad2, Music2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ActivityType = "game" | "video" | "music";

type UserActivityPopupProps = {
  initialCurrentGame?: string | null;
};

type DetectedActivity = {
  type: ActivityType;
  title: string;
  subtitle: string;
};

const PROFILE_REFRESH_INTERVAL_MS = 45_000;
const MEDIA_POLL_INTERVAL_MS = 5_000;

type RuntimeActivity = {
  type?: "game" | "video" | "music";
  title?: string;
} | null;

const classifyTextActivity = (value: string): DetectedActivity => {
  const normalized = value.trim();
  const lowered = normalized.toLowerCase();

  if (/(spotify|apple music|soundcloud|music|song|playlist|album|radio)/i.test(lowered)) {
    return {
      type: "music",
      title: normalized,
      subtitle: "Listening now",
    };
  }

  if (/(youtube|twitch|netflix|hulu|prime video|disney\+|video|stream)/i.test(lowered)) {
    return {
      type: "video",
      title: normalized,
      subtitle: "Watching now",
    };
  }

  return {
    type: "game",
    title: normalized,
    subtitle: "Playing now",
  };
};

const detectMediaSessionActivity = (): DetectedActivity | null => {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
    return null;
  }

  const metadata = navigator.mediaSession?.metadata;
  const title = String(metadata?.title ?? "").trim();
  if (!title) {
    return null;
  }

  const artist = String(metadata?.artist ?? "").trim();
  const album = String(metadata?.album ?? "").trim();
  const details = [artist, album].filter(Boolean).join(" • ");

  return {
    type: "music",
    title,
    subtitle: details || "Listening now",
  };
};

const detectDomMediaActivity = (): DetectedActivity | null => {
  if (typeof document === "undefined") {
    return null;
  }

  const activeVideo = Array.from(document.querySelectorAll("video")).find(
    (node) => !node.paused && !node.ended && node.readyState >= 2
  );

  if (activeVideo) {
    return {
      type: "video",
      title: "Live video in progress",
      subtitle: "Watching now",
    };
  }

  const activeAudio = Array.from(document.querySelectorAll("audio")).find(
    (node) => !node.paused && !node.ended && node.readyState >= 2
  );

  if (activeAudio) {
    return {
      type: "music",
      title: "Audio playback in progress",
      subtitle: "Listening now",
    };
  }

  return null;
};

export const UserActivityPopup = ({ initialCurrentGame }: UserActivityPopupProps) => {
  const [isClientReady, setIsClientReady] = useState(false);
  const [currentGame, setCurrentGame] = useState<string>(String(initialCurrentGame ?? "").trim());
  const [mediaActivity, setMediaActivity] = useState<DetectedActivity | null>(null);
  const [runtimeActivity, setRuntimeActivity] = useState<DetectedActivity | null>(null);

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  useEffect(() => {
    setCurrentGame(String(initialCurrentGame ?? "").trim());
  }, [initialCurrentGame]);

  useEffect(() => {
    const refreshProfileActivity = async () => {
      try {
        const response = await fetch("/api/profile/me", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { currentGame?: string | null };
        setCurrentGame(String(payload.currentGame ?? "").trim());
      } catch {
        // best effort
      }
    };

    const onProfileUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{
        currentGame?: string | null;
        runtimeActivity?: RuntimeActivity;
      }>;
      if (typeof customEvent.detail?.currentGame === "string" || customEvent.detail?.currentGame === null) {
        setCurrentGame(String(customEvent.detail.currentGame ?? "").trim());
      }

      const runtime = customEvent.detail?.runtimeActivity;
      const runtimeType = String(runtime?.type ?? "").trim().toLowerCase();
      const runtimeTitle = String(runtime?.title ?? "").trim();

      if (!runtimeTitle || (runtimeType !== "game" && runtimeType !== "video" && runtimeType !== "music")) {
        return;
      }

      setRuntimeActivity({
        type: runtimeType as ActivityType,
        title: runtimeTitle,
        subtitle:
          runtimeType === "music"
            ? "Listening now"
            : runtimeType === "video"
            ? "Watching now"
            : "Playing now",
      });
    };

    window.addEventListener("inaccord:profile-updated", onProfileUpdated as EventListener);

    const interval = window.setInterval(() => {
      void refreshProfileActivity();
    }, PROFILE_REFRESH_INTERVAL_MS);

    return () => {
      window.removeEventListener("inaccord:profile-updated", onProfileUpdated as EventListener);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const loadRuntimeActivity = async () => {
      try {
        const electronApi = (window as any)?.electronAPI;
        if (!electronApi || typeof electronApi.getRuntimeActivity !== "function") {
          setRuntimeActivity(null);
          return;
        }

        const payload = (await electronApi.getRuntimeActivity()) as RuntimeActivity;
        const runtimeType = String(payload?.type ?? "").trim().toLowerCase();
        const runtimeTitle = String(payload?.title ?? "").trim();

        if (!runtimeTitle || (runtimeType !== "game" && runtimeType !== "video" && runtimeType !== "music")) {
          setRuntimeActivity(null);
          return;
        }

        setRuntimeActivity({
          type: runtimeType as ActivityType,
          title: runtimeTitle,
          subtitle:
            runtimeType === "music"
              ? "Listening now"
              : runtimeType === "video"
              ? "Watching now"
              : "Playing now",
        });
      } catch {
        setRuntimeActivity(null);
      }
    };

    void loadRuntimeActivity();

    const interval = window.setInterval(() => {
      void loadRuntimeActivity();
    }, MEDIA_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const syncMedia = () => {
      const sessionActivity = detectMediaSessionActivity();
      if (sessionActivity) {
        setMediaActivity(sessionActivity);
        return;
      }

      const domMediaActivity = detectDomMediaActivity();
      setMediaActivity(domMediaActivity);
    };

    syncMedia();

    const interval = window.setInterval(syncMedia, MEDIA_POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const resolvedActivity = useMemo<DetectedActivity | null>(() => {
    if (runtimeActivity) {
      return runtimeActivity;
    }

    if (mediaActivity) {
      return mediaActivity;
    }

    if (currentGame) {
      return classifyTextActivity(currentGame);
    }

    return null;
  }, [currentGame, mediaActivity, runtimeActivity]);

  if (!isClientReady || !resolvedActivity) {
    return null;
  }

  const Icon =
    resolvedActivity.type === "music"
      ? Music2
      : resolvedActivity.type === "video"
      ? Clapperboard
      : Gamepad2;

  const accentClass =
    resolvedActivity.type === "music"
      ? "border-pink-400/35 bg-linear-to-r from-pink-500/20 to-fuchsia-500/15"
      : resolvedActivity.type === "video"
      ? "border-sky-400/35 bg-linear-to-r from-sky-500/20 to-cyan-500/15"
      : "border-emerald-400/35 bg-linear-to-r from-emerald-500/20 to-green-500/15";

  return (
    <div
      suppressHydrationWarning
      className={`fixed bottom-25 left-2 z-95 w-87 rounded-2xl border px-3 py-2 shadow-xl shadow-black/35 ${accentClass}`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/25">
          <Icon className="h-3.5 w-3.5 text-white" suppressHydrationWarning />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-white/80">
            {resolvedActivity.subtitle}
          </p>
          <p className="truncate text-sm font-semibold text-white" title={resolvedActivity.title}>
            {resolvedActivity.title}
          </p>
        </div>
      </div>
    </div>
  );
};
