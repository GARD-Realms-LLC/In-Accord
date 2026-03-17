"use client";

import qs from "query-string";
import axios from "axios";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ChannelType } from "@/lib/db/types";
import { cn } from "@/lib/utils";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useModal } from "@/hooks/use-modal-store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useMemo, useState } from "react";
import { Bot, Link2, Shield, SlidersHorizontal, Trash2, Users, Webhook } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(1, { message: "Channel name is required." }),
  icon: z.string().max(16, { message: "Icon must be 16 characters or fewer." }).optional(),
  topic: z.string().max(500, { message: "Channel topic must be 500 characters or fewer." }).optional(),
  type: z.nativeEnum(ChannelType),
  channelGroupId: z.string().nullable().optional(),
  nsfw: z.boolean().optional(),
  rateLimitPerUser: z.coerce.number().int().min(0).max(21600).optional(),
  bitrate: z.string().optional(),
  userLimit: z.string().optional(),
  rtcRegion: z.string().max(64).optional(),
  videoQualityMode: z.string().optional(),
  defaultAutoArchiveDuration: z.string().optional(),
  defaultThreadRateLimitPerUser: z.string().optional(),
});

type ChannelGroupItem = { id: string; name: string };

type ChannelPermissionValue = boolean | null;
type RolePermissionSet = {
  allowView: ChannelPermissionValue;
  allowSend: ChannelPermissionValue;
  allowConnect: ChannelPermissionValue;
};

type ChannelPermissionOverwrite = {
  targetType: "EVERYONE" | "ROLE" | "MEMBER";
  targetId: string;
  label: string;
  subtitle?: string | null;
  permissions: RolePermissionSet;
};

type ChannelPermissionCandidate = {
  targetType: "ROLE" | "MEMBER";
  targetId: string;
  label: string;
  subtitle?: string | null;
};

type ChannelAdvancedSettings = {
  nsfw: boolean;
  rateLimitPerUser: number;
  bitrate: number | null;
  userLimit: number | null;
  rtcRegion: string | null;
  videoQualityMode: number | null;
  defaultAutoArchiveDuration: number | null;
  defaultThreadRateLimitPerUser: number | null;
};

type ChannelFeatureSettings = {
  integrations: {
    enabled: boolean;
    provider: string;
    providerApiUrl: string;
    syncMentions: boolean;
    allowedBotIds: string[];
  };
  webhooks: {
    items: Array<{
      id: string;
      name: string;
      url: string;
      enabled: boolean;
      secret: string;
      eventTypes: string[];
    }>;
  };
  apps: {
    allowedAppIds: string[];
    allowPinnedApps: boolean;
    apiUrl: string;
  };
  moderation: {
    requireVerifiedEmail: boolean;
    blockedWords: string[];
    slowmodeSeconds: number;
    flaggedWordsAction: "warn" | "block";
  };
};

type ChannelFeatureCatalog = {
  providers: Array<{
    key: string;
    label: string;
    configured: boolean;
  }>;
  bots: Array<{
    id: string;
    name: string;
    applicationId: string;
    commands: string[];
  }>;
  apps: Array<{
    id: string;
    name: string;
    applicationId: string;
    clientId: string;
    redirectUri: string;
    scopes: string[];
  }>;
  webhookEventTypes: Array<{
    value: string;
    label: string;
  }>;
};

type ChannelInvitePanelItem = {
  code: string;
  createdAt: string;
  source: "created" | "regenerated";
  createdByProfileId?: string;
  createdByName?: string | null;
  createdByEmail?: string | null;
  maxUses?: number | null;
  usedCount?: number;
  expiresAt?: string | null;
};

const DEFAULT_ADVANCED_SETTINGS: ChannelAdvancedSettings = {
  nsfw: false,
  rateLimitPerUser: 0,
  bitrate: null,
  userLimit: null,
  rtcRegion: null,
  videoQualityMode: null,
  defaultAutoArchiveDuration: null,
  defaultThreadRateLimitPerUser: null,
};

const DEFAULT_FEATURE_SETTINGS: ChannelFeatureSettings = {
  integrations: {
    enabled: false,
    provider: "",
    providerApiUrl: "",
    syncMentions: false,
    allowedBotIds: [],
  },
  webhooks: {
    items: [],
  },
  apps: {
    allowedAppIds: [],
    allowPinnedApps: true,
    apiUrl: "",
  },
  moderation: {
    requireVerifiedEmail: false,
    blockedWords: [],
    slowmodeSeconds: 0,
    flaggedWordsAction: "warn",
  },
};

const DEFAULT_FEATURE_CATALOG: ChannelFeatureCatalog = {
  providers: [],
  bots: [],
  apps: [],
  webhookEventTypes: [],
};

type ChannelSettingsTab =
  | "overview"
  | "permissions"
  | "invites"
  | "integrations"
  | "webhooks"
  | "apps"
  | "moderation"
  | "danger";

type ChannelSettingsSectionGroup = {
  label: string;
  tabs: ChannelSettingsTab[];
};

const sectionGroups: ChannelSettingsSectionGroup[] = [
  { label: "Channel Settings", tabs: ["overview", "permissions", "invites"] },
  { label: "Integrations", tabs: ["integrations", "webhooks", "apps"] },
  { label: "Community", tabs: ["moderation"] },
  { label: "", tabs: ["danger"] },
];

const tabLabelMap: Record<ChannelSettingsTab, string> = {
  overview: "Overview",
  permissions: "Permissions",
  invites: "Invites",
  integrations: "Integrations",
  webhooks: "Webhooks",
  apps: "Apps",
  moderation: "Moderation",
  danger: "Delete Channel",
};

const tabDescriptionMap: Record<ChannelSettingsTab, string> = {
  overview: "Edit channel name, topic, type, and grouping.",
  permissions: "Configure role and member access to this channel.",
  invites: "Manage invite links and temporary access rules.",
  integrations: "Configure channel integrations and connected services.",
  webhooks: "Manage webhook endpoints for channel events.",
  apps: "Configure app access and app-specific channel settings.",
  moderation: "Set moderation controls for this channel.",
  danger: "Permanently delete this channel.",
};

const tabIconMap: Record<ChannelSettingsTab, React.ComponentType<{ className?: string }>> = {
  overview: SlidersHorizontal,
  permissions: Shield,
  invites: Link2,
  integrations: Users,
  webhooks: Webhook,
  apps: Bot,
  moderation: Users,
  danger: Trash2,
};

const FREE_CHANNEL_ICONS = ["💬", "📢", "✅", "📌", "⭐", "🔥", "🎮", "🎵", "🎬", "📚", "🧠", "🛠️", "🤖", "🧪", "🎨", "📷", "📰", "🧩"];

export const EditChannelModal = () => {
  const { isOpen, onClose, onOpen, type, data } = useModal();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<ChannelSettingsTab>("overview");
  const [channelGroups, setChannelGroups] = useState<ChannelGroupItem[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);
  const [permissionsSuccess, setPermissionsSuccess] = useState<string | null>(null);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [permissionOverwrites, setPermissionOverwrites] = useState<ChannelPermissionOverwrite[]>([]);
  const [permissionCandidates, setPermissionCandidates] = useState<ChannelPermissionCandidate[]>([]);
  const [permissionFilter, setPermissionFilter] = useState("");
  const [selectedPermissionKey, setSelectedPermissionKey] = useState<string | null>(null);
  const [featureSettings, setFeatureSettings] = useState<ChannelFeatureSettings>(DEFAULT_FEATURE_SETTINGS);
  const [featureCatalog, setFeatureCatalog] = useState<ChannelFeatureCatalog>(DEFAULT_FEATURE_CATALOG);
  const [featureSaveError, setFeatureSaveError] = useState<string | null>(null);
  const [featureSaveSuccess, setFeatureSaveSuccess] = useState<string | null>(null);
  const [isLoadingFeatures, setIsLoadingFeatures] = useState(false);
  const [isSavingFeatures, setIsSavingFeatures] = useState(false);
  const [invitePanelItems, setInvitePanelItems] = useState<ChannelInvitePanelItem[]>([]);
  const [isLoadingInvitePanel, setIsLoadingInvitePanel] = useState(false);
  const [invitePanelError, setInvitePanelError] = useState<string | null>(null);
  const [invitePanelSuccess, setInvitePanelSuccess] = useState<string | null>(null);
  const [invitePanelActionCode, setInvitePanelActionCode] = useState<string | null>(null);
  const [newInviteMaxUses, setNewInviteMaxUses] = useState<string>("");
  const [newInviteExpiresInHours, setNewInviteExpiresInHours] = useState<string>("");

  const isModalOpen = isOpen && type === "editChannel";
  const { channel, server } = data;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      icon: "",
      topic: "",
      type: channel?.type || ChannelType.TEXT,
      channelGroupId: null,
      nsfw: false,
      rateLimitPerUser: 0,
      bitrate: "",
      userLimit: "",
      rtcRegion: "",
      videoQualityMode: "auto",
      defaultAutoArchiveDuration: "default",
      defaultThreadRateLimitPerUser: "",
    },
  });

  const parseNullableInteger = (value: string | null | undefined) => {
    if (!value || value.trim().length === 0) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.floor(parsed) : null;
  };

  const applyAdvancedSettingsToForm = (settings: ChannelAdvancedSettings) => {
    form.setValue("nsfw", settings.nsfw);
    form.setValue("rateLimitPerUser", settings.rateLimitPerUser);
    form.setValue("bitrate", settings.bitrate === null ? "" : String(settings.bitrate));
    form.setValue("userLimit", settings.userLimit === null ? "" : String(settings.userLimit));
    form.setValue("rtcRegion", settings.rtcRegion ?? "");
    form.setValue("videoQualityMode", settings.videoQualityMode === null ? "auto" : String(settings.videoQualityMode));
    form.setValue("defaultAutoArchiveDuration", settings.defaultAutoArchiveDuration === null ? "default" : String(settings.defaultAutoArchiveDuration));
    form.setValue("defaultThreadRateLimitPerUser", settings.defaultThreadRateLimitPerUser === null ? "" : String(settings.defaultThreadRateLimitPerUser));
  };

  useEffect(() => {
    if (!channel) return;
    form.setValue("name", channel.name);
    form.setValue("icon", ((channel as { icon?: string | null })?.icon ?? ""));
    form.setValue("topic", ((channel as { topic?: string | null })?.topic ?? ""));
    form.setValue("type", channel.type);
    form.setValue("channelGroupId", ((channel as { channelGroupId?: string | null })?.channelGroupId ?? null));
    applyAdvancedSettingsToForm(DEFAULT_ADVANCED_SETTINGS);
    setFeatureSettings(DEFAULT_FEATURE_SETTINGS);
    setFeatureCatalog(DEFAULT_FEATURE_CATALOG);
    setFeatureSaveError(null);
    setFeatureSaveSuccess(null);
    setInvitePanelItems([]);
    setInvitePanelError(null);
    setInvitePanelSuccess(null);
    setInvitePanelActionCode(null);
    setNewInviteMaxUses("");
    setNewInviteExpiresInHours("");
  }, [channel, form]);

  useEffect(() => {
    if (!isModalOpen || !server?.id || !channel?.id) return;

    let cancelled = false;

    const loadChannelDetails = async () => {
      try {
        setIsLoadingDetails(true);
        const response = await axios.get<{ channel?: { topic?: string; icon?: string | null; channelGroupId?: string | null; type?: ChannelType; settings?: ChannelAdvancedSettings } }>(`/api/channels/${channel.id}`, { params: { serverId: server.id } });

        if (cancelled || !response.data.channel) return;

        const payload = response.data.channel;
        if (typeof payload.topic === "string") form.setValue("topic", payload.topic);
        if (payload.icon !== undefined) form.setValue("icon", payload.icon ?? "");
        if (payload.channelGroupId !== undefined) form.setValue("channelGroupId", payload.channelGroupId ?? null);
        if (payload.type) form.setValue("type", payload.type);
        applyAdvancedSettingsToForm(payload.settings ?? DEFAULT_ADVANCED_SETTINGS);
      } catch (error) {
        if (!cancelled) console.error("[EDIT_CHANNEL_MODAL_DETAILS]", error);
      } finally {
        if (!cancelled) setIsLoadingDetails(false);
      }
    };

    void loadChannelDetails();
    return () => {
      cancelled = true;
    };
  }, [isModalOpen, server?.id, channel?.id, form]);

  useEffect(() => {
    if (!isModalOpen || !server?.id || !channel?.id) return;

    let cancelled = false;

    const loadPermissions = async () => {
      try {
        setIsLoadingPermissions(true);
        setPermissionsError(null);
        setPermissionsSuccess(null);

        const response = await axios.get<{
          overwrites?: ChannelPermissionOverwrite[];
          candidates?: ChannelPermissionCandidate[];
        }>(`/api/channels/${channel.id}/permissions`, {
          params: { serverId: server.id },
        });

        if (!cancelled) {
          const overwrites = Array.isArray(response.data.overwrites) ? response.data.overwrites : [];
          const candidates = Array.isArray(response.data.candidates) ? response.data.candidates : [];
          setPermissionOverwrites(
            overwrites.map((item) => ({
              targetType: item.targetType,
              targetId: item.targetId,
              label: item.label,
              subtitle: item.subtitle ?? null,
              permissions: {
                allowView: item.permissions?.allowView ?? null,
                allowSend: item.permissions?.allowSend ?? null,
                allowConnect: item.permissions?.allowConnect ?? null,
              },
            }))
          );
          setPermissionCandidates(candidates);
          setSelectedPermissionKey((prev) => {
            const nextKeys = new Set(
              overwrites.map((item) => `${item.targetType}:${item.targetId}`)
            );
            if (prev && nextKeys.has(prev)) {
              return prev;
            }

            return overwrites[0] ? `${overwrites[0].targetType}:${overwrites[0].targetId}` : null;
          });
        }
      } catch {
        if (!cancelled) setPermissionsError("Failed to load channel permissions.");
      } finally {
        if (!cancelled) setIsLoadingPermissions(false);
      }
    };

    void loadPermissions();
    return () => {
      cancelled = true;
    };
  }, [isModalOpen, server?.id, channel?.id]);

  useEffect(() => {
    if (!isModalOpen || !server?.id || !channel?.id) return;

    let cancelled = false;

    const loadFeatures = async () => {
      try {
        setIsLoadingFeatures(true);
        setFeatureSaveError(null);
        setFeatureSaveSuccess(null);

        const response = await axios.get<{ settings?: ChannelFeatureSettings; catalog?: ChannelFeatureCatalog }>(
          `/api/channels/${channel.id}/features`,
          {
            params: { serverId: server.id },
          }
        );

        if (!cancelled) {
          setFeatureSettings(response.data.settings ?? DEFAULT_FEATURE_SETTINGS);
          setFeatureCatalog(response.data.catalog ?? DEFAULT_FEATURE_CATALOG);
        }
      } catch {
        if (!cancelled) {
          setFeatureSaveError("Failed to load channel feature settings.");
          setFeatureSettings(DEFAULT_FEATURE_SETTINGS);
          setFeatureCatalog(DEFAULT_FEATURE_CATALOG);
        }
      } finally {
        if (!cancelled) setIsLoadingFeatures(false);
      }
    };

    void loadFeatures();
    return () => {
      cancelled = true;
    };
  }, [isModalOpen, server?.id, channel?.id]);

  useEffect(() => {
    if (!isModalOpen || !server?.id) return;

    let cancelled = false;

    const loadGroups = async () => {
      try {
        const response = await axios.get<{ groups?: ChannelGroupItem[] }>("/api/channel-groups", {
          params: { serverId: server.id },
        });

        if (!cancelled) setChannelGroups(response.data.groups ?? []);
      } catch (error) {
        if (!cancelled) setChannelGroups([]);
        console.error("[EDIT_CHANNEL_MODAL_GROUPS]", error);
      }
    };

    void loadGroups();
    return () => {
      cancelled = true;
    };
  }, [isModalOpen, server?.id]);

  const loadInvitePanel = async () => {
    if (!server?.id || !channel?.id) {
      return;
    }

    try {
      setIsLoadingInvitePanel(true);
      setInvitePanelError(null);

      const response = await axios.get<{ invites?: ChannelInvitePanelItem[] }>(
        `/api/channels/${channel.id}/invites`,
        {
          params: { serverId: server.id },
        }
      );

      setInvitePanelItems(response.data.invites ?? []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          error.message;
        setInvitePanelError(message || "Failed to load channel invites.");
      } else {
        setInvitePanelError("Failed to load channel invites.");
      }

      setInvitePanelItems([]);
    } finally {
      setIsLoadingInvitePanel(false);
    }
  };

  useEffect(() => {
    if (!isModalOpen || activeTab !== "invites") {
      return;
    }

    void loadInvitePanel();
  }, [activeTab, isModalOpen, server?.id, channel?.id]);

  const sections = useMemo(() => sectionGroups, []);
  const isLoading = form.formState.isSubmitting;

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setSubmitError(null);

      const url = qs.stringifyUrl({
        url: `/api/channels/${channel?.id}`,
        query: { serverId: server?.id },
      });

      await axios.patch(url, {
        ...values,
        icon: (values.icon ?? "").trim() || null,
        topic: (values.topic ?? "").trim(),
        channelGroupId:
          typeof values.channelGroupId === "string" && values.channelGroupId.length > 0
            ? values.channelGroupId
            : null,
        settings: {
          nsfw: values.nsfw === true,
          rateLimitPerUser: values.rateLimitPerUser ?? 0,
          bitrate: parseNullableInteger(values.bitrate),
          userLimit: parseNullableInteger(values.userLimit),
          rtcRegion: (values.rtcRegion ?? "").trim() || null,
          videoQualityMode: parseNullableInteger(values.videoQualityMode),
          defaultAutoArchiveDuration: parseNullableInteger(values.defaultAutoArchiveDuration),
          defaultThreadRateLimitPerUser: parseNullableInteger(values.defaultThreadRateLimitPerUser),
        },
      });

      form.reset();
      router.refresh();
      onClose();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          error.message ||
          "Failed to update channel.";
        setSubmitError(message);
      } else {
        setSubmitError("Failed to update channel.");
      }
    }
  };

  const handleClose = () => {
    form.reset();
    setSubmitError(null);
    setFeatureSaveError(null);
    setFeatureSaveSuccess(null);
    setInvitePanelError(null);
    setInvitePanelSuccess(null);
    setInvitePanelActionCode(null);
    setNewInviteMaxUses("");
    setNewInviteExpiresInHours("");
    setPermissionFilter("");
    setSelectedPermissionKey(null);
    setActiveTab("overview");
    onClose();
  };

  const onCreateInvite = async () => {
    if (!server?.id || !channel?.id || invitePanelActionCode) {
      return;
    }

    try {
      setInvitePanelError(null);
      setInvitePanelSuccess(null);
      setInvitePanelActionCode("__create__");

      const response = await axios.post<{ invite?: ChannelInvitePanelItem }>(
        `/api/channels/${channel.id}/invites`,
        {
          serverId: server.id,
          maxUses: newInviteMaxUses.trim().length > 0 ? Number(newInviteMaxUses) : null,
          expiresInHours:
            newInviteExpiresInHours.trim().length > 0 ? Number(newInviteExpiresInHours) : null,
        }
      );

      const createdCode = response.data.invite?.code;
      setInvitePanelSuccess(createdCode ? `Invite created: ${createdCode}` : "Invite created.");
      setNewInviteMaxUses("");
      setNewInviteExpiresInHours("");
      await loadInvitePanel();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          error.message;
        setInvitePanelError(message || "Failed to create invite.");
      } else {
        setInvitePanelError("Failed to create invite.");
      }
    } finally {
      setInvitePanelActionCode(null);
    }
  };

  const onDeleteInvite = async (code: string) => {
    if (!server?.id || !channel?.id || !code || invitePanelActionCode) {
      return;
    }

    try {
      setInvitePanelError(null);
      setInvitePanelSuccess(null);
      setInvitePanelActionCode(code);

      await axios.delete(`/api/channels/${channel.id}/invites`, {
        data: {
          serverId: server.id,
          code,
        },
      });

      setInvitePanelSuccess("Invite deleted.");
      await loadInvitePanel();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          error.message;
        setInvitePanelError(message || "Failed to delete invite.");
      } else {
        setInvitePanelError("Failed to delete invite.");
      }
    } finally {
      setInvitePanelActionCode(null);
    }
  };

  const onCopyInviteLink = async (code: string) => {
    if (!code) {
      return;
    }

    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const inviteUrl = baseUrl ? `${baseUrl}/invite/${encodeURIComponent(code)}` : code;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInvitePanelError(null);
      setInvitePanelSuccess("Invite link copied.");
    } catch {
      setInvitePanelSuccess(null);
      setInvitePanelError("Could not copy automatically. Copy the code manually.");
    }
  };

  const onSaveFeatureSettings = async () => {
    if (!server?.id || !channel?.id) {
      setFeatureSaveError("Missing server or channel context.");
      return;
    }

    try {
      setIsSavingFeatures(true);
      setFeatureSaveError(null);
      setFeatureSaveSuccess(null);

      await axios.patch(`/api/channels/${channel.id}/features`, {
        serverId: server.id,
        settings: featureSettings,
      });

      setFeatureSaveSuccess("Saved channel feature settings.");
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          (error.response?.data as { error?: string } | undefined)?.error ||
          error.message ||
          "Failed to save channel feature settings.";
        setFeatureSaveError(message);
      } else {
        setFeatureSaveError("Failed to save channel feature settings.");
      }
    } finally {
      setIsSavingFeatures(false);
    }
  };

  const toggleFeatureId = (target: "allowedBotIds" | "allowedAppIds", value: string) => {
    setFeatureSettings((prev) => {
      if (target === "allowedBotIds") {
        const exists = prev.integrations.allowedBotIds.includes(value);
        return {
          ...prev,
          integrations: {
            ...prev.integrations,
            allowedBotIds: exists
              ? prev.integrations.allowedBotIds.filter((entry) => entry !== value)
              : [...prev.integrations.allowedBotIds, value],
          },
        };
      }

      const exists = prev.apps.allowedAppIds.includes(value);
      return {
        ...prev,
        apps: {
          ...prev.apps,
          allowedAppIds: exists
            ? prev.apps.allowedAppIds.filter((entry) => entry !== value)
            : [...prev.apps.allowedAppIds, value],
        },
      };
    });
  };

  const renderFeatureFeedback = () => {
    if (!featureSaveError && !featureSaveSuccess) {
      return null;
    }

    return (
      <div className="space-y-2">
        {featureSaveError ? (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {featureSaveError}
          </div>
        ) : null}
        {featureSaveSuccess ? (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            {featureSaveSuccess}
          </div>
        ) : null}
      </div>
    );
  };

  const renderIntegrationsSection = () => (
    <div className="settings-scrollbar theme-settings-content-body min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
      <div className="rounded-lg border border-black/30 bg-[#232428] p-4">
        <p className="text-sm font-semibold text-white">Channel Integrations</p>
        <p className="mt-1 text-xs text-zinc-400">Choose the provider, API base URL, and which installed bots are allowed to operate in this channel.</p>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-md border border-black/25 bg-[#1e1f22] px-3 py-2">
            <p className="text-xs text-zinc-300">Enable integrations in this channel</p>
            <Button
              type="button"
              size="sm"
              variant={featureSettings.integrations.enabled ? "primary" : "secondary"}
              onClick={() =>
                setFeatureSettings((prev) => ({
                  ...prev,
                  integrations: { ...prev.integrations, enabled: !prev.integrations.enabled },
                }))
              }
              disabled={isLoadingFeatures || isSavingFeatures}
            >
              {featureSettings.integrations.enabled ? "Enabled" : "Disabled"}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Primary Provider</p>
              <Select
                value={featureSettings.integrations.provider || "__none__"}
                onValueChange={(value) =>
                  setFeatureSettings((prev) => ({
                    ...prev,
                    integrations: { ...prev.integrations, provider: value === "__none__" ? "" : value },
                  }))
                }
                disabled={isLoadingFeatures || isSavingFeatures}
              >
                <SelectTrigger className="border-0 bg-zinc-700/50 text-zinc-100 outline-none ring-offset-0 focus:ring-0 focus:ring-offset-0">
                  <SelectValue placeholder="Choose provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No provider selected</SelectItem>
                  {featureCatalog.providers.map((provider) => (
                    <SelectItem key={provider.key} value={provider.key}>
                      {provider.label}
                      {provider.configured ? "" : " (not configured)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Provider API URL</p>
              <Input
                value={featureSettings.integrations.providerApiUrl}
                onChange={(event) =>
                  setFeatureSettings((prev) => ({
                    ...prev,
                    integrations: { ...prev.integrations, providerApiUrl: event.target.value.slice(0, 512) },
                  }))
                }
                disabled={isLoadingFeatures || isSavingFeatures}
                className="border-0 bg-zinc-700/50 text-zinc-100 focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder="https://api.example.com/v1"
              />
            </div>
          </div>

          <div className="flex items-end justify-between rounded-md border border-black/25 bg-[#1e1f22] px-3 py-2">
            <div>
              <p className="text-xs text-zinc-300">Sync @mentions to integrations</p>
              <p className="text-[11px] text-zinc-500">When enabled, integration hooks can receive mention context for channel events.</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={featureSettings.integrations.syncMentions ? "primary" : "secondary"}
              onClick={() =>
                setFeatureSettings((prev) => ({
                  ...prev,
                  integrations: { ...prev.integrations, syncMentions: !prev.integrations.syncMentions },
                }))
              }
              disabled={isLoadingFeatures || isSavingFeatures}
            >
              {featureSettings.integrations.syncMentions ? "On" : "Off"}
            </Button>
          </div>

          <div className="rounded-md border border-black/25 bg-[#1e1f22] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-300">Allowed installed bots</p>
                <p className="mt-1 text-[11px] text-zinc-500">If you leave this empty, every enabled installed bot can respond here.</p>
              </div>
              <span className="rounded bg-black/25 px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                {featureSettings.integrations.allowedBotIds.length === 0 ? "All bots" : `${featureSettings.integrations.allowedBotIds.length} selected`}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {featureCatalog.bots.length === 0 ? (
                <p className="rounded border border-dashed border-zinc-600/60 bg-black/20 px-3 py-3 text-xs text-zinc-400">
                  No installed enabled bots were found for this server owner yet.
                </p>
              ) : (
                featureCatalog.bots.map((bot) => {
                  const checked = featureSettings.integrations.allowedBotIds.includes(bot.id);
                  return (
                    <label key={bot.id} className="flex items-start gap-3 rounded border border-black/20 bg-black/20 px-3 py-2 text-xs text-zinc-200">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFeatureId("allowedBotIds", bot.id)}
                        disabled={isLoadingFeatures || isSavingFeatures}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-zinc-100">{bot.name}</p>
                        <p className="truncate text-[11px] text-zinc-500">App ID: {bot.applicationId}</p>
                        <p className="truncate text-[11px] text-zinc-500">Commands: {bot.commands.length > 0 ? bot.commands.slice(0, 6).join(", ") : "None"}</p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {renderFeatureFeedback()}

        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={() => void onSaveFeatureSettings()} disabled={isLoadingFeatures || isSavingFeatures}>
            {isLoadingFeatures ? "Loading..." : isSavingFeatures ? "Saving..." : "Save Integrations"}
          </Button>
        </div>
      </div>
    </div>
  );

  const renderWebhooksSection = () => (
    <div className="settings-scrollbar theme-settings-content-body min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
      <div className="rounded-lg border border-black/30 bg-[#232428] p-4">
        <p className="text-sm font-semibold text-white">Channel Webhooks</p>
        <p className="mt-1 text-xs text-zinc-400">Manage outbound webhook URLs, signing secrets, and which channel events each hook receives.</p>

        <div className="mt-4 space-y-2">
          {featureSettings.webhooks.items.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-600/60 bg-black/20 px-3 py-3 text-xs text-zinc-400">
              No channel webhooks configured yet.
            </p>
          ) : null}

          {featureSettings.webhooks.items.map((hook) => (
            <div key={hook.id} className="space-y-2 rounded-md border border-black/25 bg-[#1e1f22] p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={hook.name}
                  onChange={(event) =>
                    setFeatureSettings((prev) => ({
                      ...prev,
                      webhooks: {
                        items: prev.webhooks.items.map((item) =>
                          item.id === hook.id ? { ...item, name: event.target.value.slice(0, 80) } : item
                        ),
                      },
                    }))
                  }
                  disabled={isLoadingFeatures || isSavingFeatures}
                  className="border-0 bg-zinc-700/50 text-zinc-100 focus-visible:ring-0 focus-visible:ring-offset-0"
                  placeholder="Webhook name"
                />
                <Input
                  value={hook.url}
                  onChange={(event) =>
                    setFeatureSettings((prev) => ({
                      ...prev,
                      webhooks: {
                        items: prev.webhooks.items.map((item) =>
                          item.id === hook.id ? { ...item, url: event.target.value.slice(0, 512) } : item
                        ),
                      },
                    }))
                  }
                  disabled={isLoadingFeatures || isSavingFeatures}
                  className="border-0 bg-zinc-700/50 text-zinc-100 focus-visible:ring-0 focus-visible:ring-offset-0"
                  placeholder="https://example.com/hook"
                />
                <Input
                  value={hook.secret ?? ""}
                  onChange={(event) =>
                    setFeatureSettings((prev) => ({
                      ...prev,
                      webhooks: {
                        items: prev.webhooks.items.map((item) =>
                          item.id === hook.id ? { ...item, secret: event.target.value.slice(0, 120) } : item
                        ),
                      },
                    }))
                  }
                  disabled={isLoadingFeatures || isSavingFeatures}
                  className="border-0 bg-zinc-700/50 text-zinc-100 focus-visible:ring-0 focus-visible:ring-offset-0"
                  placeholder="Optional signing secret"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={hook.enabled ? "primary" : "secondary"}
                    onClick={() =>
                      setFeatureSettings((prev) => ({
                        ...prev,
                        webhooks: {
                          items: prev.webhooks.items.map((item) =>
                            item.id === hook.id ? { ...item, enabled: !item.enabled } : item
                          ),
                        },
                      }))
                    }
                    disabled={isLoadingFeatures || isSavingFeatures}
                  >
                    {hook.enabled ? "Enabled" : "Disabled"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      setFeatureSettings((prev) => ({
                        ...prev,
                        webhooks: {
                          items: prev.webhooks.items.filter((item) => item.id !== hook.id),
                        },
                      }))
                    }
                    disabled={isLoadingFeatures || isSavingFeatures}
                  >
                    Remove
                  </Button>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Events</p>
                <div className="flex flex-wrap gap-2">
                  {featureCatalog.webhookEventTypes.map((eventType) => {
                    const selected = hook.eventTypes.includes(eventType.value);
                    return (
                      <button
                        key={`${hook.id}-${eventType.value}`}
                        type="button"
                        onClick={() =>
                          setFeatureSettings((prev) => ({
                            ...prev,
                            webhooks: {
                              items: prev.webhooks.items.map((item) => {
                                if (item.id !== hook.id) {
                                  return item;
                                }

                                const nextEventTypes = item.eventTypes.includes(eventType.value)
                                  ? item.eventTypes.filter((entry) => entry !== eventType.value)
                                  : [...item.eventTypes, eventType.value];

                                return {
                                  ...item,
                                  eventTypes: nextEventTypes.length > 0 ? nextEventTypes : [eventType.value],
                                };
                              }),
                            },
                          }))
                        }
                        disabled={isLoadingFeatures || isSavingFeatures}
                        className={cn(
                          "rounded px-2.5 py-1 text-[11px] font-semibold transition",
                          selected
                            ? "border border-indigo-400/60 bg-indigo-500/20 text-indigo-100"
                            : "border border-black/30 bg-black/20 text-zinc-300 hover:bg-black/30"
                        )}
                      >
                        {eventType.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">Requests are sent as JSON with X-InAccord-Channel-Event headers and optional X-InAccord-Signature when a secret is set.</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setFeatureSettings((prev) => ({
                ...prev,
                webhooks: {
                  items: [
                    ...prev.webhooks.items,
                    {
                      id: crypto.randomUUID(),
                      name: "",
                      url: "",
                      enabled: true,
                      secret: "",
                      eventTypes:
                        featureCatalog.webhookEventTypes.length > 0
                          ? featureCatalog.webhookEventTypes.map((item) => item.value)
                          : ["MESSAGE_CREATED"],
                    },
                  ],
                },
              }))
            }
            disabled={isLoadingFeatures || isSavingFeatures || featureSettings.webhooks.items.length >= 25}
          >
            Add Webhook
          </Button>
        </div>

        {renderFeatureFeedback()}

        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={() => void onSaveFeatureSettings()} disabled={isLoadingFeatures || isSavingFeatures}>
            {isLoadingFeatures ? "Loading..." : isSavingFeatures ? "Saving..." : "Save Webhooks"}
          </Button>
        </div>
      </div>
    </div>
  );

  const renderAppsSection = () => {
    return (
      <div className="settings-scrollbar theme-settings-content-body min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <div className="rounded-lg border border-black/30 bg-[#232428] p-4">
          <p className="text-sm font-semibold text-white">Channel Apps</p>
          <p className="mt-1 text-xs text-zinc-400">Choose which installed apps can run here and define the channel app API/launch URL.</p>

          <div className="mt-4 space-y-3">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">App API URL</p>
              <Input
                value={featureSettings.apps.apiUrl}
                onChange={(event) =>
                  setFeatureSettings((prev) => ({
                    ...prev,
                    apps: {
                      ...prev.apps,
                      apiUrl: event.target.value.slice(0, 512),
                    },
                  }))
                }
                disabled={isLoadingFeatures || isSavingFeatures}
                className="border-0 bg-zinc-700/50 text-zinc-100 focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder="https://apps.example.com/channel"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border border-black/25 bg-[#1e1f22] px-3 py-2">
              <p className="text-xs text-zinc-300">Allow pinned app surfaces in this channel</p>
              <Button
                type="button"
                size="sm"
                variant={featureSettings.apps.allowPinnedApps ? "primary" : "secondary"}
                onClick={() =>
                  setFeatureSettings((prev) => ({
                    ...prev,
                    apps: { ...prev.apps, allowPinnedApps: !prev.apps.allowPinnedApps },
                  }))
                }
                disabled={isLoadingFeatures || isSavingFeatures}
              >
                {featureSettings.apps.allowPinnedApps ? "Allowed" : "Blocked"}
              </Button>
            </div>

            <div className="rounded-md border border-black/25 bg-[#1e1f22] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-300">Allowed installed apps</p>
                  <p className="mt-1 text-[11px] text-zinc-500">If you leave this empty, every enabled installed app can appear here.</p>
                </div>
                <span className="rounded bg-black/25 px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                  {featureSettings.apps.allowedAppIds.length === 0 ? "All apps" : `${featureSettings.apps.allowedAppIds.length} selected`}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {featureCatalog.apps.length === 0 ? (
                  <p className="rounded border border-dashed border-zinc-600/60 bg-black/20 px-3 py-3 text-xs text-zinc-400">
                    No installed enabled apps were found for this server owner yet.
                  </p>
                ) : (
                  featureCatalog.apps.map((app) => {
                    const checked = featureSettings.apps.allowedAppIds.includes(app.id);
                    return (
                      <label key={app.id} className="flex items-start gap-3 rounded border border-black/20 bg-black/20 px-3 py-2 text-xs text-zinc-200">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleFeatureId("allowedAppIds", app.id)}
                          disabled={isLoadingFeatures || isSavingFeatures}
                          className="mt-0.5"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-zinc-100">{app.name}</p>
                          <p className="truncate text-[11px] text-zinc-500">Client ID: {app.clientId || "—"}</p>
                          <p className="truncate text-[11px] text-zinc-500">Redirect URI: {app.redirectUri || "Not set"}</p>
                          <p className="truncate text-[11px] text-zinc-500">Scopes: {app.scopes.length > 0 ? app.scopes.join(", ") : "None"}</p>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {renderFeatureFeedback()}

          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={() => void onSaveFeatureSettings()} disabled={isLoadingFeatures || isSavingFeatures}>
              {isLoadingFeatures ? "Loading..." : isSavingFeatures ? "Saving..." : "Save App Settings"}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderModerationSection = () => {
    const blockedWordsText = featureSettings.moderation.blockedWords.join(", ");

    return (
      <div className="settings-scrollbar theme-settings-content-body min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <div className="rounded-lg border border-black/30 bg-[#232428] p-4">
          <p className="text-sm font-semibold text-white">Channel Moderation</p>
          <p className="mt-1 text-xs text-zinc-400">Set moderation controls and language safeguards for this channel.</p>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-md border border-black/25 bg-[#1e1f22] px-3 py-2">
              <p className="text-xs text-zinc-300">Require verified email for participation</p>
              <Button
                type="button"
                size="sm"
                variant={featureSettings.moderation.requireVerifiedEmail ? "primary" : "secondary"}
                onClick={() =>
                  setFeatureSettings((prev) => ({
                    ...prev,
                    moderation: {
                      ...prev.moderation,
                      requireVerifiedEmail: !prev.moderation.requireVerifiedEmail,
                    },
                  }))
                }
                disabled={isLoadingFeatures || isSavingFeatures}
              >
                {featureSettings.moderation.requireVerifiedEmail ? "Required" : "Not required"}
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Slowmode (seconds)</p>
                <Input
                  type="number"
                  min={0}
                  max={21600}
                  value={String(featureSettings.moderation.slowmodeSeconds)}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    const safe = Number.isFinite(parsed) ? Math.max(0, Math.min(21600, Math.floor(parsed))) : 0;
                    setFeatureSettings((prev) => ({
                      ...prev,
                      moderation: { ...prev.moderation, slowmodeSeconds: safe },
                    }));
                  }}
                  disabled={isLoadingFeatures || isSavingFeatures}
                  className="border-0 bg-zinc-700/50 text-zinc-100 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Flagged words action</p>
                <Select
                  value={featureSettings.moderation.flaggedWordsAction}
                  onValueChange={(value) =>
                    setFeatureSettings((prev) => ({
                      ...prev,
                      moderation: {
                        ...prev.moderation,
                        flaggedWordsAction: value === "block" ? "block" : "warn",
                      },
                    }))
                  }
                  disabled={isLoadingFeatures || isSavingFeatures}
                >
                  <SelectTrigger className="border-0 bg-zinc-700/50 text-zinc-100 outline-none ring-offset-0 focus:ring-0 focus:ring-offset-0">
                    <SelectValue placeholder="Choose action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warn">Warn</SelectItem>
                    <SelectItem value="block">Block</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Blocked words (comma separated)</p>
              <Input
                value={blockedWordsText}
                onChange={(event) => {
                  const words = event.target.value
                    .split(",")
                    .map((entry) => entry.trim())
                    .filter(Boolean)
                    .slice(0, 100);

                  setFeatureSettings((prev) => ({
                    ...prev,
                    moderation: {
                      ...prev.moderation,
                      blockedWords: words,
                    },
                  }));
                }}
                disabled={isLoadingFeatures || isSavingFeatures}
                className="border-0 bg-zinc-700/50 text-zinc-100 focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder="spam, slur, scam"
              />
            </div>
          </div>

          {renderFeatureFeedback()}

          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={() => void onSaveFeatureSettings()} disabled={isLoadingFeatures || isSavingFeatures}>
              {isLoadingFeatures ? "Loading..." : isSavingFeatures ? "Saving..." : "Save Moderation"}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderInvitesSection = () => (
    <div className="settings-scrollbar theme-settings-content-body min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
      <div className="rounded-lg border border-black/30 bg-[#232428] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Channel Invites</p>
            <p className="mt-1 text-xs text-zinc-400">Create and revoke channel-scoped invite codes.</p>
          </div>
        </div>

        <div className="mt-3 grid gap-2 rounded-md border border-black/25 bg-[#1e1f22] p-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            type="number"
            min={1}
            max={100000}
            value={newInviteMaxUses}
            onChange={(event) => setNewInviteMaxUses(event.target.value)}
            placeholder="Max uses (optional)"
            className="border-0 bg-zinc-700/50 text-zinc-100 focus-visible:ring-0 focus-visible:ring-offset-0"
            disabled={isLoadingInvitePanel || Boolean(invitePanelActionCode)}
          />
          <Input
            type="number"
            min={1}
            max={24 * 365}
            value={newInviteExpiresInHours}
            onChange={(event) => setNewInviteExpiresInHours(event.target.value)}
            placeholder="Expires in hours (optional)"
            className="border-0 bg-zinc-700/50 text-zinc-100 focus-visible:ring-0 focus-visible:ring-offset-0"
            disabled={isLoadingInvitePanel || Boolean(invitePanelActionCode)}
          />
          <Button
            type="button"
            onClick={() => void onCreateInvite()}
            disabled={isLoadingInvitePanel || Boolean(invitePanelActionCode)}
          >
            {invitePanelActionCode === "__create__" ? "Creating..." : "Create Invite"}
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {isLoadingInvitePanel ? (
            <p className="rounded-md border border-dashed border-zinc-600/60 bg-black/20 px-3 py-3 text-xs text-zinc-400">
              Loading invites...
            </p>
          ) : invitePanelItems.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-600/60 bg-black/20 px-3 py-3 text-xs text-zinc-400">
              No invites yet. Create one to share channel access.
            </p>
          ) : (
            invitePanelItems.map((inviteItem) => {
              const createdAt = new Date(inviteItem.createdAt);
              const createdLabel = Number.isFinite(createdAt.getTime())
                ? createdAt.toLocaleString()
                : "Unknown";
              const expiresAt = inviteItem.expiresAt ? new Date(inviteItem.expiresAt) : null;
              const expiresLabel =
                expiresAt && Number.isFinite(expiresAt.getTime()) ? expiresAt.toLocaleString() : null;

              return (
                <div key={inviteItem.code} className="rounded-md border border-black/25 bg-[#1e1f22] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-zinc-100">{inviteItem.code}</p>
                      <p className="text-xs text-zinc-400">
                        Created {createdLabel}
                        {inviteItem.createdByName ? ` by ${inviteItem.createdByName}` : ""}
                        {typeof inviteItem.usedCount === "number" ? ` · Uses: ${inviteItem.usedCount}` : ""}
                        {typeof inviteItem.maxUses === "number" ? `/${inviteItem.maxUses}` : ""}
                        {expiresLabel ? ` · Expires: ${expiresLabel}` : ""}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void onCopyInviteLink(inviteItem.code)}
                        disabled={Boolean(invitePanelActionCode)}
                      >
                        Copy Link
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => void onDeleteInvite(inviteItem.code)}
                        disabled={Boolean(invitePanelActionCode)}
                      >
                        {invitePanelActionCode === inviteItem.code ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {invitePanelError ? (
          <p className="mt-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {invitePanelError}
          </p>
        ) : null}
        {invitePanelSuccess ? (
          <p className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            {invitePanelSuccess}
          </p>
        ) : null}
      </div>
    </div>
  );

  const onSetPermission = (
    targetType: ChannelPermissionOverwrite["targetType"],
    targetId: string,
    key: keyof RolePermissionSet,
    value: ChannelPermissionValue
  ) => {
    setPermissionOverwrites((prev) =>
      prev.map((item) =>
        item.targetType === targetType && item.targetId === targetId
          ? { ...item, permissions: { ...item.permissions, [key]: value } }
          : item
      )
    );
    setPermissionsError(null);
    setPermissionsSuccess(null);
  };

  const permissionKeyFor = (targetType: ChannelPermissionOverwrite["targetType"], targetId: string) =>
    `${targetType}:${targetId}`;

  const selectedOverwrite = useMemo(() => {
    if (!selectedPermissionKey) {
      return permissionOverwrites[0] ?? null;
    }

    return (
      permissionOverwrites.find(
        (item) => permissionKeyFor(item.targetType, item.targetId) === selectedPermissionKey
      ) ?? permissionOverwrites[0] ?? null
    );
  }, [permissionOverwrites, selectedPermissionKey]);

  const filteredPermissionCandidates = useMemo(() => {
    const normalizedFilter = permissionFilter.trim().toLowerCase();
    const existingKeys = new Set(
      permissionOverwrites.map((item) => permissionKeyFor(item.targetType, item.targetId))
    );

    return permissionCandidates
      .filter((candidate) => {
        if (!normalizedFilter) {
          return true;
        }

        const haystack = `${candidate.label} ${candidate.subtitle ?? ""}`.toLowerCase();
        return haystack.includes(normalizedFilter);
      })
      .map((candidate) => ({
        ...candidate,
        exists: existingKeys.has(permissionKeyFor(candidate.targetType, candidate.targetId)),
      }))
      .slice(0, 12);
  }, [permissionCandidates, permissionFilter, permissionOverwrites]);

  const visiblePermissionOverwrites = useMemo(() => {
    const normalizedFilter = permissionFilter.trim().toLowerCase();

    const sorted = [...permissionOverwrites].sort((left, right) => {
      const rank = (value: ChannelPermissionOverwrite["targetType"]) =>
        value === "EVERYONE" ? 0 : value === "ROLE" ? 1 : 2;
      const byType = rank(left.targetType) - rank(right.targetType);
      if (byType !== 0) {
        return byType;
      }

      return left.label.localeCompare(right.label);
    });

    if (!normalizedFilter) {
      return sorted;
    }

    return sorted.filter((item) =>
      `${item.label} ${item.subtitle ?? ""}`.toLowerCase().includes(normalizedFilter)
    );
  }, [permissionFilter, permissionOverwrites]);

  const addOrFocusPermissionTarget = (candidate: ChannelPermissionCandidate) => {
    const key = permissionKeyFor(candidate.targetType, candidate.targetId);
    const existing = permissionOverwrites.find(
      (item) => permissionKeyFor(item.targetType, item.targetId) === key
    );

    if (existing) {
      setSelectedPermissionKey(key);
      return;
    }

    setPermissionOverwrites((prev) => [
      ...prev,
      {
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        label: candidate.label,
        subtitle: candidate.subtitle ?? null,
        permissions: {
          allowView: null,
          allowSend: null,
          allowConnect: null,
        },
      },
    ]);
    setSelectedPermissionKey(key);
    setPermissionsError(null);
    setPermissionsSuccess(null);
  };

  const removePermissionTarget = (overwrite: ChannelPermissionOverwrite) => {
    if (overwrite.targetType === "EVERYONE" || overwrite.targetType === "ROLE") {
      return;
    }

    const key = permissionKeyFor(overwrite.targetType, overwrite.targetId);
    setPermissionOverwrites((prev) => prev.filter((item) => permissionKeyFor(item.targetType, item.targetId) !== key));
    setSelectedPermissionKey((prev) => (prev === key ? null : prev));
    setPermissionsError(null);
    setPermissionsSuccess(null);
  };

  const permissionChoiceClass = (isActive: boolean, kind: "allow" | "inherit" | "deny") => {
    if (!isActive) return "border border-black/30 bg-black/20 text-zinc-300 hover:bg-black/30";
    if (kind === "allow") return "border border-emerald-400/60 bg-emerald-500/20 text-emerald-100";
    if (kind === "deny") return "border border-rose-400/60 bg-rose-500/20 text-rose-100";
    return "border border-zinc-400/50 bg-zinc-500/20 text-zinc-100";
  };

  const onSavePermissions = async () => {
    if (!server?.id || !channel?.id) {
      setPermissionsError("Missing server or channel context.");
      return;
    }

    try {
      setIsSavingPermissions(true);
      setPermissionsError(null);
      setPermissionsSuccess(null);

      await axios.patch(`/api/channels/${channel.id}/permissions`, {
        serverId: server.id,
        overwrites: permissionOverwrites.map((item) => ({
          targetType: item.targetType,
          targetId: item.targetId,
          permissions: item.permissions,
        })),
      });

      setPermissionsSuccess("Channel permission overwrites updated.");
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          (error.response?.data as { error?: string } | undefined)?.error ||
          error.message ||
          "Failed to save channel permissions.";
        setPermissionsError(message);
      } else {
        setPermissionsError("Failed to save channel permissions.");
      }
    } finally {
      setIsSavingPermissions(false);
    }
  };

  const renderPlaceholderSection = (tab: Exclude<ChannelSettingsTab, "overview" | "permissions" | "danger" | "integrations" | "webhooks" | "apps" | "moderation">) => (
    <div className="settings-scrollbar theme-settings-content-body min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
      <div className="rounded-lg border border-black/30 bg-[#232428] p-4">
        <p className="text-sm font-semibold text-white">{tabLabelMap[tab]}</p>
        <p className="mt-1 text-xs text-zinc-400">{tabDescriptionMap[tab]}</p>
        <div className="mt-3 rounded-md border border-[#5865f2]/35 bg-[#5865f2]/10 px-3 py-2 text-xs text-[#cdd2ff]">
          App-style menu is now in place. This section is ready for feature-specific wiring.
        </div>
      </div>
    </div>
  );

  const renderPermissionsSection = () => {
    const selectedChannelType = form.watch("type");
    const sendPermissionLabel =
      selectedChannelType === ChannelType.TEXT
        ? "Send Messages"
        : selectedChannelType === ChannelType.AUDIO
          ? "Transmit Audio"
          : "Transmit Video";
    const connectPermissionLabel =
      selectedChannelType === ChannelType.TEXT
        ? "Connect"
        : selectedChannelType === ChannelType.AUDIO
          ? "Connect to Voice"
          : "Connect to Video";

    return (
      <div className="settings-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="rounded-lg border border-black/30 bg-[#232428] p-4">
          <p className="text-sm font-semibold text-white">Permission Overwrites</p>
          <p className="mt-1 text-xs text-zinc-400">Compact, Discord-style editing for roles and individual members.</p>

          <div className="mt-4 space-y-3">
            <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="space-y-3 rounded-md border border-black/25 bg-[#1e1f22] p-3">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Add roles or members</p>
                  <Input
                    value={permissionFilter}
                    onChange={(event) => setPermissionFilter(event.target.value.slice(0, 120))}
                    disabled={isLoadingPermissions || isSavingPermissions}
                    className="border-0 bg-zinc-700/50 text-zinc-100 focus-visible:ring-0 focus-visible:ring-offset-0"
                    placeholder="Search roles or members"
                  />
                </div>

                <div className="space-y-2">
                  {filteredPermissionCandidates.length === 0 ? (
                    <p className="rounded border border-dashed border-zinc-600/60 bg-black/20 px-3 py-2 text-xs text-zinc-400">
                      No matching roles or members.
                    </p>
                  ) : (
                    filteredPermissionCandidates.map((candidate) => {
                      const key = permissionKeyFor(candidate.targetType, candidate.targetId);
                      return (
                        <div key={key} className="flex items-center justify-between gap-2 rounded border border-black/20 bg-black/20 px-2 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-zinc-100">{candidate.label}</p>
                            <p className="truncate text-[11px] text-zinc-400">{candidate.subtitle ?? candidate.targetType}</p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant={candidate.exists ? "secondary" : "primary"}
                            onClick={() => addOrFocusPermissionTarget(candidate)}
                            disabled={isLoadingPermissions || isSavingPermissions}
                          >
                            {candidate.exists ? "Jump" : "Add"}
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="settings-scrollbar max-h-[44vh] space-y-1 overflow-y-auto pr-1">
                  {visiblePermissionOverwrites.map((overwrite) => {
                    const overwriteKey = permissionKeyFor(overwrite.targetType, overwrite.targetId);
                    const isSelected = overwriteKey === permissionKeyFor(selectedOverwrite?.targetType ?? "EVERYONE", selectedOverwrite?.targetId ?? "EVERYONE") && Boolean(selectedOverwrite);
                    return (
                      <button
                        key={overwriteKey}
                        type="button"
                        onClick={() => setSelectedPermissionKey(overwriteKey)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-md px-2 py-2 text-left transition",
                          isSelected ? "bg-[#404249] text-white" : "bg-black/20 text-zinc-200 hover:bg-black/30"
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{overwrite.label}</p>
                          <p className="truncate text-[11px] text-zinc-400">{overwrite.subtitle ?? overwrite.targetType}</p>
                        </div>
                        {overwrite.targetType === "MEMBER" ? (
                          <span className="rounded bg-zinc-700/50 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-zinc-300">User</span>
                        ) : overwrite.targetType === "ROLE" ? (
                          <span className="rounded bg-zinc-700/50 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-zinc-300">Role</span>
                        ) : (
                          <span className="rounded bg-zinc-700/50 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-zinc-300">Default</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-md border border-black/25 bg-[#1e1f22] p-3">
                {selectedOverwrite ? (
                  <>
                    <div className="flex items-start justify-between gap-3 border-b border-black/20 pb-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{selectedOverwrite.label}</p>
                        <p className="mt-1 text-xs text-zinc-400">{selectedOverwrite.subtitle ?? selectedOverwrite.targetType}</p>
                      </div>
                      {selectedOverwrite.targetType === "MEMBER" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => removePermissionTarget(selectedOverwrite)}
                          disabled={isLoadingPermissions || isSavingPermissions}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>

                    <div className="mt-3 space-y-2">
                      {([
                        ["allowView", "View Channel"],
                        ["allowSend", sendPermissionLabel],
                        ["allowConnect", connectPermissionLabel],
                      ] as const).map(([key, label]) => {
                        const current = selectedOverwrite.permissions[key];
                        return (
                          <div key={key} className="flex items-center justify-between gap-3 rounded-md border border-black/20 bg-black/20 px-3 py-2">
                            <div>
                              <p className="text-sm font-medium text-zinc-100">{label}</p>
                              <p className="text-[11px] text-zinc-400">Allow, inherit, or deny for this target.</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onSetPermission(selectedOverwrite.targetType, selectedOverwrite.targetId, key, true)}
                                className={cn("rounded px-2.5 py-1 text-[11px] font-semibold", permissionChoiceClass(current === true, "allow"))}
                                disabled={isLoadingPermissions || isSavingPermissions}
                              >
                                Allow
                              </button>
                              <button
                                type="button"
                                onClick={() => onSetPermission(selectedOverwrite.targetType, selectedOverwrite.targetId, key, null)}
                                className={cn("rounded px-2.5 py-1 text-[11px] font-semibold", permissionChoiceClass(current === null, "inherit"))}
                                disabled={isLoadingPermissions || isSavingPermissions}
                              >
                                Inherit
                              </button>
                              <button
                                type="button"
                                onClick={() => onSetPermission(selectedOverwrite.targetType, selectedOverwrite.targetId, key, false)}
                                className={cn("rounded px-2.5 py-1 text-[11px] font-semibold", permissionChoiceClass(current === false, "deny"))}
                                disabled={isLoadingPermissions || isSavingPermissions}
                              >
                                Deny
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="rounded border border-dashed border-zinc-600/60 bg-black/20 px-3 py-3 text-xs text-zinc-400">
                    Select a role or member to edit its overwrites.
                  </p>
                )}
              </div>
            </div>
          </div>

          {permissionsError ? <p className="mt-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{permissionsError}</p> : null}
          {permissionsSuccess ? <p className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{permissionsSuccess}</p> : null}

          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={onSavePermissions} disabled={isLoadingPermissions || isSavingPermissions}>
              {isLoadingPermissions ? "Loading..." : isSavingPermissions ? "Saving..." : "Save Permission Overwrites"}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={handleClose}>
      <DialogContent className="settings-theme-scope settings-scrollbar theme-settings-shell flex h-[85vh] max-h-[85vh] w-[85vw] max-w-[85vw] flex-col overflow-hidden border border-black/30 bg-[#313338] p-0 text-white">
        <DialogTitle className="sr-only">Edit Channel Settings</DialogTitle>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_240px]">
          <div className="theme-settings-content flex min-h-0 h-full flex-col overflow-hidden">
            <div className="theme-settings-content-header border-b border-black/30 px-6 py-4">
              <h2 className="text-lg font-bold text-white">{tabLabelMap[activeTab]}</h2>
              <p className="mt-0.5 text-xs text-zinc-400">{tabDescriptionMap[activeTab]}</p>
              <p className="text-xs text-zinc-400">Channel: #{channel?.name ?? "unknown"}</p>
            </div>

            {activeTab === "danger" ? (
              <div className="settings-scrollbar theme-settings-content-body min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
                <p className="text-sm text-zinc-300">Deleting a channel permanently removes its messages.</p>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    if (!channel || !server) return;
                    onOpen("deleteChannel", { channel, server });
                  }}
                >
                  Delete Channel
                </Button>
                <p className="text-xs text-zinc-400">The default channel in a server cannot be deleted.</p>
              </div>
            ) : activeTab === "permissions" ? (
              renderPermissionsSection()
            ) : activeTab === "invites" ? (
              renderInvitesSection()
            ) : activeTab === "integrations" ? (
              renderIntegrationsSection()
            ) : activeTab === "webhooks" ? (
              renderWebhooksSection()
            ) : activeTab === "apps" ? (
              renderAppsSection()
            ) : activeTab === "moderation" ? (
              renderModerationSection()
            ) : activeTab !== "overview" ? (
              renderPlaceholderSection(activeTab)
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex h-full min-h-0 flex-col">
                  <div className="settings-scrollbar theme-settings-content-body min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold uppercase text-zinc-400">Channel Name</FormLabel>
                          <FormControl>
                            <Input disabled={isLoading} className="border-0 bg-zinc-700/50 text-zinc-100 focus-visible:ring-0 focus-visible:ring-offset-0" placeholder="Enter channel name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold uppercase text-zinc-400">Channel Type</FormLabel>
                          <Select disabled={isLoading} onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="capitalize border-0 bg-zinc-700/50 text-zinc-100 outline-none ring-offset-0 focus:ring-0 focus:ring-offset-0">
                                <SelectValue placeholder="Select a channel type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.values(ChannelType).map((typeValue) => (
                                <SelectItem key={typeValue} value={typeValue} className="capitalize">
                                  {typeValue.toLowerCase()}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="icon"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold uppercase text-zinc-400">Channel Icon</FormLabel>
                          <FormControl>
                            <Input disabled={isLoading} maxLength={16} className="border-0 bg-zinc-700/50 text-zinc-100 focus-visible:ring-0 focus-visible:ring-offset-0" placeholder="e.g. 🔥" {...field} value={field.value ?? ""} />
                          </FormControl>
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">Free icon picks</p>
                            <div className="grid grid-cols-6 gap-1 rounded-md border border-black/20 bg-black/10 p-2 sm:grid-cols-9">
                              {FREE_CHANNEL_ICONS.map((icon) => (
                                <button
                                  key={icon}
                                  type="button"
                                  onClick={() => form.setValue("icon", icon, { shouldDirty: true, shouldValidate: true })}
                                  className={cn("inline-flex h-8 w-8 items-center justify-center rounded text-base transition hover:bg-zinc-700/50", (field.value ?? "") === icon && "bg-zinc-700/70 ring-1 ring-indigo-400/80")}
                                  aria-label={`Use ${icon} as channel icon`}
                                  title={`Use ${icon}`}
                                >
                                  {icon}
                                </button>
                              ))}
                            </div>
                          </div>
                          <p className="text-[11px] text-zinc-500">Optional emoji or short text shown before the channel name.</p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="topic"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold uppercase text-zinc-400">Channel Topic</FormLabel>
                          <FormControl>
                            <Input disabled={isLoading} className="border-0 bg-zinc-700/50 text-zinc-100 focus-visible:ring-0 focus-visible:ring-offset-0" placeholder="What is this channel about?" maxLength={500} {...field} value={field.value ?? ""} />
                          </FormControl>
                          <p className="text-[11px] text-zinc-500">Shows at the top of this channel.</p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="channelGroupId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold uppercase text-zinc-400">Channel Group</FormLabel>
                          <Select disabled={isLoading} onValueChange={(value) => field.onChange(value === "__none__" ? null : value)} value={field.value ?? "__none__"}>
                            <FormControl>
                              <SelectTrigger className="border-0 bg-zinc-700/50 text-zinc-100 outline-none ring-offset-0 focus:ring-0 focus:ring-offset-0">
                                <SelectValue placeholder="Select a channel group" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__none__">No group</SelectItem>
                              {channelGroups.map((group) => (
                                <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {isLoadingDetails ? <p className="text-[11px] text-zinc-500">Loading channel compatibility settings…</p> : null}
                    {submitError ? <p className="text-sm text-rose-400">{submitError}</p> : null}
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-black/30 bg-[#2b2d31] px-6 py-4">
                    <Button type="button" variant="ghost" onClick={handleClose} disabled={isLoading}>Cancel</Button>
                    <Button variant="primary" disabled={isLoading}>Save Changes</Button>
                  </div>
                </form>
              </Form>
            )}
          </div>

          <aside className="theme-settings-rail settings-scrollbar min-h-0 overflow-y-auto border-l border-black/30 bg-[#2b2d31] p-3">
            <div className="mt-1 space-y-3 pr-1">
              {sections.map((sectionGroup, groupIndex) => (
                <div key={`${sectionGroup.label || "danger"}-${groupIndex}`} className="space-y-1">
                  {sectionGroup.label ? (
                    <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                      {sectionGroup.label}
                    </p>
                  ) : null}

                  {sectionGroup.tabs.map((tab) => {
                    const isActive = activeTab === tab;
                    const TabIcon = tabIconMap[tab];

                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition",
                          tab === "danger"
                            ? isActive
                              ? "bg-rose-900/35 text-rose-200"
                              : "text-rose-300 hover:bg-rose-900/25"
                            : isActive
                              ? "bg-[#404249] text-white"
                              : "text-zinc-300 hover:bg-[#3a3d44]"
                        )}
                      >
                        <TabIcon className="h-4 w-4 shrink-0" />
                        {tabLabelMap[tab]}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
};
