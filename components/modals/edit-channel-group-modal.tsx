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
  icon: z.string().max(16, { message: "Icon must be 16 characters or fewer." }).optional(),
});

const FREE_GROUP_ICONS = [
  "📁",
  "📂",
  "🗂️",
  "⭐",
  "🎮",
  "🎵",
  "🎨",
  "🧪",
  "🤖",
  "📚",
  "💼",
  "🛠️",
  "🌟",
  "📝",
  "📌",
  "🚀",
  "🎬",
  "🧩",
];

export const EditChannelGroupModal = () => {
  const { isOpen, onClose, type, data } = useModal();
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isModalOpen = isOpen && type === "editChannelGroup";
  const group = data.channelGroup;

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      icon: "",
    },
  });

  useEffect(() => {
    form.setValue("name", group?.name ?? "");
    form.setValue("icon", group?.icon ?? "");
  }, [form, group?.icon, group?.name]);

  const isLoading = form.formState.isSubmitting;
  const isBusy = isLoading || isDeleting;

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!group?.id) {
      setSubmitError("Group context missing.");
      return;
    }

    try {
      setSubmitError(null);
      await axios.patch(`/api/channel-groups/${group.id}`, {
        name: values.name,
        icon: (values.icon ?? "").trim() || null,
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
    if (isBusy) {
      return;
    }

    form.reset();
    setSubmitError(null);
    onClose();
  };

  const onDeleteGroup = async () => {
    if (!group?.id || isBusy) {
      return;
    }

    const confirmed = window.confirm(`Delete channel group "${group.name}"?`);
    if (!confirmed) {
      return;
    }

    try {
      setSubmitError(null);
      setIsDeleting(true);

      await axios.delete(`/api/channel-groups/${group.id}`);

      form.reset();
      router.refresh();
      onClose();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: string })?.error ||
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          error.message ||
          "Failed to delete group.";
        setSubmitError(message);
      } else {
        setSubmitError("Failed to delete group.");
      }
      console.error("[DELETE_CHANNEL_GROUP_MODAL]", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white p-0 text-black dark:bg-[#313338] dark:text-white">
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
                        disabled={isBusy}
                        className="border-0 bg-zinc-200/70 text-black focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-zinc-700/50 dark:text-zinc-100"
                        placeholder="Enter channel group name"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-300">
                      Group icon
                    </FormLabel>
                    <FormControl>
                      <Input
                        disabled={isBusy}
                        maxLength={16}
                        className="border-0 bg-zinc-200/70 text-black focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-zinc-700/50 dark:text-zinc-100"
                        placeholder="e.g. 📂"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-300">
                        Free icon picks
                      </p>
                      <div className="grid grid-cols-6 gap-1 rounded-md border border-black/10 bg-black/5 p-2 sm:grid-cols-9 dark:border-black/20 dark:bg-black/10">
                        {FREE_GROUP_ICONS.map((icon) => (
                          <button
                            key={icon}
                            type="button"
                            onClick={() => form.setValue("icon", icon, { shouldDirty: true, shouldValidate: true })}
                            disabled={isBusy}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded text-base transition hover:bg-zinc-700/20 dark:hover:bg-zinc-700/50 ${
                              (field.value ?? "") === icon ? "bg-zinc-700/30 ring-1 ring-indigo-400/80 dark:bg-zinc-700/70" : ""
                            }`}
                            aria-label={`Use ${icon} as group icon`}
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
              {submitError ? (
                <p className="text-sm text-rose-500 dark:text-rose-400">{submitError}</p>
              ) : null}
            </div>
            <DialogFooter className="bg-gray-100 px-6 py-4 dark:bg-zinc-800/60">
              <Button
                type="button"
                onClick={() => void onDeleteGroup()}
                disabled={isBusy}
                className="mr-auto bg-rose-600 text-white hover:bg-rose-500"
              >
                {isDeleting ? "Deleting..." : "Delete Group"}
              </Button>
              <Button type="button" variant="ghost" onClick={handleClose} disabled={isBusy}>
                Cancel
              </Button>
              <Button variant="primary" disabled={isBusy}>{isLoading ? "Saving..." : "Save Group"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
