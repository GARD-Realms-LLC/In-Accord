"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, ExternalLink, Loader2, Mic, Pin, PinOff, ScreenShare, ScreenShareOff, Users, Video, VideoOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { UserAvatar } from "@/components/user-avatar";
import { useSocket } from "@/components/providers/socket-provider";
import { getStreamBadgeText, getStreamStageText, getStreamTooltipText } from "@/lib/streaming-display";
import { getCachedVoiceState, VOICE_STATE_SYNC_EVENT, type VoiceStateSyncDetail } from "@/lib/voice-state-sync";

type MeetingMember = {
  memberId: string;
  profileId: string;
  displayName: string;
  profileImageUrl?: string;
  isMuted: boolean;
  isCameraOn: boolean;
  isStreaming: boolean;
  streamLabel?: string | null;
  isSpeaking: boolean;
};

type AvailableMember = {
  memberId: string;
  displayName: string;
  presenceStatus: string;
};

interface VideoChannelMeetingPanelProps {
  serverId: string;
  channelId: string;
  channelPath?: string;
  meetingPopoutPath?: string;
  meetingName: string;
  canConnect: boolean;
  isLiveSession: boolean;
  isPopoutView: boolean;
  hideParticipantsSidebar?: boolean;
  hideParticipantStrip?: boolean;
  forceVerticalParticipantStrip?: boolean;
  currentProfileId: string;
  meetingCreatorProfileId?: string;
  connectedMembers: MeetingMember[];
  availableMembers: AvailableMember[];
  disableVoiceStatePolling?: boolean;
  onDebugProbeUpdate?: (snapshot: MeetingPanelDebugSnapshot) => void;
}

export type MeetingPanelDebugSnapshot = {
  currentProfileId: string;
  socketConnected: boolean;
  captureIntent: "none" | "camera" | "stream";
  meshRemoteVideoLimit: number;
  subscribedRemoteVideoCount: number;
  totalRemoteVideoCandidates: number;
  isCameraEnabled: boolean;
  isStreaming: boolean;
  cameraError: string | null;
  localVideoTrackReady: boolean;
  localVideoTrackState: string | null;
  stageMemberProfileId: string | null;
  stageMemberStatusText: string;
  hasStageRemoteStream: boolean;
  remoteTransportMembers: Array<{
    profileId: string;
    displayName: string;
    isSubscribed: boolean;
    status: {
      connectionState: string;
      iceConnectionState: string;
      signalingState: string;
      hasRemoteVideo: boolean;
    } | null;
    telemetry: PeerTraceTelemetry | null;
    signalDebug: PeerSignalDebug | null;
    videoTransceivers: Array<{
      mid: string | null;
      direction: string;
      currentDirection: string | null;
      senderTrackId: string | null;
      senderTrackState: string | null;
      receiverTrackId: string | null;
      receiverTrackState: string | null;
    }>;
  }>;
};

type ElectronMeetingPopoutApi = {
  openMeetingPopout?: (meetingPath: string) => Promise<unknown>;
};

type WebRtcSignalPayload = {
  senderProfileId: string;
  targetProfileId: string;
  serverId: string;
  channelId: string;
  signal: {
    description?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
    renegotiate?: boolean;
  };
};

type WebRtcPeerPresencePayload = {
  profileId: string;
  serverId: string;
  channelId: string;
  state?: "join" | "leave";
};

type WebRtcPeerSnapshotPayload = {
  serverId: string;
  channelId: string;
  profileIds?: string[];
};

const serializeSessionDescription = (description: RTCSessionDescription | RTCSessionDescriptionInit) => ({
  type: description.type,
  sdp: typeof description.sdp === "string" ? description.sdp : "",
});

const serializeIceCandidate = (candidate: RTCIceCandidate) => ({
  candidate: candidate.candidate,
  sdpMid: candidate.sdpMid ?? null,
  sdpMLineIndex: candidate.sdpMLineIndex ?? null,
  usernameFragment: candidate.usernameFragment ?? null,
});

const shouldInitiateInitialOffer = (currentProfileId: string, remoteProfileId: string) => {
  return currentProfileId.localeCompare(remoteProfileId) < 0;
};

const isPolitePeer = (currentProfileId: string, remoteProfileId: string) => {
  return currentProfileId.localeCompare(remoteProfileId) > 0;
};

const parseIceServerUrls = (value: string | undefined) => {
  return String(value ?? "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const buildIceServers = (): RTCIceServer[] => {
  const stunUrls = parseIceServerUrls(process.env.NEXT_PUBLIC_WEBRTC_STUN_URLS).filter((entry) =>
    entry.toLowerCase().startsWith("stun:")
  );
  const turnUrls = parseIceServerUrls(process.env.NEXT_PUBLIC_WEBRTC_TURN_URLS).filter((entry) =>
    /^(turn|turns):/i.test(entry)
  );
  const turnUsername = String(process.env.NEXT_PUBLIC_WEBRTC_TURN_USERNAME ?? "").trim();
  const turnCredential = String(process.env.NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL ?? "").trim();

  const iceServers: RTCIceServer[] = [];

  if (stunUrls.length > 0) {
    iceServers.push({ urls: stunUrls });
  } else {
    iceServers.push({ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] });
  }

  if (turnUrls.length > 0) {
    iceServers.push({
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return iceServers;
};

const WEBRTC_SIGNAL_EVENT = "inaccord:webrtc-signal";
const WEBRTC_PEER_EVENT = "inaccord:webrtc-peer";
const WEBRTC_PEER_SNAPSHOT_EVENT = "inaccord:webrtc-peer-snapshot";
const WEBRTC_SOCKET_PATH = "/api/socket/io";
const WEBRTC_ICE_SERVERS: RTCIceServer[] = buildIceServers();
const WEBRTC_MAX_SIMULTANEOUS_REMOTE_VIDEO_PEERS = parsePositiveInteger(
  process.env.NEXT_PUBLIC_WEBRTC_MAX_SIMULTANEOUS_REMOTE_VIDEO_PEERS,
  6
);
const WEBRTC_TRANSPORT_STALL_MS = 12000;
const WEBRTC_HAS_TURN = WEBRTC_ICE_SERVERS.some((server) => {
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  return urls.some((value) => /^(turn|turns):/i.test(String(value ?? "").trim()));
});

const getStatsMediaKind = (report: any) => {
  const kind = String(report?.kind ?? report?.mediaType ?? "").trim().toLowerCase();
  return kind;
};

const toFiniteNumberOrNull = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function parsePositiveInteger(value: string | undefined, fallback: number, minimum = 1, maximum = 16) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, minimum), maximum);
}

type PeerTraceStats = {
  bytesReceived: number;
  framesDecoded: number;
  bytesSent: number;
  framesSent: number;
  timestamp: number;
};

type PeerTraceTelemetry = {
  flowState: "flowing" | "stalled" | "idle";
  signalStrength: "excellent" | "good" | "weak" | "none";
  bitrateKbps: number | null;
  framesPerSecond: number | null;
  framesDecoded: number;
  sendBitrateKbps: number | null;
  framesSentPerSecond: number | null;
  framesSent: number;
  packetsLost: number | null;
  jitterMs: number | null;
  rttMs: number | null;
  resolution: string | null;
  updatedAt: number;
};

type PeerSignalDebug = {
  inboundSignals: number;
  outboundSignals: number;
  inboundCandidates: number;
  outboundCandidates: number;
  lastInboundDescriptionType: string | null;
  lastOutboundDescriptionType: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
};

export const VideoChannelMeetingPanel = ({
  serverId,
  channelId,
  channelPath,
  meetingPopoutPath,
  meetingName,
  canConnect,
  isLiveSession,
  isPopoutView,
  hideParticipantsSidebar = false,
  hideParticipantStrip = false,
  forceVerticalParticipantStrip = true,
  currentProfileId,
  meetingCreatorProfileId,
  connectedMembers,
  availableMembers,
  disableVoiceStatePolling = false,
  onDebugProbeUpdate,
}: VideoChannelMeetingPanelProps) => {
    const normalizedChannelPath =
      typeof channelPath === "string" && channelPath.trim().length > 0
        ? channelPath.trim()
        : `/servers/${serverId}/channels/${channelId}`;
    const normalizedMeetingPopoutPath =
      typeof meetingPopoutPath === "string" && meetingPopoutPath.trim().length > 0
        ? meetingPopoutPath.trim()
        : `/meeting-popout/${serverId}/${channelId}`;

  const router = useRouter();
    const { socket: sharedSocket } = useSocket();
  const VOICE_TOGGLE_STREAM_EVENT = "inaccord:voice-toggle-stream";
  const VOICE_TOGGLE_CAMERA_EVENT = "inaccord:voice-toggle-camera";
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteStageVideoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const socketConnectedRef = useRef(false);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const peerVideoTransceiversRef = useRef<Map<string, RTCRtpTransceiver>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const pendingSignalsRef = useRef<Map<string, WebRtcSignalPayload["signal"][]>>(new Map());
  const emitSignalRef = useRef<(targetProfileId: string, signal: WebRtcSignalPayload["signal"]) => void>(() => {});
  const cleanupPeerRef = useRef<(remoteProfileId: string, options?: { preserveResetCooldown?: boolean }) => void>(
    () => {}
  );
  const syncLocalTracksRef = useRef<(remoteProfileId: string, peerConnection: RTCPeerConnection) => Promise<void>>(
    async () => {}
  );
  const ensurePeerConnectionRef = useRef<(remoteProfileId: string) => RTCPeerConnection | null>(() => null);
  const renegotiatePeerRef = useRef<(remoteProfileId: string, peerConnection: RTCPeerConnection) => Promise<void>>(
    async () => {}
  );
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const ignoreOfferRef = useRef<Map<string, boolean>>(new Map());
  const settingRemoteAnswerPendingRef = useRef<Map<string, boolean>>(new Map());
  const iceRestartAttemptedRef = useRef<Map<string, boolean>>(new Map());
  const lastOfferSentAtRef = useRef<Map<string, number>>(new Map());
  const lastRenegotiateRequestedAtRef = useRef<Map<string, number>>(new Map());
  const lastPeerResetAtRef = useRef<Map<string, number>>(new Map());
  const pendingRenegotiateRef = useRef<Map<string, boolean>>(new Map());
  const lastPeerTraceStatsRef = useRef<Map<string, PeerTraceStats>>(new Map());
  const peerSignalDebugRef = useRef<Map<string, PeerSignalDebug>>(new Map());
  const lastPeerTransportProgressAtRef = useRef<Map<string, number>>(new Map());
  const subscribedRemoteProfileIdsRef = useRef<Set<string>>(new Set());
  const localMediaStreamRef = useRef<MediaStream | null>(null);
  const lastLocalVideoTrackTokenRef = useRef<string | null>(null);
  const updatePeerStatusRef = useRef<(remoteProfileId: string, peerConnection: RTCPeerConnection) => void>(() => {});
  const [localMediaStream, setLocalMediaStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [peerTelemetry, setPeerTelemetry] = useState<Record<string, PeerTraceTelemetry>>({});
  const [peerStatuses, setPeerStatuses] = useState<
    Record<
      string,
      {
        connectionState: string;
        iceConnectionState: string;
        signalingState: string;
        hasRemoteVideo: boolean;
      }
    >
  >({});
  const [, setPeerSignalDebugTick] = useState(0);
  const [peerRecoveryTick, setPeerRecoveryTick] = useState(0);
  const [relayBlockedPeers, setRelayBlockedPeers] = useState<Record<string, boolean>>({});
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [captureIntent, setCaptureIntent] = useState<"none" | "camera" | "stream">("none");
  const [streamLabel, setStreamLabel] = useState<string | null>(null);
  const [contextMenuState, setContextMenuState] = useState<{
    memberId: string;
    x: number;
    y: number;
  } | null>(null);
  const [liveConnectedMembers, setLiveConnectedMembers] = useState<MeetingMember[]>(connectedMembers);
  const [showPopbackNotice, setShowPopbackNotice] = useState(false);

  const isMeetingCreator = Boolean(meetingCreatorProfileId && meetingCreatorProfileId === currentProfileId);
  const connectedMembersView = liveConnectedMembers;

  useEffect(() => {
    setLiveConnectedMembers(connectedMembers);
  }, [connectedMembers]);

  useEffect(() => {
    if (typeof window === "undefined" || disableVoiceStatePolling) {
      return;
    }

    let cancelled = false;
    const endpoint = `/api/channels/${encodeURIComponent(channelId)}/voice-state?serverId=${encodeURIComponent(serverId)}`;

    const refreshMembers = async () => {
      try {
        const response = await fetch(endpoint, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = await response.json().catch(() => null);
        const nextMembersRaw = Array.isArray(payload?.connectedMembers) ? payload.connectedMembers : [];
        const nextMembers: MeetingMember[] = nextMembersRaw.map((member: any) => ({
          memberId: String(member?.memberId ?? ""),
          profileId: String(member?.profileId ?? ""),
          displayName: String(member?.displayName ?? "Unknown user"),
          profileImageUrl:
            typeof member?.profileImageUrl === "string" && member.profileImageUrl.trim().length
              ? member.profileImageUrl
              : undefined,
          isMuted: Boolean(member?.isMuted),
          isCameraOn: Boolean(member?.isCameraOn),
          isStreaming: Boolean(member?.isStreaming),
          streamLabel:
            typeof member?.streamLabel === "string" && member.streamLabel.trim().length
              ? member.streamLabel.trim()
              : null,
          isSpeaking: Boolean(member?.isSpeaking),
        }));

        if (!cancelled) {
          setLiveConnectedMembers(nextMembers);
        }
      } catch {
        // no-op
      }
    };

    void refreshMembers();
    const pollTimer = window.setInterval(refreshMembers, isPopoutView ? 2500 : 4000);

    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
    };
  }, [channelId, disableVoiceStatePolling, isPopoutView, serverId]);

  const [presentingMemberId, setPresentingMemberId] = useState<string | null>(null);
  const currentConnectedMember = useMemo(
    () => connectedMembersView.find((item) => item.profileId === currentProfileId) ?? null,
    [connectedMembersView, currentProfileId]
  );

  const setPreferredPresenter = (memberId: string | null) => {
    if (!isMeetingCreator) {
      return;
    }

    setPresentingMemberId(memberId);
  };

  const stageMember = useMemo(() => {
    if (!connectedMembersView.length) {
      return null;
    }

    const pinned = presentingMemberId
      ? connectedMembersView.find((item) => item.memberId === presentingMemberId)
      : null;

    const memberWithRemoteStream = Object.keys(remoteStreams).find((profileId) => {
      const stream = remoteStreams[profileId];
      return Boolean(stream && stream.getVideoTracks().length > 0);
    });
    const streamedMember = memberWithRemoteStream
      ? connectedMembersView.find((item) => item.profileId === memberWithRemoteStream)
      : null;

    const creatorMember = meetingCreatorProfileId
      ? connectedMembersView.find((item) => item.profileId === meetingCreatorProfileId)
      : null;

    return (
      pinned ??
      streamedMember ??
      connectedMembersView.find((item) => item.isStreaming) ??
      connectedMembersView.find((item) => item.isCameraOn) ??
      creatorMember ??
      connectedMembersView[0] ??
      null
    );
  }, [connectedMembersView, meetingCreatorProfileId, presentingMemberId, remoteStreams]);

  const firstRemoteStreamEntry = useMemo(() => {
    return (
      Object.entries(remoteStreams).find(([, stream]) => Boolean(stream && stream.getVideoTracks().length > 0)) ?? null
    );
  }, [remoteStreams]);

  useEffect(() => {
    if (!presentingMemberId) {
      return;
    }

    if (connectedMembersView.some((item) => item.memberId === presentingMemberId)) {
      return;
    }

    setPresentingMemberId(null);
  }, [connectedMembersView, presentingMemberId]);

  const isPresentingMode = Boolean(stageMember && presentingMemberId && stageMember.memberId === presentingMemberId);

  useEffect(() => {
    const applyVoiceState = (detail?: VoiceStateSyncDetail | null) => {
      if (!detail) {
        return;
      }

      if (typeof detail.isCameraOn === "boolean") {
        setIsCameraEnabled(detail.isCameraOn);
        if (detail.isCameraOn) {
          setCaptureIntent("camera");
        }
      }

      if (typeof detail.isStreaming === "boolean") {
        setIsStreaming(detail.isStreaming);
        if (detail.isStreaming) {
          setIsCameraEnabled(false);
          setCaptureIntent("stream");
        }
        if (!detail.isStreaming) {
          setStreamLabel(null);
        }
      }

      if (typeof detail.streamLabel === "string") {
        const normalized = detail.streamLabel.trim().slice(0, 255);
        setStreamLabel(normalized.length ? normalized : null);
      }

      if (detail.streamLabel === null) {
        setStreamLabel(null);
      }
    };

    applyVoiceState(getCachedVoiceState());

    const onVoiceStateSync = (event: Event) => {
      applyVoiceState((event as CustomEvent<VoiceStateSyncDetail>).detail);
    };

    const onCameraToggle = (event: Event) => {
      const customEvent = event as CustomEvent<{ isCameraOn?: boolean }>;
      if (typeof customEvent.detail?.isCameraOn !== "boolean") {
        return;
      }

      setIsCameraEnabled(customEvent.detail.isCameraOn);
      if (customEvent.detail.isCameraOn) {
        setCaptureIntent("camera");
        setIsStreaming(false);
        setStreamLabel(null);
      }
    };

    const onStreamToggle = (event: Event) => {
      const customEvent = event as CustomEvent<{ isStreaming?: boolean; streamLabel?: string | null }>;
      if (typeof customEvent.detail?.isStreaming === "boolean") {
        setIsStreaming(customEvent.detail.isStreaming);
        if (customEvent.detail.isStreaming) {
          setCaptureIntent("stream");
          setIsCameraEnabled(false);
        }
        if (!customEvent.detail.isStreaming) {
          setStreamLabel(null);
        }
      }

      if (typeof customEvent.detail?.streamLabel === "string") {
        const normalized = customEvent.detail.streamLabel.trim().slice(0, 255);
        setStreamLabel(normalized.length ? normalized : null);
      }

      if (customEvent.detail?.streamLabel === null) {
        setStreamLabel(null);
      }
    };

    window.addEventListener(VOICE_STATE_SYNC_EVENT, onVoiceStateSync as EventListener);
    window.addEventListener(VOICE_TOGGLE_CAMERA_EVENT, onCameraToggle as EventListener);
    window.addEventListener(VOICE_TOGGLE_STREAM_EVENT, onStreamToggle as EventListener);

    return () => {
      window.removeEventListener(VOICE_STATE_SYNC_EVENT, onVoiceStateSync as EventListener);
      window.removeEventListener(VOICE_TOGGLE_CAMERA_EVENT, onCameraToggle as EventListener);
      window.removeEventListener(VOICE_TOGGLE_STREAM_EVENT, onStreamToggle as EventListener);
    };
  }, [VOICE_TOGGLE_CAMERA_EVENT, VOICE_TOGGLE_STREAM_EVENT]);

  useEffect(() => {
    const wantsVideoCapture = captureIntent !== "none";

    if (!isLiveSession || !canConnect || !wantsVideoCapture) {
      setCameraError(null);
      setLocalMediaStream((existing) => {
        if (existing) {
          existing.getTracks().forEach((track) => track.stop());
        }
        return null;
      });
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      if (captureIntent === "camera") {
        syncCameraState(false);
        setCaptureIntent("none");
      }

      if (captureIntent === "stream") {
        syncStreamingState(false, null);
        setCaptureIntent("none");
      }

      setCameraError("Camera is not supported in this browser.");
      return;
    }

    let cancelled = false;

    const start = async () => {
      try {
        const stream = captureIntent === "stream"
          ? await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: false,
            })
          : await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: "user",
              },
              audio: false,
            });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (captureIntent === "stream") {
          const [videoTrack] = stream.getVideoTracks();
          const detectedLabel =
            typeof videoTrack?.label === "string" && videoTrack.label.trim().length
              ? videoTrack.label.trim().slice(0, 255)
              : null;

          syncStreamingState(true, detectedLabel);
          setCaptureIntent("stream");

          if (videoTrack) {
            videoTrack.onended = () => {
              setCaptureIntent("none");
              syncStreamingState(false, null);
            };
          }
        } else {
          const [videoTrack] = stream.getVideoTracks();
          syncCameraState(true);
          setCaptureIntent("camera");
          if (videoTrack) {
            videoTrack.onended = () => {
              setCaptureIntent("none");
              syncCameraState(false);
            };
          }
        }

        setCameraError(null);
        setLocalMediaStream((existing) => {
          if (existing) {
            existing.getTracks().forEach((track) => track.stop());
          }
          return stream;
        });
      } catch {
        if (captureIntent === "stream") {
          syncStreamingState(false, null);
        } else {
          syncCameraState(false);
        }
        setCaptureIntent("none");
        setCameraError(
          captureIntent === "stream"
            ? "Screen share was blocked. Allow display capture to stream."
            : "Camera access was blocked. Allow camera permissions to start video."
        );
      }
    };

    void start();

    return () => {
      cancelled = true;
      setLocalMediaStream((existing) => {
        if (existing) {
          existing.getTracks().forEach((track) => track.stop());
        }
        return null;
      });
    };
  }, [canConnect, captureIntent, isLiveSession, VOICE_TOGGLE_STREAM_EVENT]);

  useEffect(() => {
    if (!localVideoRef.current) {
      return;
    }

    localVideoRef.current.srcObject = localMediaStream;
    void localVideoRef.current.play().catch(() => {
      // autoplay can be blocked until the media element is interacted with
    });
  }, [localMediaStream]);

  useEffect(() => {
    localMediaStreamRef.current = localMediaStream;
  }, [localMediaStream]);

  const isLocalStage = stageMember?.profileId === currentProfileId;
  const stageRemoteStream = stageMember && stageMember.profileId !== currentProfileId
    ? remoteStreams[stageMember.profileId] ?? firstRemoteStreamEntry?.[1] ?? null
    : firstRemoteStreamEntry?.[1] ?? null;
  const stageRemoteStreamProfileId = firstRemoteStreamEntry?.[0] ?? null;
  const shouldShowRemoteStage = isLiveSession && Boolean(stageRemoteStream);
  const stageRemoteMember = stageMember && stageRemoteStream
    ? stageMember.profileId !== currentProfileId
      ? stageMember
      : connectedMembersView.find((item) => item.profileId === stageRemoteStreamProfileId) ?? null
    : null;
  const shouldShowLocalPreview = isLiveSession && !shouldShowRemoteStage && (!stageMember || isLocalStage);
  const isConnectingVideo = shouldShowLocalPreview && !localMediaStream && !cameraError;
  const cameraOnMembers = useMemo(
    () => connectedMembersView.filter((item) => item.isCameraOn || item.isStreaming),
    [connectedMembersView]
  );
  const stageCameraMembers = useMemo(
    () => cameraOnMembers.filter((item) => item.memberId !== stageMember?.memberId),
    [cameraOnMembers, stageMember?.memberId]
  );
  const stageCameraPreviewMembers = stageCameraMembers.slice(0, 6);
  const hiddenStageCameraCount = Math.max(0, stageCameraMembers.length - stageCameraPreviewMembers.length);
  const remoteVideoCandidateMembers = useMemo(() => {
    return connectedMembersView.filter((item) => {
      if (!item.profileId || item.profileId === currentProfileId) {
        return false;
      }

      const existingStatus = peerStatuses[item.profileId] ?? null;
      const existingTelemetry = peerTelemetry[item.profileId] ?? null;

      return Boolean(
        item.isCameraOn ||
          item.isStreaming ||
          item.profileId === stageMember?.profileId ||
          item.memberId === presentingMemberId ||
          item.isSpeaking ||
          existingStatus?.hasRemoteVideo ||
          existingTelemetry
      );
    });
  }, [connectedMembersView, currentProfileId, peerStatuses, peerTelemetry, presentingMemberId, stageMember?.profileId]);
  const subscribedRemoteMembers = useMemo(() => {
    const scoreMember = (member: MeetingMember) => {
      let score = 0;
      const status = peerStatuses[member.profileId] ?? null;
      const telemetry = peerTelemetry[member.profileId] ?? null;

      if (member.profileId === stageMember?.profileId) {
        score += 100000;
      }

      if (member.memberId === presentingMemberId) {
        score += 75000;
      }

      if (member.isStreaming) {
        score += 50000;
      }

      if (member.isSpeaking) {
        score += 25000;
      }

      if (member.isCameraOn) {
        score += 15000;
      }

      if (telemetry?.flowState === "flowing") {
        score += 8000;
      } else if (telemetry?.flowState === "stalled") {
        score += 4000;
      }

      if (status?.hasRemoteVideo) {
        score += 2000;
      }

      if (status?.connectionState === "connected") {
        score += 1000;
      }

      if (meetingCreatorProfileId && member.profileId === meetingCreatorProfileId) {
        score += 250;
      }

      return score;
    };

    return [...remoteVideoCandidateMembers]
      .sort((left, right) => {
        const scoreDelta = scoreMember(right) - scoreMember(left);
        if (scoreDelta !== 0) {
          return scoreDelta;
        }

        return left.displayName.localeCompare(right.displayName) || left.profileId.localeCompare(right.profileId);
      })
      .slice(0, WEBRTC_MAX_SIMULTANEOUS_REMOTE_VIDEO_PEERS);
  }, [meetingCreatorProfileId, peerStatuses, peerTelemetry, presentingMemberId, remoteVideoCandidateMembers, stageMember?.profileId]);
  const subscribedRemoteProfileIds = useMemo(
    () => new Set(subscribedRemoteMembers.map((item) => item.profileId)),
    [subscribedRemoteMembers]
  );
  const remoteVideoCandidateCount = remoteVideoCandidateMembers.length;
  const unsubscribedRemoteVideoCount = Math.max(0, remoteVideoCandidateCount - subscribedRemoteMembers.length);
  const remoteTransportMembers = useMemo(() => {
    return connectedMembersView
      .filter((item) => item.profileId && item.profileId !== currentProfileId)
      .map((item) => ({
        member: item,
        isSubscribed: subscribedRemoteProfileIds.has(item.profileId),
        status: peerStatuses[item.profileId] ?? null,
        telemetry: peerTelemetry[item.profileId] ?? null,
      }))
      .filter(({ isSubscribed, status, telemetry }) => isSubscribed || Boolean(status) || Boolean(telemetry));
  }, [connectedMembersView, currentProfileId, peerStatuses, peerTelemetry, subscribedRemoteProfileIds]);
  const hasRemoteTransportFailure = useMemo(() => {
    return remoteTransportMembers.some(({ status }) => {
      if (!status) {
        return false;
      }

      return status.iceConnectionState === "failed" || status.connectionState === "failed";
    });
  }, [remoteTransportMembers]);

  useEffect(() => {
    subscribedRemoteProfileIdsRef.current = subscribedRemoteProfileIds;
  }, [subscribedRemoteProfileIds]);

  useEffect(() => {
    if (!remoteStageVideoRef.current) {
      return;
    }

    remoteStageVideoRef.current.srcObject = stageRemoteStream;
    void remoteStageVideoRef.current.play().catch(() => {
      // autoplay can be blocked until the media element is interacted with
    });
  }, [stageRemoteStream]);

  useEffect(() => {
    if (!isLiveSession || typeof window === "undefined") {
      return;
    }

    let disposed = false;

    const updatePeerTrace = async () => {
      const entries = Array.from(peerConnectionsRef.current.entries());
      if (!entries.length) {
        return;
      }

      const telemetryEntries = await Promise.all(
        entries.map(async ([remoteProfileId, peerConnection]) => {
          try {
            const stats = await peerConnection.getStats();
            let inboundVideo: any = null;
            let outboundVideo: any = null;
            let candidatePair: any = null;

            stats.forEach((report: any) => {
              const mediaKind = getStatsMediaKind(report);

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

            const bytesReceived = Number(inboundVideo?.bytesReceived ?? 0);
            const framesDecoded = Number(inboundVideo?.framesDecoded ?? 0);
            const bytesSent = Number(outboundVideo?.bytesSent ?? 0);
            const framesSent = Number(outboundVideo?.framesSent ?? 0);
            const timestamp = Date.now();
            const previous = lastPeerTraceStatsRef.current.get(remoteProfileId);
            const elapsedSeconds = previous ? Math.max((timestamp - previous.timestamp) / 1000, 0.001) : 0;
            const bytesDelta = previous ? Math.max(bytesReceived - previous.bytesReceived, 0) : 0;
            const framesDelta = previous ? Math.max(framesDecoded - previous.framesDecoded, 0) : 0;
            const bytesSentDelta = previous ? Math.max(bytesSent - previous.bytesSent, 0) : 0;
            const framesSentDelta = previous ? Math.max(framesSent - previous.framesSent, 0) : 0;
            const hasFlowingVideo = bytesDelta > 0 || framesDelta > 0;
            const hasAnyVideoHistory = bytesReceived > 0 || framesDecoded > 0;
            const bitrateKbps = previous && elapsedSeconds > 0 ? Math.round((bytesDelta * 8) / elapsedSeconds / 1000) : null;
            const framesPerSecond = previous && elapsedSeconds > 0 ? Math.round((framesDelta / elapsedSeconds) * 10) / 10 : null;
            const sendBitrateKbps = previous && elapsedSeconds > 0 ? Math.round((bytesSentDelta * 8) / elapsedSeconds / 1000) : null;
            const framesSentPerSecond = previous && elapsedSeconds > 0 ? Math.round((framesSentDelta / elapsedSeconds) * 10) / 10 : null;
            const rttMs = Number.isFinite(Number(candidatePair?.currentRoundTripTime))
              ? Math.round(Number(candidatePair.currentRoundTripTime) * 1000)
              : null;
            const packetsLost = Number.isFinite(Number(inboundVideo?.packetsLost)) ? Number(inboundVideo.packetsLost) : null;
            const jitterMs = Number.isFinite(Number(inboundVideo?.jitter)) ? Math.round(Number(inboundVideo.jitter) * 1000) : null;
            const frameWidth = Number.isFinite(Number(inboundVideo?.frameWidth)) ? Number(inboundVideo.frameWidth) : 0;
            const frameHeight = Number.isFinite(Number(inboundVideo?.frameHeight)) ? Number(inboundVideo.frameHeight) : 0;
            const resolution = frameWidth > 0 && frameHeight > 0 ? `${frameWidth}x${frameHeight}` : null;

            lastPeerTraceStatsRef.current.set(remoteProfileId, {
              bytesReceived,
              framesDecoded,
              bytesSent,
              framesSent,
              timestamp,
            });

            let signalStrength: PeerTraceTelemetry["signalStrength"] = "none";
            if (hasAnyVideoHistory || hasFlowingVideo) {
              if (rttMs !== null && rttMs <= 120 && (packetsLost ?? 0) <= 2) {
                signalStrength = "excellent";
              } else if (rttMs !== null && rttMs <= 220 && (packetsLost ?? 0) <= 8) {
                signalStrength = "good";
              } else {
                signalStrength = "weak";
              }
            }

            const flowState: PeerTraceTelemetry["flowState"] = hasFlowingVideo
              ? "flowing"
              : hasAnyVideoHistory
                ? "stalled"
                : "idle";

            return [
              remoteProfileId,
              {
                flowState,
                signalStrength,
                bitrateKbps: toFiniteNumberOrNull(bitrateKbps),
                framesPerSecond: toFiniteNumberOrNull(framesPerSecond),
                framesDecoded,
                sendBitrateKbps: toFiniteNumberOrNull(sendBitrateKbps),
                framesSentPerSecond: toFiniteNumberOrNull(framesSentPerSecond),
                framesSent,
                packetsLost,
                jitterMs,
                rttMs,
                resolution,
                updatedAt: Date.now(),
              } satisfies PeerTraceTelemetry,
            ] as const;
          } catch {
            return [remoteProfileId, null] as const;
          }
        })
      );

      if (disposed) {
        return;
      }

      setPeerTelemetry((current) => {
        let changed = false;
        const next = { ...current };

        for (const [remoteProfileId, telemetry] of telemetryEntries) {
          if (!telemetry) {
            continue;
          }

          const previous = current[remoteProfileId];
          if (
            previous &&
            previous.flowState === telemetry.flowState &&
            previous.signalStrength === telemetry.signalStrength &&
            previous.bitrateKbps === telemetry.bitrateKbps &&
            previous.framesPerSecond === telemetry.framesPerSecond &&
            previous.framesDecoded === telemetry.framesDecoded &&
            previous.sendBitrateKbps === telemetry.sendBitrateKbps &&
            previous.framesSentPerSecond === telemetry.framesSentPerSecond &&
            previous.framesSent === telemetry.framesSent &&
            previous.packetsLost === telemetry.packetsLost &&
            previous.jitterMs === telemetry.jitterMs &&
            previous.rttMs === telemetry.rttMs &&
            previous.resolution === telemetry.resolution
          ) {
            continue;
          }

          next[remoteProfileId] = telemetry;
          changed = true;
        }

        return changed ? next : current;
      });
    };

    void updatePeerTrace();
    const timer = window.setInterval(() => {
      void updatePeerTrace();
    }, 1500);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [isLiveSession]);

  useEffect(() => {
    if (!isLiveSession || !canConnect || typeof window === "undefined") {
      return;
    }

    let disposed = false;

    const updatePeerStatus = (remoteProfileId: string, peerConnection: RTCPeerConnection) => {
      const hasRemoteVideo = Boolean(
        remoteStreamsRef.current.get(remoteProfileId)?.getVideoTracks().some((track) => track.readyState !== "ended") ??
          peerConnection
            .getReceivers()
            .some((receiver) => receiver.track?.kind === "video" && receiver.track.readyState !== "ended")
      );

      setPeerStatuses((current) => {
        const nextStatus = {
          connectionState: String(peerConnection.connectionState ?? "new"),
          iceConnectionState: String(peerConnection.iceConnectionState ?? "new"),
          signalingState: String(peerConnection.signalingState ?? "stable"),
          hasRemoteVideo,
        };
        const previousStatus = current[remoteProfileId];

        if (
          previousStatus &&
          previousStatus.connectionState === nextStatus.connectionState &&
          previousStatus.iceConnectionState === nextStatus.iceConnectionState &&
          previousStatus.signalingState === nextStatus.signalingState &&
          previousStatus.hasRemoteVideo === nextStatus.hasRemoteVideo
        ) {
          return current;
        }

        return {
          ...current,
          [remoteProfileId]: nextStatus,
        };
      });
    };

    const cleanupPeer = (remoteProfileId: string, options?: { preserveResetCooldown?: boolean }) => {
      const peerConnection = peerConnectionsRef.current.get(remoteProfileId);
      if (peerConnection) {
        peerConnection.onicecandidate = null;
        peerConnection.ontrack = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.onnegotiationneeded = null;
        peerConnection.close();
      }

      peerConnectionsRef.current.delete(remoteProfileId);
      peerVideoTransceiversRef.current.delete(remoteProfileId);
      makingOfferRef.current.delete(remoteProfileId);
      ignoreOfferRef.current.delete(remoteProfileId);
      settingRemoteAnswerPendingRef.current.delete(remoteProfileId);
      pendingIceCandidatesRef.current.delete(remoteProfileId);
      iceRestartAttemptedRef.current.delete(remoteProfileId);
      lastOfferSentAtRef.current.delete(remoteProfileId);
      lastRenegotiateRequestedAtRef.current.delete(remoteProfileId);
      if (!options?.preserveResetCooldown) {
        lastPeerResetAtRef.current.delete(remoteProfileId);
      }
      pendingRenegotiateRef.current.delete(remoteProfileId);
      lastPeerTraceStatsRef.current.delete(remoteProfileId);
      peerSignalDebugRef.current.delete(remoteProfileId);
      lastPeerTransportProgressAtRef.current.delete(remoteProfileId);
      remoteStreamsRef.current.delete(remoteProfileId);
      setPeerSignalDebugTick((value) => value + 1);
      setRelayBlockedPeers((current) => {
        if (!(remoteProfileId in current)) {
          return current;
        }

        const next = { ...current };
        delete next[remoteProfileId];
        return next;
      });
      setPeerTelemetry((current) => {
        if (!(remoteProfileId in current)) {
          return current;
        }

        const next = { ...current };
        delete next[remoteProfileId];
        return next;
      });
      setPeerStatuses((current) => {
        if (!(remoteProfileId in current)) {
          return current;
        }

        const next = { ...current };
        delete next[remoteProfileId];
        return next;
      });
      setRemoteStreams((current) => {
        if (!(remoteProfileId in current)) {
          return current;
        }

        const next = { ...current };
        delete next[remoteProfileId];
        return next;
      });
    };

    const markPeerTransportProgress = (remoteProfileId: string) => {
      lastPeerTransportProgressAtRef.current.set(remoteProfileId, Date.now());
    };

    const emitSignal = (targetProfileId: string, signal: WebRtcSignalPayload["signal"]) => {
      const currentSignalDebug = peerSignalDebugRef.current.get(targetProfileId) ?? {
        inboundSignals: 0,
        outboundSignals: 0,
        inboundCandidates: 0,
        outboundCandidates: 0,
        lastInboundDescriptionType: null,
        lastOutboundDescriptionType: null,
        lastInboundAt: null,
        lastOutboundAt: null,
        lastError: null,
        lastErrorAt: null,
      };
      peerSignalDebugRef.current.set(targetProfileId, {
        ...currentSignalDebug,
        outboundSignals: currentSignalDebug.outboundSignals + 1,
        outboundCandidates: currentSignalDebug.outboundCandidates + (signal.candidate ? 1 : 0),
        lastOutboundDescriptionType: signal.description?.type ?? currentSignalDebug.lastOutboundDescriptionType,
        lastOutboundAt: Date.now(),
      });
      setPeerSignalDebugTick((value) => value + 1);
      const socket = socketRef.current;
      if (!socket || !socketConnectedRef.current) {
        const pendingSignals = pendingSignalsRef.current.get(targetProfileId) ?? [];
        pendingSignals.push(signal);
        pendingSignalsRef.current.set(targetProfileId, pendingSignals);
        return;
      }

      socket.emit(WEBRTC_SIGNAL_EVENT, {
        senderProfileId: currentProfileId,
        targetProfileId,
        serverId,
        channelId,
        signal,
      } satisfies WebRtcSignalPayload);
    };

    const requestRemoteOffer = (remoteProfileId: string, minimumIntervalMs = 3000) => {
      const now = Date.now();
      const lastRequestedAt = lastRenegotiateRequestedAtRef.current.get(remoteProfileId) ?? 0;

      if (now - lastRequestedAt < minimumIntervalMs) {
        return false;
      }

      lastRenegotiateRequestedAtRef.current.set(remoteProfileId, now);
      emitSignal(remoteProfileId, { renegotiate: true });
      return true;
    };

    const syncLocalTracks = async (remoteProfileId: string, peerConnection: RTCPeerConnection) => {
      const localStream = localMediaStreamRef.current;
      const localVideoTrack = localStream?.getVideoTracks()[0] ?? null;
      const existingTransceivers = peerConnection.getTransceivers();
      let videoTransceiver = peerVideoTransceiversRef.current.get(remoteProfileId);

      if (!videoTransceiver || !existingTransceivers.includes(videoTransceiver)) {
        videoTransceiver =
          existingTransceivers.find((transceiver) => {
            return (
              transceiver.sender.track?.kind === "video" ||
              transceiver.receiver.track?.kind === "video" ||
              (transceiver as { kind?: string | null }).kind === "video"
            );
          }) ??
          existingTransceivers[0];
      }

      if (!videoTransceiver) {
        videoTransceiver = peerConnection.addTransceiver("video", {
          direction: localVideoTrack ? "sendrecv" : "recvonly",
        });
      }

      peerVideoTransceiversRef.current.set(remoteProfileId, videoTransceiver);

      const sender = videoTransceiver.sender;

      if (localVideoTrack) {
        if (videoTransceiver.direction !== "sendrecv") {
          videoTransceiver.direction = "sendrecv";
        }

        if (sender.track?.id !== localVideoTrack.id || sender.track.readyState === "ended") {
          await sender.replaceTrack(localVideoTrack);
        }

        return;
      }

      if (sender.track) {
        await sender.replaceTrack(null);
      }

      if (videoTransceiver.direction !== "recvonly") {
        videoTransceiver.direction = "recvonly";
      }
    };

    const renegotiatePeer = async (remoteProfileId: string, peerConnection: RTCPeerConnection) => {
      if (makingOfferRef.current.get(remoteProfileId) === true || peerConnection.signalingState !== "stable") {
        pendingRenegotiateRef.current.set(remoteProfileId, true);
        return;
      }

      try {
        pendingRenegotiateRef.current.set(remoteProfileId, false);
        makingOfferRef.current.set(remoteProfileId, true);
        await syncLocalTracks(remoteProfileId, peerConnection);
        const shouldRestartIce = iceRestartAttemptedRef.current.get(remoteProfileId) === true;
        const offer = await peerConnection.createOffer(shouldRestartIce ? { iceRestart: true } : undefined);
        await peerConnection.setLocalDescription(offer);
        lastOfferSentAtRef.current.set(remoteProfileId, Date.now());
        updatePeerStatusRef.current(remoteProfileId, peerConnection);

        if (peerConnection.localDescription) {
          emitSignal(remoteProfileId, { description: serializeSessionDescription(peerConnection.localDescription) });
        }
      } catch (error) {
        const currentSignalDebug = peerSignalDebugRef.current.get(remoteProfileId) ?? {
          inboundSignals: 0,
          outboundSignals: 0,
          inboundCandidates: 0,
          outboundCandidates: 0,
          lastInboundDescriptionType: null,
          lastOutboundDescriptionType: null,
          lastInboundAt: null,
          lastOutboundAt: null,
          lastError: null,
          lastErrorAt: null,
        };
        peerSignalDebugRef.current.set(remoteProfileId, {
          ...currentSignalDebug,
          lastError: error instanceof Error ? error.message : String(error ?? "Unknown renegotiation error"),
          lastErrorAt: Date.now(),
        });
        setPeerSignalDebugTick((value) => value + 1);
        // best effort renegotiation; connection state handlers will clean up failures
      } finally {
        makingOfferRef.current.set(remoteProfileId, false);

        if (pendingRenegotiateRef.current.get(remoteProfileId) && peerConnection.signalingState === "stable") {
          pendingRenegotiateRef.current.set(remoteProfileId, false);
          void renegotiatePeer(remoteProfileId, peerConnection);
        }
      }
    };

    const flushPendingSignals = () => {
      if (!socketRef.current || !socketConnectedRef.current) {
        return;
      }

      for (const [targetProfileId, signals] of Array.from(pendingSignalsRef.current.entries())) {
        if (!signals.length) {
          pendingSignalsRef.current.delete(targetProfileId);
          continue;
        }

        for (const signal of signals) {
          socketRef.current.emit(WEBRTC_SIGNAL_EVENT, {
            senderProfileId: currentProfileId,
            targetProfileId,
            serverId,
            channelId,
            signal,
          } satisfies WebRtcSignalPayload);
        }

        pendingSignalsRef.current.delete(targetProfileId);
      }
    };

    const ensurePeerConnection = (remoteProfileId: string) => {
      const existing = peerConnectionsRef.current.get(remoteProfileId);
      if (existing) {
        return existing;
      }

      const peerConnection = new RTCPeerConnection({
        iceServers: WEBRTC_ICE_SERVERS,
        iceCandidatePoolSize: 4,
      });
      peerConnectionsRef.current.set(remoteProfileId, peerConnection);
      markPeerTransportProgress(remoteProfileId);
      const videoTransceiver = peerConnection.addTransceiver("video", { direction: "recvonly" });
      peerVideoTransceiversRef.current.set(remoteProfileId, videoTransceiver);
      ignoreOfferRef.current.set(remoteProfileId, false);
      makingOfferRef.current.set(remoteProfileId, false);
      settingRemoteAnswerPendingRef.current.set(remoteProfileId, false);
      pendingIceCandidatesRef.current.set(remoteProfileId, []);
      iceRestartAttemptedRef.current.set(remoteProfileId, false);

      peerConnection.onicecandidate = (event) => {
        if (!event.candidate) {
          return;
        }

        emitSignal(remoteProfileId, { candidate: serializeIceCandidate(event.candidate) });
      };

      peerConnection.ontrack = (event) => {
        const [eventStream] = event.streams;
        const stream = eventStream ?? (() => {
          const existing = remoteStreamsRef.current.get(remoteProfileId) ?? new MediaStream();
          if (!existing.getTracks().some((track) => track.id === event.track.id)) {
            existing.addTrack(event.track);
          }
          return existing;
        })();

        remoteStreamsRef.current.set(remoteProfileId, stream);
        setRemoteStreams((current) => ({
          ...current,
          [remoteProfileId]: stream,
        }));
        markPeerTransportProgress(remoteProfileId);
        updatePeerStatusRef.current(remoteProfileId, peerConnection);
      };

      peerConnection.onconnectionstatechange = () => {
        markPeerTransportProgress(remoteProfileId);
        updatePeerStatusRef.current(remoteProfileId, peerConnection);

        if (peerConnection.connectionState === "closed") {
          cleanupPeer(remoteProfileId);
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        markPeerTransportProgress(remoteProfileId);
        updatePeerStatusRef.current(remoteProfileId, peerConnection);

        if (["connected", "completed"].includes(peerConnection.iceConnectionState)) {
          iceRestartAttemptedRef.current.set(remoteProfileId, false);
          return;
        }

        if (peerConnection.iceConnectionState !== "failed") {
          return;
        }

        if (iceRestartAttemptedRef.current.get(remoteProfileId) === true) {
          return;
        }

        iceRestartAttemptedRef.current.set(remoteProfileId, true);

        try {
          peerConnection.restartIce();
        } catch {
          // browser support varies; renegotiation below still retries transport setup
        }

        void renegotiatePeerRef.current(remoteProfileId, peerConnection);
      };

      updatePeerStatus(remoteProfileId, peerConnection);

      return peerConnection;
    };

    emitSignalRef.current = emitSignal;
    cleanupPeerRef.current = cleanupPeer;
    syncLocalTracksRef.current = syncLocalTracks;
    ensurePeerConnectionRef.current = ensurePeerConnection;
    renegotiatePeerRef.current = renegotiatePeer;
    updatePeerStatusRef.current = updatePeerStatus;

    const handleSignal = async (payload: WebRtcSignalPayload) => {
      if (disposed) {
        return;
      }

      if (
        payload.targetProfileId !== currentProfileId ||
        payload.senderProfileId === currentProfileId ||
        payload.serverId !== serverId ||
        payload.channelId !== channelId
      ) {
        return;
      }

      const remoteProfileId = payload.senderProfileId;
      const isSubscribedRemote = subscribedRemoteProfileIdsRef.current.has(remoteProfileId);
      const hasExistingPeer = peerConnectionsRef.current.has(remoteProfileId);
      const hasSubscriptionCapacity =
        subscribedRemoteProfileIdsRef.current.size < WEBRTC_MAX_SIMULTANEOUS_REMOTE_VIDEO_PEERS;

      if (!isSubscribedRemote && !hasExistingPeer && !hasSubscriptionCapacity) {
        return;
      }

      if (!isSubscribedRemote && hasExistingPeer && !hasSubscriptionCapacity) {
        cleanupPeerRef.current(remoteProfileId);
        return;
      }

      const peerConnection = ensurePeerConnectionRef.current(remoteProfileId);
      if (!peerConnection) {
        return;
      }
      const incomingDescription = payload.signal.description;
      const incomingCandidate = payload.signal.candidate;
      const incomingRenegotiate = payload.signal.renegotiate === true;
      const currentSignalDebug = peerSignalDebugRef.current.get(remoteProfileId) ?? {
        inboundSignals: 0,
        outboundSignals: 0,
        inboundCandidates: 0,
        outboundCandidates: 0,
        lastInboundDescriptionType: null,
        lastOutboundDescriptionType: null,
        lastInboundAt: null,
        lastOutboundAt: null,
        lastError: null,
        lastErrorAt: null,
      };
      peerSignalDebugRef.current.set(remoteProfileId, {
        ...currentSignalDebug,
        inboundSignals: currentSignalDebug.inboundSignals + 1,
        inboundCandidates: currentSignalDebug.inboundCandidates + (incomingCandidate ? 1 : 0),
        lastInboundDescriptionType: incomingDescription?.type ?? currentSignalDebug.lastInboundDescriptionType,
        lastInboundAt: Date.now(),
      });
      setPeerSignalDebugTick((value) => value + 1);
      const flushPendingIceCandidates = async () => {
        const pendingCandidates = pendingIceCandidatesRef.current.get(remoteProfileId) ?? [];
        if (!pendingCandidates.length) {
          return;
        }

        pendingIceCandidatesRef.current.set(remoteProfileId, []);

        for (const candidate of pendingCandidates) {
          await peerConnection.addIceCandidate(candidate);
        }
      };

      try {
        if (incomingRenegotiate) {
          await renegotiatePeerRef.current(remoteProfileId, peerConnection);
          return;
        }

        if (incomingDescription) {
          if (incomingDescription.type === "offer") {
            const polite = isPolitePeer(currentProfileId, remoteProfileId);
            const makingOffer = makingOfferRef.current.get(remoteProfileId) === true;
            const settingRemoteAnswerPending = settingRemoteAnswerPendingRef.current.get(remoteProfileId) === true;
            const readyForOffer = !makingOffer && (peerConnection.signalingState === "stable" || settingRemoteAnswerPending);
            const offerCollision = !readyForOffer;
            const shouldIgnoreOffer = !polite && offerCollision;

            ignoreOfferRef.current.set(remoteProfileId, shouldIgnoreOffer);
            if (shouldIgnoreOffer) {
              return;
            }

            if (offerCollision && peerConnection.signalingState !== "stable") {
              await peerConnection.setLocalDescription({ type: "rollback" });
            }

            await peerConnection.setRemoteDescription(incomingDescription);
            lastOfferSentAtRef.current.delete(remoteProfileId);
            settingRemoteAnswerPendingRef.current.set(remoteProfileId, false);
            await flushPendingIceCandidates();
            await syncLocalTracks(remoteProfileId, peerConnection);
            await peerConnection.setLocalDescription(await peerConnection.createAnswer());
            updatePeerStatusRef.current(remoteProfileId, peerConnection);

            if (pendingRenegotiateRef.current.get(remoteProfileId) && peerConnection.signalingState === "stable") {
              pendingRenegotiateRef.current.set(remoteProfileId, false);
              void renegotiatePeerRef.current(remoteProfileId, peerConnection);
            }

            if (peerConnection.localDescription) {
              emitSignal(remoteProfileId, { description: serializeSessionDescription(peerConnection.localDescription) });
            }
          } else if (incomingDescription.type === "answer") {
            ignoreOfferRef.current.set(remoteProfileId, false);
            settingRemoteAnswerPendingRef.current.set(remoteProfileId, true);
            await peerConnection.setRemoteDescription(incomingDescription);
            lastOfferSentAtRef.current.delete(remoteProfileId);
            settingRemoteAnswerPendingRef.current.set(remoteProfileId, false);
            await flushPendingIceCandidates();
            updatePeerStatusRef.current(remoteProfileId, peerConnection);

            if (pendingRenegotiateRef.current.get(remoteProfileId) && peerConnection.signalingState === "stable") {
              pendingRenegotiateRef.current.set(remoteProfileId, false);
              void renegotiatePeerRef.current(remoteProfileId, peerConnection);
            }
          } else {
            ignoreOfferRef.current.set(remoteProfileId, false);
            await peerConnection.setRemoteDescription(incomingDescription);
            lastOfferSentAtRef.current.delete(remoteProfileId);
            settingRemoteAnswerPendingRef.current.set(remoteProfileId, false);
            await flushPendingIceCandidates();
            updatePeerStatusRef.current(remoteProfileId, peerConnection);

            if (pendingRenegotiateRef.current.get(remoteProfileId) && peerConnection.signalingState === "stable") {
              pendingRenegotiateRef.current.set(remoteProfileId, false);
              void renegotiatePeerRef.current(remoteProfileId, peerConnection);
            }
          }
        } else if (incomingCandidate) {
          if (ignoreOfferRef.current.get(remoteProfileId)) {
            return;
          }

          if (!peerConnection.remoteDescription) {
            const pendingCandidates = pendingIceCandidatesRef.current.get(remoteProfileId) ?? [];
            pendingCandidates.push(incomingCandidate);
            pendingIceCandidatesRef.current.set(remoteProfileId, pendingCandidates);
            return;
          }

          await peerConnection.addIceCandidate(incomingCandidate);
        }
      } catch (error) {
        peerSignalDebugRef.current.set(remoteProfileId, {
          ...(peerSignalDebugRef.current.get(remoteProfileId) ?? currentSignalDebug),
          lastError: error instanceof Error ? error.message : String(error ?? "Unknown signal handling error"),
          lastErrorAt: Date.now(),
        });
        setPeerSignalDebugTick((value) => value + 1);
        cleanupPeer(remoteProfileId);
      }
    };

    const socket = sharedSocket as Socket | null;
    if (!socket) {
      return () => {
        disposed = true;
        socketRef.current = null;
        socketConnectedRef.current = false;
      };
    }

    socketRef.current = socket;

    const joinMeetingRooms = () => {
      socketConnectedRef.current = true;
      socket.emit("inaccord:join", {
        serverId,
        channelId,
        profileId: currentProfileId,
        meeting: true,
      });

      flushPendingSignals();

      for (const [remoteProfileId, peerConnection] of Array.from(peerConnectionsRef.current.entries())) {
        void renegotiatePeer(remoteProfileId, peerConnection);
      }
    };

    const onConnect = () => {
      joinMeetingRooms();
    };

    const onDisconnect = () => {
      socketConnectedRef.current = false;
    };

    const onSignal = (payload: WebRtcSignalPayload) => {
      void handleSignal(payload);
    };

    const onPeerPresence = (payload: WebRtcPeerPresencePayload) => {
      if (
        !payload ||
        payload.serverId !== serverId ||
        payload.channelId !== channelId ||
        payload.profileId === currentProfileId
      ) {
        return;
      }

      if (payload.state === "leave") {
        cleanupPeerRef.current(payload.profileId);
        return;
      }

      const isSubscribedRemote = subscribedRemoteProfileIdsRef.current.has(payload.profileId);
      const hasSubscriptionCapacity =
        subscribedRemoteProfileIdsRef.current.size < WEBRTC_MAX_SIMULTANEOUS_REMOTE_VIDEO_PEERS;

      if (!isSubscribedRemote && !hasSubscriptionCapacity) {
        return;
      }

      const peerConnection = ensurePeerConnectionRef.current(payload.profileId);
      if (!peerConnection) {
        return;
      }

      void renegotiatePeerRef.current(payload.profileId, peerConnection);
    };

    const onPeerSnapshot = (payload: WebRtcPeerSnapshotPayload) => {
      if (!payload || payload.serverId !== serverId || payload.channelId !== channelId) {
        return;
      }

      for (const profileId of payload.profileIds ?? []) {
        const remoteProfileId = String(profileId ?? "").trim();
        if (!remoteProfileId || remoteProfileId === currentProfileId) {
          continue;
        }

        const isSubscribedRemote = subscribedRemoteProfileIdsRef.current.has(remoteProfileId);
        const hasSubscriptionCapacity =
          subscribedRemoteProfileIdsRef.current.size < WEBRTC_MAX_SIMULTANEOUS_REMOTE_VIDEO_PEERS;

        if (!isSubscribedRemote && !hasSubscriptionCapacity) {
          continue;
        }

        const peerConnection = ensurePeerConnectionRef.current(remoteProfileId);
        if (!peerConnection) {
          continue;
        }

        void renegotiatePeerRef.current(remoteProfileId, peerConnection);
      }
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on(WEBRTC_SIGNAL_EVENT, onSignal);
    socket.on(WEBRTC_PEER_EVENT, onPeerPresence);
    socket.on(WEBRTC_PEER_SNAPSHOT_EVENT, onPeerSnapshot);

    if (socket.connected) {
      joinMeetingRooms();
    }

    return () => {
      disposed = true;
      socket.emit("inaccord:leave", {
          serverId,
          channelId,
          profileId: currentProfileId,
          meeting: true,
      });
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off(WEBRTC_SIGNAL_EVENT, onSignal);
      socket.off(WEBRTC_PEER_EVENT, onPeerPresence);
      socket.off(WEBRTC_PEER_SNAPSHOT_EVENT, onPeerSnapshot);
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      socketConnectedRef.current = false;
      pendingSignalsRef.current.clear();

      for (const remoteProfileId of Array.from(peerConnectionsRef.current.keys())) {
        cleanupPeerRef.current(remoteProfileId);
      }
    };
  }, [canConnect, channelId, currentProfileId, isLiveSession, serverId, sharedSocket]);

  useEffect(() => {
    if (!isLiveSession) {
      return;
    }

    const recoveryTimer = window.setInterval(() => {
      setPeerRecoveryTick((value) => value + 1);
    }, 2000);

    return () => {
      window.clearInterval(recoveryTimer);
    };
  }, [isLiveSession]);

  useEffect(() => {
    if (!isLiveSession) {
      return;
    }

    const remoteMembers = subscribedRemoteMembers;
    const remoteProfileIds = subscribedRemoteProfileIds;
    const nextRelayBlockedProfileIds = new Set<string>();

    for (const remoteMember of remoteMembers) {
      const remoteProfileId = remoteMember.profileId;
      const hadPeerConnection = peerConnectionsRef.current.has(remoteProfileId);
      const peerConnection = ensurePeerConnectionRef.current(remoteProfileId);
      if (peerConnection) {
        if (!hadPeerConnection) {
          void renegotiatePeerRef.current(remoteProfileId, peerConnection);
          continue;
        }

        if (
          !peerConnection.remoteDescription &&
          peerConnection.signalingState === "stable"
        ) {
          const lastOfferSentAt = lastOfferSentAtRef.current.get(remoteProfileId) ?? 0;
          if (Date.now() - lastOfferSentAt >= 3000) {
            void renegotiatePeerRef.current(remoteProfileId, peerConnection);
          }
        }

        const remoteStatus = peerStatuses[remoteProfileId] ?? null;
        const remoteTelemetry = peerTelemetry[remoteProfileId] ?? null;
        const expectsRemoteVideo = remoteMember.isCameraOn || remoteMember.isStreaming;
        if (
          expectsRemoteVideo &&
          !remoteStatus?.hasRemoteVideo &&
          peerConnection.signalingState === "stable"
        ) {
          const lastOfferSentAt = lastOfferSentAtRef.current.get(remoteProfileId) ?? 0;
          if (Date.now() - lastOfferSentAt >= 3000) {
            void renegotiatePeerRef.current(remoteProfileId, peerConnection);
          }
        }

        const staleOfferAgeMs = Date.now() - (lastOfferSentAtRef.current.get(remoteProfileId) ?? 0);
        const staleLocalOffer =
          remoteStatus?.signalingState === "have-local-offer" &&
          remoteTelemetry?.flowState !== "flowing" &&
          staleOfferAgeMs >= 6000;
        const lastPeerTransportProgressAt = lastPeerTransportProgressAtRef.current.get(remoteProfileId) ?? 0;
        const staleTransportAgeMs = lastPeerTransportProgressAt > 0 ? Date.now() - lastPeerTransportProgressAt : 0;
        const transportLooksStuck =
          expectsRemoteVideo &&
          !remoteStatus?.hasRemoteVideo &&
          staleTransportAgeMs >= WEBRTC_TRANSPORT_STALL_MS &&
          peerConnection.remoteDescription &&
          remoteStatus?.signalingState === "stable" &&
          (
            ["new", "connecting", "disconnected"].includes(remoteStatus?.connectionState ?? "new") ||
            ["new", "checking", "disconnected"].includes(remoteStatus?.iceConnectionState ?? "new") ||
            (
              remoteStatus?.connectionState === "connected" &&
              remoteTelemetry?.flowState !== "flowing"
            )
          );
        const relayLikelyRequired =
          !WEBRTC_HAS_TURN &&
          transportLooksStuck &&
          Boolean(peerConnection.remoteDescription) &&
          remoteStatus?.signalingState === "stable";

        if (relayLikelyRequired) {
          nextRelayBlockedProfileIds.add(remoteProfileId);
        }

        const peerLooksPoisoned =
          expectsRemoteVideo &&
          !relayLikelyRequired &&
          ((
            !remoteStatus?.hasRemoteVideo &&
            (!peerConnection.remoteDescription ||
              remoteStatus?.iceConnectionState === "failed" ||
              remoteStatus?.connectionState === "failed")
          ) ||
            staleLocalOffer ||
            transportLooksStuck);

        if (peerLooksPoisoned) {
          const lastPeerResetAt = lastPeerResetAtRef.current.get(remoteProfileId) ?? 0;
          if (Date.now() - lastPeerResetAt >= 8000) {
            lastPeerResetAtRef.current.set(remoteProfileId, Date.now());

            cleanupPeerRef.current(remoteProfileId, { preserveResetCooldown: true });

            const nextPeerConnection = ensurePeerConnectionRef.current(remoteProfileId);
            if (nextPeerConnection) {
              void renegotiatePeerRef.current(remoteProfileId, nextPeerConnection);
            }
          }
        }
      }
    }

    for (const remoteProfileId of Array.from(peerConnectionsRef.current.keys())) {
      if (!remoteProfileIds.has(remoteProfileId)) {
        cleanupPeerRef.current(remoteProfileId);
      }
    }

    setRelayBlockedPeers((current) => {
      const next = Object.fromEntries(
        Array.from(nextRelayBlockedProfileIds.values()).map((profileId) => [profileId, true])
      );

      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(next);

      if (
        currentKeys.length === nextKeys.length &&
        currentKeys.every((profileId) => next[profileId] === true)
      ) {
        return current;
      }

      return next;
    });
  }, [currentProfileId, isLiveSession, peerRecoveryTick, peerStatuses, peerTelemetry, subscribedRemoteMembers, subscribedRemoteProfileIds]);

  useEffect(() => {
    if (!isLiveSession) {
      return;
    }

    const currentVideoTrack = localMediaStream?.getVideoTracks()[0] ?? null;
    const nextTrackToken = currentVideoTrack ? `${currentVideoTrack.id}:${currentVideoTrack.readyState}` : "none";

    const previousTrackToken = lastLocalVideoTrackTokenRef.current;
    if (previousTrackToken === nextTrackToken) {
      return;
    }

    lastLocalVideoTrackTokenRef.current = nextTrackToken;

    if (previousTrackToken === null && nextTrackToken === "none") {
      return;
    }

    for (const [remoteProfileId, peerConnection] of Array.from(peerConnectionsRef.current.entries())) {
      void syncLocalTracksRef.current(remoteProfileId, peerConnection).catch(() => {
        // renegotiation below remains the authoritative recovery path
      });

      void renegotiatePeerRef.current(remoteProfileId, peerConnection);
    }
  }, [channelId, currentProfileId, isLiveSession, localMediaStream, serverId]);

  useEffect(() => {
    if (!isPopoutView || typeof document === "undefined") {
      return;
    }

    const previousTitle = document.title;
    document.title = "In-Accord Meeting";

    return () => {
      document.title = previousTitle;
    };
  }, [isPopoutView]);

  useEffect(() => {
    if (!contextMenuState) {
      return;
    }

    const onDismiss = () => setContextMenuState(null);
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenuState(null);
      }
    };

    window.addEventListener("click", onDismiss);
    window.addEventListener("resize", onDismiss);
    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("click", onDismiss);
      window.removeEventListener("resize", onDismiss);
      window.removeEventListener("keydown", onEscape);
    };
  }, [contextMenuState]);

  const onPopoutMeeting = () => {
    if (typeof window === "undefined") {
      return;
    }

    const url = `${normalizedMeetingPopoutPath}?live=true`;
    const width = 1280;
    const height = 820;
    const left = Math.max(0, Math.round((window.screen.width - width) / 2));
    const top = Math.max(0, Math.round((window.screen.height - height) / 2));
    const electronApi = (window as Window & { electronAPI?: ElectronMeetingPopoutApi }).electronAPI;

    if (typeof electronApi?.openMeetingPopout === "function") {
      void electronApi.openMeetingPopout(url).catch(() => {
        window.open(
          url,
          `inaccord-meeting-${channelId}`,
          `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
        );
      });

      router.replace(`${normalizedChannelPath}?popoutChat=true`);
      return;
    }

    window.open(
      url,
      `inaccord-meeting-${channelId}`,
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    router.replace(`${normalizedChannelPath}?popoutChat=true`);
  };

  const onJoinMeeting = () => {
    if (typeof window === "undefined") {
      return;
    }

    router.replace(`${normalizedChannelPath}?live=true`);
  };

  const onLeaveMeeting = () => {
    if (typeof window === "undefined") {
      return;
    }

    router.replace(`${normalizedChannelPath}?live=false`);
  };

  const onClosePopout = () => {
    if (typeof window === "undefined") {
      return;
    }

    const fallbackUrl = `${normalizedChannelPath}?live=true`;

    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          {
            type: "inaccord:meeting-popback",
            serverId,
            channelId,
          },
          window.location.origin
        );
        window.opener.focus();
      }
    } catch {
      // cross-window access can fail; fallback below keeps meeting in channel route
    }

    window.close();

    if (!window.closed) {
      router.replace(fallbackUrl);
    }
  };

  useEffect(() => {
    if (isPopoutView || typeof window === "undefined") {
      return;
    }

    const syncBackToMeeting = () => {
      const targetUrl = `${normalizedChannelPath}?live=true`;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (currentUrl === targetUrl) {
        return;
      }

      setShowPopbackNotice(true);
      router.replace(targetUrl);
    };

    const onPopbackMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const data = event.data as
        | {
            type?: string;
            serverId?: string;
            channelId?: string;
          }
        | undefined;

      if (data?.type !== "inaccord:meeting-popback") {
        return;
      }

      if (data.serverId !== serverId || data.channelId !== channelId) {
        return;
      }

      syncBackToMeeting();
    };

    window.addEventListener("message", onPopbackMessage);

    return () => {
      window.removeEventListener("message", onPopbackMessage);
    };
  }, [channelId, isPopoutView, normalizedChannelPath, router, serverId]);

  useEffect(() => {
    if (!showPopbackNotice || typeof window === "undefined") {
      return;
    }

    const timer = window.setTimeout(() => {
      setShowPopbackNotice(false);
    }, 1500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [showPopbackNotice]);

  const onMinimizePopout = () => {
    if (typeof window === "undefined") {
      return;
    }

    window.blur();
  };

  const syncStreamingState = (
    nextStreaming: boolean,
    nextStreamLabel: string | null = null,
    options?: { preserveCaptureIntent?: boolean }
  ) => {
    setIsStreaming(nextStreaming);
    if (!options?.preserveCaptureIntent) {
      setCaptureIntent(nextStreaming ? "stream" : "none");
    }
    if (nextStreaming) {
      setIsCameraEnabled(false);
      window.dispatchEvent(new CustomEvent(VOICE_TOGGLE_CAMERA_EVENT, { detail: { isCameraOn: false } }));
    }
    setStreamLabel(nextStreaming ? nextStreamLabel : null);
    window.dispatchEvent(
      new CustomEvent(VOICE_TOGGLE_STREAM_EVENT, {
        detail: {
          isStreaming: nextStreaming,
          streamLabel: nextStreaming ? nextStreamLabel : null,
        },
      })
    );
  };

  const syncCameraState = (nextCameraEnabled: boolean, options?: { preserveCaptureIntent?: boolean }) => {
    setIsCameraEnabled(nextCameraEnabled);
    if (!options?.preserveCaptureIntent) {
      setCaptureIntent(nextCameraEnabled ? "camera" : "none");
    }
    if (nextCameraEnabled) {
      setIsStreaming(false);
      setStreamLabel(null);
      window.dispatchEvent(
        new CustomEvent(VOICE_TOGGLE_STREAM_EVENT, {
          detail: {
            isStreaming: false,
            streamLabel: null,
          },
        })
      );
    }

    window.dispatchEvent(
      new CustomEvent(VOICE_TOGGLE_CAMERA_EVENT, {
        detail: {
          isCameraOn: nextCameraEnabled,
        },
      })
    );
  };

  const toggleCameraCapture = () => {
    const next = !(isCameraEnabled || captureIntent === "camera");
    if (next) {
      setCaptureIntent("camera");
      setCameraError(null);
      syncStreamingState(false, null, { preserveCaptureIntent: true });
      return;
    }

    setCaptureIntent("none");
    syncCameraState(false);
  };

  const toggleStreamCapture = () => {
    const next = !(isStreaming || captureIntent === "stream");
    if (next) {
      setCaptureIntent("stream");
      setCameraError(null);
      syncCameraState(false, { preserveCaptureIntent: true });
      return;
    }

    setCaptureIntent("none");
    syncStreamingState(false, null);
  };
  const runParticipantAction = async (
    action: "mute" | "unmute" | "kick" | "hidevideo" | "showvideo" | "hidestream" | "showstream",
    targetMemberId: string
  ) => {
    const endpoint = `/api/channels/${encodeURIComponent(channelId)}/voice-state?serverId=${encodeURIComponent(serverId)}`;

    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        targetMemberId,
      }),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "Unable to perform action");
      throw new Error(message || "Unable to perform action");
    }
  };

  const reportParticipant = async (targetProfileId: string) => {
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        targetType: "USER",
        targetId: targetProfileId,
        reason: "Meeting participant report",
        details: `Reported from meeting ${meetingName}`,
      }),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "Unable to report user");
      throw new Error(message || "Unable to report user");
    }
  };

  const getAvatarInitials = (displayName: string) => {
    const normalized = displayName.trim();
    if (!normalized) {
      return "?";
    }

    const segments = normalized.split(/\s+/).filter(Boolean);
    if (segments.length === 1) {
      return segments[0].slice(0, 2).toUpperCase();
    }

    return `${segments[0][0] ?? ""}${segments[1][0] ?? ""}`.toUpperCase();
  };

  const contextMenuMember = contextMenuState
    ? connectedMembersView.find((member) => member.memberId === contextMenuState.memberId) ?? null
    : null;
  const stageMemberTransportStatus = stageMember?.profileId ? peerStatuses[stageMember.profileId] ?? null : null;
  const stageMemberTelemetry = stageMember?.profileId ? peerTelemetry[stageMember.profileId] ?? null : null;
  const stageMemberRelayBlocked = Boolean(stageMember?.profileId && relayBlockedPeers[stageMember.profileId]);
  const relayBlockedTransportMembers = remoteTransportMembers.filter(({ member }) => relayBlockedPeers[member.profileId]);
  const stageMemberStatusText = !stageMember
    ? ""
    : stageMember.profileId === currentProfileId
      ? stageMember.isStreaming
        ? getStreamStageText(stageMember.streamLabel)
        : stageMember.isCameraOn
          ? "Camera live"
          : "Audio only"
      : stageRemoteStream
        ? stageMember.isStreaming
          ? getStreamStageText(stageMember.streamLabel)
          : stageMember.isCameraOn
            ? "Camera live"
            : "Audio only"
        : stageMemberTelemetry?.flowState === "flowing"
          ? stageMember.isStreaming
            ? `${getStreamStageText(stageMember.streamLabel)} • ${stageMemberTelemetry.signalStrength}`
            : `Camera live • ${stageMemberTelemetry.signalStrength}`
        : stageMemberTelemetry?.flowState === "stalled"
            ? stageMember.isStreaming
              ? "Stream stalled"
              : "Camera stalled"
        : stageMemberRelayBlocked
          ? stageMember.isStreaming
            ? "Stream relay required"
            : "Camera relay required"
        : stageMemberTransportStatus?.iceConnectionState === "failed" || stageMemberTransportStatus?.connectionState === "failed"
          ? stageMember.isStreaming
            ? "Stream transport failed"
            : stageMember.isCameraOn
              ? "Camera transport failed"
              : "Audio transport failed"
          : stageMember.isStreaming
            ? "Connecting stream..."
            : stageMember.isCameraOn
              ? "Connecting camera..."
              : "Audio only";

    useEffect(() => {
      if (!onDebugProbeUpdate) {
        return;
      }

      const localVideoTrack = localMediaStream?.getVideoTracks()?.[0] ?? null;
      onDebugProbeUpdate({
        currentProfileId,
        socketConnected: Boolean(socketRef.current?.connected),
        captureIntent,
        meshRemoteVideoLimit: WEBRTC_MAX_SIMULTANEOUS_REMOTE_VIDEO_PEERS,
        subscribedRemoteVideoCount: subscribedRemoteMembers.length,
        totalRemoteVideoCandidates: remoteVideoCandidateCount,
        isCameraEnabled,
        isStreaming,
        cameraError,
        localVideoTrackReady: Boolean(localVideoTrack && localVideoTrack.readyState === "live"),
        localVideoTrackState: localVideoTrack?.readyState ?? null,
        stageMemberProfileId: stageMember?.profileId ?? null,
        stageMemberStatusText,
        hasStageRemoteStream: Boolean(stageRemoteStream?.getVideoTracks().length),
        remoteTransportMembers: remoteTransportMembers.map(({ member, isSubscribed, status, telemetry }) => {
          const peerConnection = peerConnectionsRef.current.get(member.profileId);
          const videoTransceivers = (peerConnection?.getTransceivers() ?? [])
            .filter((transceiver) => {
              return (
                transceiver.sender.track?.kind === "video" ||
                transceiver.receiver.track?.kind === "video" ||
                (transceiver as { kind?: string | null }).kind === "video"
              );
            })
            .map((transceiver) => ({
              mid: transceiver.mid ?? null,
              direction: String(transceiver.direction ?? "unknown"),
              currentDirection: transceiver.currentDirection ?? null,
              senderTrackId: transceiver.sender.track?.id ?? null,
              senderTrackState: transceiver.sender.track?.readyState ?? null,
              receiverTrackId: transceiver.receiver.track?.id ?? null,
              receiverTrackState: transceiver.receiver.track?.readyState ?? null,
            }));

          return {
            profileId: member.profileId,
            displayName: member.displayName,
            isSubscribed,
            status,
            telemetry,
            signalDebug: peerSignalDebugRef.current.get(member.profileId) ?? null,
            videoTransceivers,
          };
        }),
      });
    }, [
      cameraError,
      captureIntent,
      currentProfileId,
      isCameraEnabled,
      isStreaming,
      localMediaStream,
      onDebugProbeUpdate,
      remoteVideoCandidateCount,
      remoteTransportMembers,
      subscribedRemoteMembers.length,
      stageMember?.profileId,
      stageMemberStatusText,
      stageRemoteStream,
    ]);

  return (
    <div
      suppressHydrationWarning
      className={`mt-4 grid gap-4 ${
        hideParticipantsSidebar
          ? ""
          : isPopoutView
            ? "grid-cols-[minmax(0,1fr)_240px]"
            : "lg:grid-cols-[minmax(0,1fr)_220px]"
      }`}
    >
      <div className="space-y-3">
        {showPopbackNotice && !isPopoutView ? (
          <div className="rounded-md border border-emerald-400/45 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100">
            Popout closed • meeting restored
          </div>
        ) : null}

        {isLiveSession && relayBlockedTransportMembers.length > 0 ? (
          <div className="rounded-md border border-amber-400/45 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-100">
            Video relay is not configured. Remote camera and screen-share can stay stuck until TURN or the SFU meeting transport is configured.
          </div>
        ) : null}

        {isLiveSession && isMeetingCreator && hasRemoteTransportFailure && !WEBRTC_HAS_TURN ? (
          <div className="rounded-md border border-amber-400/45 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-100">
            TURN relay is not configured. Remote camera and screen-share between different networks can fail until relay credentials are provided.
          </div>
        ) : null}

        {isLiveSession && remoteTransportMembers.length ? (
          <div className="rounded-md border border-border/60 bg-background/70 px-3 py-2 text-[11px] text-zinc-300">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 font-semibold uppercase tracking-[0.08em] text-zinc-400">
              <span>Media transport</span>
              <span className="text-[10px] text-zinc-500">
                {remoteTransportMembers.length}/{remoteVideoCandidateCount || remoteTransportMembers.length} active feeds
              </span>
            </div>
            {unsubscribedRemoteVideoCount > 0 ? (
              <div className="mb-2 rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-100">
                Mesh mode is bounded to {WEBRTC_MAX_SIMULTANEOUS_REMOTE_VIDEO_PEERS} remote video transports per client. {unsubscribedRemoteVideoCount} lower-priority feed{unsubscribedRemoteVideoCount === 1 ? " is" : "s are"} currently not attached.
              </div>
            ) : null}
            <div className="space-y-1.5">
              {remoteTransportMembers.map(({ member, isSubscribed, status, telemetry }) => {
                const statusLabel = !status
                  ? isSubscribed
                    ? "waiting"
                    : "budgeted"
                  : relayBlockedPeers[member.profileId]
                    ? "relay"
                  : telemetry?.flowState === "flowing"
                    ? "live"
                    : telemetry?.flowState === "stalled"
                      ? "stalled"
                      : status.hasRemoteVideo
                        ? "received"
                    : status.iceConnectionState === "failed" || status.connectionState === "failed"
                      ? "failed"
                      : status.connectionState === "connected"
                        ? "connected"
                        : status.connectionState === "connecting" || status.iceConnectionState === "checking"
                          ? "connecting"
                          : status.signalingState === "stable"
                            ? "stable"
                            : status.signalingState;

                return (
                  <div key={`transport-${member.memberId}`} className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-black/15 px-2 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-zinc-100">{member.displayName}</div>
                      <div className="mt-0.5 truncate text-[10px] text-zinc-400">
                        {!isSubscribed
                          ? "not attached in current mesh budget"
                          : relayBlockedPeers[member.profileId]
                            ? "relay required for remote video"
                          : telemetry
                          ? [
                              `flow:${telemetry.flowState}`,
                              `signal:${telemetry.signalStrength}`,
                              typeof telemetry.sendBitrateKbps === "number" ? `up:${telemetry.sendBitrateKbps} kbps` : null,
                              typeof telemetry.bitrateKbps === "number" ? `down:${telemetry.bitrateKbps} kbps` : null,
                              typeof telemetry.framesSentPerSecond === "number" ? `upfps:${telemetry.framesSentPerSecond}` : null,
                              typeof telemetry.framesPerSecond === "number" ? `downfps:${telemetry.framesPerSecond}` : null,
                              telemetry.resolution,
                              telemetry.rttMs !== null ? `${telemetry.rttMs} ms` : null,
                            ]
                              .filter(Boolean)
                              .join(" • ")
                          : "awaiting trace"}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        statusLabel === "live"
                          ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
                          : statusLabel === "relay"
                            ? "border-amber-400/50 bg-amber-500/15 text-amber-100"
                          : statusLabel === "stalled"
                            ? "border-amber-400/50 bg-amber-500/15 text-amber-200"
                            : statusLabel === "failed"
                              ? "border-rose-400/50 bg-rose-500/15 text-rose-200"
                              : statusLabel === "budgeted"
                                ? "border-amber-300/40 bg-amber-500/10 text-amber-100"
                              : statusLabel === "connecting"
                                ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-200"
                                : "border-zinc-500/50 bg-zinc-500/10 text-zinc-300"
                      }`}
                      title={status ? `pc=${status.connectionState} ice=${status.iceConnectionState} signal=${status.signalingState}` : "Peer connection not created yet"}
                    >
                      {statusLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-border/70 bg-[#1f232b] p-3">
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-linear-to-br from-[#2e323c] to-[#1b1f26]">
            {shouldShowRemoteStage ? (
              <video
                key={`remote-stage-${stageRemoteStreamProfileId ?? stageRemoteMember?.memberId ?? "unknown"}`}
                ref={remoteStageVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
                aria-label={`${stageRemoteMember?.displayName ?? "Remote participant"} live video`}
              />
            ) : shouldShowLocalPreview && localMediaStream ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
                aria-label="Local camera preview"
              />
            ) : isLiveSession && stageMember ? (
              <div className="text-center">
                <p className="text-base font-semibold text-zinc-100">
                  {stageMember.profileId === currentProfileId ? "You" : stageMember.displayName}
                </p>
                <p className="mt-1 text-xs text-zinc-300">
                  {isPresentingMode ? "Presenting" : stageMemberStatusText}
                </p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-base font-semibold text-zinc-100">Meeting stage</p>
                <p className="mt-1 text-xs text-zinc-300">
                  Join to start this video meeting.
                </p>
              </div>
            )}

            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-zinc-500/45 bg-black/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-200">
              <Users suppressHydrationWarning className="h-3 w-3" />
              {connectedMembersView.length} in meeting
            </span>

            {isPresentingMode ? (
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-indigo-400/45 bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-100">
                <Pin suppressHydrationWarning className="h-3 w-3" />
                Presenting mode
              </span>
            ) : null}

            {cameraError ? (
              <span
                className={`absolute left-3 right-3 rounded-md border border-rose-500/45 bg-rose-500/20 px-2 py-1 text-[10px] text-rose-100 ${
                  isLiveSession && stageCameraPreviewMembers.length ? "bottom-16" : "bottom-3"
                }`}
              >
                {cameraError}
              </span>
            ) : null}

            {isConnectingVideo ? (
              <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full border border-indigo-400/40 bg-indigo-500/20 px-2 py-1 text-[10px] font-semibold text-indigo-100">
                <Loader2 suppressHydrationWarning className="h-3 w-3 animate-spin" />
                Connecting video...
              </span>
            ) : null}

            {isLiveSession && stageCameraPreviewMembers.length ? (
              <div className="absolute inset-x-3 bottom-3 z-10 flex items-center gap-2 overflow-x-auto rounded-lg border border-white/15 bg-black/40 p-2 backdrop-blur-sm">
                {stageCameraPreviewMembers.map((item) => {
                  const isPinned = presentingMemberId === item.memberId;
                  const tileName = item.profileId === currentProfileId ? "You" : item.displayName;

                  return (
                    <button
                      key={`stage-camera-${item.memberId}`}
                      type="button"
                      onClick={() => setPreferredPresenter(item.memberId)}
                      className={`group relative h-16 min-w-28 overflow-hidden rounded-md border text-left transition hover:scale-[1.01] ${
                        isPinned
                          ? "border-indigo-300/80 bg-indigo-500/25"
                          : "border-zinc-300/35 bg-zinc-900/70"
                      }`}
                      title={isPinned ? `${tileName} (presenting)` : `Make ${tileName} presenter`}
                    >
                      {item.profileImageUrl ? (
                        <UserAvatar
                          src={item.profileImageUrl}
                          className="h-full w-full rounded-none border-0 object-cover"
                        />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-zinc-600/70 to-zinc-900/80 text-xs font-semibold text-white">
                          {getAvatarInitials(tileName)}
                        </span>
                      )}

                      <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-1.5 py-1 text-[10px] text-zinc-100">
                        <span className="max-w-[75%] truncate">{tileName}</span>
                        {item.isStreaming ? (
                          <ScreenShare suppressHydrationWarning className="h-3 w-3 shrink-0 text-indigo-200" />
                        ) : (
                          <Video suppressHydrationWarning className="h-3 w-3 shrink-0 text-emerald-300" />
                        )}
                      </span>
                    </button>
                  );
                })}

                {hiddenStageCameraCount > 0 ? (
                  <span className="inline-flex h-16 min-w-16 items-center justify-center rounded-md border border-zinc-300/40 bg-zinc-900/70 px-2 text-xs font-semibold text-zinc-100">
                    +{hiddenStageCameraCount}
                  </span>
                ) : null}
              </div>
            ) : null}

          </div>

          {!isPopoutView ? (
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
            {!canConnect ? (
              <span className="rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
                You can view, but not join this meeting.
              </span>
            ) : isLiveSession ? (
              <button
                type="button"
                onClick={onLeaveMeeting}
                className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300/40 bg-zinc-200/70 px-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-300/80 dark:border-zinc-600/70 dark:bg-zinc-700/60 dark:text-zinc-100 dark:hover:bg-zinc-600/70"
              >
                Leave meeting
              </button>
            ) : (
              <button
                type="button"
                onClick={onJoinMeeting}
                className="inline-flex h-9 items-center justify-center rounded-md bg-indigo-500 px-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
              >
                Join meeting
              </button>
            )}
            {isPopoutView ? (
              <button
                type="button"
                onClick={onClosePopout}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-rose-400/40 bg-rose-500/20 px-3 text-xs font-semibold uppercase tracking-wide text-rose-100 transition hover:bg-rose-500/30"
                title="Close popout and return to channel view"
              >
                CLOSE
              </button>
            ) : (
              <button
                type="button"
                onClick={onPopoutMeeting}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-white/20 bg-black/25 px-3 text-xs font-semibold text-zinc-100 transition hover:bg-black/35"
                title="Open meeting in a pop-out window"
              >
                <ExternalLink suppressHydrationWarning className="h-3.5 w-3.5" />
                Pop out meeting
              </button>
            )}

            {isLiveSession ? (
              <button
                type="button"
                onClick={toggleCameraCapture}
                className={`inline-flex h-9 items-center gap-1 rounded-md border px-3 text-xs font-semibold transition ${
                  isCameraEnabled || captureIntent === "camera"
                    ? "border-emerald-300/60 bg-emerald-500/30 text-emerald-100 hover:bg-emerald-500/40"
                    : "border-white/20 bg-black/25 text-zinc-100 hover:bg-black/35"
                }`}
                title={isCameraEnabled || captureIntent === "camera" ? "Turn camera off" : "Turn camera on"}
              >
                {isCameraEnabled || captureIntent === "camera" ? <Video suppressHydrationWarning className="h-3.5 w-3.5" /> : <VideoOff suppressHydrationWarning className="h-3.5 w-3.5" />}
                {isCameraEnabled || captureIntent === "camera" ? "Stop camera" : "Start camera"}
              </button>
            ) : null}

            {isLiveSession ? (
              <button
                type="button"
                onClick={toggleStreamCapture}
                className={`inline-flex h-9 items-center gap-1 rounded-md border px-3 text-xs font-semibold transition ${
                  isStreaming || captureIntent === "stream"
                    ? "border-indigo-300/60 bg-indigo-500/30 text-indigo-100 hover:bg-indigo-500/40"
                    : "border-white/20 bg-black/25 text-zinc-100 hover:bg-black/35"
                }`}
                title={isStreaming || captureIntent === "stream" ? "Stop stream" : "Start stream"}
              >
                {isStreaming || captureIntent === "stream" ? <ScreenShareOff suppressHydrationWarning className="h-3.5 w-3.5" /> : <ScreenShare suppressHydrationWarning className="h-3.5 w-3.5" />}
                {isStreaming || captureIntent === "stream" ? "Stop stream" : "Start stream"}
              </button>
            ) : null}

            {isLiveSession ? (
              <button
                type="button"
                onClick={() => {
                  if (!currentConnectedMember) {
                    return;
                  }
                  setPreferredPresenter(currentConnectedMember.memberId);
                }}
                disabled={!currentConnectedMember}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-indigo-400/50 bg-indigo-500/15 px-3 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                title={currentConnectedMember ? "Pin yourself to the stage" : "Join the meeting first"}
              >
                {currentConnectedMember?.isCameraOn ? <Pin suppressHydrationWarning className="h-3.5 w-3.5" /> : <VideoOff suppressHydrationWarning className="h-3.5 w-3.5" />}
                Present me
              </button>
            ) : null}

            {isLiveSession ? (
              <button
                type="button"
                onClick={() => setPreferredPresenter(null)}
                disabled={!isMeetingCreator || !presentingMemberId}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-white/20 bg-black/25 px-3 text-xs font-semibold text-zinc-200 transition hover:bg-black/35 disabled:cursor-not-allowed disabled:opacity-50"
                title={!isMeetingCreator ? "Only the channel creator can manage presenter" : presentingMemberId ? "Clear pinned presenter" : "No presenter is pinned"}
              >
                <PinOff suppressHydrationWarning className="h-3.5 w-3.5" />
                Clear presenter
              </button>
            ) : null}
          </div>
          ) : null}

        </div>

        {isPopoutView ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-3 z-70 px-3">
            <div className="pointer-events-auto mx-auto flex w-full max-w-5xl flex-col gap-2 rounded-2xl border border-white/20 bg-black/55 p-2.5 shadow-2xl shadow-black/45 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-center gap-2">
                {!canConnect ? (
                  <span className="rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
                    You can view, but not join this meeting.
                  </span>
                ) : isLiveSession ? (
                  <button
                    type="button"
                    onClick={onLeaveMeeting}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300/40 bg-zinc-200/70 px-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-300/80 dark:border-zinc-600/70 dark:bg-zinc-700/60 dark:text-zinc-100 dark:hover:bg-zinc-600/70"
                  >
                    Leave meeting
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onJoinMeeting}
                    className="inline-flex h-9 items-center justify-center rounded-md bg-indigo-500 px-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
                  >
                    Join meeting
                  </button>
                )}

                {isLiveSession ? (
                  <>
                    <button
                      type="button"
                      onClick={toggleCameraCapture}
                      className={`inline-flex h-9 items-center gap-1 rounded-md border px-3 text-xs font-semibold transition ${
                        isCameraEnabled || captureIntent === "camera"
                          ? "border-emerald-300/60 bg-emerald-500/30 text-emerald-100 hover:bg-emerald-500/40"
                          : "border-white/20 bg-black/25 text-zinc-100 hover:bg-black/35"
                      }`}
                      title={isCameraEnabled || captureIntent === "camera" ? "Turn camera off" : "Turn camera on"}
                    >
                      {isCameraEnabled || captureIntent === "camera" ? <Video suppressHydrationWarning className="h-3.5 w-3.5" /> : <VideoOff suppressHydrationWarning className="h-3.5 w-3.5" />}
                      {isCameraEnabled || captureIntent === "camera" ? "Stop camera" : "Start camera"}
                    </button>

                    <button
                      type="button"
                      onClick={toggleStreamCapture}
                      className={`inline-flex h-9 items-center gap-1 rounded-md border px-3 text-xs font-semibold transition ${
                        isStreaming || captureIntent === "stream"
                          ? "border-indigo-300/60 bg-indigo-500/30 text-indigo-100 hover:bg-indigo-500/40"
                          : "border-white/20 bg-black/25 text-zinc-100 hover:bg-black/35"
                      }`}
                      title={isStreaming || captureIntent === "stream" ? "Stop stream" : "Start stream"}
                    >
                      {isStreaming || captureIntent === "stream" ? <ScreenShareOff suppressHydrationWarning className="h-3.5 w-3.5" /> : <ScreenShare suppressHydrationWarning className="h-3.5 w-3.5" />}
                      {isStreaming || captureIntent === "stream" ? "Stop stream" : "Start stream"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!currentConnectedMember) {
                          return;
                        }
                        setPreferredPresenter(currentConnectedMember.memberId);
                      }}
                      disabled={!currentConnectedMember}
                      className="inline-flex h-9 items-center gap-1 rounded-md border border-indigo-400/50 bg-indigo-500/15 px-3 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                      title={currentConnectedMember ? "Pin yourself to the stage" : "Join the meeting first"}
                    >
                      {currentConnectedMember?.isCameraOn ? <Pin suppressHydrationWarning className="h-3.5 w-3.5" /> : <VideoOff suppressHydrationWarning className="h-3.5 w-3.5" />}
                      Present me
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreferredPresenter(null)}
                      disabled={!isMeetingCreator || !presentingMemberId}
                      className="inline-flex h-9 items-center gap-1 rounded-md border border-white/20 bg-black/25 px-3 text-xs font-semibold text-zinc-200 transition hover:bg-black/35 disabled:cursor-not-allowed disabled:opacity-50"
                      title={!isMeetingCreator ? "Only the channel creator can manage presenter" : presentingMemberId ? "Clear pinned presenter" : "No presenter is pinned"}
                    >
                      <PinOff suppressHydrationWarning className="h-3.5 w-3.5" />
                      Clear presenter
                    </button>
                  </>
                ) : null}

                <button
                  type="button"
                  onClick={onMinimizePopout}
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-white/20 bg-black/25 px-3 text-xs font-semibold uppercase tracking-wide text-zinc-100 transition hover:bg-black/35"
                  title="Minimize popout window"
                >
                  MINIMIZE
                </button>

                <button
                  type="button"
                  onClick={onClosePopout}
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-rose-400/40 bg-rose-500/20 px-3 text-xs font-semibold uppercase tracking-wide text-rose-100 transition hover:bg-rose-500/30"
                  title="Close popout and return to channel view"
                >
                  CLOSE
                </button>
              </div>

            </div>
          </div>
        ) : null}

        {isLiveSession && connectedMembersView.length && !hideParticipantStrip ? (
          <div className="rounded-xl border border-border/60 bg-background/70 p-2">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              Participant strip
            </p>
            <div
              className={
                forceVerticalParticipantStrip
                  ? "flex max-h-56 flex-col gap-2 overflow-y-auto pr-1"
                  : "flex gap-2 overflow-x-auto pb-1"
              }
            >
              {connectedMembersView.map((item) => {
                const isPinned = presentingMemberId === item.memberId;

                return (
                  <button
                    key={item.memberId}
                    type="button"
                    onClick={() => setPreferredPresenter(isPinned ? null : item.memberId)}
                    className={`${forceVerticalParticipantStrip ? "w-full" : "min-w-40"} rounded-lg border px-2 py-2 text-left transition ${
                      isPinned
                        ? "border-indigo-400/60 bg-indigo-500/15"
                        : "border-border/50 bg-background/80 hover:bg-background"
                    }`}
                    title={isPinned ? "Unpin from stage" : "Pin to stage"}
                  >
                    <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {item.profileId === currentProfileId ? "You" : item.displayName}
                    </p>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-300">
                      <span>{item.isMuted ? "Muted" : "Mic On"}</span>
                      <span>•</span>
                      <span>{item.isCameraOn ? "Camera" : "Audio"}</span>
                      {item.isStreaming ? (
                        <>
                          <span>•</span>
                          <span className="group relative inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-300/45 bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-100">
                            <ScreenShare suppressHydrationWarning className="h-3 w-3 shrink-0" />
                            <span className="max-w-36 truncate">
                              {item.streamLabel ? `Live: ${item.streamLabel}` : "Live"}
                            </span>
                            {item.streamLabel ? (
                              <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden max-w-56 rounded-md border border-indigo-300/45 bg-[#151a2a] px-2 py-1 text-[10px] text-indigo-50 shadow-lg group-hover:block group-focus-within:block">
                                {item.streamLabel}
                              </span>
                            ) : null}
                          </span>
                        </>
                      ) : null}
                    </div>
                    <div className="mt-2 inline-flex items-center gap-1 text-[10px] text-indigo-200">
                      {isPinned ? <PinOff suppressHydrationWarning className="h-3 w-3" /> : <Pin suppressHydrationWarning className="h-3 w-3" />}
                      {isPinned ? "Unpin" : "Pin to stage"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {hideParticipantsSidebar ? null : (
      <aside className="relative rounded-2xl border border-border/70 bg-background/60 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
          Meeting participants
        </p>
        {connectedMembersView.length ? (
          <ul className="space-y-1.5">
            {connectedMembersView.map((item) => {
              const isPinned = presentingMemberId === item.memberId;
              const displayName = item.profileId === currentProfileId ? "You" : item.displayName;

              return (
                <li
                  key={item.memberId}
                  onContextMenu={(event) => {
                    if (!isPopoutView || !isMeetingCreator) {
                      return;
                    }

                    event.preventDefault();
                    setContextMenuState({
                      memberId: item.memberId,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                  className={`rounded-md border px-2 py-1.5 ${
                    isPinned
                      ? "border-indigo-400/55 bg-indigo-500/15"
                      : "border-border/50 bg-background/70"
                  } ${isPopoutView && isMeetingCreator ? "cursor-context-menu" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm text-zinc-900 dark:text-zinc-100">{displayName}</p>
                    <div className="flex items-center gap-1">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                          item.isSpeaking
                            ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300"
                            : "border-rose-400/60 bg-rose-500/20 text-rose-300"
                        }`}
                        title={item.isSpeaking ? "Speaking" : "Idle"}
                      >
                        <Activity suppressHydrationWarning className="h-3.5 w-3.5" />
                      </span>
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                          item.isMuted
                            ? "border-rose-400/60 bg-rose-500/20 text-rose-300"
                            : "border-emerald-400/60 bg-emerald-500/20 text-emerald-300"
                        }`}
                        title={item.isMuted ? "Mic Off" : "Mic On"}
                      >
                        <Mic suppressHydrationWarning className="h-3.5 w-3.5" />
                      </span>
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                          item.isCameraOn
                            ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300"
                            : "border-rose-400/60 bg-rose-500/20 text-rose-300"
                        }`}
                        title={item.isCameraOn ? "Camera On" : "Camera Off"}
                      >
                        <Video suppressHydrationWarning className="h-3.5 w-3.5" />
                      </span>
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                          item.isStreaming
                            ? "border-indigo-300/60 bg-indigo-500/20 text-indigo-100"
                            : "border-zinc-500/60 bg-zinc-700/30 text-zinc-300"
                        }`}
                        title={
                          item.isStreaming
                            ? getStreamTooltipText(item.streamLabel)
                            : "Not streaming"
                        }
                      >
                        <ScreenShare suppressHydrationWarning className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                  {item.isStreaming ? (
                    <div className="mt-1">
                      <span className="group relative inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-300/45 bg-indigo-500/20 px-2 py-0.5 text-[10px] font-medium text-indigo-100">
                        <ScreenShare suppressHydrationWarning className="h-3 w-3 shrink-0" />
                        <span className="max-w-40 truncate">
                          {getStreamBadgeText(item.streamLabel)}
                        </span>
                        {item.streamLabel ? (
                          <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden max-w-56 rounded-md border border-indigo-300/45 bg-[#151a2a] px-2 py-1 text-[10px] text-indigo-50 shadow-lg group-hover:block group-focus-within:block">
                            {item.streamLabel}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">No one connected yet.</p>
        )}

        {isPopoutView && isMeetingCreator && contextMenuState && contextMenuMember ? (
          <div
            className="fixed z-120 min-w-44 rounded-md border border-white/15 bg-[#17181c] p-1 text-xs text-zinc-100 shadow-2xl shadow-black/50"
            style={{ left: contextMenuState.x, top: contextMenuState.y }}
            role="menu"
          >
            <button
              type="button"
              onClick={() => {
                setPreferredPresenter(contextMenuMember.memberId);
                setContextMenuState(null);
              }}
              className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left transition hover:bg-white/10"
            >
              <span>Make Presenter</span>
              <Pin suppressHydrationWarning className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                void runParticipantAction(
                  contextMenuMember.isMuted ? "unmute" : "mute",
                  contextMenuMember.memberId
                )
                  .catch((error) => {
                    window.alert(`Action failed: ${error instanceof Error ? error.message : "Unknown error"}`);
                  })
                  .finally(() => {
                    setContextMenuState(null);
                  });
              }}
              className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left transition hover:bg-white/10"
            >
              <span>{contextMenuMember.isMuted ? "Unmute participant" : "Mute participant"}</span>
              <Mic suppressHydrationWarning className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (contextMenuMember.isCameraOn) {
                  const shouldHideVideo = window.confirm(
                    `Hide video for ${contextMenuMember.displayName ?? "this participant"}?`
                  );

                  if (!shouldHideVideo) {
                    return;
                  }
                }

                void runParticipantAction(
                  contextMenuMember.isCameraOn ? "hidevideo" : "showvideo",
                  contextMenuMember.memberId
                )
                  .catch((error) => {
                    window.alert(`Action failed: ${error instanceof Error ? error.message : "Unknown error"}`);
                  })
                  .finally(() => {
                    setContextMenuState(null);
                  });
              }}
              className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left transition hover:bg-white/10"
            >
              <span>{contextMenuMember.isCameraOn ? "Hide Video" : "Show Video"}</span>
              <Video suppressHydrationWarning className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (contextMenuMember.isStreaming) {
                  const shouldHideStream = window.confirm(
                    `Stop stream for ${contextMenuMember.displayName ?? "this participant"}?`
                  );

                  if (!shouldHideStream) {
                    return;
                  }
                }

                void runParticipantAction(
                  contextMenuMember.isStreaming ? "hidestream" : "showstream",
                  contextMenuMember.memberId
                )
                  .catch((error) => {
                    window.alert(`Action failed: ${error instanceof Error ? error.message : "Unknown error"}`);
                  })
                  .finally(() => {
                    setContextMenuState(null);
                  });
              }}
              className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left transition hover:bg-white/10"
            >
              <span>{contextMenuMember.isStreaming ? "Stop Stream" : "Allow Stream"}</span>
              <ScreenShare suppressHydrationWarning className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                const shouldKick = window.confirm(
                  `Kick ${contextMenuMember.displayName ?? "this participant"} from the meeting?`
                );

                if (!shouldKick) {
                  return;
                }

                void runParticipantAction("kick", contextMenuMember.memberId)
                  .catch((error) => {
                    window.alert(`Action failed: ${error instanceof Error ? error.message : "Unknown error"}`);
                  })
                  .finally(() => {
                    setContextMenuState(null);
                  });
              }}
              className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left transition hover:bg-white/10"
            >
              <span>Kick from meeting</span>
              <Video suppressHydrationWarning className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                void reportParticipant(contextMenuMember.profileId)
                  .catch((error) => {
                    window.alert(`Report failed: ${error instanceof Error ? error.message : "Unknown error"}`);
                  })
                  .finally(() => {
                    setContextMenuState(null);
                  });
              }}
              className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left transition hover:bg-white/10"
            >
              <span>Report participant</span>
              <Activity suppressHydrationWarning className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        {!isPopoutView ? (
          <div className="mt-4 rounded-lg border border-border/60 bg-background/70 p-2.5 text-[11px] text-zinc-500 dark:text-zinc-300">
            <p className="inline-flex items-center gap-1 font-semibold text-zinc-800 dark:text-zinc-100">
              <Video suppressHydrationWarning className="h-3.5 w-3.5" />
              Teams-style tip
            </p>
            <p className="mt-1">Pin a participant to keep them on stage during the meeting.</p>
          </div>
        ) : null}
      </aside>
      )}
    </div>
  );
};
