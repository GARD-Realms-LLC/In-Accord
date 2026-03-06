"use client";

import qs from "query-string";
import axios from "axios";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ChannelType } from "@/lib/db/types";
import { cn } from "@/lib/utils";

import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useModal } from "@/hooks/use-modal-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Link2,
  Shield,
  SlidersHorizontal,
  Trash2,
  Users,
  Webhook,
} from "lucide-react";

const formSchema = z.object({
  name: z
    .string()
    .min(1, {
      message: "Channel name is required.",
    }),
  topic: z
    .string()
    .max(500, {
      message: "Channel topic must be 500 characters or fewer.",
    })
    .optional(),
  type: z.nativeEnum(ChannelType),
  channelGroupId: z.string().nullable().optional(),
});

type ChannelGroupItem = {
  id: string;
  name: string;
};

type RolePermissionSet = {
  allowView: boolean;
  allowSend: boolean;
  allowConnect: boolean;
};

type RolePermissions = {
  ADMIN: RolePermissionSet;
  MODERATOR: RolePermissionSet;
  GUEST: RolePermissionSet;
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
  {
    label: "Channel Settings",
    tabs: ["overview", "permissions", "invites"],
  },
  {
    label: "Integrations",
    tabs: ["integrations", "webhooks", "apps"],
  },
  {
    label: "Community",
    tabs: ["moderation"],
  },
  {
    label: "",
    tabs: ["danger"],
  },
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
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>({
    ADMIN: { allowView: true, allowSend: true, allowConnect: true },
    MODERATOR: { allowView: true, allowSend: true, allowConnect: true },
    GUEST: { allowView: true, allowSend: true, allowConnect: true },
  });

  const isModalOpen = isOpen && type === "editChannel";
  const { channel, server } = data;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      topic: "",
      type: channel?.type || ChannelType.TEXT,
      channelGroupId: null,
    },
  });

  useEffect(() => {
    if (channel) {
      form.setValue("name", channel.name);
      form.setValue("topic", ((channel as { topic?: string | null })?.topic ?? ""));
      form.setValue("type", channel.type);
      form.setValue("channelGroupId", ((channel as { channelGroupId?: string | null })?.channelGroupId ?? null));
    }
  }, [form, channel]);

  useEffect(() => {
    if (!isModalOpen || !server?.id || !channel?.id) {
      return;
    }

    let cancelled = false;

    const loadPermissions = async () => {
      try {
        setIsLoadingPermissions(true);
        setPermissionsError(null);
        setPermissionsSuccess(null);

        const response = await axios.get<{ permissions?: Partial<RolePermissions> }>(
          `/api/channels/${channel.id}/permissions`,
          { params: { serverId: server.id } }
        );

        if (!cancelled && response.data.permissions) {
          setRolePermissions({
            ADMIN: {
              allowView: response.data.permissions.ADMIN?.allowView ?? true,
              allowSend: response.data.permissions.ADMIN?.allowSend ?? true,
              allowConnect: response.data.permissions.ADMIN?.allowConnect ?? true,
            },
            MODERATOR: {
              allowView: response.data.permissions.MODERATOR?.allowView ?? true,
              allowSend: response.data.permissions.MODERATOR?.allowSend ?? true,
              allowConnect: response.data.permissions.MODERATOR?.allowConnect ?? true,
            },
            GUEST: {
              allowView: response.data.permissions.GUEST?.allowView ?? true,
              allowSend: response.data.permissions.GUEST?.allowSend ?? true,
              allowConnect: response.data.permissions.GUEST?.allowConnect ?? true,
            },
          });
        }
      } catch (error) {
        if (!cancelled) {
          setPermissionsError("Failed to load channel permissions.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPermissions(false);
        }
      }
    };

    void loadPermissions();

    return () => {
      cancelled = true;
    };
  }, [isModalOpen, server?.id, channel?.id]);

  useEffect(() => {
    if (!isModalOpen || !server?.id) {
      return;
    }

    let cancelled = false;

    const loadGroups = async () => {
      try {
        const response = await axios.get<{ groups?: ChannelGroupItem[] }>("/api/channel-groups", {
          params: { serverId: server.id },
        });

        if (!cancelled) {
          setChannelGroups(response.data.groups ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          setChannelGroups([]);
        }
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
        query: {
          serverId: server?.id,
        },
      });
      await axios.patch(url, {
        ...values,
        topic: (values.topic ?? "").trim(),
        channelGroupId:
          typeof values.channelGroupId === "string" && values.channelGroupId.length > 0
            ? values.channelGroupId
            : null,
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
      console.log(error);
    }
  };

  const handleClose = () => {
    form.reset();
    setSubmitError(null);
    setActiveTab("overview");
    onClose();
  };

  const onTogglePermission = (
    role: keyof RolePermissions,
    key: keyof RolePermissionSet,
    value: boolean
  ) => {
    setRolePermissions((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [key]: value,
      },
    }));
    setPermissionsError(null);
    setPermissionsSuccess(null);
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
        permissions: rolePermissions,
      });

      setPermissionsSuccess("Channel permissions updated.");
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

  const renderPlaceholderSection = (tab: Exclude<ChannelSettingsTab, "overview" | "permissions" | "danger">) => {
    return (
      <div className="flex-1 space-y-4 px-6 py-5">
        <div className="rounded-lg border border-black/30 bg-[#232428] p-4">
          <p className="text-sm font-semibold text-white">{tabLabelMap[tab]}</p>
          <p className="mt-1 text-xs text-zinc-400">{tabDescriptionMap[tab]}</p>
          <div className="mt-3 rounded-md border border-[#5865f2]/35 bg-[#5865f2]/10 px-3 py-2 text-xs text-[#cdd2ff]">
            Discord-style menu is now in place. This section is ready for feature-specific wiring.
          </div>
        </div>
      </div>
    );
  };

  const renderPermissionsSection = () => {
    const roleRows: Array<keyof RolePermissions> = ["ADMIN", "MODERATOR", "GUEST"];

    return (
      <div className="flex-1 space-y-4 px-6 py-5">
        <div className="rounded-lg border border-black/30 bg-[#232428] p-4">
          <p className="text-sm font-semibold text-white">Role Permissions</p>
          <p className="mt-1 text-xs text-zinc-400">
            Configure who can view this channel, send messages, and connect.
          </p>

          <div className="mt-4 space-y-3">
            {roleRows.map((role) => (
              <div key={role} className="rounded-md border border-black/25 bg-[#1e1f22] p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-300">{role}</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {([
                    ["allowView", "View Channel"],
                    ["allowSend", "Send Messages"],
                    ["allowConnect", "Connect"],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 rounded bg-black/20 px-2 py-1.5 text-xs text-zinc-200">
                      <input
                        type="checkbox"
                        checked={rolePermissions[role][key]}
                        onChange={(event) => onTogglePermission(role, key, event.target.checked)}
                        disabled={isLoadingPermissions || isSavingPermissions}
                        className="h-4 w-4 accent-[#5865f2]"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {permissionsError ? (
            <p className="mt-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {permissionsError}
            </p>
          ) : null}

          {permissionsSuccess ? (
            <p className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {permissionsSuccess}
            </p>
          ) : null}

          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              onClick={onSavePermissions}
              disabled={isLoadingPermissions || isSavingPermissions}
            >
              {isLoadingPermissions
                ? "Loading..."
                : isSavingPermissions
                  ? "Saving..."
                  : "Save Permissions"}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl overflow-hidden border border-black/30 bg-[#313338] p-0 text-white">
        <div className="grid min-h-[560px] grid-cols-[220px_1fr]">
          <aside className="border-r border-black/30 bg-[#2b2d31] p-3">
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

          <div className="flex h-full flex-col">
            <div className="border-b border-black/30 px-6 py-4">
              <h2 className="text-lg font-bold text-white">{tabLabelMap[activeTab]}</h2>
              <p className="mt-0.5 text-xs text-zinc-400">{tabDescriptionMap[activeTab]}</p>
              <p className="text-xs text-zinc-400">Channel: #{channel?.name ?? "unknown"}</p>
            </div>

            {activeTab === "danger" ? (
              <div className="flex-1 space-y-3 px-6 py-5">
                <p className="text-sm text-zinc-300">
                  Deleting a channel permanently removes its messages.
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    if (!channel || !server) {
                      return;
                    }
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
                            <Input
                              disabled={isLoading}
                              className="border-0 bg-zinc-700/50 text-zinc-100 focus-visible:ring-0 focus-visible:ring-offset-0"
                              placeholder="Enter channel name"
                              {...field}
                            />
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
                              {Object.values(ChannelType).map((type) => (
                                <SelectItem key={type} value={type} className="capitalize">
                                  {type.toLowerCase()}
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
                      name="topic"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold uppercase text-zinc-400">Channel Topic</FormLabel>
                          <FormControl>
                            <Input
                              disabled={isLoading}
                              className="border-0 bg-zinc-700/50 text-zinc-100 focus-visible:ring-0 focus-visible:ring-offset-0"
                              placeholder="What is this channel about?"
                              maxLength={500}
                              {...field}
                              value={field.value ?? ""}
                            />
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
                          <Select
                            disabled={isLoading}
                            onValueChange={(value) => field.onChange(value === "__none__" ? null : value)}
                            value={field.value ?? "__none__"}
                          >
                            <FormControl>
                              <SelectTrigger className="border-0 bg-zinc-700/50 text-zinc-100 outline-none ring-offset-0 focus:ring-0 focus:ring-offset-0">
                                <SelectValue placeholder="Select a channel group" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__none__">No group</SelectItem>
                              {channelGroups.map((group) => (
                                <SelectItem key={group.id} value={group.id}>
                                  {group.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {submitError ? <p className="text-sm text-rose-400">{submitError}</p> : null}
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-black/30 bg-[#2b2d31] px-6 py-4">
                    <Button type="button" variant="ghost" onClick={handleClose} disabled={isLoading}>
                      Cancel
                    </Button>
                    <Button variant="primary" disabled={isLoading}>
                      Save Changes
                    </Button>
                  </div>
                </form>
              </Form>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
