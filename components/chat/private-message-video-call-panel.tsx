"use client";

import Link from "next/link";
import { CameraOff, Loader2, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface PrivateMessageVideoCallPanelProps {
  isActive: boolean;
  participantName: string;
  conversationId: string;
  hangupHref: string;
  className?: string;
}

const PM_TOGGLE_CAMERA_EVENT = "inaccord:pm-toggle-camera";
const PM_CAMERA_STATE_SYNC_EVENT = "inaccord:pm-camera-state-sync";

const formatElapsed = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
};

export const PrivateMessageVideoCallPanel = ({
  isActive,
  participantName,
  conversationId,
  hangupHref,
  className,
}: PrivateMessageVideoCallPanelProps) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const elapsedLabel = useMemo(() => formatElapsed(elapsedSeconds), [elapsedSeconds]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(PM_CAMERA_STATE_SYNC_EVENT, {
        detail: {
          active: isActive,
          isCameraOn: isActive && isCameraOn && streamReady,
        },
      })
    );
  }, [isActive, isCameraOn, streamReady]);

  const requestLocalStream = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVideoError("Video calls are not supported in this browser.");
      setStreamReady(false);
      return false;
    }

    try {
      setIsConnecting(true);
      setVideoError(null);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setStreamReady(true);
      return true;
    } catch {
      setVideoError("Camera or microphone access was blocked. Allow permissions to start this PM video call.");
      setStreamReady(false);
      return false;
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    if (!isActive) {
      setIsMuted(false);
      setIsCameraOn(true);
      setIsConnecting(false);
      setStreamReady(false);
      setVideoError(null);
      setElapsedSeconds(0);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      streamRef.current = null;
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVideoError("Video calls are not supported in this browser.");
      return;
    }

    let cancelled = false;

    const start = async () => {
      const connected = await requestLocalStream();

      if (cancelled && connected && streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      streamRef.current = null;
    };
  }, [conversationId, isActive]);

  useEffect(() => {
    if (!isActive || !streamReady) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isActive, streamReady]);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) {
      return;
    }

    const audioTracks = stream.getAudioTracks();
    audioTracks.forEach((track) => {
      track.enabled = !isMuted;
    });
  }, [isMuted]);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) {
      return;
    }

    const videoTracks = stream.getVideoTracks();
    videoTracks.forEach((track) => {
      track.enabled = isCameraOn;
    });
  }, [isCameraOn]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const onExternalToggle = (event: Event) => {
      const customEvent = event as CustomEvent<{ isCameraOn?: boolean }>;
      const next = customEvent.detail?.isCameraOn;

      if (typeof next !== "boolean") {
        return;
      }

      if (!next) {
        setIsCameraOn(false);
        return;
      }

      void (async () => {
        const hasStream = Boolean(streamRef.current && streamRef.current.getVideoTracks().length > 0);

        if (!hasStream || !streamReady) {
          const reconnected = await requestLocalStream();
          if (!reconnected) {
            return;
          }
        }

        setIsCameraOn(true);
      })();
    };

    window.addEventListener(PM_TOGGLE_CAMERA_EVENT, onExternalToggle as EventListener);

    return () => {
      window.removeEventListener(PM_TOGGLE_CAMERA_EVENT, onExternalToggle as EventListener);
    };
  }, [isActive, streamReady]);

  if (!isActive) {
    return null;
  }

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-3 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-indigo-100">
            <span className="inline-flex items-center gap-1.5">
              <Video className="h-4 w-4" suppressHydrationWarning />
              PM Video Call with {participantName}
            </span>
          </p>
          <p className="mt-1 text-xs text-indigo-100/90">
            {isConnecting
              ? "Connecting video..."
              : streamReady
                ? `Connected • ${elapsedLabel}`
                : "Trying to connect..."}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsMuted((current) => !current)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${
              isMuted
                ? "border-rose-400/45 bg-rose-500/20 text-rose-100"
                : "border-indigo-300/40 bg-indigo-500/15 text-indigo-100 hover:bg-indigo-500/20"
            }`}
            title={isMuted ? "Unmute" : "Mute"}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff className="h-4 w-4" suppressHydrationWarning /> : <Mic className="h-4 w-4" suppressHydrationWarning />}
          </button>

          <button
            type="button"
            onClick={async () => {
              if (isCameraOn) {
                setIsCameraOn(false);
                return;
              }

              const hasStream = Boolean(streamRef.current && streamRef.current.getVideoTracks().length > 0);

              if (!hasStream || !streamReady) {
                const reconnected = await requestLocalStream();
                if (!reconnected) {
                  return;
                }
              }

              setIsCameraOn(true);
            }}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${
              isCameraOn
                ? "border-indigo-300/40 bg-indigo-500/15 text-indigo-100 hover:bg-indigo-500/20"
                : "border-rose-400/45 bg-rose-500/20 text-rose-100"
            }`}
            title={isCameraOn ? "Turn camera off" : "Turn camera on"}
            aria-label={isCameraOn ? "Turn camera off" : "Turn camera on"}
          >
            {isCameraOn ? <Video className="h-4 w-4" suppressHydrationWarning /> : <VideoOff className="h-4 w-4" suppressHydrationWarning />}
          </button>

          <Link
            href={hangupHref}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-rose-400/45 bg-rose-500/20 px-2.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/30"
            title="End call"
            aria-label="End call"
          >
            <PhoneOff className="h-3.5 w-3.5" suppressHydrationWarning />
            End
          </Link>
        </div>
      </div>

      <div className="mt-2 grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-2">
        <div className="relative min-h-0 overflow-hidden rounded-lg border border-white/15 bg-black/35">
          {streamReady ? (
            <video ref={videoRef} autoPlay playsInline muted className="h-full min-h-45 w-full object-cover" />
          ) : (
            <div className="flex h-full min-h-45 items-center justify-center text-xs text-indigo-100/90">
              {isConnecting ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" suppressHydrationWarning />
                  Connecting your camera...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <CameraOff className="h-3.5 w-3.5" suppressHydrationWarning />
                  Camera off • turn it on to preview
                </span>
              )}
            </div>
          )}

          <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
            You
          </span>
        </div>

        <div className="relative min-h-0 overflow-hidden rounded-lg border border-white/15 bg-black/35">
          <div className="flex h-full min-h-45 items-center justify-center text-xs text-indigo-100/90">
            <span className="inline-flex items-center gap-1">
              <CameraOff className="h-3.5 w-3.5" suppressHydrationWarning />
              Waiting for {participantName}&apos;s camera...
            </span>
          </div>

          <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
            {participantName}
          </span>
        </div>
      </div>

      {videoError ? (
        <div className="mt-2 rounded-md border border-rose-400/40 bg-rose-500/15 px-2 py-1.5 text-[11px] text-rose-100">
          <p>{videoError}</p>
          <button
            type="button"
            onClick={async () => {
              const connected = await requestLocalStream();
              if (connected) {
                setIsCameraOn(true);
              }
            }}
            className="mt-2 inline-flex h-7 items-center rounded-md border border-rose-300/45 bg-rose-500/20 px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-rose-50 transition hover:bg-rose-500/30"
          >
            Retry Camera
          </button>
        </div>
      ) : null}
    </div>
  );
};
