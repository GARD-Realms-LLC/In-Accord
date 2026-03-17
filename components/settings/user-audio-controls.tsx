"use client";

import { Headphones, Mic, MicOff, ScreenShare, ScreenShareOff, Video, VideoOff, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";

import { getCachedVoiceState, VOICE_STATE_SYNC_EVENT, type VoiceStateSyncDetail } from "@/lib/voice-state-sync";

const VOICE_TOGGLE_MUTE_EVENT = "inaccord:voice-toggle-mute";
const VOICE_TOGGLE_DEAFEN_EVENT = "inaccord:voice-toggle-deafen";
const VOICE_TOGGLE_CAMERA_EVENT = "inaccord:voice-toggle-camera";
const VOICE_TOGGLE_STREAM_EVENT = "inaccord:voice-toggle-stream";

export const UserAudioControls = () => {
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isVoiceSessionActive, setIsVoiceSessionActive] = useState(false);
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
    if (next) {
      setIsStreaming(false);
      window.dispatchEvent(new CustomEvent(VOICE_TOGGLE_STREAM_EVENT, { detail: { isStreaming: false, streamLabel: null } }));
    }
    window.dispatchEvent(new CustomEvent(VOICE_TOGGLE_CAMERA_EVENT, { detail: { isCameraOn: next } }));
  };

  const onToggleStream = () => {
    if (!isVideoSession) {
      return;
    }

    const next = !isStreaming;
    setIsStreaming(next);
    if (next) {
      setIsCameraOn(false);
      window.dispatchEvent(new CustomEvent(VOICE_TOGGLE_CAMERA_EVENT, { detail: { isCameraOn: false } }));
    }
    window.dispatchEvent(new CustomEvent(VOICE_TOGGLE_STREAM_EVENT, { detail: { isStreaming: next } }));
  };

  useEffect(() => {
    const applyVoiceState = (detail?: VoiceStateSyncDetail | null) => {
      if (!detail) {
        return;
      }

      if (typeof detail.active === "boolean") {
        setIsVoiceSessionActive(detail.active);
      }
      if (typeof detail.isMuted === "boolean") {
        setIsMuted(detail.isMuted);
      }
      if (typeof detail.isDeafened === "boolean") {
        setIsDeafened(detail.isDeafened);
      }
      if (typeof detail.isCameraOn === "boolean") {
        setIsCameraOn(detail.isCameraOn);
      }
      if (typeof detail.isStreaming === "boolean") {
        setIsStreaming(detail.isStreaming);
      }
      if (typeof detail.isVideoChannel === "boolean") {
        setIsVideoSession(detail.isVideoChannel);
      }
    };

    applyVoiceState(getCachedVoiceState());

    const syncFromSession = (event: Event) => {
      applyVoiceState((event as CustomEvent<VoiceStateSyncDetail>).detail);
    };

    window.addEventListener(VOICE_STATE_SYNC_EVENT, syncFromSession as EventListener);

    return () => {
      window.removeEventListener(VOICE_STATE_SYNC_EVENT, syncFromSession as EventListener);
    };
  }, []);

  const canUseVideoControls = isVoiceSessionActive && isVideoSession;

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
        title={!canUseVideoControls ? "Join a live video channel to use camera" : isCameraOn ? "Turn camera off" : "Turn camera on"}
        onClick={onToggleCamera}
        disabled={!canUseVideoControls}
        className={`rounded p-1 transition ${
          !canUseVideoControls
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
        title={!canUseVideoControls ? "Join a live video channel to start streaming" : isStreaming ? "Stop stream" : "Start stream"}
        onClick={onToggleStream}
        disabled={!canUseVideoControls}
        className={`rounded p-1 transition ${
          !canUseVideoControls
            ? "cursor-not-allowed bg-black/70 text-zinc-200 opacity-70"
            : isStreaming
              ? "bg-indigo-500/20 text-indigo-200"
              : "bg-black/70 text-zinc-200"
        }`}
      >
        {isStreaming ? (
          <ScreenShare className="h-3.5 w-3.5" suppressHydrationWarning />
        ) : (
          <ScreenShareOff className="h-3.5 w-3.5" suppressHydrationWarning />
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
