"use client";

import Link from "next/link";
import { Loader2, Mic, MicOff, PhoneCall, PhoneOff, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface PrivateMessageAudioCallPanelProps {
  isActive: boolean;
  participantName: string;
  conversationId: string;
  hangupHref: string;
}

const formatElapsed = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
};

export const PrivateMessageAudioCallPanel = ({
  isActive,
  participantName,
  conversationId,
  hangupHref,
}: PrivateMessageAudioCallPanelProps) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const elapsedLabel = useMemo(() => formatElapsed(elapsedSeconds), [elapsedSeconds]);

  useEffect(() => {
    if (!isActive) {
      setIsMuted(false);
      setIsDeafened(false);
      setIsConnecting(false);
      setIsAudioReady(false);
      setAudioError(null);
      setElapsedSeconds(0);
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setAudioError("Audio calls are not supported in this browser.");
      setIsConnecting(false);
      setIsAudioReady(false);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;

    const start = async () => {
      try {
        setIsConnecting(true);
        setAudioError(null);

        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        setIsAudioReady(true);
      } catch {
        setAudioError("Microphone access was blocked. Allow microphone permissions to start this PM audio call.");
        setIsAudioReady(false);
      } finally {
        if (!cancelled) {
          setIsConnecting(false);
        }
      }
    };

    void start();

    return () => {
      cancelled = true;

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isActive, conversationId]);

  useEffect(() => {
    if (!isActive || !isAudioReady) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isActive, isAudioReady]);

  if (!isActive) {
    return null;
  }

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-emerald-100">
            <span className="inline-flex items-center gap-1.5">
              <PhoneCall className="h-4 w-4" suppressHydrationWarning />
              PM Audio Call with {participantName}
            </span>
          </p>
          <p className="mt-1 text-xs text-emerald-200/90">
            {isConnecting
              ? "Connecting audio..."
              : isAudioReady
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
                : "border-emerald-300/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/20"
            }`}
            title={isMuted ? "Unmute" : "Mute"}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff className="h-4 w-4" suppressHydrationWarning /> : <Mic className="h-4 w-4" suppressHydrationWarning />}
          </button>

          <button
            type="button"
            onClick={() => setIsDeafened((current) => !current)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${
              isDeafened
                ? "border-rose-400/45 bg-rose-500/20 text-rose-100"
                : "border-emerald-300/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/20"
            }`}
            title={isDeafened ? "Undeafen" : "Deafen"}
            aria-label={isDeafened ? "Undeafen" : "Deafen"}
          >
            {isDeafened ? <VolumeX className="h-4 w-4" suppressHydrationWarning /> : <Volume2 className="h-4 w-4" suppressHydrationWarning />}
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

      {isConnecting ? (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-100/90">
          <Loader2 className="h-3 w-3 animate-spin" suppressHydrationWarning />
          Initializing microphone session...
        </p>
      ) : null}

      {audioError ? (
        <p className="mt-2 rounded-md border border-rose-400/40 bg-rose-500/15 px-2 py-1.5 text-[11px] text-rose-100">
          {audioError}
        </p>
      ) : null}
    </div>
  );
};
