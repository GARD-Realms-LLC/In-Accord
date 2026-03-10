"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { useModal } from "@/hooks/use-modal-store";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildChannelPath } from "@/lib/route-slugs";

type ChannelGroupItem = {
  id: string;
  name: string;
};

const formSchema = z.object({
  name: z
    .string()
    .min(1, { message: "Forum name is required." })
    .max(80, { message: "Forum name must be 80 characters or less." })
    .refine((value) => value.trim().toLowerCase() !== "general", {
      message: "Forum name cannot be 'general'.",
    }),
  channelGroupId: z.string().nullable().optional(),
});

export const CreateFormModal = () => {
  const { isOpen, onClose, type, data } = useModal();
  const router = useRouter();
  const params = useParams();

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [channelGroups, setChannelGroups] = useState<ChannelGroupItem[]>([]);

  const isModalOpen = isOpen && type === "createForm";

  const routeServerId = useMemo(() => {
    const raw = params?.serverId;
    if (typeof raw === "string") {
      return raw;
    }
    if (Array.isArray(raw)) {
      return raw[0] ?? "";
    }
    return "";
  }, [params?.serverId]);

  const targetServerId = data.server?.id || routeServerId;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      channelGroupId: null,
    },
  });

  const isLoading = form.formState.isSubmitting;

  useEffect(() => {
    if (!isModalOpen || !targetServerId) {
      return;
    }

    let cancelled = false;

    const loadGroups = async () => {
      try {
        const response = await axios.get<{ groups?: ChannelGroupItem[] }>("/api/channel-groups", {
          params: { serverId: targetServerId },
        });

        if (!cancelled) {
          setChannelGroups(response.data.groups ?? []);
        }
      } catch {
        if (!cancelled) {
          setChannelGroups([]);
        }
      }
    };

    void loadGroups();

    return () => {
      cancelled = true;
    };
  }, [isModalOpen, targetServerId]);

  const handleClose = () => {
    form.reset({
      name: "",
      channelGroupId: null,
    });
    setSubmitError(null);
    onClose();
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!targetServerId) {
      setSubmitError("Unable to determine server context.");
      return;
    }

    try {
      setSubmitError(null);

      const response = await axios.post<{
        channel?: { id?: string };
      }>(`/api/channels?serverId=${encodeURIComponent(targetServerId)}`, {
        name: values.name.trim(),
        type: ChannelType.TEXT,
        channelGroupId:
          typeof values.channelGroupId === "string" && values.channelGroupId.length > 0
            ? values.channelGroupId
            : null,
      });

      const createdChannelId = response.data?.channel?.id;

      form.reset();
      onClose();

      if (createdChannelId) {
        router.push(
          buildChannelPath({
            server: { id: targetServerId, name: data.server?.name ?? "server" },
            channel: { id: createdChannelId, name: values.name.trim() || "channel" },
          })
        );
      } else {
        router.refresh();
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          (error.response?.data as { error?: string } | undefined)?.error ||
          error.message ||
          "Failed to create forum.";
        setSubmitError(message);
      } else {
        setSubmitError("Failed to create forum.");
      }
    }
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={handleClose}>
      <DialogContent className="overflow-hidden bg-white p-0 text-black dark:bg-[#313338] dark:text-white">
        <DialogHeader className="px-6 pt-8">
          <DialogTitle className="text-center text-2xl font-bold">Create Forum</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 px-6 pb-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-300">
                    Forum Name
                  </FormLabel>
                  <FormControl>
                    <Input
                      disabled={isLoading}
                      className="border-0 bg-zinc-200/70 text-black focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-zinc-700/50 dark:text-zinc-100"
                      placeholder="community-chat"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="channelGroupId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-300">
                    Channel Group
                  </FormLabel>
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

            <p className="rounded-md border border-zinc-700/40 bg-zinc-100/60 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-300">
              This creates a forum-style chat space and opens the new channel directly.
            </p>

            {submitError ? <p className="text-sm text-rose-500 dark:text-rose-400">{submitError}</p> : null}

            <DialogFooter className="bg-gray-100 px-2 py-4 dark:bg-zinc-800/60">
              <Button type="button" variant="ghost" onClick={handleClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button variant="primary" disabled={isLoading}>
                {isLoading ? "Creating..." : "Create Forum"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
