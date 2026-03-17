"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  VideoChannelMeetingPanel,
  type MeetingPanelDebugSnapshot,
} from "@/components/server/video-channel-meeting-panel";
import { SocketProvider } from "@/components/providers/socket-provider";

const VOICE_TOGGLE_CAMERA_EVENT = "inaccord:voice-toggle-camera";
const PROBE_SERVER_ID = "meeting-panel-probe-server";
const PROBE_CHANNEL_ID = "meeting-panel-probe-channel";
const PROBE_MEMBERS = [
  {
    memberId: "member-alpha",
    profileId: "probe-alpha",
    displayName: "Probe Alpha",
    isMuted: false,
    isCameraOn: true,
    isStreaming: false,
    isSpeaking: false,
  },
  {
    memberId: "member-beta",
    profileId: "probe-beta",
    displayName: "Probe Beta",
    isMuted: false,
    isCameraOn: true,
    isStreaming: false,
    isSpeaking: false,
  },
  {
    memberId: "member-gamma",
    profileId: "probe-gamma",
    displayName: "Probe Gamma",
    isMuted: false,
    isCameraOn: true,
    isStreaming: false,
    isSpeaking: false,
  },
  {
    memberId: "member-delta",
    profileId: "probe-delta",
    displayName: "Probe Delta",
    isMuted: false,
    isCameraOn: true,
    isStreaming: false,
    isSpeaking: false,
  },
  {
    memberId: "member-epsilon",
    profileId: "probe-epsilon",
    displayName: "Probe Epsilon",
    isMuted: false,
    isCameraOn: true,
    isStreaming: false,
    isSpeaking: false,
  },
];

const ROLE_HUE: Record<string, number> = {
  alpha: 160,
  beta: 280,
  gamma: 30,
  delta: 210,
  epsilon: 330,
};

const PROFILE_ID_BY_ROLE: Record<string, string> = Object.fromEntries(
  PROBE_MEMBERS.map((member) => [member.displayName.replace(/^Probe\s+/i, "").toLowerCase(), member.profileId])
);

const postProbeReport = async (payload: Record<string, unknown>) => {
  try {
    await fetch("/api/socket/panel-probe-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    // ignore report failures during probe runs
  }
};

const installSyntheticCamera = (role: string) => {
  const mediaDevices = navigator.mediaDevices as MediaDevices & {
    getDisplayMedia?: typeof navigator.mediaDevices.getDisplayMedia;
  };
  const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
  const originalGetDisplayMedia = mediaDevices.getDisplayMedia?.bind(mediaDevices);

  const createStream = async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas context unavailable");
    }

    let frame = 0;
    const baseHue = ROLE_HUE[role] ?? 45;
    const render = () => {
      frame += 1;
      context.fillStyle = `hsl(${(baseHue + frame * 2) % 360} 75% 22%)`;
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.fillStyle = "rgba(255,255,255,0.92)";
      context.font = "700 34px sans-serif";
      context.fillText(`meeting-panel ${role}`, 28, 64);
      context.font = "600 22px sans-serif";
      context.fillText(new Date().toISOString(), 28, 104);
      context.fillText(`frame ${frame}`, 28, 140);

      const x = 60 + ((frame * 9) % 480);
      context.fillStyle = "rgba(255,255,255,0.30)";
      context.fillRect(x, 180, 100, 100);
      context.fillStyle = "rgba(255,255,255,0.65)";
      context.fillRect(canvas.width - x - 120, 190, 80, 80);
    };

    render();
    const timer = window.setInterval(render, 1000 / 12);
    const stream = canvas.captureStream(12);
    stream.getTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        window.clearInterval(timer);
      });
    });

    return stream;
  };

  mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
    if (constraints?.video) {
      return createStream();
    }

    return originalGetUserMedia(constraints);
  };

  if (originalGetDisplayMedia) {
    mediaDevices.getDisplayMedia = async (constraints?: DisplayMediaStreamOptions) => {
      if (constraints?.video) {
        return createStream();
      }

      return originalGetDisplayMedia(constraints);
    };
  }

  return () => {
    mediaDevices.getUserMedia = originalGetUserMedia;
    if (originalGetDisplayMedia) {
      mediaDevices.getDisplayMedia = originalGetDisplayMedia;
    }
  };
};

function ProbeClientInner({ role }: { role: string }) {
  const [mediaPatched, setMediaPatched] = useState(false);
  const lastPayloadRef = useRef<string>("");
  const mountedAtRef = useRef(Date.now());

  useEffect(() => {
    const restore = installSyntheticCamera(role);
    setMediaPatched(true);

    const roleIndex = ["gamma", "alpha", "epsilon", "beta", "delta"].indexOf(role);
    const startTimer = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(VOICE_TOGGLE_CAMERA_EVENT, { detail: { isCameraOn: true } }));
    }, 300 + Math.max(roleIndex, 0) * 650);

    return () => {
      window.clearTimeout(startTimer);
      restore();
    };
  }, [role]);

  const currentProfileId = PROFILE_ID_BY_ROLE[role] ?? "probe-alpha";

  const handleDebugProbeUpdate = useCallback(
    (snapshot: MeetingPanelDebugSnapshot) => {
      const remoteSummaries = snapshot.remoteTransportMembers.map((remoteMember) => {
        const telemetry = remoteMember.telemetry;
        const hasBitrate =
          typeof telemetry?.sendBitrateKbps === "number" || typeof telemetry?.bitrateKbps === "number";
        const flowing = telemetry?.flowState === "flowing";
        const signaled = Boolean(telemetry?.signalStrength && telemetry.signalStrength !== "none");

        return {
          profileId: remoteMember.profileId,
          displayName: remoteMember.displayName,
          ok: Boolean(flowing && signaled && hasBitrate),
          telemetry,
          status: remoteMember.status,
          videoTransceivers: remoteMember.videoTransceivers,
        };
      });

      const ok =
        remoteSummaries.length === PROBE_MEMBERS.length - 1 && remoteSummaries.every((remoteMember) => remoteMember.ok);

      const payload = {
        probe: "meeting-panel",
        role,
        ok,
        at: Date.now(),
        elapsedMs: Date.now() - mountedAtRef.current,
        currentProfileId,
        stage: ok ? "rtp-flow" : snapshot.stageMemberStatusText || "waiting",
        remoteOkCount: remoteSummaries.filter((remoteMember) => remoteMember.ok).length,
        remoteCount: remoteSummaries.length,
        remoteSummaries,
        snapshot,
      };

      const serialized = JSON.stringify(payload);
      if (serialized === lastPayloadRef.current) {
        return;
      }

      lastPayloadRef.current = serialized;
      void postProbeReport(payload);
    },
    [currentProfileId, role]
  );

  const availableMembers = useMemo(
    () =>
      PROBE_MEMBERS.map((member) => ({
        memberId: member.memberId,
        displayName: member.displayName,
        presenceStatus: "online",
      })),
    []
  );

  if (!mediaPatched) {
    return <main className="flex min-h-screen items-center justify-center bg-black text-zinc-300">arming camera…</main>;
  }

  return (
    <SocketProvider>
      <main className="min-h-screen bg-black px-3 py-3 text-zinc-100">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">probe role: {role}</div>
        <VideoChannelMeetingPanel
          serverId={PROBE_SERVER_ID}
          channelId={PROBE_CHANNEL_ID}
          meetingName={`Probe ${role}`}
          canConnect
          isLiveSession
          isPopoutView={false}
          currentProfileId={currentProfileId}
          meetingCreatorProfileId="probe-alpha"
          connectedMembers={PROBE_MEMBERS}
          availableMembers={availableMembers}
          disableVoiceStatePolling
          onDebugProbeUpdate={handleDebugProbeUpdate}
        />
      </main>
    </SocketProvider>
  );
}

export default function WebRtcMeetingPanelProbeClientPage() {
  const [role, setRole] = useState<"alpha" | "beta" | "gamma" | "delta" | "epsilon">("alpha");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextRole = String(params.get("role") ?? "alpha").trim().toLowerCase();
    if (["alpha", "beta", "gamma", "delta", "epsilon"].includes(nextRole)) {
      setRole(nextRole as "alpha" | "beta" | "gamma" | "delta" | "epsilon");
      return;
    }

    setRole("alpha");
  }, []);

  return <ProbeClientInner role={role} />;
}