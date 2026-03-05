"use client";

import axios from "axios";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

export const EditChannelGroupModal = () => {
  const { isOpen, onClose, type, data } = useModal();
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isModalOpen = isOpen && type === "editChannelGroup";
  const group = data.channelGroup;

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  useEffect(() => {
    form.setValue("name", group?.name ?? "");
  }, [form, group?.name]);

  const isLoading = form.formState.isSubmitting;

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!group?.id) {
      setSubmitError("Group context missing.");
      return;
    }

    try {
      setSubmitError(null);
      await axios.patch(`/api/channel-groups/${group.id}`, {
        name: values.name,
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
          "Failed to update group.";
        setSubmitError(message);
      } else {
        setSubmitError("Failed to update group.");
      }
      console.error("[EDIT_CHANNEL_GROUP_MODAL]", error);
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
          <DialogTitle className="text-center text-2xl font-bold">Edit Channel Group</DialogTitle>
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
              <Button type="button" variant="ghost" onClick={handleClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button variant="primary" disabled={isLoading}>Save Group</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
