"use client";

import axios from "axios";
import qs from "query-string";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useModal } from "@/hooks/use-modal-store";

export const DeleteMessageModal = () => {
  const { isOpen, onClose, type, data } = useModal();
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isModalOpen = isOpen && type === "deleteMessage";

  const handleClose = () => {
    setSubmitError(null);
    setIsSubmitting(false);
    onClose();
  };

  const onConfirm = async () => {
    const apiUrl = String(data.apiUrl ?? "").trim();
    const query = data.query ?? {};

    if (!apiUrl) {
      setSubmitError("Message route is missing.");
      return;
    }

    try {
      setSubmitError(null);
      setIsSubmitting(true);

      const url = qs.stringifyUrl({
        url: apiUrl,
        query,
      });

      await axios.delete(url);

      router.refresh();
      toast.success("Post deleted.");
      handleClose();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          (error.response?.data as { error?: string } | undefined)?.error ||
          error.message ||
          "Failed to delete post.";

        setSubmitError(message);
        toast.error(message);
      } else {
        setSubmitError("Failed to delete post.");
        toast.error("Failed to delete post.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={handleClose}>
      <DialogContent className="overflow-hidden bg-white p-0 text-black dark:bg-[#313338] dark:text-white">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-xl font-bold">Delete Post</DialogTitle>
          <DialogDescription className="text-sm text-zinc-500 dark:text-zinc-300">
            Are you sure? This will mark the post as deleted.
          </DialogDescription>
        </DialogHeader>

        {submitError ? <p className="px-6 text-sm text-rose-500 dark:text-rose-400">{submitError}</p> : null}

        <DialogFooter className="bg-gray-100 px-6 py-4 dark:bg-zinc-800/60">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={() => void onConfirm()} disabled={isSubmitting}>
            {isSubmitting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
