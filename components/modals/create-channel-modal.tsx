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
import { useEffect, useState } from "react";

const formSchema = z.object({
  name: z
    .string()
    .min(1, {
      message: "Channel name is required.",
    })
    .refine((name) => name !== "general", {
      message: "Channel name cannot be 'general'",
    }),
  type: z.nativeEnum(ChannelType),
  channelGroupId: z.string().nullable().optional(),
});

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

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
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
    if (!isModalOpen || !params?.serverId) {
      return;
    }

    let cancelled = false;

    const loadGroups = async () => {
      try {
        const response = await axios.get<{ groups?: ChannelGroupItem[] }>("/api/channel-groups", {
          params: { serverId: params.serverId },
        });

        if (!cancelled) {
          setChannelGroups(response.data.groups ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          setChannelGroups([]);
        }
        console.error("[CREATE_CHANNEL_MODAL_GROUPS]", error);
      }
    };

    void loadGroups();

    return () => {
      cancelled = true;
    };
  }, [isModalOpen, params?.serverId]);

  const isLoading = form.formState.isSubmitting;

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setSubmitError(null);

      const routeServerId =
        typeof params?.serverId === "string"
          ? params.serverId
          : Array.isArray(params?.serverId)
            ? params.serverId[0]
            : "";

      if (!routeServerId) {
        setSubmitError("Unable to determine server context.");
        return;
      }

      const url = qs.stringifyUrl({
        url: "/api/channels",
        query: {
          serverId: routeServerId,
        },
      });
      await axios.post(url, {
        ...values,
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
      <DialogContent className="overflow-hidden bg-white p-0 text-black dark:bg-[#313338] dark:text-white">
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
