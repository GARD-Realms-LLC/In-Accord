"use client";

import {
  Copy,
  Crown,
  Headphones,
  LogOut,
  Mic,
  MicOff,
  RefreshCw,
  ScreenShare,
  ScreenShareOff,
  Settings,
  ShieldAlert,
  Video,
  VideoOff,
  VolumeX,
  Wrench,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BannerImage } from "@/components/ui/banner-image";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModeratorLineIcon } from "@/components/moderator-line-icon";
import { ProfileEffectLayer } from "@/components/profile-effect-layer";
import { ProfileNameWithServerTag } from "@/components/profile-name-with-server-tag";
import { ProfileIconRow } from "@/components/profile-icon-row";
import { UserAvatar } from "@/components/user-avatar";
import { useModal } from "@/hooks/use-modal-store";
import {
  hasInAccordAdministrativeAccess,
  isInAccordAdministrator,
  isInAccordDeveloper,
  isInAccordModerator,
} from "@/lib/in-accord-admin";
import { resolveBannerUrl } from "@/lib/asset-url";
import { resolveProfileIcons, type ProfileIcon } from "@/lib/profile-icons";
import {
  PresenceStatus,
  formatPresenceStatusLabel,
  normalizePresenceStatus,
  presenceStatusLabelMap,
  presenceStatusValues,
} from "@/lib/presence-status";
import { getStreamSummaryText } from "@/lib/streaming-display";
import {
  getCachedVoiceState,
  VOICE_STATE_SYNC_EVENT,
  type VoiceStateSyncDetail,
} from "@/lib/voice-state-sync";
import {
  INACCORD_BUILD_NUMBER,
  INACCORD_VERSION_LABEL,
} from "@/lib/build-version";
import {
  getDirectFriendStatusFromRequestResponse,
  type FriendRequestPostResponse,
} from "@/lib/direct-friend-status";

const VOICE_TOGGLE_MUTE_EVENT = "inaccord:voice-toggle-mute";
const VOICE_TOGGLE_DEAFEN_EVENT = "inaccord:voice-toggle-deafen";
const VOICE_TOGGLE_CAMERA_EVENT = "inaccord:voice-toggle-camera";
const VOICE_TOGGLE_STREAM_EVENT = "inaccord:voice-toggle-stream";
const PM_TOGGLE_CAMERA_EVENT = "inaccord:pm-toggle-camera";
const PM_CAMERA_STATE_SYNC_EVENT = "inaccord:pm-camera-state-sync";

interface UserStatusMenuProps {
  profileId?: string | null;
  profileRealName?: string | null;
  profileName?: string | null;
  profilePronouns?: string | null;
  profileRole?: string | null;
  profileEmail?: string | null;
  profileImageUrl?: string | null;
  profileAvatarDecorationUrl?: string | null;
  profileEffectUrl?: string | null;
  profileNameplateLabel?: string | null;
  profileNameplateColor?: string | null;
  profileNameplateImageUrl?: string | null;
  profileBannerUrl?: string | null;
  profilePresenceStatus?: string | null;
  profileCurrentGame?: string | null;
  profileJoinedAt?: string | null;
  profileLastLogonAt?: string | null;
}

export const UserStatusMenu = ({
  profileId,
  profileRealName,
  profileName,
  profilePronouns,
  profileRole,
  profileEmail,
  profileImageUrl,
  profileAvatarDecorationUrl,
  profileEffectUrl,
  profileNameplateLabel,
  profileNameplateColor,
  profileNameplateImageUrl,
  profileBannerUrl,
  profilePresenceStatus,
  profileCurrentGame,
  profileJoinedAt,
  profileLastLogonAt,
}: UserStatusMenuProps) => {
  const { onOpen } = useModal();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isSwitchAccountsConfirmOpen, setIsSwitchAccountsConfirmOpen] =
    useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSwitchingAccounts, setIsSwitchingAccounts] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isVoiceSessionActive, setIsVoiceSessionActive] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [isVoiceDeafened, setIsVoiceDeafened] = useState(false);
  const [isVideoSession, setIsVideoSession] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamLabel, setStreamLabel] = useState<string | null>(null);
  const [isPmVideoSessionActive, setIsPmVideoSessionActive] = useState(false);
  const [isPmCameraOn, setIsPmCameraOn] = useState(false);
  const [menuRealName, setMenuRealName] = useState<string | null>(
    profileRealName ?? null,
  );
  const [menuProfileName, setMenuProfileName] = useState<string | null>(
    profileName ?? null,
  );
  const [menuPronouns, setMenuPronouns] = useState<string | null>(
    profilePronouns ?? null,
  );
  const [menuAvatarDecorationUrl, setMenuAvatarDecorationUrl] = useState<
    string | null
  >(profileAvatarDecorationUrl ?? null);
  const [menuProfileEffectUrl, setMenuProfileEffectUrl] = useState<
    string | null
  >(profileEffectUrl ?? null);
  const [menuNameplateLabel, setMenuNameplateLabel] = useState<string | null>(
    profileNameplateLabel ?? null,
  );
  const [menuNameplateColor, setMenuNameplateColor] = useState<string | null>(
    profileNameplateColor ?? null,
  );
  const [menuNameplateImageUrl, setMenuNameplateImageUrl] = useState<
    string | null
  >(profileNameplateImageUrl ?? null);
  const [menuProfileIcons, setMenuProfileIcons] = useState<ProfileIcon[]>(
    resolveProfileIcons({
      userId: profileId,
      role: profileRole,
      email: profileEmail,
      createdAt: profileJoinedAt,
    }),
  );
  const [menuBannerUrl, setMenuBannerUrl] = useState<string | null>(
    profileBannerUrl ?? null,
  );
  const [menuProfileRole, setMenuProfileRole] = useState<string | null>(
    profileRole ?? null,
  );
  const [menuPresenceStatus, setMenuPresenceStatus] = useState<PresenceStatus>(
    normalizePresenceStatus(profilePresenceStatus),
  );
  const [menuCurrentGame, setMenuCurrentGame] = useState<string | null>(
    profileCurrentGame?.trim() || null,
  );
  const [runtimeCurrentGame, setRuntimeCurrentGame] = useState<string | null>(
    null,
  );

  const buildMenuProfileIcons = (
    incomingIcons?: ProfileIcon[] | null,
    roleOverride?: string | null,
  ) => {
    const resolvedIcons = resolveProfileIcons({
      userId: profileId,
      role: roleOverride ?? profileRole,
      email: profileEmail,
      createdAt: profileJoinedAt,
    });

    if (!Array.isArray(incomingIcons) || incomingIcons.length === 0) {
      return resolvedIcons;
    }

    const seen = new Set<string>();
    const merged = [...incomingIcons, ...resolvedIcons].filter((icon) => {
      const key = String(icon?.key ?? "")
        .trim()
        .toLowerCase();
      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });

    return merged;
  };

  useEffect(() => {
    setMenuRealName(profileRealName ?? null);
    setMenuProfileName(profileName ?? null);
    setMenuPronouns(profilePronouns ?? null);
    setMenuAvatarDecorationUrl(profileAvatarDecorationUrl ?? null);
    setMenuProfileEffectUrl(profileEffectUrl ?? null);
    setMenuNameplateLabel(profileNameplateLabel ?? null);
    setMenuNameplateColor(profileNameplateColor ?? null);
    setMenuNameplateImageUrl(profileNameplateImageUrl ?? null);
    setMenuProfileIcons(
      resolveProfileIcons({
        userId: profileId,
        role: profileRole,
        email: profileEmail,
        createdAt: profileJoinedAt,
      }),
    );
    setMenuBannerUrl(profileBannerUrl ?? null);
    setMenuProfileRole(profileRole ?? null);
    setMenuPresenceStatus(normalizePresenceStatus(profilePresenceStatus));
    setMenuCurrentGame(profileCurrentGame?.trim() || null);
  }, [
    profileAvatarDecorationUrl,
    profileBannerUrl,
    profileCurrentGame,
    profileEffectUrl,
    profileEmail,
    profileId,
    profileJoinedAt,
    profileName,
    profileNameplateColor,
    profileNameplateImageUrl,
    profileNameplateLabel,
    profilePresenceStatus,
    profilePronouns,
    profileRealName,
    profileRole,
  ]);

  useEffect(() => {
    if (!isPopoverOpen) {
      return;
    }

    let cancelled = false;

    const loadFreshProfile = async () => {
      try {
        const response = await fetch("/api/profile/me", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          realName?: string | null;
          profileName?: string | null;
          pronouns?: string | null;
          comment?: string | null;
          profileIcons?: ProfileIcon[];
          avatarDecorationUrl?: string | null;
          profileEffectUrl?: string | null;
          nameplateLabel?: string | null;
          nameplateColor?: string | null;
          nameplateImageUrl?: string | null;
          bannerUrl?: string | null;
          role?: string | null;
          presenceStatus?: string | null;
          currentGame?: string | null;
        };

        if (!cancelled) {
          setMenuRealName(payload.realName?.trim() || null);
          setMenuProfileName(payload.profileName ?? null);
          setMenuPronouns(payload.pronouns ?? null);
          setMenuNameplateLabel(payload.nameplateLabel ?? null);
          setMenuNameplateColor(payload.nameplateColor ?? null);
          setMenuNameplateImageUrl(payload.nameplateImageUrl ?? null);
          setMenuProfileIcons(
            buildMenuProfileIcons(
              payload.profileIcons,
              payload.role ?? profileRole,
            ),
          );
          setMenuAvatarDecorationUrl(payload.avatarDecorationUrl ?? null);
          setMenuProfileEffectUrl(payload.profileEffectUrl ?? null);
          setMenuBannerUrl(payload.bannerUrl ?? null);
          setMenuProfileRole(payload.role ?? profileRole ?? null);
          setMenuPresenceStatus(
            normalizePresenceStatus(payload.presenceStatus),
          );
          setMenuCurrentGame(payload.currentGame?.trim() || null);
        }
      } catch (error) {
        console.error("[USER_STATUS_PROFILE_REFRESH]", error);
      }
    };

    void loadFreshProfile();

    return () => {
      cancelled = true;
    };
  }, [isPopoverOpen, profileEmail, profileId, profileJoinedAt, profileRole]);

  useEffect(() => {
    const handleProfileUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{
        realName?: string;
        profileName?: string;
        bannerUrl?: string | null;
        avatarDecorationUrl?: string | null;
        profileEffectUrl?: string | null;
        nameplateLabel?: string | null;
        nameplateColor?: string | null;
        nameplateImageUrl?: string | null;
        profileRole?: string | null;
        presenceStatus?: string;
        currentGame?: string | null;
      }>;

      if (typeof customEvent.detail?.realName === "string") {
        setMenuRealName(customEvent.detail.realName?.trim() || null);
      }

      if (typeof customEvent.detail?.profileName === "string") {
        setMenuProfileName(customEvent.detail.profileName || null);
      }

      if (
        customEvent.detail?.bannerUrl === null ||
        typeof customEvent.detail?.bannerUrl === "string"
      ) {
        setMenuBannerUrl(customEvent.detail.bannerUrl ?? null);
      }

      if (
        customEvent.detail?.avatarDecorationUrl === null ||
        typeof customEvent.detail?.avatarDecorationUrl === "string"
      ) {
        setMenuAvatarDecorationUrl(
          customEvent.detail.avatarDecorationUrl ?? null,
        );
      }

      if (
        customEvent.detail?.profileEffectUrl === null ||
        typeof customEvent.detail?.profileEffectUrl === "string"
      ) {
        setMenuProfileEffectUrl(customEvent.detail.profileEffectUrl ?? null);
      }

      if (
        customEvent.detail?.nameplateLabel === null ||
        typeof customEvent.detail?.nameplateLabel === "string"
      ) {
        setMenuNameplateLabel(customEvent.detail.nameplateLabel ?? null);
      }

      if (
        customEvent.detail?.nameplateColor === null ||
        typeof customEvent.detail?.nameplateColor === "string"
      ) {
        setMenuNameplateColor(customEvent.detail.nameplateColor ?? null);
      }

      if (
        customEvent.detail?.nameplateImageUrl === null ||
        typeof customEvent.detail?.nameplateImageUrl === "string"
      ) {
        setMenuNameplateImageUrl(customEvent.detail.nameplateImageUrl ?? null);
      }

      if (
        customEvent.detail?.profileRole === null ||
        typeof customEvent.detail?.profileRole === "string"
      ) {
        setMenuProfileRole(customEvent.detail.profileRole ?? null);
        setMenuProfileIcons(
          buildMenuProfileIcons(
            undefined,
            customEvent.detail.profileRole ?? null,
          ),
        );
      }

      if (typeof customEvent.detail?.presenceStatus === "string") {
        setMenuPresenceStatus(
          normalizePresenceStatus(customEvent.detail.presenceStatus),
        );
      }

      if (
        customEvent.detail?.currentGame === null ||
        typeof customEvent.detail?.currentGame === "string"
      ) {
        setMenuCurrentGame(customEvent.detail.currentGame?.trim() || null);
      }
    };

    window.addEventListener("inaccord:profile-updated", handleProfileUpdated);

    return () => {
      window.removeEventListener(
        "inaccord:profile-updated",
        handleProfileUpdated,
      );
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const loadRuntimeActivity = async () => {
      try {
        const payload = (await fetch("/api/profile/runtime-activity", {
          cache: "no-store",
        }).then((response) => (response.ok ? response.json() : null))) as {
          type?: string;
          title?: string;
        } | null;

        if (isCancelled) {
          return;
        }

        const runtimeType = String(payload?.type ?? "")
          .trim()
          .toLowerCase();
        const runtimeTitle = String(payload?.title ?? "").trim();
        if (runtimeType === "game" && runtimeTitle) {
          setRuntimeCurrentGame(runtimeTitle);
          return;
        }

        setRuntimeCurrentGame(null);
      } catch {
        if (!isCancelled) {
          setRuntimeCurrentGame(null);
        }
      }
    };

    void loadRuntimeActivity();
    const interval = window.setInterval(() => {
      void loadRuntimeActivity();
    }, 3000);

    return () => {
      isCancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const handleCopyId = async () => {
    if (!profileId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(profileId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch (error) {
      console.error("[USER_STATUS_COPY_ID]", error);
    }
  };

  const openSettings = () => {
    onOpen("settings", {
      profileId,
      profileRealName: menuRealName,
      profileName: menuProfileName,
      profileRole: menuProfileRole ?? profileRole,
      profileEmail,
      profileImageUrl,
      profileAvatarDecorationUrl: menuAvatarDecorationUrl,
      profileEffectUrl: menuProfileEffectUrl,
      profileNameplateLabel: menuNameplateLabel,
      profileNameplateColor: menuNameplateColor,
      profileBannerUrl,
      profilePresenceStatus: menuPresenceStatus,
      profileCurrentGame: menuCurrentGame,
      profileJoinedAt,
      profileLastLogonAt,
    });
  };

  const openPatronSettings = () => {
    onOpen("settings", {
      profileId,
      profileRealName: menuRealName,
      profileName: menuProfileName,
      profileRole: menuProfileRole ?? profileRole,
      profileEmail,
      profileImageUrl,
      profileAvatarDecorationUrl: menuAvatarDecorationUrl,
      profileEffectUrl: menuProfileEffectUrl,
      profileNameplateLabel: menuNameplateLabel,
      profileNameplateColor: menuNameplateColor,
      profileBannerUrl,
      profilePresenceStatus: menuPresenceStatus,
      profileCurrentGame: menuCurrentGame,
      profileJoinedAt,
      profileLastLogonAt,
      query: {
        settingsSection: "becomePatron",
      },
    });
  };

  const openInAccordAdminPanel = () => {
    onOpen("inAccordAdmin", {
      profileId,
      profileRealName: menuRealName,
      profileName: menuProfileName,
      profileRole: menuProfileRole ?? profileRole,
      profileEmail,
      profileImageUrl,
      profileAvatarDecorationUrl: menuAvatarDecorationUrl,
      profileEffectUrl: menuProfileEffectUrl,
      profileNameplateLabel: menuNameplateLabel,
      profileNameplateColor: menuNameplateColor,
      profileBannerUrl: menuBannerUrl,
      profileJoinedAt,
      profileLastLogonAt,
    });
  };

  const onAddFriend = () => {
    setIsPopoverOpen(false);
    const targetProfileId = String(profileId ?? "").trim();

    if (!targetProfileId) {
      window.alert("Unable to send friend request from this view.");
      return;
    }

    void axios
      .post<FriendRequestPostResponse>("/api/friends/requests", {
        profileId: targetProfileId,
      })
      .then((response) => {
        router.refresh();
        const nextRelationshipStatus = getDirectFriendStatusFromRequestResponse(
          response.data,
        );

        if (nextRelationshipStatus === "friends") {
          window.alert("You are already direct friends.");
          return;
        }

        if (nextRelationshipStatus === "incoming_pending") {
          window.alert(
            "This user already sent you a friend request. Accept it from Pending.",
          );
          return;
        }

        if (response.data.created === false) {
          window.alert("Friend request already pending.");
          return;
        }

        window.alert("Friend request sent.");
      })
      .catch((error) => {
        const message = axios.isAxiosError(error)
          ? ((error.response?.data as { error?: string } | undefined)?.error ??
            "Failed to send friend request.")
          : "Failed to send friend request.";
        window.alert(message);
      });
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
        setIsVoiceMuted(detail.isMuted);
      }

      if (typeof detail.isDeafened === "boolean") {
        setIsVoiceDeafened(detail.isDeafened);
      }

      if (typeof detail.isVideoChannel === "boolean") {
        setIsVideoSession(detail.isVideoChannel);
      }

      if (typeof detail.isCameraOn === "boolean") {
        setIsCameraOn(detail.isCameraOn);
        if (detail.isCameraOn) {
          setIsVideoSession(true);
        }
      }

      if (typeof detail.isStreaming === "boolean") {
        setIsStreaming(detail.isStreaming);
        if (detail.isStreaming) {
          setIsVideoSession(true);
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

    window.addEventListener(
      VOICE_STATE_SYNC_EVENT,
      onVoiceStateSync as EventListener,
    );

    return () => {
      window.removeEventListener(
        VOICE_STATE_SYNC_EVENT,
        onVoiceStateSync as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    const onPmCameraStateSync = (event: Event) => {
      const customEvent = event as CustomEvent<{
        active?: boolean;
        isCameraOn?: boolean;
      }>;

      if (typeof customEvent.detail?.active === "boolean") {
        setIsPmVideoSessionActive(customEvent.detail.active);
      }

      if (typeof customEvent.detail?.isCameraOn === "boolean") {
        setIsPmCameraOn(customEvent.detail.isCameraOn);
      }
    };

    window.addEventListener(
      PM_CAMERA_STATE_SYNC_EVENT,
      onPmCameraStateSync as EventListener,
    );

    return () => {
      window.removeEventListener(
        PM_CAMERA_STATE_SYNC_EVENT,
        onPmCameraStateSync as EventListener,
      );
    };
  }, []);

  const onToggleCamera = () => {
    const canControlVoiceCamera = isVoiceSessionActive && isVideoSession;
    const canControlPmCamera = isPmVideoSessionActive;

    if (!canControlVoiceCamera && !canControlPmCamera) {
      window.alert(
        "Join a live video channel or start a PM video call to use camera controls.",
      );
      return;
    }

    const next = !(canControlVoiceCamera ? isCameraOn : isPmCameraOn);

    if (canControlVoiceCamera) {
      setIsCameraOn(next);
      if (next) {
        setIsStreaming(false);
        setStreamLabel(null);
        window.dispatchEvent(
          new CustomEvent(VOICE_TOGGLE_STREAM_EVENT, {
            detail: {
              isStreaming: false,
              streamLabel: null,
            },
          }),
        );
      }
      window.dispatchEvent(
        new CustomEvent(VOICE_TOGGLE_CAMERA_EVENT, {
          detail: { isCameraOn: next },
        }),
      );
    }

    if (canControlPmCamera) {
      setIsPmCameraOn(next);
      window.dispatchEvent(
        new CustomEvent(PM_TOGGLE_CAMERA_EVENT, {
          detail: { isCameraOn: next },
        }),
      );
    }
  };

  const onToggleStream = () => {
    const canControlStreaming = isVoiceSessionActive && isVideoSession;

    if (!canControlStreaming) {
      window.alert("Join a live video channel to start streaming.");
      return;
    }

    const next = !isStreaming;
    setIsStreaming(next);
    if (!next) {
      setStreamLabel(null);
    }
    if (next) {
      setIsCameraOn(false);
      window.dispatchEvent(
        new CustomEvent(VOICE_TOGGLE_CAMERA_EVENT, {
          detail: { isCameraOn: false },
        }),
      );
    }

    window.dispatchEvent(
      new CustomEvent(VOICE_TOGGLE_STREAM_EVENT, {
        detail: {
          isStreaming: next,
          streamLabel: next ? streamLabel : null,
        },
      }),
    );
  };

  const onToggleMute = () => {
    if (!isVoiceSessionActive) {
      window.alert("Join a voice channel to use mute.");
      return;
    }

    const next = !isVoiceMuted;
    setIsVoiceMuted(next);
    window.dispatchEvent(
      new CustomEvent(VOICE_TOGGLE_MUTE_EVENT, { detail: { isMuted: next } }),
    );
  };

  const onToggleDeafen = () => {
    if (!isVoiceSessionActive) {
      window.alert("Join a voice channel to use deafen.");
      return;
    }

    const next = !isVoiceDeafened;
    setIsVoiceDeafened(next);
    window.dispatchEvent(
      new CustomEvent(VOICE_TOGGLE_DEAFEN_EVENT, {
        detail: { isDeafened: next },
      }),
    );
  };

  const statusDotClassMap: Record<PresenceStatus, string> = {
    ONLINE: "bg-emerald-500",
    DND: "bg-rose-500",
    INVISIBLE: "bg-yellow-400",
    OFFLINE: "bg-black border border-zinc-400",
  };

  const onChangeStatus = async (nextStatus: PresenceStatus) => {
    if (nextStatus === menuPresenceStatus || isSavingStatus) {
      return;
    }

    const previousStatus = menuPresenceStatus;
    setMenuPresenceStatus(nextStatus);

    try {
      setIsSavingStatus(true);
      await axios.patch("/api/profile/status", { status: nextStatus });

      window.dispatchEvent(
        new CustomEvent("inaccord:profile-updated", {
          detail: {
            presenceStatus: nextStatus,
          },
        }),
      );
    } catch (error) {
      setMenuPresenceStatus(previousStatus);
      console.error("[USER_STATUS_UPDATE]", error);
      window.alert("Failed to update status.");
    } finally {
      setIsSavingStatus(false);
    }
  };

  const onLogoff = async () => {
    if (isLoggingOut) {
      return;
    }

    try {
      setIsLoggingOut(true);
      await axios.post("/api/auth/logout");
      setIsPopoverOpen(false);
      router.push("/sign-in");
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Logoff failed";
        console.error(
          "[USER_STATUS_LOGOFF]",
          error.response?.data ?? error.message,
        );
        window.alert(message);
      } else {
        console.error("[USER_STATUS_LOGOFF]", error);
        window.alert("Logoff failed");
      }
    } finally {
      setIsLoggingOut(false);
    }
  };

  const onSwitchAccounts = () => {
    if (isSwitchingAccounts || isLoggingOut) {
      return;
    }

    setIsSwitchAccountsConfirmOpen(true);
  };

  const onConfirmSwitchAccounts = () => {
    if (isSwitchingAccounts || isLoggingOut) {
      return;
    }

    setIsSwitchingAccounts(true);
    setIsSwitchAccountsConfirmOpen(false);
    setIsPopoverOpen(false);
    window.location.assign("/api/auth/clear-session?next=/sign-in");
  };

  const formatDate = (value?: string | null) => {
    if (!value) {
      return "";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return parsed.toLocaleString();
  };

  const lastLogon = formatDate(profileLastLogonAt);
  const created = formatDate(profileJoinedAt);
  const effectiveGlobalRole = menuProfileRole ?? profileRole;
  const hasAdministrativeAccess =
    hasInAccordAdministrativeAccess(effectiveGlobalRole);
  const isGlobalDeveloper = isInAccordDeveloper(effectiveGlobalRole);
  const isGlobalAdministrator = isInAccordAdministrator(effectiveGlobalRole);
  const isGlobalModerator = isInAccordModerator(effectiveGlobalRole);
  const highestRoleIcon = isGlobalDeveloper ? (
    <Wrench
      className="h-4 w-4 shrink-0 text-cyan-400"
      aria-label="Developer"
      suppressHydrationWarning
    />
  ) : isGlobalAdministrator ? (
    <Crown
      className="h-4 w-4 shrink-0 text-rose-500"
      aria-label="Administrator"
      suppressHydrationWarning
    />
  ) : isGlobalModerator ? (
    <ModeratorLineIcon
      className="h-4 w-4 shrink-0 text-indigo-500"
      aria-label="Moderator"
      suppressHydrationWarning
    />
  ) : null;
  const roleMetaOnPlate = highestRoleIcon ? (
    <span className="inline-flex items-center">{highestRoleIcon}</span>
  ) : null;
  const fallbackNameFromEmail = profileEmail?.split("@")[0]?.trim() || "";
  const displayStatusName =
    menuProfileName?.trim() ||
    menuRealName?.trim() ||
    fallbackNameFromEmail ||
    profileId ||
    "Deleted User";
  const displayNameForProfileCard =
    menuRealName?.trim() ||
    menuProfileName?.trim() ||
    fallbackNameFromEmail ||
    profileId ||
    "Deleted User";
  const canControlVoiceCamera = isVoiceSessionActive && isVideoSession;
  const canUseCameraControls = canControlVoiceCamera || isPmVideoSessionActive;
  const canUseStreamingControls = canControlVoiceCamera;
  const effectiveCameraOn = canControlVoiceCamera ? isCameraOn : isPmCameraOn;
  const effectiveCurrentGame =
    runtimeCurrentGame?.trim() || menuCurrentGame?.trim() || null;
  const showCurrentGameIcon = Boolean(effectiveCurrentGame);
  const resolvedMenuBannerUrl = resolveBannerUrl(menuBannerUrl);

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex min-w-0 items-center gap-4 rounded-xl px-1 py-1 text-left transition hover:bg-[#2a2b2f]"
          aria-label="Open user menu"
        >
          <UserAvatar
            src={profileImageUrl ?? undefined}
            decorationSrc={menuAvatarDecorationUrl}
            className="h-20 w-20"
          />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <ProfileNameWithServerTag
                name={displayStatusName}
                profileId={profileId}
                nameClassName="text-xs font-semibold text-white"
              />
              {highestRoleIcon}
            </div>
            <p className="truncate text-[10px] text-[#b5bac1]">
              {formatPresenceStatusLabel(menuPresenceStatus, {
                showGameIcon: showCurrentGameIcon,
              })}
            </p>
          </div>
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={10}
        className="relative w-[320px] overflow-hidden rounded-xl border border-black/30 bg-[#111214] p-0 text-[#dbdee1] shadow-2xl shadow-black/50"
      >
        <ProfileEffectLayer src={menuProfileEffectUrl} />
        <div className="relative h-24 bg-linear-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
          {resolvedMenuBannerUrl ? (
            <BannerImage
              src={resolvedMenuBannerUrl}
              alt="User banner"
              className="object-cover"
            />
          ) : null}
        </div>

        <div className="relative p-3 pt-9">
          <div className="absolute -top-10 left-3 rounded-full border-4 border-[#111214]">
            <UserAvatar
              src={profileImageUrl ?? undefined}
              decorationSrc={menuAvatarDecorationUrl}
              className="h-20 w-20"
            />
          </div>

          <ProfileIconRow icons={menuProfileIcons} />
          <div className="flex w-full min-w-0 items-start gap-1.5">
            <ProfileNameWithServerTag
              name={displayStatusName}
              profileId={profileId}
              pronouns={menuPronouns?.trim() || null}
              containerClassName="w-full min-w-0"
              nameClassName="text-base font-bold text-white"
              showNameplate
              nameplateClassName="mb-0 w-full max-w-full"
              plateMetaIcons={roleMetaOnPlate}
            />
          </div>
          <div className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] p-3 text-xs">
            <div className="space-y-1 text-[#dbdee1]">
              <p>Name: {displayNameForProfileCard}</p>
              <p>Profile Name: {menuProfileName || "Not set"}</p>
              <p>Email: {profileEmail || ""}</p>
              <p>
                Status:{" "}
                {formatPresenceStatusLabel(menuPresenceStatus, {
                  showGameIcon: showCurrentGameIcon,
                })}
              </p>
              <p>Current Game: {effectiveCurrentGame || "Not in game"}</p>
              <p>Last logon: {lastLogon}</p>
              <p>Created: {created}</p>
            </div>

            <div className="mt-3 rounded-md border border-white/10 bg-[#15161a] p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                  User Status
                </p>
              </div>
              <p className="mb-2 text-[10px] text-[#949ba4]">
                {!canUseCameraControls && !canUseStreamingControls
                  ? "Join a live video channel to use camera and streaming controls"
                  : canControlVoiceCamera
                    ? isStreaming
                      ? getStreamSummaryText(streamLabel)
                      : "Voice video camera and streaming controls active"
                    : "PM camera control active"}
              </p>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleMute}
                  disabled={!isVoiceSessionActive}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    isVoiceMuted
                      ? "border-rose-400/45 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30"
                      : "border-emerald-400/45 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
                  }`}
                  title={
                    !isVoiceSessionActive
                      ? "Join a voice channel to use mute"
                      : isVoiceMuted
                        ? "Unmute"
                        : "Mute"
                  }
                  aria-label={isVoiceMuted ? "Unmute" : "Mute"}
                >
                  {isVoiceMuted ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={onToggleDeafen}
                  disabled={!isVoiceSessionActive}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    isVoiceDeafened
                      ? "border-rose-400/45 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30"
                      : "border-emerald-400/45 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
                  }`}
                  title={
                    !isVoiceSessionActive
                      ? "Join a voice channel to use deafen"
                      : isVoiceDeafened
                        ? "Undeafen"
                        : "Deafen"
                  }
                  aria-label={isVoiceDeafened ? "Undeafen" : "Deafen"}
                >
                  {isVoiceDeafened ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Headphones className="h-4 w-4" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={onToggleCamera}
                  disabled={!canUseCameraControls}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    effectiveCameraOn
                      ? "border-emerald-400/45 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
                      : "border-zinc-600 bg-zinc-700/70 text-zinc-300 hover:bg-zinc-600"
                  }`}
                  aria-label={
                    effectiveCameraOn ? "Turn camera off" : "Turn camera on"
                  }
                  title={
                    !canUseCameraControls
                      ? "Join a live video channel or start a PM video call to enable camera"
                      : effectiveCameraOn
                        ? "Turn camera off"
                        : "Turn camera on"
                  }
                >
                  {effectiveCameraOn ? (
                    <Video className="h-4 w-4" />
                  ) : (
                    <VideoOff className="h-4 w-4" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={onToggleStream}
                  disabled={!canUseStreamingControls}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    isStreaming
                      ? "border-indigo-300/60 bg-indigo-500/30 text-indigo-100 hover:bg-indigo-500/40"
                      : "border-zinc-600 bg-zinc-700/70 text-zinc-300 hover:bg-zinc-600"
                  }`}
                  aria-label={isStreaming ? "Stop stream" : "Start stream"}
                  title={
                    !canUseStreamingControls
                      ? "Join a live video channel to enable streaming"
                      : isStreaming
                        ? "Stop stream"
                        : "Start stream"
                  }
                >
                  {isStreaming ? (
                    <ScreenShare className="h-4 w-4" />
                  ) : (
                    <ScreenShareOff className="h-4 w-4" />
                  )}
                </button>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={isSavingStatus}
                    className="flex w-full items-center justify-between rounded-md border border-white/10 bg-[#1e1f22] px-2 py-2 text-xs text-white transition hover:bg-[#2a2b30] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${statusDotClassMap[menuPresenceStatus]}`}
                      />
                      {formatPresenceStatusLabel(menuPresenceStatus, {
                        showGameIcon: showCurrentGameIcon,
                      })}
                    </span>
                    <span className="text-[10px] text-[#949ba4]">
                      {isSavingStatus ? "Saving..." : "Change"}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-44 border border-black/40 bg-[#1e1f22] p-1 text-white"
                >
                  {presenceStatusValues.map((status) => (
                    <DropdownMenuItem
                      key={status}
                      onClick={() => onChangeStatus(status)}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-white focus:bg-[#2f3136]"
                    >
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${statusDotClassMap[status]}`}
                      />
                      <span>{presenceStatusLabelMap[status]}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div className="space-y-1 border-t border-white/10 p-3 pt-2">
          {hasAdministrativeAccess ? (
            <button
              type="button"
              onClick={openInAccordAdminPanel}
              className="flex w-full items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-500/20"
            >
              <ShieldAlert className="h-4 w-4" />
              In-Accord Staff
            </button>
          ) : null}

          <button
            type="button"
            onClick={openSettings}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-[#dbdee1] transition hover:bg-[#2f3136]"
          >
            <Settings className="h-4 w-4" />
            User Settings
          </button>

          <button
            type="button"
            onClick={openPatronSettings}
            className="flex w-full items-center gap-2 rounded-md border border-yellow-500/20 bg-yellow-500/10 px-2 py-2 text-sm text-yellow-200 transition hover:bg-yellow-500/20"
          >
            <Crown className="h-4 w-4" />
            Become a Patron
          </button>

          <button
            type="button"
            onClick={handleCopyId}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-[#dbdee1] transition hover:bg-[#2f3136]"
          >
            <Copy className="h-4 w-4" />
            {copied ? "Copied User ID" : "Copy User ID"}
          </button>

          <button
            type="button"
            onClick={onSwitchAccounts}
            disabled={isSwitchingAccounts || isLoggingOut}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-amber-200 transition hover:bg-[#3a3520] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${isSwitchingAccounts ? "animate-spin" : ""}`}
            />
            {isSwitchingAccounts ? "Switching accounts..." : "Switch Accounts"}
          </button>

          <button
            type="button"
            onClick={onLogoff}
            disabled={isLoggingOut || isSwitchingAccounts}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-rose-300 transition hover:bg-[#3a1f24] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {isLoggingOut ? "Logging off..." : "Logoff"}
          </button>

          <p className="px-2 pt-1 text-[11px] text-[#949ba4]">
            {INACCORD_VERSION_LABEL
              ? `Version ${INACCORD_VERSION_LABEL}`
              : "Version Live"}
            {INACCORD_BUILD_NUMBER ? ` • Build #${INACCORD_BUILD_NUMBER}` : ""}
          </p>
        </div>
      </PopoverContent>

      <Dialog
        open={isSwitchAccountsConfirmOpen}
        onOpenChange={setIsSwitchAccountsConfirmOpen}
      >
        <DialogContent className="w-105 border-black/30 bg-[#111214] text-[#dbdee1]">
          <DialogTitle className="text-base font-semibold text-white">
            Switch Accounts?
          </DialogTitle>

          <div className="mt-2 space-y-2 text-sm text-[#b5bac1]">
            <p>
              This will clear your current session and send you to the sign-in
              page.
            </p>
            <p className="text-xs text-[#949ba4]">
              Your local settings remain saved. You can sign back in anytime.
            </p>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsSwitchAccountsConfirmOpen(false)}
              disabled={isSwitchingAccounts}
              className="rounded-md border border-white/15 bg-[#1e1f22] px-3 py-2 text-sm text-[#dbdee1] transition hover:bg-[#2a2b30] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmSwitchAccounts}
              disabled={isSwitchingAccounts}
              className="inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${isSwitchingAccounts ? "animate-spin" : ""}`}
              />
              {isSwitchingAccounts ? "Switching..." : "Switch Accounts"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </Popover>
  );
};
