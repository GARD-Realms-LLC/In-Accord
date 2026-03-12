"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, ExternalLink, Loader2, Mic, Pin, PinOff, ScreenShare, ScreenShareOff, Users, Video, VideoOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { UserAvatar } from "@/components/user-avatar";

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
}

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
  const VOICE_STATE_SYNC_EVENT = "inaccord:voice-state-sync";
  const VOICE_TOGGLE_STREAM_EVENT = "inaccord:voice-toggle-stream";
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [localMediaStream, setLocalMediaStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
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
    if (typeof window === "undefined") {
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
  }, [channelId, isPopoutView, serverId]);

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

    const creatorMember = meetingCreatorProfileId
      ? connectedMembersView.find((item) => item.profileId === meetingCreatorProfileId)
      : null;

    return (
      pinned ??
      creatorMember ??
      connectedMembersView.find((item) => item.isStreaming) ??
      connectedMembersView.find((item) => item.isCameraOn) ??
      connectedMembersView[0] ??
      null
    );
  }, [connectedMembersView, meetingCreatorProfileId, presentingMemberId]);

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
    const onVoiceStateSync = (event: Event) => {
      const customEvent = event as CustomEvent<{
        isCameraOn?: boolean;
        isStreaming?: boolean;
        streamLabel?: string | null;
      }>;

      if (typeof customEvent.detail?.isCameraOn === "boolean") {
        setIsCameraEnabled(customEvent.detail.isCameraOn);
      }

      if (typeof customEvent.detail?.isStreaming === "boolean") {
        setIsStreaming(customEvent.detail.isStreaming);
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

    return () => {
      window.removeEventListener(VOICE_STATE_SYNC_EVENT, onVoiceStateSync as EventListener);
    };
  }, [VOICE_STATE_SYNC_EVENT]);

  useEffect(() => {
    const wantsVideoCapture = isStreaming || isCameraEnabled;

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
      setCameraError("Camera is not supported in this browser.");
      return;
    }

    let cancelled = false;

    const start = async () => {
      try {
        const stream = isStreaming
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

        if (isStreaming) {
          const [videoTrack] = stream.getVideoTracks();
          const detectedLabel =
            typeof videoTrack?.label === "string" && videoTrack.label.trim().length
              ? videoTrack.label.trim().slice(0, 255)
              : null;

          syncStreamingState(true, detectedLabel);

          if (videoTrack) {
            videoTrack.onended = () => {
              syncStreamingState(false, null);
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
        if (isStreaming) {
          syncStreamingState(false, null);
        }
        setCameraError(
          isStreaming
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
  }, [canConnect, isCameraEnabled, isLiveSession, isStreaming, VOICE_TOGGLE_STREAM_EVENT]);

  useEffect(() => {
    if (!localVideoRef.current) {
      return;
    }

    localVideoRef.current.srcObject = localMediaStream;
  }, [localMediaStream]);

  const isLocalStage = stageMember?.profileId === currentProfileId;
  const shouldShowLocalPreview = isLiveSession && (!stageMember || isLocalStage);
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
    const electronApi = (window as any).electronAPI;

    if (typeof electronApi?.openMeetingPopout === "function") {
      void electronApi.openMeetingPopout(url);
      router.replace(`${normalizedChannelPath}?popoutChat=true`);
      return;
    }

    const width = 1280;
    const height = 820;
    const left = Math.max(0, Math.round((window.screen.width - width) / 2));
    const top = Math.max(0, Math.round((window.screen.height - height) / 2));

    window.open(
      url,
      `inaccord-meeting-${channelId}`,
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    window.alert("Browser popouts always keep the address bar. In desktop app mode, popout opens as a native window without it.");

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

    router.replace(normalizedChannelPath);
  };

  const onClosePopout = () => {
    if (typeof window === "undefined") {
      return;
    }

    const fallbackUrl = `${normalizedChannelPath}?live=true`;
    const popbackStorageKey = "inaccord:meeting-popback";
    const popbackPayload = JSON.stringify({
      serverId,
      channelId,
      timestamp: Date.now(),
    });

    try {
      window.localStorage.setItem(popbackStorageKey, popbackPayload);

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

    const popbackStorageKey = "inaccord:meeting-popback";

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

      setShowPopbackNotice(true);
      router.replace(`${normalizedChannelPath}?live=true`);
    };

    const onPopbackStorage = (event: StorageEvent) => {
      if (event.key !== popbackStorageKey || !event.newValue) {
        return;
      }

      try {
        const payload = JSON.parse(event.newValue) as
          | {
              serverId?: string;
              channelId?: string;
            }
          | undefined;

        if (payload?.serverId !== serverId || payload?.channelId !== channelId) {
          return;
        }

        setShowPopbackNotice(true);
        router.replace(`${normalizedChannelPath}?live=true`);
      } catch {
        // ignore invalid payloads
      }
    };

    window.addEventListener("message", onPopbackMessage);
    window.addEventListener("storage", onPopbackStorage);

    const electronApi = (window as any).electronAPI;
    const disposePopoutClosed =
      typeof electronApi?.onMeetingPopoutClosed === "function"
        ? electronApi.onMeetingPopoutClosed((payload: { serverId?: string | null; channelId?: string | null }) => {
            if (payload?.serverId !== serverId || payload?.channelId !== channelId) {
              return;
            }

            setShowPopbackNotice(true);
            router.replace(`${normalizedChannelPath}?live=true`);
          })
        : null;

    return () => {
      window.removeEventListener("message", onPopbackMessage);
      window.removeEventListener("storage", onPopbackStorage);
      if (typeof disposePopoutClosed === "function") {
        disposePopoutClosed();
      }
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

    const electronApi = (window as any).electronAPI;
    if (electronApi?.minimizeCurrentWindow) {
      void electronApi.minimizeCurrentWindow();
      return;
    }

    window.blur();
  };

  const syncStreamingState = (nextStreaming: boolean, nextStreamLabel: string | null = null) => {
    setIsStreaming(nextStreaming);
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

        <div className="rounded-2xl border border-border/70 bg-[#1f232b] p-3">
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-linear-to-br from-[#2e323c] to-[#1b1f26]">
            {shouldShowLocalPreview && localMediaStream ? (
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
                  {isPresentingMode
                    ? "Presenting"
                    : stageMember.isStreaming
                      ? `Streaming${stageMember.streamLabel ? ` • ${stageMember.streamLabel}` : ""}`
                    : stageMember.isCameraOn
                      ? "Camera live"
                      : "Audio only"}
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
                onClick={() => {
                  const next = !isStreaming;
                  syncStreamingState(next, next ? streamLabel : null);
                }}
                className={`inline-flex h-9 items-center gap-1 rounded-md border px-3 text-xs font-semibold transition ${
                  isStreaming
                    ? "border-indigo-300/60 bg-indigo-500/30 text-indigo-100 hover:bg-indigo-500/40"
                    : "border-white/20 bg-black/25 text-zinc-100 hover:bg-black/35"
                }`}
                title={isStreaming ? "Stop streaming" : "Start screen sharing"}
              >
                {isStreaming ? <ScreenShareOff suppressHydrationWarning className="h-3.5 w-3.5" /> : <ScreenShare suppressHydrationWarning className="h-3.5 w-3.5" />}
                {isStreaming ? "Stop stream" : "Go Live"}
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
                      onClick={() => {
                        const next = !isStreaming;
                        syncStreamingState(next, next ? streamLabel : null);
                      }}
                      className={`inline-flex h-9 items-center gap-1 rounded-md border px-3 text-xs font-semibold transition ${
                        isStreaming
                          ? "border-indigo-300/60 bg-indigo-500/30 text-indigo-100 hover:bg-indigo-500/40"
                          : "border-white/20 bg-black/25 text-zinc-100 hover:bg-black/35"
                      }`}
                      title={isStreaming ? "Stop streaming" : "Start screen sharing"}
                    >
                      {isStreaming ? <ScreenShareOff suppressHydrationWarning className="h-3.5 w-3.5" /> : <ScreenShare suppressHydrationWarning className="h-3.5 w-3.5" />}
                      {isStreaming ? "Stop stream" : "Go Live"}
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
                            <ScreenShare className="h-3 w-3 shrink-0" />
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
                            ? item.streamLabel
                              ? `Streaming: ${item.streamLabel}`
                              : "Streaming"
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
                        <ScreenShare className="h-3 w-3 shrink-0" />
                        <span className="max-w-40 truncate">
                          {item.streamLabel ? `Source: ${item.streamLabel}` : "Live"}
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
