"use client";

import { Headphones, Mic, MicOff, Video, VideoOff, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";

const VOICE_TOGGLE_MUTE_EVENT = "inaccord:voice-toggle-mute";
const VOICE_TOGGLE_DEAFEN_EVENT = "inaccord:voice-toggle-deafen";
const VOICE_TOGGLE_CAMERA_EVENT = "inaccord:voice-toggle-camera";

export const UserAudioControls = () => {
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isVideoSession, setIsVideoSession] = useState(false);

  const onToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    window.dispatchEvent(new CustomEvent(VOICE_TOGGLE_MUTE_EVENT, { detail: { isMuted: next } }));
  };

  const onToggleDeafen = () => {
    const next = !isDeafened;
    setIsDeafened(next);
    window.dispatchEvent(new CustomEvent(VOICE_TOGGLE_DEAFEN_EVENT, { detail: { isDeafened: next } }));
  };

  const onToggleCamera = () => {
    if (!isVideoSession) {
      return;
    }

    const next = !isCameraOn;
    setIsCameraOn(next);
    window.dispatchEvent(new CustomEvent(VOICE_TOGGLE_CAMERA_EVENT, { detail: { isCameraOn: next } }));
  };

  useEffect(() => {
    const syncFromSession = (event: Event) => {
      const customEvent = event as CustomEvent<{
        isMuted?: boolean;
        isDeafened?: boolean;
        isCameraOn?: boolean;
        isVideoChannel?: boolean;
      }>;
      if (typeof customEvent.detail?.isMuted === "boolean") {
        setIsMuted(customEvent.detail.isMuted);
      }
      if (typeof customEvent.detail?.isDeafened === "boolean") {
        setIsDeafened(customEvent.detail.isDeafened);
      }
      if (typeof customEvent.detail?.isCameraOn === "boolean") {
        setIsCameraOn(customEvent.detail.isCameraOn);
      }
      if (typeof customEvent.detail?.isVideoChannel === "boolean") {
        setIsVideoSession(customEvent.detail.isVideoChannel);
      }
    };

    window.addEventListener("inaccord:voice-state-sync", syncFromSession as EventListener);

    return () => {
      window.removeEventListener("inaccord:voice-state-sync", syncFromSession as EventListener);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        title={isMuted ? "Unmute" : "Mute"}
        onClick={onToggleMute}
        className={`rounded p-1 transition ${
          isMuted
            ? "bg-black/70 text-zinc-200"
            : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/25"
        }`}
      >
        {isMuted ? (
          <MicOff className="h-3.5 w-3.5" suppressHydrationWarning />
        ) : (
          <Mic className="h-3.5 w-3.5" suppressHydrationWarning />
        )}
      </button>
      <button
        type="button"
        title={!isVideoSession ? "Camera unavailable" : isCameraOn ? "Turn camera off" : "Turn camera on"}
        onClick={onToggleCamera}
        disabled={!isVideoSession}
        className={`rounded p-1 transition ${
          !isVideoSession
            ? "cursor-not-allowed bg-black/70 text-zinc-200 opacity-70"
            : isCameraOn
              ? "bg-emerald-500/20 text-emerald-300"
              : "bg-black/70 text-zinc-200"
        }`}
      >
        {isCameraOn ? (
          <Video className="h-3.5 w-3.5" suppressHydrationWarning />
        ) : (
          <VideoOff className="h-3.5 w-3.5" suppressHydrationWarning />
        )}
      </button>
      <button
        type="button"
        title={isDeafened ? "Undeafen" : "Deafen"}
        onClick={onToggleDeafen}
        className={`rounded p-1 transition ${
          isDeafened
            ? "bg-black/70 text-zinc-200"
            : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/25"
        }`}
      >
        {isDeafened ? (
          <VolumeX className="h-3.5 w-3.5" suppressHydrationWarning />
        ) : (
          <Headphones className="h-3.5 w-3.5" suppressHydrationWarning />
        )}
      </button>
    </>
  );
};
