"use client";

import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import {
  Accessibility,
  Activity,
  Baby,
  Bell,
  CreditCard,
  Camera,
  Crown,
  Gamepad2,
  Gift,
  IdCard,
  ImageIcon,
  Keyboard,
  Languages,
  Loader2,
  Link2,
  LogOut,
  Mic,
  Monitor,
  Palette,
  Puzzle,
  Radio,
  Receipt,
  Rocket,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  User,
  UserPlus,
  LockKeyhole,
} from "lucide-react";
import axios from "axios";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DialogDescription,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { useModal } from "@/hooks/use-modal-store";
import { isInAccordAdministrator } from "@/lib/in-accord-admin";
import { normalizePresenceStatus, presenceStatusLabelMap } from "@/lib/presence-status";
import { readMentionsEnabled, writeMentionsEnabled } from "@/lib/mentions";

type SettingsSection =
  | "myAccount"
  | "profiles"
  | "contentSocial"
  | "dataPrivacy"
  | "familyCenter"
  | "authorizedApps"
  | "devices"
  | "connections"
  | "friendRequests"
  | "nitro"
  | "serverBoost"
  | "subscriptions"
  | "giftInventory"
  | "billing"
  | "appearance"
  | "accessibility"
  | "voiceVideo"
  | "textImages"
  | "notifications"
  | "keybinds"
  | "language"
  | "streamerMode"
  | "advanced"
  | "activityPrivacy"
  | "registeredGames"
  | "gameOverlay";

type SectionGroup = {
  label: string;
  sections: SettingsSection[];
};

const sectionGroups: SectionGroup[] = [
  {
    label: "User Settings",
    sections: [
      "myAccount",
      "profiles",
      "contentSocial",
      "dataPrivacy",
      "familyCenter",
      "authorizedApps",
      "devices",
      "connections",
      "friendRequests",
    ],
  },
  {
    label: "Billing Settings",
    sections: ["nitro", "serverBoost", "subscriptions", "giftInventory", "billing"],
  },
  {
    label: "App Settings",
    sections: [
      "appearance",
      "accessibility",
      "voiceVideo",
      "textImages",
      "notifications",
      "keybinds",
      "language",
      "streamerMode",
      "advanced",
    ],
  },
  {
    label: "Activity Settings",
    sections: ["activityPrivacy", "registeredGames", "gameOverlay"],
  },
];

const sectionLabelMap: Record<SettingsSection, string> = {
  myAccount: "My Account",
  profiles: "Profiles",
  contentSocial: "Content & Social",
  dataPrivacy: "Data & Privacy",
  familyCenter: "Family Center",
  authorizedApps: "Authorized Apps",
  devices: "Devices",
  connections: "Connections",
  friendRequests: "Friend Requests",
  nitro: "Nitro",
  serverBoost: "Server Boost",
  subscriptions: "Subscriptions",
  giftInventory: "Gift Inventory",
  billing: "Billing",
  appearance: "Appearance",
  accessibility: "Accessibility",
  voiceVideo: "Voice & Video",
  textImages: "Text & Images",
  notifications: "Notifications",
  keybinds: "Keybinds",
  language: "Language",
  streamerMode: "Streamer Mode",
  advanced: "Advanced",
  activityPrivacy: "Activity Privacy",
  registeredGames: "Registered Games",
  gameOverlay: "Game Overlay",
};

const sectionDescriptionMap: Record<SettingsSection, string> = {
  myAccount: "Manage your In-Accord profile information and account actions.",
  profiles: "Set profile customization per identity and server context.",
  contentSocial: "Control content display and social discovery preferences.",
  dataPrivacy: "Review data, privacy, and safety controls.",
  familyCenter: "Family and supervised account controls.",
  authorizedApps: "Manage third-party apps connected to your account.",
  devices: "Review and manage signed-in devices.",
  connections: "Connect and manage linked external accounts.",
  friendRequests: "Set who can send friend requests and contact you.",
  nitro: "Manage premium perks and benefits.",
  serverBoost: "Manage boost perks and active boosts.",
  subscriptions: "Review and manage recurring subscriptions.",
  giftInventory: "View and redeem your gift inventory.",
  billing: "Manage payment methods and billing details.",
  appearance: "Customize how In-Accord looks and feels.",
  accessibility: "Accessibility preferences for contrast, motion, and readability.",
  voiceVideo: "Configure input/output devices and voice processing.",
  textImages: "Choose how text and media are displayed.",
  notifications: "Control when and how you get notified.",
  keybinds: "Customize keyboard shortcuts and hotkeys.",
  language: "Set language and regional preferences.",
  streamerMode: "Configure streamer-safe and privacy-focused options.",
  advanced: "Advanced application behavior and diagnostics options.",
  activityPrivacy: "Control how your activity is shared.",
  registeredGames: "Manage detected and manually-added games.",
  gameOverlay: "Configure in-game overlay behavior.",
};

const sectionIconMap: Record<SettingsSection, React.ComponentType<{ className?: string }>> = {
  myAccount: User,
  profiles: IdCard,
  contentSocial: ImageIcon,
  dataPrivacy: Shield,
  familyCenter: Baby,
  authorizedApps: Puzzle,
  devices: Smartphone,
  connections: Link2,
  friendRequests: UserPlus,
  nitro: Sparkles,
  serverBoost: Rocket,
  subscriptions: Receipt,
  giftInventory: Gift,
  billing: CreditCard,
  appearance: Palette,
  accessibility: Accessibility,
  voiceVideo: Mic,
  textImages: ImageIcon,
  notifications: Bell,
  keybinds: Keyboard,
  language: Languages,
  streamerMode: Radio,
  advanced: SlidersHorizontal,
  activityPrivacy: LockKeyhole,
  registeredGames: Gamepad2,
  gameOverlay: Monitor,
};

const CUSTOM_CSS_STORAGE_KEY = "in-accord-custom-css";
const CUSTOM_CSS_STYLE_ID = "in-accord-custom-css-style";
const DOWNLOADED_PLUGINS_STORAGE_KEY = "in-accord-downloaded-plugins";

export const SettingsModal = () => {
  const router = useRouter();
  const { isOpen, onClose, type, data } = useModal();
  const [activeSection, setActiveSection] = useState<SettingsSection>("myAccount");
  const [displaySection, setDisplaySection] = useState<SettingsSection>("myAccount");
  const [isSectionVisible, setIsSectionVisible] = useState(true);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSavingProfileName, setIsSavingProfileName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [realName, setRealName] = useState(data.profileRealName ?? "");
  const [profileName, setProfileName] = useState("");
  const [profileRole, setProfileRole] = useState<string | null>(data.profileRole ?? null);
  const [profilePresenceStatus, setProfilePresenceStatus] = useState(
    normalizePresenceStatus(data.profilePresenceStatus)
  );
  const [profileNameError, setProfileNameError] = useState<string | null>(null);
  const [profileNameSuccess, setProfileNameSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(data.profileImageUrl ?? null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(data.profileBannerUrl ?? null);
  const [resolvedProfileId, setResolvedProfileId] = useState<string | null>(data.profileId ?? null);
  const [mentionsEnabled, setMentionsEnabled] = useState(true);
  const [customCss, setCustomCss] = useState("");
  const [customCssStatus, setCustomCssStatus] = useState<string | null>(null);
  const [isCustomCssEditorOpen, setIsCustomCssEditorOpen] = useState(false);
  const [isPluginsInstalledPanelOpen, setIsPluginsInstalledPanelOpen] = useState(false);
  const [isDownloadedPluginsPanelOpen, setIsDownloadedPluginsPanelOpen] = useState(false);
  const [isPluginUploadsPanelOpen, setIsPluginUploadsPanelOpen] = useState(false);
  const [downloadedPlugins, setDownloadedPlugins] = useState<string[]>([]);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  const isModalOpen = isOpen && type === "settings";

  const installedPluginsCount = useMemo(() => downloadedPlugins.length, [downloadedPlugins.length]);

  const installedPluginsCountLabel = useMemo(
    () => installedPluginsCount.toString().padStart(2, "0"),
    [installedPluginsCount]
  );

  const sections = useMemo<SettingsSection[]>(() => sectionGroups.flatMap((group) => group.sections), []);

  useEffect(() => {
    setAvatarUrl(data.profileImageUrl ?? null);
  }, [data.profileImageUrl]);

  useEffect(() => {
    setBannerUrl(data.profileBannerUrl ?? null);
  }, [data.profileBannerUrl]);

  useEffect(() => {
    setRealName(data.profileRealName ?? "");
    setProfileName("");
    setProfileRole(data.profileRole ?? null);
    setProfilePresenceStatus(normalizePresenceStatus(data.profilePresenceStatus));
    setProfileNameError(null);
    setProfileNameSuccess(null);
  }, [data.profileName, data.profilePresenceStatus, data.profileRealName, data.profileRole, isModalOpen]);

  useEffect(() => {
    setResolvedProfileId(data.profileId ?? null);
  }, [data.profileId]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    setMentionsEnabled(readMentionsEnabled());
  }, [isModalOpen]);

  const onToggleMentions = () => {
    const next = !mentionsEnabled;
    setMentionsEnabled(next);
    writeMentionsEnabled(next);
    window.dispatchEvent(new Event("inaccord:mentions-setting-updated"));
  };

  const applyCustomCss = (cssText: string) => {
    if (typeof document === "undefined") {
      return;
    }

    let styleElement = document.getElementById(CUSTOM_CSS_STYLE_ID) as HTMLStyleElement | null;
    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = CUSTOM_CSS_STYLE_ID;
      document.head.appendChild(styleElement);
    }

    styleElement.textContent = cssText;
  };

  const onSaveCustomCss = () => {
    try {
      applyCustomCss(customCss);
      window.localStorage.setItem(CUSTOM_CSS_STORAGE_KEY, customCss);
      setCustomCssStatus("Custom CSS saved and applied.");
    } catch {
      setCustomCssStatus("Could not save Custom CSS in this browser.");
    }
  };

  const onResetCustomCss = () => {
    setCustomCss("");
    applyCustomCss("");
    setCustomCssStatus("Custom CSS cleared.");

    try {
      window.localStorage.removeItem(CUSTOM_CSS_STORAGE_KEY);
    } catch {
      // ignore storage failures
    }
  };

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    let cancelled = false;

    const resolveProfileId = async () => {
      try {
        const response = await axios.get<{
          id?: string;
          name?: string;
          realName?: string;
          profileName?: string | null;
          bannerUrl?: string | null;
          role?: string | null;
          presenceStatus?: string | null;
        }>("/api/profile/me");
        if (!cancelled) {
          setResolvedProfileId(response.data?.id ?? null);
          setRealName(response.data?.realName ?? response.data?.name ?? "");
          setProfileName(response.data?.profileName ?? "");
          setBannerUrl(response.data?.bannerUrl ?? null);
          setProfileRole(response.data?.role ?? data.profileRole ?? null);
          setProfilePresenceStatus(normalizePresenceStatus(response.data?.presenceStatus));
        }
      } catch (error) {
        if (!cancelled) {
          setResolvedProfileId(null);
        }
      }
    };

    void resolveProfileId();

    return () => {
      cancelled = true;
    };
  }, [data.profileRole, isModalOpen]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    try {
      const storedCss = window.localStorage.getItem(CUSTOM_CSS_STORAGE_KEY) || "";
      setCustomCss(storedCss);
      applyCustomCss(storedCss);

      const downloadedRaw = window.localStorage.getItem(DOWNLOADED_PLUGINS_STORAGE_KEY);
      if (downloadedRaw) {
        const parsed = JSON.parse(downloadedRaw) as unknown;
        if (Array.isArray(parsed)) {
          setDownloadedPlugins(
            parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          );
        } else {
          setDownloadedPlugins([]);
        }
      } else {
        setDownloadedPlugins([]);
      }
    } catch {
      setCustomCss("");
      setDownloadedPlugins([]);
    }
  }, [isModalOpen]);

  useEffect(() => {
    applyCustomCss(customCss);
  }, [customCss]);

  const onSaveProfileName = async () => {
    const trimmedName = profileName.trim();

    setProfileNameError(null);
    setProfileNameSuccess(null);

    if (!trimmedName) {
      setProfileNameError("Profile Name is required.");
      return;
    }

    if (trimmedName.length > 80) {
      setProfileNameError("Profile Name must be 80 characters or fewer.");
      return;
    }

    try {
      setIsSavingProfileName(true);

      const response = await axios.patch<{ ok: boolean; profileName: string }>("/api/profile/name", {
        profileName: trimmedName,
      });

      const savedName = response.data?.profileName ?? trimmedName;
      setProfileName(savedName);
      setProfileNameSuccess("Profile Name updated.");
      window.dispatchEvent(
        new CustomEvent("inaccord:profile-updated", {
          detail: {
            profileId: resolvedProfileId,
            profileName: savedName,
          },
        })
      );
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Failed to update Profile Name";
        setProfileNameError(message);
      } else {
        setProfileNameError("Failed to update Profile Name");
      }
    } finally {
      setIsSavingProfileName(false);
    }
  };

  useEffect(() => {
    if (activeSection === displaySection) {
      return;
    }

    setIsSectionVisible(false);

    const timer = setTimeout(() => {
      setDisplaySection(activeSection);
      setIsSectionVisible(true);
    }, 120);

    return () => clearTimeout(timer);
  }, [activeSection, displaySection]);

  const onPickAvatar = () => {
    if (isUploadingAvatar) {
      return;
    }

    avatarInputRef.current?.click();
  };

  const onAvatarChange = async (file?: File) => {
    if (!file) {
      return;
    }

    try {
      setIsUploadingAvatar(true);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=userImage",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      await axios.patch("/api/profile/avatar", {
        imageUrl: upload.data.url,
      });

      setAvatarUrl(upload.data.url);
      window.dispatchEvent(
        new CustomEvent("inaccord:profile-updated", {
          detail: {
            profileId: resolvedProfileId,
            imageUrl: upload.data.url,
          },
        })
      );
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Upload failed";
        console.error("[SETTINGS_AVATAR_UPLOAD]", error.response?.data ?? error.message);
        window.alert(message);
      } else {
        console.error("[SETTINGS_AVATAR_UPLOAD]", error);
        window.alert("Upload failed");
      }
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
    }
  };

  const onPickBanner = () => {
    if (isUploadingBanner) {
      return;
    }

    bannerInputRef.current?.click();
  };

  const onBannerChange = async (file?: File) => {
    if (!file) {
      return;
    }

    try {
      setIsUploadingBanner(true);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=userBanner",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      await axios.patch("/api/profile/banner", {
        bannerUrl: upload.data.url,
      });

      setBannerUrl(upload.data.url);
      window.dispatchEvent(
        new CustomEvent("inaccord:profile-updated", {
          detail: {
            profileId: resolvedProfileId,
            bannerUrl: upload.data.url,
          },
        })
      );
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Banner upload failed";
        console.error("[SETTINGS_BANNER_UPLOAD]", error.response?.data ?? error.message);
        window.alert(message);
      } else {
        console.error("[SETTINGS_BANNER_UPLOAD]", error);
        window.alert("Banner upload failed");
      }
    } finally {
      setIsUploadingBanner(false);
      if (bannerInputRef.current) {
        bannerInputRef.current.value = "";
      }
    }
  };

  const onRemoveBanner = async () => {
    try {
      setIsUploadingBanner(true);
      await axios.patch("/api/profile/banner", {
        bannerUrl: null,
      });
      setBannerUrl(null);
      window.dispatchEvent(
        new CustomEvent("inaccord:profile-updated", {
          detail: {
            profileId: resolvedProfileId,
            bannerUrl: null,
          },
        })
      );
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Failed to remove banner";
        console.error("[SETTINGS_BANNER_REMOVE]", error.response?.data ?? error.message);
        window.alert(message);
      } else {
        console.error("[SETTINGS_BANNER_REMOVE]", error);
        window.alert("Failed to remove banner");
      }
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const onLogout = async () => {
    try {
      setIsLoggingOut(true);
      await axios.post("/api/auth/logout");
      onClose();
      router.push("/sign-in");
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Logout failed";
        console.error("[SETTINGS_LOGOUT]", error.response?.data ?? error.message);
        window.alert(message);
      } else {
        console.error("[SETTINGS_LOGOUT]", error);
        window.alert("Logout failed");
      }
    } finally {
      setIsLoggingOut(false);
    }
  };

  const onChangePassword = async () => {
    const trimmedCurrent = currentPassword.trim();
    const trimmedNext = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    setPasswordError(null);
    setPasswordSuccess(null);

    if (!trimmedCurrent) {
      setPasswordError("Current password is required.");
      return;
    }

    if (trimmedNext.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }

    if (trimmedNext !== trimmedConfirm) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    if (trimmedCurrent === trimmedNext) {
      setPasswordError("New password must be different from current password.");
      return;
    }

    try {
      setIsChangingPassword(true);

      await axios.patch("/api/profile/password", {
        currentPassword: trimmedCurrent,
        newPassword: trimmedNext,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Password updated successfully.");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Failed to update password";
        setPasswordError(message);
      } else {
        setPasswordError("Failed to update password");
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const joinedDateValue = data.profileJoinedAt ? new Date(data.profileJoinedAt) : null;
  const joinedDisplay =
    joinedDateValue && !Number.isNaN(joinedDateValue.getTime())
      ? joinedDateValue.toLocaleString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "Unknown";

  const lastLogonDateValue = data.profileLastLogonAt ? new Date(data.profileLastLogonAt) : null;
  const lastLogonDisplay =
    lastLogonDateValue && !Number.isNaN(lastLogonDateValue.getTime())
      ? lastLogonDateValue.toLocaleString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "Unknown";

  const hasAdminCrown = isInAccordAdministrator(profileRole ?? data.profileRole);

  const renderComingSoonSection = (title: string, subtitle: string) => {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="mt-1 text-xs text-[#949ba4]">{subtitle}</p>
          <div className="mt-4 rounded-xl border border-[#5865f2]/25 bg-[#5865f2]/10 px-3 py-2 text-xs text-[#cdd2ff]">
            This section is now available in the menu and ready for feature wiring.
          </div>
        </div>
      </div>
    );
  };

  const renderSectionContent = () => {
    if (displaySection === "myAccount") {
      return (
        <div className="space-y-12">
          <div className="mx-auto mt-8 h-[80vh] w-[80%] max-w-none rounded-[2.5rem] border border-black/20 bg-[#1e1f22] p-4 shadow-xl shadow-black/35">
            <p className="text-center text-sm font-medium text-white">Account Actions</p>

            <div className="mx-auto mt-8 w-full max-w-[28rem] space-y-3 rounded-3xl border border-white/10 bg-[#232428] p-4">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Password Settings
              </p>

              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Current password"
                className="w-full rounded-xl border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="New password (min 8 chars)"
                className="w-full rounded-xl border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm new password"
                className="w-full rounded-xl border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              />

              {passwordError ? (
                <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {passwordError}
                </p>
              ) : null}

              {passwordSuccess ? (
                <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                  {passwordSuccess}
                </p>
              ) : null}

              <Button
                type="button"
                onClick={onChangePassword}
                disabled={isChangingPassword}
                className="w-full bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isChangingPassword ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating...
                  </span>
                ) : (
                  "Update Password"
                )}
              </Button>
            </div>

            <div className="mx-auto w-full max-w-[28rem] py-10">
              <div className="h-[6px] rounded-full bg-[#d9d9d9] shadow-[0_0_10px_rgba(217,217,217,0.45)]" />
            </div>

            <div className="mx-auto w-full max-w-[28rem] rounded-3xl border border-white/10 bg-[#232428] p-4">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Authenticator App
              </p>
              <p className="mt-2 text-center text-xs text-[#b5bac1]">
                Add an authenticator app for extra account security.
              </p>
              <Button
                type="button"
                disabled
                className="mt-3 w-full bg-[#5865f2]/60 text-white hover:bg-[#5865f2]/60 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Coming Soon
              </Button>
            </div>

            <div className="mx-auto w-full max-w-[28rem] py-10">
              <div className="h-[6px] rounded-full bg-[#d9d9d9] shadow-[0_0_10px_rgba(217,217,217,0.45)]" />
            </div>

            <div className="mx-auto w-full max-w-[28rem] rounded-3xl border border-white/10 bg-[#232428] p-4">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                Security Key
              </p>
              <p className="mt-2 text-center text-xs text-[#b5bac1]">
                Register a physical security key for stronger sign-in protection.
              </p>
              <Button
                type="button"
                disabled
                className="mt-3 w-full bg-[#5865f2]/60 text-white hover:bg-[#5865f2]/60 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Coming Soon
              </Button>
            </div>

            <div className="mx-auto w-full max-w-[28rem] py-10">
              <div className="h-[6px] rounded-full bg-[#d9d9d9] shadow-[0_0_10px_rgba(217,217,217,0.45)]" />
            </div>

            <div className="mx-auto w-full max-w-[28rem] rounded-3xl border border-white/10 bg-[#232428] p-4">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                SMS
              </p>
              <p className="mt-2 text-center text-xs text-[#b5bac1]">
                Add SMS-based verification as an additional sign-in factor.
              </p>
              <Button
                type="button"
                disabled
                className="mt-3 w-full bg-[#5865f2]/60 text-white hover:bg-[#5865f2]/60 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Coming Soon
              </Button>
            </div>

            <div className="mx-auto w-full max-w-[28rem] py-10">
              <div className="h-[6px] rounded-full bg-[#d9d9d9] shadow-[0_0_10px_rgba(217,217,217,0.45)]" />
            </div>

            <div className="mx-auto w-full max-w-[28rem] rounded-3xl border border-rose-500/20 bg-rose-950/20 p-4 pb-8">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-rose-200">
                Delete Account
              </p>
              <p className="mt-2 text-center text-xs text-rose-100/90">
                Permanently remove your account and all associated data.
              </p>
              <Button
                type="button"
                disabled
                className="mb-4 mt-3 w-full border border-rose-500/35 bg-rose-600/80 text-white hover:bg-rose-600/80 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Delete Account (Coming Soon)
              </Button>

              <div className="py-10">
                <div className="h-[6px] w-full rounded-full bg-[#d9d9d9] shadow-[0_0_10px_rgba(217,217,217,0.45)]" />
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (displaySection === "appearance") {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Switch Color Modes</p>
            <div className="mt-3">
              <ModeToggle />
            </div>
          </div>

          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Plugins - Comming Soon!</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Manage Plugins and review uploaded plugin assets.
            </p>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                All Plugins
              </p>

              <ul className="mt-3 space-y-2 text-sm text-[#dbdee1]">
                <li className="rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      <span className="text-[#949ba4]">Plugins Installed:</span>{" "}
                      <span className="text-white">{installedPluginsCountLabel}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => setIsPluginsInstalledPanelOpen(true)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-black/20 text-[#dbdee1] transition hover:bg-white/10"
                      aria-label="Open Plugins Installed panel"
                      title="Open Plugins Installed panel"
                    >
                      <Puzzle className="h-4 w-4" />
                    </button>
                  </div>
                </li>

                <li className="rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      <span className="text-[#949ba4]">Downloaded Plugins:</span>{" "}
                      <span className="text-white">{downloadedPlugins.length.toString().padStart(2, "0")}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => setIsDownloadedPluginsPanelOpen(true)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-black/20 text-[#dbdee1] transition hover:bg-white/10"
                      aria-label="Open Downloaded Plugins panel"
                      title="Open Downloaded Plugins panel"
                    >
                      <Puzzle className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              </ul>

              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#949ba4]">
                <span>No plugin uploads found yet.</span>

                <button
                  type="button"
                  onClick={() => setIsPluginUploadsPanelOpen(true)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-black/20 text-[#dbdee1] transition hover:bg-white/10"
                  aria-label="Open Plugin Uploads panel"
                  title="Open Plugin Uploads panel"
                >
                  <Puzzle className="h-4 w-4" />
                </button>
              </div>
            </div>

            <Dialog open={isPluginsInstalledPanelOpen} onOpenChange={setIsPluginsInstalledPanelOpen}>
              <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-[42rem]">
                <DialogHeader>
                  <DialogTitle>Plugins Installed</DialogTitle>
                  <DialogDescription className="text-[#949ba4]">
                    View plugins installed for this user.
                  </DialogDescription>
                </DialogHeader>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                    Installed Plugins: {installedPluginsCountLabel}
                  </p>

                  {downloadedPlugins.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-sm text-[#dbdee1]">
                      {downloadedPlugins.map((pluginName, index) => (
                        <li
                          key={`${pluginName}-${index}`}
                          className="rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2"
                        >
                          {pluginName}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#949ba4]">
                      No installed plugins found.
                    </p>
                  )}
                </div>

                <DialogFooter>
                  <Button type="button" onClick={() => setIsPluginsInstalledPanelOpen(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isDownloadedPluginsPanelOpen} onOpenChange={setIsDownloadedPluginsPanelOpen}>
              <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-[42rem]">
                <DialogHeader>
                  <DialogTitle>Downloaded Plugins</DialogTitle>
                  <DialogDescription className="text-[#949ba4]">
                    View downloaded plugins for this user.
                  </DialogDescription>
                </DialogHeader>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                    Downloaded Plugins: {downloadedPlugins.length.toString().padStart(2, "0")}
                  </p>

                  {downloadedPlugins.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-sm text-[#dbdee1]">
                      {downloadedPlugins.map((pluginName, index) => (
                        <li
                          key={`downloaded-${pluginName}-${index}`}
                          className="rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2"
                        >
                          {pluginName}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#949ba4]">
                      No downloaded plugins found.
                    </p>
                  )}
                </div>

                <DialogFooter>
                  <Button type="button" onClick={() => setIsDownloadedPluginsPanelOpen(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isPluginUploadsPanelOpen} onOpenChange={setIsPluginUploadsPanelOpen}>
              <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-[42rem]">
                <DialogHeader>
                  <DialogTitle>Plugin Uploads</DialogTitle>
                  <DialogDescription className="text-[#949ba4]">
                    View plugin upload status and uploaded assets.
                  </DialogDescription>
                </DialogHeader>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                    Plugin Uploads
                  </p>

                  <ul className="mt-3 space-y-2 text-sm text-[#dbdee1]">
                    <li className="rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2">
                      <span className="text-[#949ba4]">Upload Queue:</span>{" "}
                      <span className="text-white">Empty</span>
                    </li>
                    <li className="rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2">
                      <span className="text-[#949ba4]">Last Upload:</span>{" "}
                      <span className="text-white">None</span>
                    </li>
                  </ul>

                  <p className="mt-3 rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2 text-xs text-[#949ba4]">
                    No plugin uploads found yet.
                  </p>
                </div>

                <DialogFooter>
                  <Button type="button" onClick={() => setIsPluginUploadsPanelOpen(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Custom CSS</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Add CSS overrides to personalize your interface.
            </p>
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCustomCssEditorOpen(true)}
                className="border-white/20 bg-transparent text-white hover:bg-white/10"
              >
                Pop Out Editor
              </Button>
            </div>
            <textarea
              rows={15}
              value={customCss}
              onChange={(event) => {
                setCustomCss(event.target.value);
                setCustomCssStatus(null);
              }}
              placeholder="/* Paste your custom CSS here */"
              className="mt-3 w-full resize-y rounded-xl border border-black/25 bg-[#1a1b1e] px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
            />
            {customCssStatus ? (
              <p className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                {customCssStatus}
              </p>
            ) : null}
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onResetCustomCss}
                className="border-white/20 bg-transparent text-white hover:bg-white/10"
              >
                Reset CSS
              </Button>
              <Button
                type="button"
                onClick={onSaveCustomCss}
                className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
              >
                Save CSS
              </Button>
            </div>
          </div>

          <Dialog open={isCustomCssEditorOpen} onOpenChange={setIsCustomCssEditorOpen}>
            <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-[90vw]">
              <DialogHeader>
                <DialogTitle>Custom CSS Editor</DialogTitle>
                <DialogDescription className="text-[#949ba4]">
                  Edit your Custom CSS in a larger pop-out editor.
                </DialogDescription>
              </DialogHeader>

              <textarea
                rows={22}
                value={customCss}
                onChange={(event) => {
                  setCustomCss(event.target.value);
                  setCustomCssStatus(null);
                }}
                placeholder="/* Paste your custom CSS here */"
                className="w-full resize-y rounded-xl border border-black/25 bg-[#1a1b1e] px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
              />

              {customCssStatus ? (
                <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#b5bac1]">
                  {customCssStatus}
                </p>
              ) : null}

              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onResetCustomCss}
                  className="border-white/20 bg-transparent text-white hover:bg-white/10"
                >
                  Reset CSS
                </Button>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCustomCssEditorOpen(false)}
                    className="border-white/20 bg-transparent text-white hover:bg-white/10"
                  >
                    Close
                  </Button>
                  <Button type="button" onClick={onSaveCustomCss} className="bg-[#5865f2] text-white hover:bg-[#4752c4]">
                    Save CSS
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      );
    }

    if (displaySection === "notifications") {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <p className="text-sm font-medium text-white">Notification Preferences</p>
            <p className="mt-1 text-xs text-[#949ba4]">
              Notification toggles can be configured here.
            </p>
          </div>

          <div className="rounded-lg border border-black/20 bg-[#1e1f22] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-white">Enable @Mentions</p>
                <p className="mt-1 text-xs text-[#949ba4]">
                  When enabled, typing <span className="font-semibold text-[#c9cdfb]">@</span> in chat suggests users and server roles.
                </p>
              </div>

              <button
                type="button"
                onClick={onToggleMentions}
                className={`inline-flex h-7 w-12 items-center rounded-full border transition ${
                  mentionsEnabled
                    ? "border-emerald-400/50 bg-emerald-500/40"
                    : "border-zinc-600 bg-zinc-700"
                }`}
                aria-pressed={mentionsEnabled}
                aria-label="Toggle @Mentions"
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                    mentionsEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <p className="mt-3 rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-[#b5bac1]">
              Current status: <span className="font-semibold text-white">{mentionsEnabled ? "On" : "Off"}</span>
            </p>
          </div>
        </div>
      );
    }

    if (displaySection === "dataPrivacy") {
      return renderComingSoonSection("Data & Privacy", "Privacy controls and account safety settings can be managed here.");
    }

    return renderComingSoonSection(sectionLabelMap[displaySection], sectionDescriptionMap[displaySection]);
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={onClose}>
      <DialogContent className="settings-theme-scope settings-scrollbar theme-settings-shell flex h-[85vh] max-h-[85vh] w-[85vw] max-w-[85vw] flex-col overflow-hidden rounded-3xl border-black/30 bg-[#2b2d31] p-0 text-[#dbdee1]">
        <DialogTitle className="sr-only">User Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Edit account, appearance, notification, and privacy settings.
        </DialogDescription>

        <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr] overflow-hidden">
          <aside className="theme-settings-left-rail settings-scrollbar flex h-full min-h-0 flex-col overflow-y-auto rounded-l-3xl border-r border-black/20 bg-[#232428] p-4 pt-2 shadow-2xl shadow-black/40">
            <nav className="settings-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {sectionGroups.map((group) => (
                <div key={group.label} className="space-y-1">
                  <p className="px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#949ba4]">
                    {group.label}
                  </p>

                  {group.sections.map((section) => {
                    const isActive = activeSection === section;
                    const SectionIcon = sectionIconMap[section];

                    return (
                      <button
                        key={section}
                        type="button"
                        onClick={() => setActiveSection(section)}
                        className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm transition-colors ${
                          isActive
                            ? "bg-[#404249] font-semibold text-white"
                            : "text-[#b5bac1] hover:bg-[#3f4248] hover:text-[#f2f3f5]"
                        }`}
                      >
                        <SectionIcon className="h-4 w-4 shrink-0" />
                        {sectionLabelMap[section]}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            <p className="mt-4 rounded-2xl border border-black/20 bg-[#1e1f22] px-3 py-2 text-xs leading-5 text-[#949ba4] whitespace-normal break-words shadow-lg shadow-black/35">
              Choose a category on the left and edit details on the right.
            </p>

            <button
              type="button"
              onClick={onLogout}
              disabled={isLoggingOut}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-600/15 px-3 py-2 text-sm font-semibold text-rose-200 shadow-lg shadow-black/35 transition hover:bg-rose-600/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoggingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              {isLoggingOut ? "Logging out..." : "Log out"}
            </button>
          </aside>

          <section className="theme-settings-main-panel min-h-0 overflow-hidden">
            <div
              className={`transition-all duration-200 ${
                isSectionVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
              }`}
            >
              <div className="theme-settings-main-header sticky top-0 z-10 border-b border-black/20 bg-[#2b2d31]/95 px-6 py-4 shadow-lg shadow-black/35 backdrop-blur">
                <h3 className={`text-xl font-bold text-white ${displaySection === "myAccount" ? "text-center" : ""}`}>
                  {sectionLabelMap[displaySection]}
                </h3>
                <p className={`mt-1 text-sm text-[#949ba4] ${displaySection === "myAccount" ? "text-center" : ""}`}>
                  {sectionDescriptionMap[displaySection]}
                </p>
              </div>

              <div className="settings-scrollbar theme-settings-main-content h-[calc(85vh-78px)] overflow-y-auto px-6 py-5">
                {displaySection === "myAccount" ? (
                  <div className="mx-auto mb-6 w-full max-w-[28rem] overflow-hidden rounded-[2.5rem] border border-white/15 bg-[#1f2024] p-4 shadow-2xl shadow-black/45">
                    <div className="mb-4 overflow-hidden rounded-2xl border border-black/25 bg-[#141518]">
                      <div className="relative h-40 w-full bg-[#2a2d33]">
                        {bannerUrl ? (
                          <Image
                            src={bannerUrl}
                            alt="User banner"
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-r from-[#5865f2] via-[#4752c4] to-[#313338]">
                            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-white/85">
                              No banner
                            </span>
                          </div>
                        )}

                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 bg-black/30 px-3 py-2 backdrop-blur-sm">
                          <Button
                            type="button"
                            onClick={onPickBanner}
                            disabled={isUploadingBanner}
                            className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isUploadingBanner ? (
                              <span className="inline-flex items-center gap-1.5">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Uploading...
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5">
                                <Camera className="h-3.5 w-3.5" />
                                {bannerUrl ? "Change banner" : "Upload banner"}
                              </span>
                            )}
                          </Button>

                          {bannerUrl ? (
                            <Button
                              type="button"
                              onClick={onRemoveBanner}
                              disabled={isUploadingBanner}
                              className="h-8 border border-rose-500/35 bg-rose-500/15 px-3 text-xs text-rose-200 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Remove
                            </Button>
                          ) : null}
                        </div>

                        <input
                          ref={bannerInputRef}
                          className="hidden"
                          type="file"
                          accept="image/*"
                          onChange={(event) => onBannerChange(event.target.files?.[0])}
                        />
                      </div>
                    </div>

                    <div className="mb-5 flex justify-center">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={onPickAvatar}
                          disabled={isUploadingAvatar}
                          className="group relative rounded-full focus:outline-none focus:ring-2 focus:ring-[#5865f2] focus:ring-offset-2 focus:ring-offset-[#2b2d31]"
                          aria-label="Add or edit user icon"
                        >
                          <Avatar className="h-[min(22vh,12rem)] w-[min(22vh,12rem)] border-2 border-black/20 shadow-lg ring-2 ring-[#5865f2]/35">
                            <AvatarImage src={avatarUrl || undefined} alt={data.profileName || "User"} />
                            <AvatarFallback className="bg-[#5865f2] text-5xl font-bold text-white">
                              {(data.profileName || "U").slice(0, 1).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>

                          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-transparent transition-all group-hover:bg-black/35 group-hover:text-white">
                            {isUploadingAvatar ? (
                              <Loader2 className="h-8 w-8 animate-spin" />
                            ) : (
                              <Camera className="h-8 w-8" />
                            )}
                          </span>
                        </button>

                        <input
                          ref={avatarInputRef}
                          className="hidden"
                          type="file"
                          accept="image/*"
                          onChange={(event) => onAvatarChange(event.target.files?.[0])}
                        />
                      </div>
                    </div>

                    <div className="mx-auto w-full max-w-[24rem] rounded-3xl border border-black/20 bg-[#1e1f22] p-4 shadow-xl shadow-black/35">
                      <p className="text-xs uppercase tracking-[0.08em] text-[#949ba4]">In-Accord Profile</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <p>
                          <span className="text-[#949ba4]">Users ID:</span>{" "}
                          <span className="text-white">{resolvedProfileId || "Unknown ID"}</span>
                        </p>
                        <p>
                          <span className="text-[#949ba4]">Name:</span>{" "}
                          <span className="text-white">{realName || "Unknown User"}</span>
                        </p>
                        <p>
                          <span className="text-[#949ba4]">In-Accord Profile Name:</span>{" "}
                          <span className="inline-flex items-center gap-1.5 text-white">
                            <span>{profileName || "Not set"}</span>
                            {hasAdminCrown ? (
                              <Crown className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-label="In-Accord Administrator" />
                            ) : null}
                          </span>
                        </p>
                        <p>
                          <span className="text-[#949ba4]">Email:</span>{" "}
                          <span className="text-white">{data.profileEmail || "No email"}</span>
                        </p>
                        <p>
                          <span className="text-[#949ba4]">Status:</span>{" "}
                          <span className="text-white">{presenceStatusLabelMap[profilePresenceStatus]}</span>
                        </p>
                        <p>
                          <span className="text-[#949ba4]">Last logon:</span>{" "}
                          <span className="text-white">{lastLogonDisplay}</span>
                        </p>
                        <p>
                          <span className="text-[#949ba4]">Created:</span>{" "}
                          <span className="text-white">{joinedDisplay}</span>
                        </p>
                      </div>

                      <div className="mt-4 space-y-2 rounded-2xl border border-black/20 bg-[#16171a] p-3">
                        <p className="text-xs uppercase tracking-[0.08em] text-[#949ba4]">In-Accord Profile Name</p>
                        <input
                          type="text"
                          value={profileName}
                          onChange={(event) => {
                            setProfileName(event.target.value);
                            setProfileNameError(null);
                            setProfileNameSuccess(null);
                          }}
                          placeholder="Enter In-Accord Profile Name"
                          className="w-full rounded-xl border border-black/25 bg-[#1a1b1e] px-3 py-2 text-sm text-white outline-none placeholder:text-[#7f8690] focus:border-[#5865f2]/70 focus:ring-2 focus:ring-[#5865f2]/35"
                        />

                        {profileNameError ? (
                          <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                            {profileNameError}
                          </p>
                        ) : null}

                        {profileNameSuccess ? (
                          <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                            {profileNameSuccess}
                          </p>
                        ) : null}

                        <Button
                          type="button"
                          onClick={onSaveProfileName}
                          disabled={isSavingProfileName}
                          className="w-full bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSavingProfileName ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Saving...
                            </span>
                          ) : (
                            "Save In-Accord Profile Name"
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {displaySection === "myAccount" ? (
                  <div className="mx-auto w-full max-w-[32rem] py-10">
                    <div className="h-[6px] rounded-full bg-[#d9d9d9] shadow-[0_0_10px_rgba(217,217,217,0.45)]" />
                  </div>
                ) : null}

                {renderSectionContent()}

                <div className="mt-6 flex justify-end">
                  <Button
                    type="button"
                    onClick={onClose}
                    className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
                  >
                    Done
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};
