"use client";

import axios from "axios";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

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
import { useModal } from "@/hooks/use-modal-store";

const formSchema = z.object({
  name: z.string().min(1, { message: "Group name is required." }),
});

export const CreateChannelGroupModal = () => {
  const { isOpen, onClose, type, data } = useModal();
  const router = useRouter();
  const params = useParams();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isModalOpen = isOpen && type === "createChannelGroup";

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  const isLoading = form.formState.isSubmitting;

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setSubmitError(null);

      const routeServerId =
        typeof params?.serverId === "string"
          ? params.serverId
          : Array.isArray(params?.serverId)
            ? (params?.serverId[0] ?? "")
            : "";
      const fallbackServerId = typeof data.server?.id === "string" ? data.server.id : "";
      const serverId = (routeServerId || fallbackServerId).trim();

      if (!serverId) {
        setSubmitError("Unable to determine server context for this channel group.");
        return;
      }

      await axios.post("/api/channel-groups", {
        name: values.name,
        serverId,
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
          "Failed to create channel group.";
        setSubmitError(message);
      } else {
        setSubmitError("Failed to create channel group.");
      }
      console.error("[CREATE_CHANNEL_GROUP_MODAL]", error);
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
        <DialogHeader className="px-6 pt-8">
          <DialogTitle className="text-center text-2xl font-bold">Create Channel Group</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="space-y-8 px-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-300">
                      Group name
                    </FormLabel>
                    <FormControl>
                      <Input
                        disabled={isLoading}
                        className="border-0 bg-zinc-200/70 text-black focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-zinc-700/50 dark:text-zinc-100"
                        placeholder="Enter channel group name"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {submitError ? (
                <p className="text-sm text-rose-500 dark:text-rose-400">{submitError}</p>
              ) : null}
            </div>
            <DialogFooter className="bg-gray-100 px-6 py-4 dark:bg-zinc-800/60">
              <Button variant="primary" disabled={isLoading}>Create Group</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
