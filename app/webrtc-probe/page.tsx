"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";

type ProbeStatus =
  | { phase: "booting" }
  | { phase: "running"; message: string }
  | { phase: "success"; message: string }
  | { phase: "error"; message: string };

const SIGNAL_EVENT = "inaccord:webrtc-signal";
const serverId = "probe-server";
const channelId = "probe-channel";
const senderProfileId = "probe-sender";
const receiverProfileId = "probe-receiver";

const reportResult = async (payload: Record<string, unknown>) => {
  await fetch("/api/socket/probe-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
};

export default function WebRtcProbePage() {
  const [status, setStatus] = useState<ProbeStatus>({ phase: "booting" });

  useEffect(() => {
    let disposed = false;
    let senderSocket: ReturnType<typeof io> | null = null;
    let receiverSocket: ReturnType<typeof io> | null = null;
    let senderPc: RTCPeerConnection | null = null;
    let receiverPc: RTCPeerConnection | null = null;
    let canvasStream: MediaStream | null = null;
    let animationFrame = 0;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let successTimeout: ReturnType<typeof setTimeout> | null = null;
    const debugState = {
      senderSocketConnected: false,
      receiverSocketConnected: false,
      offerSent: false,
      offerReceived: false,
      answerSent: false,
      answerReceived: false,
      senderCandidatesSent: 0,
      receiverCandidatesSent: 0,
      senderCandidatesReceived: 0,
      receiverCandidatesReceived: 0,
      senderSignalsReceived: 0,
      receiverSignalsReceived: 0,
    };

    const collectPeerStats = async (peerConnection: RTCPeerConnection | null) => {
      if (!peerConnection) {
        return null;
      }

      const stats = await peerConnection.getStats();
      let inboundVideo: any = null;
      let outboundVideo: any = null;
      let candidatePair: any = null;

      stats.forEach((report: any) => {
        const mediaKind = String(report?.kind ?? report?.mediaType ?? "").trim().toLowerCase();

        if (report?.type === "inbound-rtp" && mediaKind === "video") {
          inboundVideo = report;
        }

        if (report?.type === "outbound-rtp" && mediaKind === "video") {
          outboundVideo = report;
        }

        if (report?.type === "candidate-pair" && (report.nominated || report.selected)) {
          candidatePair = report;
        }
      });

      return {
        bytesReceived: Number(inboundVideo?.bytesReceived ?? 0),
        framesDecoded: Number(inboundVideo?.framesDecoded ?? 0),
        packetsLost: Number(inboundVideo?.packetsLost ?? 0),
        bytesSent: Number(outboundVideo?.bytesSent ?? 0),
        framesSent: Number(outboundVideo?.framesSent ?? 0),
        frameWidth: Number(inboundVideo?.frameWidth ?? 0),
        frameHeight: Number(inboundVideo?.frameHeight ?? 0),
        currentRoundTripTime: Number(candidatePair?.currentRoundTripTime ?? 0),
      };
    };

    const finish = async (nextStatus: ProbeStatus, payload: Record<string, unknown>) => {
      if (disposed) {
        return;
      }

      disposed = true;
      setStatus(nextStatus);
      await reportResult({
        debugState,
        ...payload,
        at: Date.now(),
      });

      if (timeout) {
        clearTimeout(timeout);
      }

      if (successTimeout) {
        clearTimeout(successTimeout);
      }

      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }

      try { senderSocket?.disconnect(); } catch {}
      try { receiverSocket?.disconnect(); } catch {}
      try { senderPc?.close(); } catch {}
      try { receiverPc?.close(); } catch {}
      try { canvasStream?.getTracks().forEach((track) => track.stop()); } catch {}
    };

    const run = async () => {
      setStatus({ phase: "running", message: "Creating synthetic camera track" });

      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const context = canvas.getContext("2d");
      if (!context) {
        await finish({ phase: "error", message: "Canvas context unavailable" }, { ok: false, stage: "canvas" });
        return;
      }

      const start = performance.now();
      const draw = () => {
        const elapsed = performance.now() - start;
        context.fillStyle = "#111827";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#22c55e";
        context.fillRect(10, 10, 100 + ((elapsed / 10) % 180), 40);
        context.fillStyle = "#ffffff";
        context.font = "20px sans-serif";
        context.fillText(`probe ${Math.round(elapsed)}`, 20, 100);
        animationFrame = requestAnimationFrame(draw);
      };
      draw();

      canvasStream = canvas.captureStream(12);
      const [videoTrack] = canvasStream.getVideoTracks();
      if (!videoTrack) {
        await finish({ phase: "error", message: "Synthetic video track unavailable" }, { ok: false, stage: "track" });
        return;
      }

      senderPc = new RTCPeerConnection({ iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }] });
      receiverPc = new RTCPeerConnection({ iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }] });

      let gotRemoteTrack = false;
      receiverPc.ontrack = async (event) => {
        if (gotRemoteTrack) {
          return;
        }
        gotRemoteTrack = true;
        const stream = event.streams?.[0] ?? new MediaStream([event.track]);
        const video = document.createElement("video");
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        try {
          await video.play();
        } catch {}

        setStatus({ phase: "running", message: "Remote track arrived, collecting RTP stats" });
        successTimeout = setTimeout(async () => {
          const receiverStats = await collectPeerStats(receiverPc);
          const senderStats = await collectPeerStats(senderPc);
          const hasFlow = Boolean(
            (receiverStats?.bytesReceived ?? 0) > 0 ||
              (receiverStats?.framesDecoded ?? 0) > 0 ||
              (senderStats?.bytesSent ?? 0) > 0 ||
              (senderStats?.framesSent ?? 0) > 0
          );

          await finish(
            hasFlow
              ? { phase: "success", message: "Remote synthetic video arrived with RTP flow" }
              : { phase: "error", message: "Remote track arrived but RTP stats stayed at zero" },
            {
              ok: hasFlow,
              stage: hasFlow ? "rtp-flow" : "rtp-zero",
              trackId: event.track.id,
              readyState: event.track.readyState,
              senderStats,
              receiverStats,
            }
          );
        }, 2000);
      };

      senderPc.onicecandidate = (event) => {
        if (!event.candidate || !senderSocket) {
          return;
        }
        debugState.senderCandidatesSent += 1;
        senderSocket.emit(SIGNAL_EVENT, {
          senderProfileId,
          targetProfileId: receiverProfileId,
          serverId,
          channelId,
          signal: {
            candidate: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              usernameFragment: event.candidate.usernameFragment,
            },
          },
        });
      };

      receiverPc.onicecandidate = (event) => {
        if (!event.candidate || !receiverSocket) {
          return;
        }
        debugState.receiverCandidatesSent += 1;
        receiverSocket.emit(SIGNAL_EVENT, {
          senderProfileId: receiverProfileId,
          targetProfileId: senderProfileId,
          serverId,
          channelId,
          signal: {
            candidate: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              usernameFragment: event.candidate.usernameFragment,
            },
          },
        });
      };

      senderPc.addTrack(videoTrack, canvasStream);

      senderSocket = io(window.location.origin, {
        path: "/api/socket/io",
        transports: ["polling", "websocket"],
        withCredentials: true,
      });

      receiverSocket = io(window.location.origin, {
        path: "/api/socket/io",
        transports: ["polling", "websocket"],
        withCredentials: true,
      });

      senderSocket.on(SIGNAL_EVENT, async (payload: any) => {
        if (payload?.targetProfileId !== senderProfileId) {
          return;
        }

        debugState.senderSignalsReceived += 1;

        if (payload.signal?.description) {
          debugState.answerReceived = payload.signal.description.type === "answer";
          await senderPc?.setRemoteDescription(payload.signal.description);
        }

        if (payload.signal?.candidate) {
          debugState.senderCandidatesReceived += 1;
          await senderPc?.addIceCandidate(payload.signal.candidate);
        }
      });

      receiverSocket.on(SIGNAL_EVENT, async (payload: any) => {
        if (payload?.targetProfileId !== receiverProfileId) {
          return;
        }

        debugState.receiverSignalsReceived += 1;

        if (payload.signal?.description) {
          debugState.offerReceived = payload.signal.description.type === "offer";
          await receiverPc?.setRemoteDescription(payload.signal.description);
          if (payload.signal.description.type === "offer") {
            const answer = await receiverPc!.createAnswer();
            await receiverPc!.setLocalDescription(answer);
            debugState.answerSent = true;
            receiverSocket!.emit(SIGNAL_EVENT, {
              senderProfileId: receiverProfileId,
              targetProfileId: senderProfileId,
              serverId,
              channelId,
              signal: {
                description: receiverPc!.localDescription,
              },
            });
          }
        }

        if (payload.signal?.candidate) {
          debugState.receiverCandidatesReceived += 1;
          await receiverPc?.addIceCandidate(payload.signal.candidate);
        }
      });

      const waitForSockets = await new Promise<boolean>((resolve) => {
        let connected = 0;
        const onConnect = () => {
          connected += 1;
          if (!debugState.senderSocketConnected) {
            debugState.senderSocketConnected = senderSocket?.connected === true;
          }
          if (!debugState.receiverSocketConnected) {
            debugState.receiverSocketConnected = receiverSocket?.connected === true;
          }
          if (connected === 2) {
            resolve(true);
          }
        };

        senderSocket!.once("connect", onConnect);
        receiverSocket!.once("connect", onConnect);

        timeout = setTimeout(() => resolve(false), 5000);
      });

      if (!waitForSockets) {
        await finish({ phase: "error", message: "Socket connections timed out" }, { ok: false, stage: "socket-connect" });
        return;
      }

      senderSocket.emit("inaccord:join", { serverId, channelId, profileId: senderProfileId });
      receiverSocket.emit("inaccord:join", { serverId, channelId, profileId: receiverProfileId });

      const offer = await senderPc.createOffer();
      await senderPc.setLocalDescription(offer);
      debugState.offerSent = true;
      senderSocket.emit(SIGNAL_EVENT, {
        senderProfileId,
        targetProfileId: receiverProfileId,
        serverId,
        channelId,
        signal: {
          description: senderPc.localDescription,
        },
      });

      timeout = setTimeout(async () => {
        await finish(
          { phase: "error", message: "Remote synthetic video did not arrive in time" },
          {
            ok: false,
            stage: "timeout",
            senderConnectionState: senderPc?.connectionState ?? null,
            receiverConnectionState: receiverPc?.connectionState ?? null,
            senderIceConnectionState: senderPc?.iceConnectionState ?? null,
            receiverIceConnectionState: receiverPc?.iceConnectionState ?? null,
            senderStats: await collectPeerStats(senderPc),
            receiverStats: await collectPeerStats(receiverPc),
          }
        );
      }, 12000);
    };

    void run();

    return () => {
      void finish({ phase: "error", message: "Probe disposed" }, { ok: false, stage: "disposed" });
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0f14] text-white">
      <div className="rounded-xl border border-white/15 bg-white/5 px-6 py-5 shadow-2xl">
        <h1 className="text-lg font-semibold">WebRTC Probe</h1>
        <p className="mt-2 text-sm text-zinc-300">{status.phase === "booting" ? "Booting" : status.message}</p>
        <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">{status.phase}</p>
      </div>
    </main>
  );
}
