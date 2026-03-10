"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type VoiceStateSessionProps = {
  serverId: string;
  channelId: string;
  active: boolean;
  isVideoChannel: boolean;
  showUi?: boolean;
};

const HEARTBEAT_MS = 20_000;
const VOICE_TOGGLE_MUTE_EVENT = "inaccord:voice-toggle-mute";
const VOICE_TOGGLE_DEAFEN_EVENT = "inaccord:voice-toggle-deafen";
const VOICE_TOGGLE_CAMERA_EVENT = "inaccord:voice-toggle-camera";

export const VoiceStateSession = ({
  serverId,
  channelId,
  active,
  isVideoChannel,
  showUi = true,
}: VoiceStateSessionProps) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(isVideoChannel);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const payload = useMemo(
    () => ({
      isMuted,
      isDeafened,
      isCameraOn: isVideoChannel ? isCameraOn : false,
      isSpeaking,
    }),
    [isCameraOn, isDeafened, isMuted, isSpeaking, isVideoChannel]
  );
  const payloadRef = useRef(payload);

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  useEffect(() => {
    const onMuteToggle = (event: Event) => {
      const customEvent = event as CustomEvent<{ isMuted?: boolean }>;
      if (typeof customEvent.detail?.isMuted === "boolean") {
        setIsMuted(customEvent.detail.isMuted);
      }
    };

    const onDeafenToggle = (event: Event) => {
      const customEvent = event as CustomEvent<{ isDeafened?: boolean }>;
      if (typeof customEvent.detail?.isDeafened === "boolean") {
        setIsDeafened(customEvent.detail.isDeafened);
      }
    };

    const onCameraToggle = (event: Event) => {
      const customEvent = event as CustomEvent<{ isCameraOn?: boolean }>;
      if (typeof customEvent.detail?.isCameraOn === "boolean") {
        setIsCameraOn(customEvent.detail.isCameraOn);
      }
    };

    window.addEventListener(VOICE_TOGGLE_MUTE_EVENT, onMuteToggle as EventListener);
    window.addEventListener(VOICE_TOGGLE_DEAFEN_EVENT, onDeafenToggle as EventListener);
    window.addEventListener(VOICE_TOGGLE_CAMERA_EVENT, onCameraToggle as EventListener);

    return () => {
      window.removeEventListener(VOICE_TOGGLE_MUTE_EVENT, onMuteToggle as EventListener);
      window.removeEventListener(VOICE_TOGGLE_DEAFEN_EVENT, onDeafenToggle as EventListener);
      window.removeEventListener(VOICE_TOGGLE_CAMERA_EVENT, onCameraToggle as EventListener);
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("inaccord:voice-state-sync", {
        detail: {
          isMuted,
          isDeafened,
          isCameraOn: isVideoChannel ? isCameraOn : false,
          isVideoChannel,
          active,
        },
      })
    );
  }, [active, isCameraOn, isDeafened, isMuted, isVideoChannel]);

  useEffect(() => {
    if (!active || isMuted || isDeafened) {
      setIsSpeaking(false);
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setIsSpeaking(false);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let intervalId: number | null = null;

    const startDetection = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);

        const bufferLength = analyser.fftSize;
        const data = new Uint8Array(bufferLength);
        const speakingThreshold = 0.025;

        intervalId = window.setInterval(() => {
          if (!analyser || cancelled) {
            return;
          }

          analyser.getByteTimeDomainData(data);

          let sumSquares = 0;
          for (let index = 0; index < data.length; index += 1) {
            const normalized = (data[index] - 128) / 128;
            sumSquares += normalized * normalized;
          }

          const rms = Math.sqrt(sumSquares / data.length);
          setIsSpeaking(rms > speakingThreshold);
        }, 300);
      } catch {
        setIsSpeaking(false);
      }
    };

    void startDetection();

    return () => {
      cancelled = true;
      setIsSpeaking(false);

      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      if (audioContext) {
        void audioContext.close();
      }
    };
  }, [active, isDeafened, isMuted]);

  useEffect(() => {
    let cancelled = false;

    const endpoint = `/api/channels/${encodeURIComponent(channelId)}/voice-state?serverId=${encodeURIComponent(serverId)}`;

    const join = async () => {
      try {
        await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payloadRef.current),
          cache: "no-store",
        });
      } catch {
        // no-op
      }
    };

    const leave = async (keepalive = false) => {
      try {
        await fetch(endpoint, {
          method: "DELETE",
          cache: "no-store",
          keepalive,
        });
      } catch {
        // no-op
      }
    };

    if (!active) {
      void leave(false);

      return () => {
        cancelled = true;
      };
    }

    void join();

    const heartbeatTimer = window.setInterval(() => {
      void join();
    }, HEARTBEAT_MS);

    const onPageHide = () => {
      void leave(true);
    };

    window.addEventListener("pagehide", onPageHide);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatTimer);
      window.removeEventListener("pagehide", onPageHide);
      void leave(true);
    };
  }, [active, channelId, serverId]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const endpoint = `/api/channels/${encodeURIComponent(channelId)}/voice-state?serverId=${encodeURIComponent(serverId)}`;

    void fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    }).catch(() => {
      // no-op
    });
  }, [active, channelId, payload, serverId]);

  if (!active || !showUi) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2">
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
        {isSpeaking ? "Speaking" : "Idle"}
      </span>
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
          isMuted
            ? "border-rose-500/45 bg-rose-500/15 text-rose-200"
            : "border-zinc-500/40 bg-zinc-500/10 text-zinc-300"
        }`}
      >
        {isMuted ? "Muted" : "Mic On"}
      </span>
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
          isDeafened
            ? "border-rose-500/45 bg-rose-500/15 text-rose-200"
            : "border-zinc-500/40 bg-zinc-500/10 text-zinc-300"
        }`}
      >
        {isDeafened ? "Deafened" : "Audio On"}
      </span>
      {isVideoChannel ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-zinc-500/40 bg-zinc-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
          {isCameraOn ? "Camera On" : "Camera Off"}
        </span>
      ) : null}
    </div>
  );
};
