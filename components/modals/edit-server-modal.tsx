"use client";

import axios from "axios";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera, Loader2, Pencil, Plus, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { UserAvatar } from "@/components/user-avatar";
import { useModal } from "@/hooks/use-modal-store";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  name: z.string().min(1, { message: "Server name is required" }),
  imageUrl: z.string().min(1, { message: "Server image is required" }),
  bannerUrl: z.string().optional(),
  bannerFit: z.enum(["cover", "contain", "scale"]).optional(),
  bannerScale: z.number().min(1).max(2).optional(),
});

type ServerSettingsSection =
  | "overview"
  | "roles"
  | "emoji"
  | "stickers"
  | "soundboard"
  | "moderation"
  | "auditLog"
  | "invites"
  | "bans"
  | "integrations"
  | "webhooks"
  | "appDirectory"
  | "serverTemplate"
  | "communityOverview"
  | "safetySetup"
  | "onboarding"
  | "vanityUrl"
  | "widget"
  | "deleteServer";

const SETTINGS_SECTIONS: Array<{
  heading?: string;
  items: Array<{ key: ServerSettingsSection; label: string }>;
}> = [
  {
    items: [
      { key: "overview", label: "Overview" },
      { key: "roles", label: "Roles" },
      { key: "emoji", label: "Emoji" },
      { key: "stickers", label: "Stickers" },
      { key: "soundboard", label: "Soundboard" },
    ],
  },
  {
    heading: "Moderation",
    items: [
      { key: "moderation", label: "Moderation" },
      { key: "auditLog", label: "Audit Log" },
      { key: "invites", label: "Invites" },
      { key: "bans", label: "Bans" },
    ],
  },
  {
    heading: "Apps",
    items: [
      { key: "integrations", label: "Integrations" },
      { key: "webhooks", label: "Webhooks" },
      { key: "appDirectory", label: "App Directory" },
    ],
  },
  {
    heading: "Community",
    items: [
      { key: "communityOverview", label: "Community Overview" },
      { key: "safetySetup", label: "Safety Setup" },
      { key: "onboarding", label: "Onboarding" },
      { key: "vanityUrl", label: "Vanity URL" },
      { key: "widget", label: "Widget" },
      { key: "serverTemplate", label: "Server Template" },
    ],
  },
  {
    heading: "Danger Zone",
    items: [{ key: "deleteServer", label: "Delete Server" }],
  },
];

const SECTION_TITLES: Record<ServerSettingsSection, string> = {
  overview: "Server Overview",
  roles: "Roles",
  emoji: "Emoji",
  stickers: "Stickers",
  soundboard: "Soundboard",
  moderation: "Moderation",
  auditLog: "Audit Log",
  invites: "Invites",
  bans: "Bans",
  integrations: "Integrations",
  webhooks: "Webhooks",
  appDirectory: "App Directory",
  serverTemplate: "Server Template",
  communityOverview: "Community Overview",
  safetySetup: "Safety Setup",
  onboarding: "Onboarding",
  vanityUrl: "Vanity URL",
  widget: "Widget",
  deleteServer: "Delete Server",
};

type ServerRoleItem = {
  id: string;
  name: string;
  color: string;
  iconUrl: string | null;
  position: number;
  isManaged: boolean;
  memberCount?: number;
};

type RoleMemberItem = {
  memberId: string;
  profileId: string;
  displayName: string;
  email: string | null;
  imageUrl: string | null;
  isAssigned: boolean;
};

export const EditServerModal = () => {
  const { isOpen, onClose, onOpen, type, data } = useModal();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<ServerSettingsSection>("overview");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [roles, setRoles] = useState<ServerRoleItem[]>([]);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  const [serverMemberTotal, setServerMemberTotal] = useState(0);
  const [canManageRoles, setCanManageRoles] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState("#99aab5");
  const [newRoleIconUrl, setNewRoleIconUrl] = useState("");
  const [isCreateRolePopupOpen, setIsCreateRolePopupOpen] = useState(false);
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [isUploadingNewRoleIcon, setIsUploadingNewRoleIcon] = useState(false);
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [isRoleEditorPopupOpen, setIsRoleEditorPopupOpen] = useState(false);
  const [editRoleName, setEditRoleName] = useState("");
  const [editRoleColor, setEditRoleColor] = useState("#99aab5");
  const [editRoleIconUrl, setEditRoleIconUrl] = useState("");
  const [isUploadingEditRoleIcon, setIsUploadingEditRoleIcon] = useState(false);
  const [roleMembers, setRoleMembers] = useState<RoleMemberItem[]>([]);
  const [isLoadingRoleMembers, setIsLoadingRoleMembers] = useState(false);
  const [roleMembersError, setRoleMembersError] = useState<string | null>(null);
  const [canManageRoleMembers, setCanManageRoleMembers] = useState(false);
  const [togglingMemberId, setTogglingMemberId] = useState<string | null>(null);
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const newRoleIconInputRef = useRef<HTMLInputElement | null>(null);
  const editRoleIconInputRef = useRef<HTMLInputElement | null>(null);

  const isModalOpen = isOpen && type === "editServer";
  const { server } = data;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      imageUrl: "",
      bannerUrl: "",
      bannerFit: "cover",
      bannerScale: 1,
    },
  });

  useEffect(() => {
    if (server) {
      form.setValue("name", server.name);
      form.setValue("imageUrl", server.imageUrl);
      form.setValue(
        "bannerUrl",
        (server as { bannerUrl?: string | null }).bannerUrl ?? ""
      );
      form.setValue(
        "bannerFit",
        ((server as { bannerFit?: "cover" | "contain" | "scale" | null }).bannerFit ?? "cover") as
          | "cover"
          | "contain"
          | "scale"
      );
      form.setValue(
        "bannerScale",
        (server as { bannerScale?: number | null }).bannerScale ?? 1
      );
    }
  }, [server, form]);

  useEffect(() => {
    if (!isModalOpen) {
      setActiveSection("overview");
      setRoles([]);
      setRolesError(null);
      setCanManageRoles(false);
      setServerMemberTotal(0);
      setSelectedRoleId(null);
      setNewRoleName("");
      setNewRoleColor("#99aab5");
      setNewRoleIconUrl("");
      setIsCreateRolePopupOpen(false);
      setIsRoleEditorPopupOpen(false);
      setEditRoleName("");
      setEditRoleColor("#99aab5");
      setEditRoleIconUrl("");
      setRoleMembers([]);
      setRoleMembersError(null);
      setCanManageRoleMembers(false);
      setTogglingMemberId(null);
      setAddMemberSearch("");
      setIsUploadingNewRoleIcon(false);
      setIsUploadingEditRoleIcon(false);
    }
  }, [isModalOpen]);

  useEffect(() => {
    if (!isModalOpen || activeSection !== "roles" || !isRoleEditorPopupOpen || !server?.id || !selectedRoleId) {
      return;
    }

    let cancelled = false;

    const loadRoleMembers = async () => {
      try {
        setIsLoadingRoleMembers(true);
        setRoleMembersError(null);

        const response = await axios.get<{
          members?: RoleMemberItem[];
          canManageRoleMembers?: boolean;
        }>(`/api/servers/${server.id}/roles/${selectedRoleId}/members`);

        if (cancelled) {
          return;
        }

        setRoleMembers(response.data.members ?? []);
        setCanManageRoleMembers(Boolean(response.data.canManageRoleMembers));
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (axios.isAxiosError(error)) {
          const message =
            (error.response?.data as { error?: string })?.error ||
            (typeof error.response?.data === "string" ? error.response.data : "") ||
            error.message;
          setRoleMembersError(message || "Failed to load role members.");
        } else {
          setRoleMembersError("Failed to load role members.");
        }

        setRoleMembers([]);
      } finally {
        if (!cancelled) {
          setIsLoadingRoleMembers(false);
        }
      }
    };

    void loadRoleMembers();

    return () => {
      cancelled = true;
    };
  }, [activeSection, isModalOpen, isRoleEditorPopupOpen, selectedRoleId, server?.id]);

  useEffect(() => {
    if (!isModalOpen || activeSection !== "roles" || !server?.id) {
      return;
    }

    let cancelled = false;

    const loadRoles = async () => {
      try {
        setIsLoadingRoles(true);
        setRolesError(null);

        const response = await axios.get<{
          roles?: ServerRoleItem[];
          totalMembers?: number;
          canManageRoles?: boolean;
        }>(`/api/servers/${server.id}/roles`);

        if (cancelled) {
          return;
        }

        const nextRoles = response.data.roles ?? [];
        setRoles(nextRoles);
        setServerMemberTotal(Number(response.data.totalMembers ?? 0));
        setCanManageRoles(Boolean(response.data.canManageRoles));

        const initialRole = nextRoles[0] ?? null;

        setSelectedRoleId(initialRole?.id ?? null);
        setEditRoleName(initialRole?.name ?? "");
        setEditRoleColor(initialRole?.color ?? "#99aab5");
        setEditRoleIconUrl(initialRole?.iconUrl ?? "");
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (axios.isAxiosError(error)) {
          const message =
            (error.response?.data as { error?: string })?.error ||
            (typeof error.response?.data === "string" ? error.response.data : "") ||
            error.message;
          setRolesError(message || "Failed to load roles.");
        } else {
          setRolesError("Failed to load roles.");
        }

        setRoles([]);
        setServerMemberTotal(0);
      } finally {
        if (!cancelled) {
          setIsLoadingRoles(false);
        }
      }
    };

    void loadRoles();

    return () => {
      cancelled = true;
    };
  }, [activeSection, isModalOpen, server?.id]);

  const isLoading = form.formState.isSubmitting;
  const imageUrl = form.watch("imageUrl") || "";
  const bannerUrl = form.watch("bannerUrl") || "";
  const bannerFit = form.watch("bannerFit") || "cover";
  const bannerScale = form.watch("bannerScale") || 1;

  const onPickImage = () => {
    if (isUploadingImage || isLoading) {
      return;
    }

    fileInputRef.current?.click();
  };

  const onImageChange = async (file?: File) => {
    if (!file) {
      return;
    }

    try {
      setSubmitError(null);
      setIsUploadingImage(true);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=serverImage",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      form.setValue("imageUrl", upload.data.url, {
        shouldDirty: true,
        shouldValidate: true,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Image upload failed.";
        setSubmitError(message);
      } else {
        setSubmitError("Image upload failed.");
      }
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const onPickBanner = () => {
    if (isUploadingBanner || isLoading) {
      return;
    }

    bannerInputRef.current?.click();
  };

  const onBannerChange = async (file?: File) => {
    if (!file) {
      return;
    }

    try {
      setSubmitError(null);
      setIsUploadingBanner(true);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=serverImage",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      form.setValue("bannerUrl", upload.data.url, {
        shouldDirty: true,
        shouldValidate: true,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Banner upload failed.";
        setSubmitError(message);
      } else {
        setSubmitError("Banner upload failed.");
      }
    } finally {
      setIsUploadingBanner(false);
      if (bannerInputRef.current) {
        bannerInputRef.current.value = "";
      }
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setSubmitError(null);
      await axios.patch(`/api/servers/${server?.id}`, values);

      form.reset();
      router.refresh();
      onClose();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          typeof error.response?.data === "string"
            ? error.response.data
            : error.response?.data?.message;
        setSubmitError(message || "Failed to update server.");
      } else {
        setSubmitError("Failed to update server.");
      }
      console.log(error);
    }
  }

  const handleClose = () => {
    form.reset();
    setSubmitError(null);
    setIsUploadingImage(false);
    setIsUploadingBanner(false);
    onClose();
  }

  const onSelectRole = (role: ServerRoleItem) => {
    setSelectedRoleId(role.id);
    setEditRoleName(role.name);
    setEditRoleColor(role.color);
    setEditRoleIconUrl(role.iconUrl ?? "");
    setIsRoleEditorPopupOpen(true);
  };

  const onPickNewRoleIcon = () => {
    if (!canManageRoles || isUploadingNewRoleIcon || isCreatingRole) {
      return;
    }

    newRoleIconInputRef.current?.click();
  };

  const onPickEditRoleIcon = () => {
    if (!canManageRoles || isUploadingEditRoleIcon || isSavingRole) {
      return;
    }

    editRoleIconInputRef.current?.click();
  };

  const onNewRoleIconChange = async (file?: File) => {
    if (!file || !canManageRoles) {
      return;
    }

    try {
      setIsUploadingNewRoleIcon(true);
      setRolesError(null);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=serverImage",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      setNewRoleIconUrl(upload.data.url);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Role icon upload failed.";
        setRolesError(message);
      } else {
        setRolesError("Role icon upload failed.");
      }
    } finally {
      setIsUploadingNewRoleIcon(false);
      if (newRoleIconInputRef.current) {
        newRoleIconInputRef.current.value = "";
      }
    }
  };

  const onEditRoleIconChange = async (file?: File) => {
    if (!file || !canManageRoles) {
      return;
    }

    try {
      setIsUploadingEditRoleIcon(true);
      setRolesError(null);

      const formData = new FormData();
      formData.append("file", file);

      const upload = await axios.post<{ url: string }>(
        "/api/r2/upload?type=serverImage",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      setEditRoleIconUrl(upload.data.url);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          error.message ||
          "Role icon upload failed.";
        setRolesError(message);
      } else {
        setRolesError("Role icon upload failed.");
      }
    } finally {
      setIsUploadingEditRoleIcon(false);
      if (editRoleIconInputRef.current) {
        editRoleIconInputRef.current.value = "";
      }
    }
  };

  const onCreateRole = async () => {
    if (!server?.id || !canManageRoles || isCreatingRole) {
      return;
    }

    const name = newRoleName.trim();
    if (!name) {
      setRolesError("Role name is required.");
      return;
    }

    try {
      setRolesError(null);
      setIsCreatingRole(true);

      const response = await axios.post<{ role?: ServerRoleItem }>(`/api/servers/${server.id}/roles`, {
        name,
        color: newRoleColor,
        iconUrl: newRoleIconUrl || null,
      });

      const role = response.data.role;
      if (!role) {
        setRolesError("Failed to create role.");
        return;
      }

      const next = [...roles, role].sort((a, b) => a.position - b.position);
      setRoles(next);
      setSelectedRoleId(role.id);
      setEditRoleName(role.name);
      setEditRoleColor(role.color);
      setEditRoleIconUrl(role.iconUrl ?? "");
      setNewRoleName("");
      setNewRoleColor("#99aab5");
      setNewRoleIconUrl("");
      setIsCreateRolePopupOpen(false);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          error.message;
        setRolesError(message || "Failed to create role.");
      } else {
        setRolesError("Failed to create role.");
      }
    } finally {
      setIsCreatingRole(false);
    }
  };

  const onSaveRole = async () => {
    if (!server?.id || !selectedRoleId || !canManageRoles || isSavingRole) {
      return;
    }

    const name = editRoleName.trim();
    if (!name) {
      setRolesError("Role name is required.");
      return;
    }

    try {
      setRolesError(null);
      setIsSavingRole(true);

      const response = await axios.patch<{ role?: ServerRoleItem }>(
        `/api/servers/${server.id}/roles/${selectedRoleId}`,
        {
          name,
          color: editRoleColor,
          iconUrl: editRoleIconUrl || null,
        }
      );

      const role = response.data.role;
      if (!role) {
        setRolesError("Failed to save role.");
        return;
      }

      setRoles((prev) => prev.map((item) => (item.id === role.id ? role : item)));
      setEditRoleName(role.name);
      setEditRoleColor(role.color);
      setEditRoleIconUrl(role.iconUrl ?? "");
      setIsRoleEditorPopupOpen(false);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          error.message;
        setRolesError(message || "Failed to save role.");
      } else {
        setRolesError("Failed to save role.");
      }
    } finally {
      setIsSavingRole(false);
    }
  };

  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null;
  const normalizedAddMemberSearch = addMemberSearch.trim().toLowerCase();
  const assignedRoleMembers = roleMembers.filter((memberItem) => memberItem.isAssigned);
  const addableRoleMembers = roleMembers.filter((memberItem) => {
    if (!normalizedAddMemberSearch) {
      return false;
    }

    if (memberItem.isAssigned) {
      return false;
    }

    const haystack = `${memberItem.displayName} ${memberItem.email ?? ""} ${memberItem.profileId}`.toLowerCase();
    return haystack.includes(normalizedAddMemberSearch);
  });

  const onToggleRoleMember = async (memberItem: RoleMemberItem) => {
    if (!server?.id || !selectedRoleId || !canManageRoleMembers || togglingMemberId) {
      return;
    }

    try {
      setRoleMembersError(null);
      setTogglingMemberId(memberItem.memberId);

      if (memberItem.isAssigned) {
        await axios.delete(`/api/servers/${server.id}/roles/${selectedRoleId}/members`, {
          data: { memberId: memberItem.memberId },
        });
      } else {
        await axios.post(`/api/servers/${server.id}/roles/${selectedRoleId}/members`, {
          memberId: memberItem.memberId,
        });
      }

      setRoleMembers((prev) =>
        prev.map((item) =>
          item.memberId === memberItem.memberId
            ? { ...item, isAssigned: !item.isAssigned }
            : item
        )
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          error.message;
        setRoleMembersError(message || "Failed to update role member.");
      } else {
        setRoleMembersError("Failed to update role member.");
      }
    } finally {
      setTogglingMemberId(null);
    }
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={handleClose}>
      <DialogContent className="overflow-hidden border-0 bg-[#313338] p-0 text-white shadow-2xl sm:max-w-[990px]">
        <DialogTitle className="sr-only">Server Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Edit server overview settings.
        </DialogDescription>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} suppressHydrationWarning>
            <div className="grid min-h-[560px] grid-cols-1 md:grid-cols-[240px_1fr]">
              <aside className="border-r border-black/20 bg-[#2B2D31] px-3 py-6">
                <p className="px-3 pb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">
                  Server settings
                </p>

                <div className="space-y-4">
                  {SETTINGS_SECTIONS.map((section) => (
                    <div key={section.heading ?? "base"} className="space-y-1">
                      {section.heading ? (
                        <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-500">
                          {section.heading}
                        </p>
                      ) : null}
                      {section.items.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setActiveSection(item.key)}
                          className={cn(
                            "w-full rounded-md px-3 py-2 text-left text-sm transition",
                            activeSection === item.key
                              ? "bg-[#404249] font-semibold text-white"
                              : item.key === "deleteServer"
                                ? "text-rose-300 hover:bg-rose-500/10"
                                : "text-zinc-300 hover:bg-[#36393f]"
                          )}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </aside>

              <section className="flex h-full flex-col bg-[#313338]">
                <DialogHeader className="border-b border-black/20 px-8 pb-4 pt-6 text-left">
                  <DialogTitle className="text-xl font-semibold text-white">
                    {SECTION_TITLES[activeSection]}
                  </DialogTitle>
                  <DialogDescription className="pt-1 text-sm text-zinc-300">
                    {activeSection === "overview"
                      ? "Customize your server's appearance and identity."
                      : "Menu section scaffolded. Hook up server-side behavior as needed."}
                  </DialogDescription>
                </DialogHeader>

                {activeSection !== "overview" ? (
                  <div className="flex-1 space-y-4 px-8 py-6">
                    {activeSection === "roles" ? (
                      <div className="rounded-xl border border-zinc-700 bg-[#2B2D31] p-3">
                          <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-zinc-200">
                              Server Roles
                            </p>
                            <span className="rounded bg-[#1e1f22] px-2.5 py-1 text-xs text-zinc-300">
                              {roles.length}
                            </span>
                          </div>

                          <div className="mb-3">
                            <Button
                              type="button"
                              onClick={() => setIsCreateRolePopupOpen(true)}
                              disabled={!canManageRoles}
                              className="w-full bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Create Role
                            </Button>
                          </div>

                          <div className="mb-2 grid grid-cols-[1fr_96px_80px] items-center px-2 text-xs font-semibold text-zinc-300">
                            <span className="text-left">Roles - {roles.length}</span>
                            <span className="text-center">Members: {serverMemberTotal}</span>
                            <span className="text-right">Edit</span>
                          </div>

                          <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1">
                            {isLoadingRoles ? (
                              <div className="flex items-center gap-2 rounded-md bg-[#1e1f22] px-3 py-2 text-sm text-zinc-300">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading roles...
                              </div>
                            ) : roles.length === 0 ? (
                              <p className="rounded-md bg-[#1e1f22] px-3 py-2 text-xs text-zinc-400">No roles found.</p>
                            ) : (
                              roles.map((role) => (
                                <button
                                  key={role.id}
                                  type="button"
                                  onClick={() => onSelectRole(role)}
                                  className={cn(
                                    "grid w-full grid-cols-[1fr_96px_80px] items-center gap-2 rounded-md px-2 py-2.5 text-left text-base transition",
                                    selectedRoleId === role.id
                                      ? "bg-[#404249] text-white"
                                      : "text-zinc-300 hover:bg-[#36393f]"
                                  )}
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    {role.iconUrl ? (
                                      <span className="relative inline-flex h-6 w-6 overflow-hidden rounded-sm border border-zinc-600">
                                        <Image src={role.iconUrl} alt={`${role.name} icon`} fill className="object-cover" unoptimized />
                                      </span>
                                    ) : (
                                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-sm border border-zinc-600 bg-[#1e1f22] text-xs font-semibold uppercase text-zinc-200">
                                        {role.name.slice(0, 1)}
                                      </span>
                                    )}
                                    <span className="truncate">{role.name}</span>
                                    {role.isManaged ? (
                                      <span className="rounded bg-black/25 px-1.5 py-0.5 text-[11px] text-zinc-300">
                                        System
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className="text-center">
                                    <span className="inline-flex w-12 items-center justify-center rounded bg-black/25 px-1.5 py-0.5 text-xs text-zinc-200">
                                      {role.memberCount ?? 0}
                                    </span>
                                  </span>
                                  <span className="inline-flex items-center justify-end">
                                    <Pencil className="h-4.5 w-4.5 shrink-0 text-zinc-300" aria-label="Edit role" />
                                  </span>
                                </button>
                              ))
                            )}
                          </div>


                        {!canManageRoles ? (
                          <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                            Only the server owner can add or edit roles.
                          </p>
                        ) : null}

                        {rolesError ? (
                          <p className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                            {rolesError}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {activeSection === "roles" && isCreateRolePopupOpen ? (
                      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
                        <div className="w-full max-w-[520px] rounded-xl border border-zinc-700 bg-[#2B2D31] p-4 shadow-2xl shadow-black/60">
                          <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-semibold text-white">Create Role</p>
                            <button
                              type="button"
                              onClick={() => setIsCreateRolePopupOpen(false)}
                              className="rounded p-1 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                              aria-label="Close create role popup"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Role Name</p>
                              <input
                                value={newRoleName}
                                onChange={(event) => setNewRoleName(event.target.value)}
                                placeholder="Role name"
                                className="h-10 w-full rounded-md border border-zinc-700 bg-[#15161a] px-3 text-sm text-white outline-none focus:border-indigo-500"
                                disabled={!canManageRoles || isCreatingRole}
                              />
                            </div>

                            <div>
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Role Color</p>
                              <input
                                value={newRoleColor}
                                onChange={(event) => setNewRoleColor(event.target.value)}
                                placeholder="#99aab5"
                                className="h-10 w-full rounded-md border border-zinc-700 bg-[#15161a] px-3 text-sm text-white outline-none focus:border-indigo-500"
                                disabled={!canManageRoles || isCreatingRole}
                              />
                            </div>

                            <div>
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Role Icon</p>
                              <p className="mb-2 text-[11px] text-zinc-500">Pick an icon file or paste an icon URL.</p>
                              <div className="flex items-center gap-2">
                                <input
                                  value={newRoleIconUrl}
                                  onChange={(event) => setNewRoleIconUrl(event.target.value)}
                                  placeholder="https://..."
                                  className="h-10 flex-1 rounded-md border border-zinc-700 bg-[#15161a] px-3 text-sm text-white outline-none focus:border-indigo-500"
                                  disabled={!canManageRoles || isCreatingRole || isUploadingNewRoleIcon}
                                />
                                <Button
                                  type="button"
                                  onClick={onPickNewRoleIcon}
                                  disabled={!canManageRoles || isCreatingRole || isUploadingNewRoleIcon}
                                  className="h-10 bg-[#4e5058] px-3 text-xs text-white hover:bg-[#5d6069]"
                                >
                                  {isUploadingNewRoleIcon ? "Uploading..." : "Pick Icon"}
                                </Button>
                              </div>
                              <input
                                ref={newRoleIconInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(event) => void onNewRoleIconChange(event.target.files?.[0])}
                              />

                              <div className="mt-2">
                                {newRoleIconUrl ? (
                                  <span className="relative inline-flex h-10 w-10 overflow-hidden rounded-md border border-zinc-700">
                                    <Image src={newRoleIconUrl} alt="New role icon preview" fill className="object-cover" unoptimized />
                                  </span>
                                ) : (
                                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-700 bg-[#1e1f22] text-lg font-semibold uppercase text-zinc-300">
                                    {newRoleName.slice(0, 1) || "R"}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              onClick={() => setIsCreateRolePopupOpen(false)}
                              className="bg-transparent text-zinc-300 hover:bg-white/10"
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              onClick={onCreateRole}
                              disabled={!canManageRoles || isCreatingRole}
                              className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
                            >
                              {isCreatingRole ? "Creating..." : "Create Role"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {activeSection === "roles" && isRoleEditorPopupOpen && selectedRole ? (
                      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
                        <div className="w-full max-w-[560px] rounded-xl border border-zinc-700 bg-[#2B2D31] p-4 shadow-2xl shadow-black/60">
                          <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-semibold text-white">Role Editor</p>
                            <button
                              type="button"
                              onClick={() => setIsRoleEditorPopupOpen(false)}
                              className="rounded p-1 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                              aria-label="Close role editor popup"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Role Name</p>
                              <input
                                value={editRoleName}
                                onChange={(event) => setEditRoleName(event.target.value)}
                                className="h-10 w-full rounded-md border border-zinc-700 bg-[#1e1f22] px-3 text-sm text-white outline-none focus:border-indigo-500"
                                disabled={!canManageRoles || isSavingRole}
                              />
                            </div>

                            <div>
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Role Color</p>
                              <div className="flex items-center gap-2">
                                <input
                                  value={editRoleColor}
                                  onChange={(event) => setEditRoleColor(event.target.value)}
                                  className="h-10 flex-1 rounded-md border border-zinc-700 bg-[#1e1f22] px-3 text-sm text-white outline-none focus:border-indigo-500"
                                  disabled={!canManageRoles || isSavingRole || isUploadingEditRoleIcon}
                                />
                                <span
                                  className="inline-flex h-8 w-8 rounded-full border border-zinc-700"
                                  style={{ backgroundColor: editRoleColor || "#99aab5" }}
                                />
                              </div>
                            </div>

                            <div>
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Role Icon</p>
                              <p className="mb-2 text-[11px] text-zinc-500">Pick an icon file or paste an icon URL.</p>
                              <div className="flex items-center gap-2">
                                <input
                                  value={editRoleIconUrl}
                                  onChange={(event) => setEditRoleIconUrl(event.target.value)}
                                  placeholder="https://..."
                                  className="h-10 flex-1 rounded-md border border-zinc-700 bg-[#1e1f22] px-3 text-sm text-white outline-none focus:border-indigo-500"
                                  disabled={!canManageRoles || isSavingRole || isUploadingEditRoleIcon}
                                />
                                <Button
                                  type="button"
                                  onClick={onPickEditRoleIcon}
                                  disabled={!canManageRoles || isSavingRole || isUploadingEditRoleIcon}
                                  className="h-10 bg-[#4e5058] px-3 text-xs text-white hover:bg-[#5d6069]"
                                >
                                  {isUploadingEditRoleIcon ? "Uploading..." : "Pick Icon"}
                                </Button>
                                <Button
                                  type="button"
                                  onClick={() => setEditRoleIconUrl("")}
                                  disabled={!canManageRoles || isSavingRole || isUploadingEditRoleIcon}
                                  className="h-10 bg-transparent px-3 text-xs text-zinc-300 hover:bg-white/10"
                                >
                                  Remove
                                </Button>
                              </div>

                              <input
                                ref={editRoleIconInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(event) => void onEditRoleIconChange(event.target.files?.[0])}
                              />

                              <div className="mt-2">
                                {editRoleIconUrl ? (
                                  <span className="relative inline-flex h-10 w-10 overflow-hidden rounded-md border border-zinc-700">
                                    <Image src={editRoleIconUrl} alt="Role icon preview" fill className="object-cover" unoptimized />
                                  </span>
                                ) : (
                                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-700 bg-[#1e1f22] text-lg font-semibold uppercase text-zinc-300">
                                    {editRoleName.slice(0, 1) || "R"}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div>
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Members with this role</p>
                              <div className="max-h-[220px] space-y-1 overflow-y-auto rounded-md border border-zinc-700 bg-[#1e1f22] p-2">
                                {isLoadingRoleMembers ? (
                                  <div className="flex items-center gap-2 px-2 py-2 text-xs text-zinc-300">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Loading members...
                                  </div>
                                ) : assignedRoleMembers.length === 0 ? (
                                  <p className="px-2 py-2 text-xs text-zinc-400">No users currently have this role.</p>
                                ) : (
                                  assignedRoleMembers.map((memberItem) => (
                                    <div key={memberItem.memberId} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-black/20">
                                      <UserAvatar src={memberItem.imageUrl ?? undefined} className="h-7 w-7" />
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-medium text-white">{memberItem.displayName}</p>
                                        <p className="truncate text-[11px] text-zinc-400">{memberItem.email || memberItem.profileId}</p>
                                      </div>
                                      <Button
                                        type="button"
                                        onClick={() => void onToggleRoleMember(memberItem)}
                                        disabled={!canManageRoleMembers || togglingMemberId === memberItem.memberId}
                                        className="h-7 bg-rose-600/80 px-2 text-[11px] text-white hover:bg-rose-600"
                                      >
                                        {togglingMemberId === memberItem.memberId ? "..." : "Remove"}
                                      </Button>
                                    </div>
                                  ))
                                )}
                              </div>

                              {!canManageRoleMembers ? (
                                <p className="mt-2 text-[11px] text-amber-300">Only the server owner can change role members.</p>
                              ) : null}

                              {roleMembersError ? (
                                <p className="mt-2 text-[11px] text-rose-300">{roleMembersError}</p>
                              ) : null}
                            </div>

                            <div>
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Add members to this role</p>
                              <input
                                value={addMemberSearch}
                                onChange={(event) => setAddMemberSearch(event.target.value)}
                                placeholder="Search users by name, email, or ID"
                                className="h-9 w-full rounded-md border border-zinc-700 bg-[#1e1f22] px-3 text-xs text-white outline-none focus:border-indigo-500"
                                disabled={!canManageRoleMembers || isLoadingRoleMembers}
                              />

                              <div className="mt-2 max-h-[180px] space-y-1 overflow-y-auto rounded-md border border-zinc-700 bg-[#1e1f22] p-2">
                                {isLoadingRoleMembers ? (
                                  <div className="flex items-center gap-2 px-2 py-2 text-xs text-zinc-300">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Loading users...
                                  </div>
                                ) : addableRoleMembers.length === 0 ? (
                                  <p className="px-2 py-2 text-xs text-zinc-400">
                                    {normalizedAddMemberSearch
                                      ? "No users match your search."
                                      : "Type in search to find users."}
                                  </p>
                                ) : (
                                  addableRoleMembers.map((memberItem) => (
                                    <div key={`add-${memberItem.memberId}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-black/20">
                                      <UserAvatar src={memberItem.imageUrl ?? undefined} className="h-7 w-7" />
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-medium text-white">{memberItem.displayName}</p>
                                        <p className="truncate text-[11px] text-zinc-400">{memberItem.email || memberItem.profileId}</p>
                                      </div>
                                      <Button
                                        type="button"
                                        onClick={() => void onToggleRoleMember(memberItem)}
                                        disabled={!canManageRoleMembers || togglingMemberId === memberItem.memberId}
                                        className="h-7 bg-emerald-600/80 px-2 text-[11px] text-white hover:bg-emerald-600"
                                      >
                                        {togglingMemberId === memberItem.memberId ? "..." : "Add"}
                                      </Button>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              onClick={() => setIsRoleEditorPopupOpen(false)}
                              className="bg-transparent text-zinc-300 hover:bg-white/10"
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              onClick={onSaveRole}
                              disabled={!canManageRoles || isSavingRole}
                              className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
                            >
                              {isSavingRole ? "Saving..." : "Save Role"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {activeSection === "deleteServer" ? (
                      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
                        <p className="text-sm text-zinc-200">
                          Deleting this server removes channels, groups, and messages associated with it.
                        </p>
                        <Button
                          type="button"
                          variant="destructive"
                          className="mt-4"
                          onClick={() => {
                            if (server) {
                              onOpen("deleteServer", { server });
                            }
                          }}
                        >
                          Continue to Delete Server
                        </Button>
                      </div>
                    ) : activeSection !== "roles" ? (
                      <div className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-4">
                        <p className="text-sm text-zinc-200">
                          {SECTION_TITLES[activeSection]} menu is now available in the settings rail.
                        </p>
                        <p className="mt-2 text-xs text-zinc-400">
                          This section currently uses a placeholder panel and is ready for feature-specific controls.
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                <>
                <div className="flex-1 space-y-7 px-8 py-6">
                  <div className="grid gap-6 md:grid-cols-[120px_1fr] md:items-start">
                    <FormField
                      control={form.control}
                      name="imageUrl"
                      render={() => (
                        <FormItem>
                          <FormControl>
                            <div className="flex flex-col items-start gap-3">
                              {imageUrl ? (
                                <div className="group relative h-[96px] w-[96px]">
                                  <Image
                                    fill
                                    src={imageUrl}
                                    alt="Server icon"
                                    className="rounded-full object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={onPickImage}
                                    disabled={isUploadingImage || isLoading}
                                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100 disabled:cursor-not-allowed"
                                    aria-label="Change server icon"
                                  >
                                    <Camera className="h-5 w-5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => form.setValue("imageUrl", "", { shouldValidate: true, shouldDirty: true })}
                                    className="absolute right-0 top-0 rounded-full bg-rose-500 p-1 text-white shadow-sm"
                                    aria-label="Remove server icon"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={onPickImage}
                                  disabled={isUploadingImage || isLoading}
                                  className="group relative flex h-[96px] w-[96px] items-center justify-center rounded-full border-2 border-dashed border-zinc-500 bg-[#232428] transition hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-60"
                                  aria-label="Upload server icon"
                                >
                                  <Camera className="h-9 w-9 text-zinc-300" />
                                  <span className="absolute -bottom-1 -right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-white shadow-sm">
                                    <Plus className="h-4 w-4" />
                                  </span>
                                </button>
                              )}

                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(event) => onImageChange(event.target.files?.[0])}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-3">
                      <p className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-300">
                        Server icon
                      </p>
                      <p className="text-sm text-zinc-300">
                        Upload a square image for best results.
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={isUploadingImage || isLoading}
                        onClick={onPickImage}
                        className="bg-[#4E5058] text-white hover:bg-[#5D6069]"
                      >
                        {isUploadingImage ? "Uploading..." : imageUrl ? "Change icon" : "Upload icon"}
                      </Button>
                    </div>
                  </div>

                  {submitError ? (
                    <p className="text-sm font-medium text-rose-400">Save error: {submitError}</p>
                  ) : null}

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-300">
                          Server name
                        </FormLabel>
                        <FormControl>
                          <Input
                            disabled={isLoading}
                            className="h-11 border border-zinc-700 bg-[#1E1F22] text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:ring-offset-0"
                            placeholder="Enter server name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="bannerUrl"
                    render={() => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-300">
                          Server banner
                        </FormLabel>
                        <FormControl>
                          <div className="space-y-3">
                            <div className="relative h-24 w-full overflow-hidden rounded-md border border-zinc-700 bg-[#1E1F22]">
                              {bannerUrl ? (
                                <Image
                                  fill
                                  src={bannerUrl}
                                  alt="Server banner preview"
                                  className={bannerFit === "contain" ? "object-contain" : "object-cover"}
                                  style={
                                    bannerFit === "scale"
                                      ? { transform: `scale(${bannerScale})`, transformOrigin: "center" }
                                      : undefined
                                  }
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                                  No banner selected
                                </div>
                              )}
                            </div>

                            <div className="grid gap-2 md:grid-cols-2">
                              <div>
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                                  Fit mode
                                </p>
                                <select
                                  value={bannerFit}
                                  onChange={(event) =>
                                    form.setValue(
                                      "bannerFit",
                                      event.target.value as "cover" | "contain" | "scale",
                                      { shouldDirty: true }
                                    )
                                  }
                                  className="h-9 w-full rounded-md border border-zinc-700 bg-[#1E1F22] px-2 text-sm text-zinc-100"
                                  disabled={isLoading || isUploadingBanner}
                                >
                                  <option value="cover">Auto Fill</option>
                                  <option value="contain">Auto Fit</option>
                                  <option value="scale">Manual Scale</option>
                                </select>
                              </div>

                              <div>
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                                  Scale ({bannerScale.toFixed(2)}x)
                                </p>
                                <input
                                  type="range"
                                  min={1}
                                  max={2}
                                  step={0.05}
                                  value={bannerScale}
                                  onChange={(event) =>
                                    form.setValue("bannerScale", Number(event.target.value), {
                                      shouldDirty: true,
                                    })
                                  }
                                  className="w-full"
                                  disabled={bannerFit !== "scale" || isLoading || isUploadingBanner}
                                />
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={isUploadingBanner || isLoading}
                                onClick={onPickBanner}
                                className="bg-[#4E5058] text-white hover:bg-[#5D6069]"
                              >
                                {isUploadingBanner ? "Uploading..." : bannerUrl ? "Change banner" : "Upload banner"}
                              </Button>

                              {bannerUrl ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-zinc-300 hover:bg-white/10 hover:text-white"
                                  onClick={() => form.setValue("bannerUrl", "", { shouldDirty: true, shouldValidate: true })}
                                  disabled={isUploadingBanner || isLoading}
                                >
                                  Remove banner
                                </Button>
                              ) : null}
                            </div>

                            <input
                              ref={bannerInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(event) => onBannerChange(event.target.files?.[0])}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex items-center justify-between border-t border-black/20 bg-[#2B2D31] px-8 py-4">
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-zinc-300 hover:bg-white/10 hover:text-white"
                    onClick={handleClose}
                    disabled={isLoading || isUploadingImage || isUploadingBanner}
                  >
                    Cancel
                  </Button>
                  <Button variant="primary" disabled={isLoading || isUploadingImage || isUploadingBanner}>
                    {isLoading ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
                </>
                )}
              </section>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
