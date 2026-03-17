"use client";

import { useRouter } from "next/navigation";
import { Activity, ExternalLink, Loader2, Mic, Pin, PinOff, ScreenShare, ScreenShareOff, Users, Video, VideoOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConnectionState,
  LocalTrackPublication,
  LocalVideoTrack,
  RemoteAudioTrack,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteVideoTrack,
  Room,
  RoomEvent,
  Track,
  TrackPublication,
} from "livekit-client";

import { UserAvatar } from "@/components/user-avatar";
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

type RemoteVideoSources = {
  camera: RemoteVideoTrack | null;
  screen: RemoteVideoTrack | null;
};

const VOICE_TOGGLE_STREAM_EVENT = "inaccord:voice-toggle-stream";
const VOICE_TOGGLE_CAMERA_EVENT = "inaccord:voice-toggle-camera";

const buildTransportStatus = (roomState: ConnectionState, hasRemoteVideo: boolean) => ({
  connectionState: roomState,
  iceConnectionState: roomState === ConnectionState.Connected ? "connected" : roomState,
  signalingState: roomState === ConnectionState.Connected ? "stable" : roomState,
  hasRemoteVideo,
});

const getMemberDisplayName = (member: MeetingMember | null | undefined, currentProfileId: string) => {
  if (!member) {
    return "Unknown user";
  }

  return member.profileId === currentProfileId ? "You" : member.displayName;
};

const isLikelyLocalLiveKitUrl = (value: string) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    normalized.startsWith("ws://127.0.0.1") ||
    normalized.startsWith("wss://127.0.0.1") ||
    normalized.startsWith("ws://localhost") ||
    normalized.startsWith("wss://localhost")
  );
};

const formatMeetingConnectionError = (error: unknown, liveKitUrl?: string) => {
  const fallbackMessage = "Unable to connect to the meeting room.";
  const rawMessage = error instanceof Error ? error.message : fallbackMessage;
  const message = String(rawMessage ?? fallbackMessage).trim() || fallbackMessage;
  const normalizedMessage = message.toLowerCase();
  const normalizedUrl = String(liveKitUrl ?? "").trim();

  if (normalizedMessage.includes("livekit sfu is not configured")) {
    return "LiveKit is not configured yet. Add a real NEXT_PUBLIC_LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET. A basic shared web host usually cannot run the LiveKit SFU itself.";
  }

  if (
    normalizedMessage.includes("websocket error during connection establishment") ||
    normalizedMessage.includes("could not establish signal connection")
  ) {
    if (isLikelyLocalLiveKitUrl(normalizedUrl)) {
      return `The meeting server is pointed at ${normalizedUrl}, which is localhost-only. That only works on the machine actually running LiveKit. A basic shared web host usually cannot host the SFU directly.`;
    }

    if (normalizedUrl) {
      return `The LiveKit server at ${normalizedUrl} could not be reached. Verify that the endpoint is real, publicly reachable, and backed by a LiveKit deployment.`;
    }
  }

  return message;
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
  const roomRef = useRef<Room | null>(null);
  const remoteStageVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const hiddenAudioContainerRef = useRef<HTMLDivElement | null>(null);
  const remoteAudioElementsRef = useRef<Map<string, HTMLMediaElement>>(new Map());
  const [liveConnectedMembers, setLiveConnectedMembers] = useState<MeetingMember[]>(connectedMembers);
  const [presentingMemberId, setPresentingMemberId] = useState<string | null>(null);
  const [showPopbackNotice, setShowPopbackNotice] = useState(false);
  const [contextMenuState, setContextMenuState] = useState<{ memberId: string; x: number; y: number } | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captureIntent, setCaptureIntent] = useState<"none" | "camera" | "stream">("none");
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamLabel, setStreamLabel] = useState<string | null>(null);
  const [localCameraTrack, setLocalCameraTrack] = useState<LocalVideoTrack | null>(null);
  const [localScreenTrack, setLocalScreenTrack] = useState<LocalVideoTrack | null>(null);
  const [remoteVideoTracks, setRemoteVideoTracks] = useState<Record<string, RemoteVideoSources>>({});

  const isMeetingCreator = Boolean(meetingCreatorProfileId && meetingCreatorProfileId === currentProfileId);
  const isRoomConnected = connectionState === ConnectionState.Connected;

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
        // ignore voice-state polling failures
      }
    };

    void refreshMembers();
    const pollTimer = window.setInterval(refreshMembers, isPopoutView ? 2500 : 4000);

    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
    };
  }, [channelId, disableVoiceStatePolling, isPopoutView, serverId]);

  const syncStreamingState = useCallback(
    (nextStreaming: boolean, nextStreamLabel: string | null = null, options?: { preserveCaptureIntent?: boolean }) => {
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
    },
    []
  );

  const syncCameraState = useCallback((nextCameraEnabled: boolean, options?: { preserveCaptureIntent?: boolean }) => {
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
  }, []);

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
  }, []);

  const cleanupRemoteAudio = useCallback((predicate?: (key: string) => boolean) => {
    for (const [key, element] of Array.from(remoteAudioElementsRef.current.entries())) {
      if (predicate && !predicate(key)) {
        continue;
      }

      try {
        const srcObject = element.srcObject as MediaStream | null;
        srcObject?.getTracks().forEach((track) => track.stop());
      } catch {
        // ignore detach cleanup errors
      }
      element.remove();
      remoteAudioElementsRef.current.delete(key);
    }
  }, []);

  const refreshLocalTracks = useCallback((room: Room | null) => {
    const localParticipant = room?.localParticipant;
    const nextCameraTrack = (localParticipant?.getTrackPublication(Track.Source.Camera)?.videoTrack as LocalVideoTrack | undefined) ?? null;
    const nextScreenTrack = (localParticipant?.getTrackPublication(Track.Source.ScreenShare)?.videoTrack as LocalVideoTrack | undefined) ?? null;
    setLocalCameraTrack(nextCameraTrack);
    setLocalScreenTrack(nextScreenTrack);
  }, []);

  const setRemoteVideoTrack = useCallback((profileId: string, source: Track.Source, track: RemoteVideoTrack | null) => {
    setRemoteVideoTracks((current) => {
      const previous = current[profileId] ?? { camera: null, screen: null };
      const next: RemoteVideoSources = {
        camera: source === Track.Source.Camera ? track : previous.camera,
        screen: source === Track.Source.ScreenShare ? track : previous.screen,
      };

      if (next.camera === previous.camera && next.screen === previous.screen) {
        return current;
      }

      return {
        ...current,
        [profileId]: next,
      };
    });
  }, []);

  const clearRemoteParticipantTracks = useCallback((profileId: string) => {
    setRemoteVideoTracks((current) => {
      if (!(profileId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[profileId];
      return next;
    });
    cleanupRemoteAudio((key) => key.startsWith(`${profileId}:`));
  }, [cleanupRemoteAudio]);

  const attachRemoteAudioTrack = useCallback((participantIdentity: string, publication: RemoteTrackPublication) => {
    const audioTrack = publication.audioTrack as RemoteAudioTrack | undefined;
    if (!audioTrack || !hiddenAudioContainerRef.current) {
      return;
    }

    const key = `${participantIdentity}:${publication.trackSid}`;
    if (remoteAudioElementsRef.current.has(key)) {
      return;
    }

    const element = audioTrack.attach();
    element.autoplay = true;
    element.dataset.inaccordRemoteAudio = key;
    hiddenAudioContainerRef.current.appendChild(element);
    remoteAudioElementsRef.current.set(key, element);
  }, []);

  const syncRemoteParticipant = useCallback((participant: RemoteParticipant) => {
    const profileId = String(participant.identity ?? "").trim();
    if (!profileId) {
      return;
    }

    let nextCameraTrack: RemoteVideoTrack | null = null;
    let nextScreenTrack: RemoteVideoTrack | null = null;
    const activeAudioKeys = new Set<string>();

    participant.trackPublications.forEach((publication) => {
      const key = `${profileId}:${publication.trackSid}`;
      const source = publication.source;

      if (publication.kind === Track.Kind.Audio) {
        attachRemoteAudioTrack(profileId, publication as RemoteTrackPublication);
        activeAudioKeys.add(key);
        return;
      }

      if (publication.kind !== Track.Kind.Video) {
        return;
      }

      const videoTrack = publication.videoTrack as RemoteVideoTrack | undefined;
      if (!videoTrack) {
        return;
      }

      if (source === Track.Source.ScreenShare) {
        nextScreenTrack = videoTrack;
        return;
      }

      nextCameraTrack = videoTrack;
    });

    setRemoteVideoTracks((current) => {
      const previous = current[profileId] ?? { camera: null, screen: null };
      if (previous.camera === nextCameraTrack && previous.screen === nextScreenTrack) {
        return current;
      }

      return {
        ...current,
        [profileId]: {
          camera: nextCameraTrack,
          screen: nextScreenTrack,
        },
      };
    });

    cleanupRemoteAudio((key) => key.startsWith(`${profileId}:`) && !activeAudioKeys.has(key));
  }, [attachRemoteAudioTrack, cleanupRemoteAudio]);

  useEffect(() => {
    if (!isLiveSession || !canConnect) {
      if (roomRef.current) {
        void roomRef.current.disconnect(true).catch(() => undefined);
        roomRef.current = null;
      }
      cleanupRemoteAudio();
      setConnectionState(ConnectionState.Disconnected);
      setLocalCameraTrack(null);
      setLocalScreenTrack(null);
      setRemoteVideoTracks({});
      return;
    }

    let disposed = false;
    const abortController = new AbortController();
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      stopLocalTrackOnUnpublish: true,
      videoCaptureDefaults: {
        resolution: {
          width: 1280,
          height: 720,
          frameRate: 30,
        },
      },
    });

    roomRef.current = room;
    setConnectionState(ConnectionState.Connecting);
    setTokenError(null);
    setCameraError(null);

    const handleConnectionStateChanged = (state: ConnectionState) => {
      if (!disposed) {
        setConnectionState(state);
      }
    };

    const handleParticipantConnected = (participant: RemoteParticipant) => {
      syncRemoteParticipant(participant);
    };

    const handleParticipantDisconnected = (participant: RemoteParticipant) => {
      clearRemoteParticipantTracks(participant.identity);
    };

    const handleTrackSubscribed = (_track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      syncRemoteParticipant(participant);
    };

    const handleTrackUnsubscribed = (_track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      syncRemoteParticipant(participant);
    };

    const handleTrackMuted = (_publication: TrackPublication, participant: RemoteParticipant | any) => {
      if (participant && participant.identity && room.remoteParticipants.has(participant.identity)) {
        const remoteParticipant = room.remoteParticipants.get(participant.identity);
        if (remoteParticipant) {
          syncRemoteParticipant(remoteParticipant);
        }
      }
    };

    const handleLocalTrackPublished = (_publication: LocalTrackPublication) => {
      refreshLocalTracks(room);
    };

    const handleLocalTrackUnpublished = (publication: LocalTrackPublication) => {
      refreshLocalTracks(room);
      if (publication.source === Track.Source.ScreenShare) {
        setCaptureIntent("none");
        syncStreamingState(false, null, { preserveCaptureIntent: true });
      }
      if (publication.source === Track.Source.Camera) {
        syncCameraState(false, { preserveCaptureIntent: true });
      }
    };

    room.on(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);
    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    room.on(RoomEvent.TrackMuted, handleTrackMuted);
    room.on(RoomEvent.TrackUnmuted, handleTrackMuted);
    room.on(RoomEvent.LocalTrackPublished, handleLocalTrackPublished);
    room.on(RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished);

    const connectToRoom = async () => {
      let liveKitUrl = "";

      try {
        const response = await fetch(
          `/api/channels/${encodeURIComponent(channelId)}/meeting-token?serverId=${encodeURIComponent(serverId)}`,
          {
            method: "GET",
            cache: "no-store",
            signal: abortController.signal,
          }
        );

        if (!response.ok) {
          const message = (await response.text().catch(() => "")) || "Unable to create meeting session.";
          throw new Error(message);
        }

        const payload = (await response.json()) as { token?: string; url?: string };
        const token = String(payload?.token ?? "").trim();
        const url = String(payload?.url ?? "").trim();
        liveKitUrl = url;

        if (!token || !url) {
          throw new Error("Meeting token response was incomplete.");
        }

        await room.connect(url, token);
        if (disposed) {
          await room.disconnect(true).catch(() => undefined);
          return;
        }

        await room.startAudio().catch(() => undefined);
        refreshLocalTracks(room);
        room.remoteParticipants.forEach((participant) => {
          syncRemoteParticipant(participant);
        });
      } catch (error) {
        if (disposed || abortController.signal.aborted) {
          return;
        }

        const message = formatMeetingConnectionError(error, liveKitUrl);
        setTokenError(message);
        setConnectionState(ConnectionState.Disconnected);
      }
    };

    void connectToRoom();

    return () => {
      disposed = true;
      abortController.abort();
      room.off(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
      room.off(RoomEvent.TrackMuted, handleTrackMuted);
      room.off(RoomEvent.TrackUnmuted, handleTrackMuted);
      room.off(RoomEvent.LocalTrackPublished, handleLocalTrackPublished);
      room.off(RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished);
      cleanupRemoteAudio();
      void room.disconnect(true).catch(() => undefined);
      if (roomRef.current === room) {
        roomRef.current = null;
      }
      setLocalCameraTrack(null);
      setLocalScreenTrack(null);
      setRemoteVideoTracks({});
      setConnectionState(ConnectionState.Disconnected);
    };
  }, [canConnect, channelId, cleanupRemoteAudio, clearRemoteParticipantTracks, currentProfileId, isLiveSession, refreshLocalTracks, serverId, syncCameraState, syncRemoteParticipant, syncStreamingState]);

  useEffect(() => {
    if (!isLiveSession || !canConnect) {
      return;
    }

    const room = roomRef.current;
    if (!room || (connectionState !== ConnectionState.Connected && connectionState !== ConnectionState.Reconnecting && connectionState !== ConnectionState.SignalReconnecting)) {
      return;
    }

    let cancelled = false;

    const syncCapture = async () => {
      try {
        if (captureIntent === "camera") {
          await room.localParticipant.setScreenShareEnabled(false);
          await room.localParticipant.setCameraEnabled(true);
          if (cancelled) {
            return;
          }
          syncCameraState(true, { preserveCaptureIntent: true });
          syncStreamingState(false, null, { preserveCaptureIntent: true });
          setCameraError(null);
          refreshLocalTracks(room);
          return;
        }

        if (captureIntent === "stream") {
          await room.localParticipant.setCameraEnabled(false);
          const publication = await room.localParticipant.setScreenShareEnabled(true);
          if (cancelled) {
            return;
          }
          const detectedLabel = publication?.videoTrack?.mediaStreamTrack?.label?.trim() || null;
          syncCameraState(false, { preserveCaptureIntent: true });
          syncStreamingState(true, detectedLabel, { preserveCaptureIntent: true });
          setCameraError(null);
          refreshLocalTracks(room);
          return;
        }

        await room.localParticipant.setCameraEnabled(false);
        await room.localParticipant.setScreenShareEnabled(false);
        if (cancelled) {
          return;
        }
        syncCameraState(false, { preserveCaptureIntent: true });
        syncStreamingState(false, null, { preserveCaptureIntent: true });
        setCameraError(null);
        refreshLocalTracks(room);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setCaptureIntent("none");
        if (captureIntent === "stream") {
          syncStreamingState(false, null, { preserveCaptureIntent: true });
          setCameraError("Screen share was blocked. Allow display capture to stream.");
        } else {
          syncCameraState(false, { preserveCaptureIntent: true });
          setCameraError("Camera access was blocked. Allow camera permissions to start video.");
        }
        refreshLocalTracks(room);
      }
    };

    void syncCapture();

    return () => {
      cancelled = true;
    };
  }, [canConnect, captureIntent, connectionState, isLiveSession, refreshLocalTracks, syncCameraState, syncStreamingState]);

  const stageMember = useMemo(() => {
    if (!liveConnectedMembers.length) {
      return null;
    }

    const pinned = presentingMemberId
      ? liveConnectedMembers.find((item) => item.memberId === presentingMemberId)
      : null;

    const memberWithRemoteScreen = Object.keys(remoteVideoTracks).find((profileId) => remoteVideoTracks[profileId]?.screen);
    const memberWithRemoteCamera = Object.keys(remoteVideoTracks).find((profileId) => remoteVideoTracks[profileId]?.camera);

    const streamedMember = memberWithRemoteScreen
      ? liveConnectedMembers.find((item) => item.profileId === memberWithRemoteScreen)
      : memberWithRemoteCamera
        ? liveConnectedMembers.find((item) => item.profileId === memberWithRemoteCamera)
        : null;

    const creatorMember = meetingCreatorProfileId
      ? liveConnectedMembers.find((item) => item.profileId === meetingCreatorProfileId)
      : null;

    return (
      pinned ??
      streamedMember ??
      liveConnectedMembers.find((item) => item.isStreaming) ??
      liveConnectedMembers.find((item) => item.isCameraOn) ??
      creatorMember ??
      liveConnectedMembers[0] ??
      null
    );
  }, [liveConnectedMembers, meetingCreatorProfileId, presentingMemberId, remoteVideoTracks]);

  useEffect(() => {
    if (!presentingMemberId) {
      return;
    }

    if (liveConnectedMembers.some((item) => item.memberId === presentingMemberId)) {
      return;
    }

    setPresentingMemberId(null);
  }, [liveConnectedMembers, presentingMemberId]);

  const localPreviewTrack = captureIntent === "stream" ? localScreenTrack ?? localCameraTrack : localCameraTrack ?? localScreenTrack;
  const localPreviewMember = liveConnectedMembers.find((item) => item.profileId === currentProfileId) ?? null;
  const isLocalStage = stageMember?.profileId === currentProfileId;
  const preferredStageRemoteTrack = stageMember?.profileId
    ? remoteVideoTracks[stageMember.profileId]?.screen ?? remoteVideoTracks[stageMember.profileId]?.camera ?? null
    : null;
  const fallbackStageRemoteTrackEntry = useMemo(
    () =>
      Object.entries(remoteVideoTracks).find(([, sources]) => Boolean(sources.screen || sources.camera)) ?? null,
    [remoteVideoTracks]
  );
  const stageRemoteTrack = preferredStageRemoteTrack ?? fallbackStageRemoteTrackEntry?.[1]?.screen ?? fallbackStageRemoteTrackEntry?.[1]?.camera ?? null;
  const stageRemoteTrackProfileId =
    preferredStageRemoteTrack && stageMember?.profileId
      ? stageMember.profileId
      : fallbackStageRemoteTrackEntry?.[0] ?? null;
  const stageRemoteMember = stageRemoteTrackProfileId
    ? liveConnectedMembers.find((item) => item.profileId === stageRemoteTrackProfileId) ?? null
    : null;
  const shouldShowRemoteStage = isLiveSession && Boolean(stageRemoteTrack);
  const shouldShowLocalPreview = isLiveSession && !shouldShowRemoteStage && (!stageMember || isLocalStage);
  const isConnectingVideo = shouldShowLocalPreview && !localPreviewTrack && !cameraError && isRoomConnected;
  const cameraOnMembers = useMemo(
    () => liveConnectedMembers.filter((item) => item.isCameraOn || item.isStreaming),
    [liveConnectedMembers]
  );
  const stageCameraMembers = useMemo(
    () => cameraOnMembers.filter((item) => item.memberId !== stageMember?.memberId),
    [cameraOnMembers, stageMember?.memberId]
  );
  const stageCameraPreviewMembers = stageCameraMembers.slice(0, 6);
  const hiddenStageCameraCount = Math.max(0, stageCameraMembers.length - stageCameraPreviewMembers.length);
  const remoteTransportMembers = useMemo(() => {
    return liveConnectedMembers
      .filter((item) => item.profileId && item.profileId !== currentProfileId)
      .map((item) => {
        const sources = remoteVideoTracks[item.profileId] ?? { camera: null, screen: null };
        const hasRemoteVideo = Boolean(sources.camera || sources.screen);
        return {
          member: item,
          isSubscribed: hasRemoteVideo,
          status: buildTransportStatus(connectionState, hasRemoteVideo),
          telemetry: hasRemoteVideo
            ? ({
                flowState: "flowing",
                signalStrength: connectionState === ConnectionState.Connected ? "excellent" : "weak",
                bitrateKbps: null,
                framesPerSecond: null,
                framesDecoded: 0,
                sendBitrateKbps: null,
                framesSentPerSecond: null,
                framesSent: 0,
                packetsLost: null,
                jitterMs: null,
                rttMs: null,
                resolution: null,
                updatedAt: Date.now(),
              } satisfies PeerTraceTelemetry)
            : null,
        };
      });
  }, [connectionState, currentProfileId, liveConnectedMembers, remoteVideoTracks]);
  const stageMemberStatusText = !stageMember
    ? ""
    : stageMember.profileId === currentProfileId
      ? isStreaming
        ? getStreamStageText(streamLabel)
        : isCameraEnabled
          ? "Camera live"
          : isRoomConnected
            ? "Audio only"
            : "Connecting"
      : stageRemoteTrack
        ? stageMember.isStreaming
          ? getStreamStageText(stageMember.streamLabel)
          : stageMember.isCameraOn
            ? "Camera live"
            : "Audio only"
        : isRoomConnected
          ? stageMember.isStreaming
            ? "Waiting for screen share..."
            : stageMember.isCameraOn
              ? "Waiting for camera..."
              : "Audio only"
          : "Connecting";

  useEffect(() => {
    const videoElement = remoteStageVideoRef.current;
    if (!videoElement) {
      return;
    }

    if (!stageRemoteTrack) {
      videoElement.srcObject = null;
      return;
    }

    stageRemoteTrack.attach(videoElement);
    void videoElement.play().catch(() => undefined);

    return () => {
      stageRemoteTrack.detach(videoElement);
      videoElement.srcObject = null;
    };
  }, [stageRemoteTrack]);

  useEffect(() => {
    const videoElement = localVideoRef.current;
    if (!videoElement) {
      return;
    }

    if (!localPreviewTrack) {
      videoElement.srcObject = null;
      return;
    }

    localPreviewTrack.attach(videoElement);
    videoElement.muted = true;
    void videoElement.play().catch(() => undefined);

    return () => {
      localPreviewTrack.detach(videoElement);
      videoElement.srcObject = null;
    };
  }, [localPreviewTrack]);

  useEffect(() => {
    if (!onDebugProbeUpdate) {
      return;
    }

    onDebugProbeUpdate({
      currentProfileId,
      socketConnected: isRoomConnected,
      captureIntent,
      meshRemoteVideoLimit: liveConnectedMembers.length,
      subscribedRemoteVideoCount: remoteTransportMembers.filter((item) => item.isSubscribed).length,
      totalRemoteVideoCandidates: remoteTransportMembers.length,
      isCameraEnabled,
      isStreaming,
      cameraError,
      localVideoTrackReady: Boolean(localPreviewTrack),
      localVideoTrackState: localPreviewTrack?.mediaStreamTrack.readyState ?? null,
      stageMemberProfileId: stageMember?.profileId ?? null,
      stageMemberStatusText,
      hasStageRemoteStream: Boolean(stageRemoteTrack),
      remoteTransportMembers: remoteTransportMembers.map(({ member, isSubscribed, status, telemetry }) => ({
        profileId: member.profileId,
        displayName: member.displayName,
        isSubscribed,
        status,
        telemetry,
        signalDebug: null,
        videoTransceivers: [],
      })),
    });
  }, [cameraError, captureIntent, currentProfileId, isCameraEnabled, isRoomConnected, isStreaming, liveConnectedMembers.length, localPreviewTrack, onDebugProbeUpdate, remoteTransportMembers, stageMember?.profileId, stageMemberStatusText, stageRemoteTrack]);

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

  const setPreferredPresenter = (memberId: string | null) => {
    if (!isMeetingCreator) {
      return;
    }

    setPresentingMemberId(memberId);
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
      // ignore cross-window access failures
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

      const data = event.data as { type?: string; serverId?: string; channelId?: string } | undefined;
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

  const runParticipantAction = async (
    action: "mute" | "unmute" | "kick" | "hidevideo" | "showvideo" | "hidestream" | "showstream",
    targetMemberId: string
  ) => {
    try {
      const response = await fetch(`/api/channels/${encodeURIComponent(channelId)}/voice-state?serverId=${encodeURIComponent(serverId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            targetMemberId,
          }),
        }
      );

      if (!response.ok) {
        const message = await response.text().catch(() => "Failed to update participant");
        throw new Error(message || "Failed to update participant");
      }

      setContextMenuState(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to update participant");
    }
  };

  const contextMenuMember = contextMenuState
    ? liveConnectedMembers.find((member) => member.memberId === contextMenuState.memberId) ?? null
    : null;

  return (
    <div className="relative flex min-h-[420px] flex-col gap-3">
      <div ref={hiddenAudioContainerRef} className="hidden" aria-hidden="true" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
            Video meeting
          </p>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{meetingName}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              isRoomConnected
                ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
                : isLiveSession
                  ? "border-amber-400/50 bg-amber-500/15 text-amber-200"
                  : "border-zinc-500/50 bg-zinc-500/10 text-zinc-300"
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            {isRoomConnected ? "SFU live" : isLiveSession ? "Connecting" : "Idle"}
          </span>

          {isPopoutView ? (
            <button
              type="button"
              onClick={onClosePopout}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-white/15 bg-black/25 px-3 text-xs font-semibold text-zinc-100 transition hover:bg-black/35"
            >
              Close Popout
            </button>
          ) : (
            <button
              type="button"
              onClick={onPopoutMeeting}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-white/15 bg-black/25 px-3 text-xs font-semibold text-zinc-100 transition hover:bg-black/35"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Popout
            </button>
          )}
        </div>
      </div>

      {showPopbackNotice ? (
        <div className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          Meeting window returned to this channel.
        </div>
      ) : null}

      {tokenError ? (
        <div className="rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          {tokenError}
        </div>
      ) : null}

      {cameraError ? (
        <div className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {cameraError}
        </div>
      ) : null}

      <div className="rounded-2xl border border-border/70 bg-[#1f232b] p-3">
        <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-linear-to-br from-[#2e323c] to-[#1b1f26]">
          {shouldShowRemoteStage ? (
            <video
              ref={remoteStageVideoRef}
              autoPlay
              playsInline
              className="h-full w-full object-cover"
              aria-label={`${getMemberDisplayName(stageRemoteMember, currentProfileId)} live video`}
            />
          ) : shouldShowLocalPreview && localPreviewTrack ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
              aria-label={`${getMemberDisplayName(localPreviewMember, currentProfileId)} local preview`}
            />
          ) : isConnectingVideo ? (
            <div className="flex flex-col items-center gap-2 text-zinc-300">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Preparing your video…</p>
            </div>
          ) : stageMember ? (
            <div className="flex flex-col items-center gap-2 text-center text-zinc-200">
              <UserAvatar src={stageMember.profileImageUrl} className="h-22 w-22 md:h-24 md:w-24" />
              <div>
                <p className="text-lg font-semibold">{getMemberDisplayName(stageMember, currentProfileId)}</p>
                <p className="mt-1 text-xs text-zinc-300">{stageMemberStatusText}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-center text-zinc-300">
              <Users className="h-10 w-10" />
              <p className="text-sm">Join the meeting to start video.</p>
            </div>
          )}

          {stageMember ? (
            <div className="pointer-events-none absolute left-3 bottom-3 rounded-lg bg-black/45 px-3 py-2 text-left text-white shadow-lg">
              <p className="text-sm font-semibold">{getMemberDisplayName(stageMember, currentProfileId)}</p>
              <p className="mt-1 text-xs text-zinc-200">{stageMemberStatusText}</p>
            </div>
          ) : null}
        </div>

        {!hideParticipantStrip && stageCameraPreviewMembers.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {stageCameraPreviewMembers.map((item) => {
              const isPinned = presentingMemberId === item.memberId;
              return (
                <button
                  key={item.memberId}
                  type="button"
                  onClick={() => setPreferredPresenter(isPinned ? null : item.memberId)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenuState({ memberId: item.memberId, x: event.clientX, y: event.clientY });
                  }}
                  className={`group flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${
                    isPinned
                      ? "border-indigo-400/60 bg-indigo-500/15"
                      : "border-border/60 bg-background/65 hover:border-indigo-400/40 hover:bg-indigo-500/10"
                  }`}
                >
                  <UserAvatar src={item.profileImageUrl} className="h-9 w-9" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-zinc-100">{getMemberDisplayName(item, currentProfileId)}</p>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-zinc-400">
                      {item.isStreaming ? (
                        <span className="group relative inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-300/45 bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-100">
                          <ScreenShare className="h-3 w-3 shrink-0" />
                          <span className="max-w-36 truncate">{getStreamBadgeText(item.streamLabel)}</span>
                        </span>
                      ) : item.isCameraOn ? (
                        <span>Camera on</span>
                      ) : (
                        <span>Audio only</span>
                      )}
                    </div>
                  </div>
                  {isMeetingCreator ? (
                    isPinned ? <Pin className="h-3.5 w-3.5 text-indigo-200" /> : <PinOff className="h-3.5 w-3.5 text-zinc-500" />
                  ) : null}
                </button>
              );
            })}
            {hiddenStageCameraCount > 0 ? (
              <div className="inline-flex items-center rounded-xl border border-border/60 bg-background/50 px-3 text-xs font-semibold text-zinc-300">
                +{hiddenStageCameraCount} more
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
              {isCameraEnabled || captureIntent === "camera" ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
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
              {isStreaming || captureIntent === "stream" ? <ScreenShareOff className="h-3.5 w-3.5" /> : <ScreenShare className="h-3.5 w-3.5" />}
              {isStreaming || captureIntent === "stream" ? "Stop stream" : "Start stream"}
            </button>

            <button
              type="button"
              onClick={onLeaveMeeting}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-rose-400/40 bg-rose-500/10 px-3 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20"
            >
              Leave meeting
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onJoinMeeting}
            disabled={!canConnect}
            className="inline-flex h-9 items-center gap-1 rounded-md bg-indigo-500 px-3 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Join meeting
          </button>
        )}
      </div>

      {isLiveSession ? (
        <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {isRoomConnected ? `Connected to #${meetingName}. Live video is running through the SFU.` : `Connecting #${meetingName} to the SFU...`}
        </div>
      ) : canConnect ? (
        <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-200">
          Not connected yet. Join this meeting to publish or watch video.
        </div>
      ) : (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          You can view this channel, but you do not have permission to connect.
        </div>
      )}

      {!hideParticipantsSidebar ? (
        <div className="rounded-xl border border-border/70 bg-background/55 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Participants</p>
            <span className="text-[11px] text-zinc-400">{liveConnectedMembers.length} connected</span>
          </div>

          {liveConnectedMembers.length ? (
            <div className="space-y-2">
              {liveConnectedMembers.map((item) => (
                <div
                  key={item.memberId}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenuState({ memberId: item.memberId, x: event.clientX, y: event.clientY });
                  }}
                  className="rounded-lg border border-border/50 bg-background/70 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar src={item.profileImageUrl} className="h-9 w-9" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-zinc-100">{getMemberDisplayName(item, currentProfileId)}</p>
                        {presentingMemberId === item.memberId ? (
                          <span className="rounded-full border border-indigo-300/45 bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-100">
                            Stage
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-400">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${item.isSpeaking ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300" : "border-zinc-500/50 bg-zinc-500/10 text-zinc-300"}`} title={item.isSpeaking ? "Speaking" : "Idle"}>
                          <Activity className="h-3.5 w-3.5" />
                        </span>
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${item.isMuted ? "border-rose-400/60 bg-rose-500/20 text-rose-300" : "border-emerald-400/60 bg-emerald-500/20 text-emerald-300"}`} title={item.isMuted ? "Mic Off" : "Mic On"}>
                          <Mic className="h-3.5 w-3.5" />
                        </span>
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${item.isCameraOn ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300" : "border-zinc-500/50 bg-zinc-500/10 text-zinc-300"}`} title={item.isCameraOn ? "Camera On" : "Camera Off"}>
                          <Video className="h-3.5 w-3.5" />
                        </span>
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${item.isStreaming ? "border-indigo-300/60 bg-indigo-500/20 text-indigo-100" : "border-zinc-500/50 bg-zinc-500/10 text-zinc-300"}`} title={item.isStreaming ? getStreamTooltipText(item.streamLabel) : "Not streaming"}>
                          <ScreenShare className="h-3.5 w-3.5" />
                        </span>
                        {item.isStreaming ? (
                          <span className="group relative inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-300/45 bg-indigo-500/20 px-2 py-0.5 text-[10px] font-medium text-indigo-100">
                            <ScreenShare className="h-3 w-3 shrink-0" />
                            <span className="max-w-40 truncate">{getStreamBadgeText(item.streamLabel)}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">No one connected yet.</p>
          )}

          {!isLiveSession && availableMembers.length ? (
            <div className="mt-3 rounded-lg border border-border/50 bg-background/70 px-3 py-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Available to join</p>
              <ul className="space-y-1.5 text-xs text-zinc-300">
                {availableMembers.map((item) => (
                  <li key={item.memberId} className="flex items-center justify-between gap-2">
                    <span className="truncate">{item.displayName}</span>
                    <span className="rounded-full border border-zinc-500/50 bg-zinc-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-300">
                      {item.presenceStatus}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {contextMenuState && contextMenuMember ? (
        <div
          className="fixed z-130 min-w-44 rounded-md border border-zinc-700 bg-[#1f2125] p-1 shadow-2xl shadow-black/70"
          style={{ left: contextMenuState.x, top: contextMenuState.y }}
        >
          {isMeetingCreator && contextMenuMember.profileId !== currentProfileId ? (
            <>
              <button
                type="button"
                onClick={() => setPreferredPresenter(presentingMemberId === contextMenuMember.memberId ? null : contextMenuMember.memberId)}
                className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-zinc-100 transition hover:bg-white/10"
              >
                {presentingMemberId === contextMenuMember.memberId ? "Unpin from stage" : "Pin to stage"}
              </button>
              <button
                type="button"
                onClick={() => void runParticipantAction(contextMenuMember.isMuted ? "unmute" : "mute", contextMenuMember.memberId)}
                className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-zinc-100 transition hover:bg-white/10"
              >
                {contextMenuMember.isMuted ? "Unmute member" : "Mute member"}
              </button>
              <button
                type="button"
                onClick={() => void runParticipantAction(contextMenuMember.isCameraOn ? "hidevideo" : "showvideo", contextMenuMember.memberId)}
                className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-zinc-100 transition hover:bg-white/10"
              >
                {contextMenuMember.isCameraOn ? "Hide camera" : "Allow camera"}
              </button>
              <button
                type="button"
                onClick={() => void runParticipantAction(contextMenuMember.isStreaming ? "hidestream" : "showstream", contextMenuMember.memberId)}
                className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-zinc-100 transition hover:bg-white/10"
              >
                {contextMenuMember.isStreaming ? "Stop stream" : "Allow stream"}
              </button>
              <button
                type="button"
                onClick={() => void runParticipantAction("kick", contextMenuMember.memberId)}
                className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-rose-300 transition hover:bg-rose-500/15"
              >
                Kick from meeting
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setContextMenuState(null)}
              className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-zinc-100 transition hover:bg-white/10"
            >
              Close
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
};
