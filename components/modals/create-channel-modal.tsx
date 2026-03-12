"use client";

import qs from "query-string";
import axios from "axios";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ChannelType } from "@/lib/db/types";

import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { useParams, useRouter } from "next/navigation";
import { useModal } from "@/hooks/use-modal-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useMemo, useState } from "react";

const formSchema = z.object({
  name: z
    .string()
    .min(1, {
      message: "Channel name is required.",
    })
    .refine((name) => name !== "general", {
      message: "Channel name cannot be 'general'",
    }),
  icon: z.string().max(16, { message: "Icon must be 16 characters or fewer." }).optional(),
  type: z.nativeEnum(ChannelType),
  channelGroupId: z.string().nullable().optional(),
});

const FREE_CHANNEL_ICONS = [
  "💬",
  "📢",
  "✅",
  "📌",
  "⭐",
  "🔥",
  "🎮",
  "🎵",
  "🎬",
  "📚",
  "🧠",
  "🛠️",
  "🤖",
  "🧪",
  "🎨",
  "📷",
  "📰",
  "🧩",
];

type ChannelGroupItem = {
  id: string;
  name: string;
};

export const CreateChannelModal = () => {
  const { isOpen, onClose, type, data } = useModal();
  const router = useRouter();
  const params = useParams();

  const isModalOpen = isOpen && type === "createChannel";
  const { channelType } = data;
  const [channelGroups, setChannelGroups] = useState<ChannelGroupItem[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const resolvedServerId = useMemo(() => {
    const modalServerId = String(data.server?.id ?? "").trim();
    if (modalServerId) {
      return modalServerId;
    }

    const routeServerParam = params?.serverId;

    const routeServerId =
      typeof routeServerParam === "string"
        ? routeServerParam
        : Array.isArray(routeServerParam)
          ? (routeServerParam[0] ?? "")
          : "";

    const normalizedRouteServerId = String(routeServerId ?? "").trim();
    if (normalizedRouteServerId) {
      return normalizedRouteServerId;
    }

    return "";
  }, [data.server?.id, params?.serverId]);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      icon: "",
      type: channelType || ChannelType.TEXT,
      channelGroupId: null,
    },
  });

  useEffect(() => {
    if (channelType) {
      form.setValue("type", channelType);
    } else {
      form.setValue("type", ChannelType.TEXT);
    }
    form.setValue("channelGroupId", null);
  }, [channelType, form]);

  useEffect(() => {
    if (!isModalOpen || !resolvedServerId) {
      if (isModalOpen) {
        setChannelGroups([]);
      }
      return;
    }

    let cancelled = false;

    const loadGroups = async () => {
      try {
        const response = await axios.get<{ groups?: ChannelGroupItem[] }>("/api/channel-groups", {
          params: { serverId: resolvedServerId },
        });

        if (!cancelled) {
          setChannelGroups(response.data.groups ?? []);
          setSubmitError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setChannelGroups([]);
        }

        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        if (status === 401 || status === 403) {
          if (!cancelled) {
            setSubmitError("You are not authorized to load channel groups for this server.");
          }
          return;
        }

        console.error("[CREATE_CHANNEL_MODAL_GROUPS]", error);
      }
    };

    void loadGroups();

    return () => {
      cancelled = true;
    };
  }, [isModalOpen, resolvedServerId]);

  const isLoading = form.formState.isSubmitting;

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    setSubmitError(null);
  }, [isModalOpen]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setSubmitError(null);

      if (!resolvedServerId) {
        setSubmitError("Unable to determine server context.");
        return;
      }

      const url = qs.stringifyUrl({
        url: "/api/channels",
        query: {
          serverId: resolvedServerId,
        },
      });
      await axios.post(url, {
        ...values,
        icon: (values.icon ?? "").trim() || null,
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
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          (error.response?.data as { error?: string } | undefined)?.error ||
          error.message ||
          "Failed to create channel.";
        setSubmitError(message);
      } else {
        setSubmitError("Failed to create channel.");
      }
      console.log(error);
    }
  };

  const handleClose = () => {
    form.reset();
    setSubmitError(null);
    onClose();
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white p-0 text-black dark:bg-[#313338] dark:text-white">
        <DialogHeader className="pt-8 px-6">
          <DialogTitle className="text-2xl text-center font-bold">
            Create Channel
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="space-y-8 px-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase text-xs font-bold text-zinc-500 dark:text-zinc-300">
                      Channel name
                    </FormLabel>
                    <FormControl>
                      <Input
                        disabled={isLoading}
                        className="border-0 bg-zinc-200/70 text-black focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-zinc-700/50 dark:text-zinc-100"
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
                    <FormLabel>Channel Type</FormLabel>
                    <Select
                      disabled={isLoading}
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="capitalize border-0 bg-zinc-200/70 text-black outline-none ring-offset-0 focus:ring-0 focus:ring-offset-0 dark:bg-zinc-700/50 dark:text-zinc-100">
                          <SelectValue placeholder="Select a channel type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(ChannelType).map((type) => (
                          <SelectItem
                            key={type}
                            value={type}
                            className="capitalize"
                          >
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
                name="icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Channel Icon (emoji or short text)</FormLabel>
                    <FormControl>
                      <Input
                        disabled={isLoading}
                        maxLength={16}
                        className="border-0 bg-zinc-200/70 text-black focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-zinc-700/50 dark:text-zinc-100"
                        placeholder="e.g. 🔥"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-300">
                        Free icon picks
                      </p>
                      <div className="grid grid-cols-6 gap-1 rounded-md border border-black/10 bg-black/5 p-2 sm:grid-cols-9 dark:border-black/20 dark:bg-black/10">
                        {FREE_CHANNEL_ICONS.map((icon) => (
                          <button
                            key={icon}
                            type="button"
                            onClick={() => form.setValue("icon", icon, { shouldDirty: true, shouldValidate: true })}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded text-base transition hover:bg-zinc-700/20 dark:hover:bg-zinc-700/50 ${
                              (field.value ?? "") === icon ? "bg-zinc-700/30 ring-1 ring-indigo-400/80 dark:bg-zinc-700/70" : ""
                            }`}
                            aria-label={`Use ${icon} as channel icon`}
                            title={`Use ${icon}`}
                          >
                            {icon}
                          </button>
                        ))}
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="channelGroupId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Channel Group</FormLabel>
                    <Select
                      disabled={isLoading}
                      onValueChange={(value) => field.onChange(value === "__none__" ? null : value)}
                      value={field.value ?? "__none__"}
                    >
                      <FormControl>
                        <SelectTrigger className="border-0 bg-zinc-200/70 text-black outline-none ring-offset-0 focus:ring-0 focus:ring-offset-0 dark:bg-zinc-700/50 dark:text-zinc-100">
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
              {submitError ? (
                <p className="text-sm text-rose-500 dark:text-rose-400">{submitError}</p>
              ) : null}
            </div>
            <DialogFooter className="bg-gray-100 px-6 py-4 dark:bg-zinc-800/60">
              <Button variant="primary" disabled={isLoading}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
