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
  targetType: "EVERYONE" | "ROLE";
  targetId: string;
  label: string;
  permissions: RolePermissionSet;
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

        const response = await axios.get<{ overwrites?: ChannelPermissionOverwrite[] }>(`/api/channels/${channel.id}/permissions`, {
          params: { serverId: server.id },
        });

        if (!cancelled) {
          const overwrites = Array.isArray(response.data.overwrites) ? response.data.overwrites : [];
          setPermissionOverwrites(
            overwrites.map((item) => ({
              targetType: item.targetType,
              targetId: item.targetId,
              label: item.label,
              permissions: {
                allowView: item.permissions?.allowView ?? null,
                allowSend: item.permissions?.allowSend ?? null,
                allowConnect: item.permissions?.allowConnect ?? null,
              },
            }))
          );
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
    setActiveTab("overview");
    onClose();
  };

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

  const renderPlaceholderSection = (tab: Exclude<ChannelSettingsTab, "overview" | "permissions" | "danger">) => (
    <div className="flex-1 space-y-4 px-6 py-5">
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
      <div className="flex-1 space-y-4 px-6 py-5">
        <div className="rounded-lg border border-black/30 bg-[#232428] p-4">
          <p className="text-sm font-semibold text-white">Permission Overwrites</p>
          <p className="mt-1 text-xs text-zinc-400">Other-style: set Allow, Neutral (inherit), or Deny for each role.</p>

          <div className="mt-4 space-y-3">
            {permissionOverwrites.map((overwrite) => (
              <div key={`${overwrite.targetType}:${overwrite.targetId}`} className="rounded-md border border-black/25 bg-[#1e1f22] p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-300">{overwrite.label}</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {([
                    ["allowView", "View Channel"],
                    ["allowSend", sendPermissionLabel],
                    ["allowConnect", connectPermissionLabel],
                  ] as const).map(([key, label]) => {
                    const current = overwrite.permissions[key];
                    return (
                      <div key={key} className="rounded bg-black/20 px-2 py-2 text-xs text-zinc-200">
                        <p className="mb-1.5 font-medium text-zinc-300">{label}</p>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onSetPermission(overwrite.targetType, overwrite.targetId, key, true)}
                            className={cn("rounded px-2 py-1 text-[11px] font-semibold", permissionChoiceClass(current === true, "allow"))}
                            disabled={isLoadingPermissions || isSavingPermissions}
                          >
                            Allow
                          </button>
                          <button
                            type="button"
                            onClick={() => onSetPermission(overwrite.targetType, overwrite.targetId, key, null)}
                            className={cn("rounded px-2 py-1 text-[11px] font-semibold", permissionChoiceClass(current === null, "inherit"))}
                            disabled={isLoadingPermissions || isSavingPermissions}
                          >
                            Neutral
                          </button>
                          <button
                            type="button"
                            onClick={() => onSetPermission(overwrite.targetType, overwrite.targetId, key, false)}
                            className={cn("rounded px-2 py-1 text-[11px] font-semibold", permissionChoiceClass(current === false, "deny"))}
                            disabled={isLoadingPermissions || isSavingPermissions}
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
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
      <DialogContent className="h-[80vh] w-[80vw] max-h-[80vh] max-w-[80vw] overflow-hidden border border-black/30 bg-[#313338] p-0 text-white">
        <DialogTitle className="sr-only">Edit Channel Settings</DialogTitle>
        <div className="grid h-full grid-cols-[1fr_220px]">
          <div className="flex h-full flex-col">
            <div className="border-b border-black/30 px-6 py-4">
              <h2 className="text-lg font-bold text-white">{tabLabelMap[activeTab]}</h2>
              <p className="mt-0.5 text-xs text-zinc-400">{tabDescriptionMap[activeTab]}</p>
              <p className="text-xs text-zinc-400">Channel: #{channel?.name ?? "unknown"}</p>
            </div>

            {activeTab === "danger" ? (
              <div className="flex-1 space-y-3 px-6 py-5">
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
            ) : activeTab !== "overview" ? (
              renderPlaceholderSection(activeTab)
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex h-full flex-col">
                  <div className="flex-1 space-y-6 px-6 py-5">
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

          <aside className="border-l border-black/30 bg-[#2b2d31] p-3">
            <div className="mt-1 space-y-3">
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
