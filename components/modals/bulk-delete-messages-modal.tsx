"use client";

import axios from "axios";
import qs from "query-string";
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { useModal } from "@/hooks/use-modal-store";
import { emitLocalChatMutationForRoute } from "@/lib/chat-live-events";

const MIN_DELETE_COUNT = 1;
const MAX_DELETE_COUNT = 500;

export const BulkDeleteMessagesModal = () => {
  const { isOpen, onClose, type, data } = useModal();

  const [countInput, setCountInput] = useState("10");
  const [profileNameInput, setProfileNameInput] = useState("");
  const [deleteAll, setDeleteAll] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isModalOpen = isOpen && type === "bulkDeleteMessages";

  const resolvedCount = useMemo(() => {
    const parsed = Number.parseInt(countInput.trim(), 10);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return parsed;
  }, [countInput]);

  const handleClose = () => {
    setCountInput("10");
    setProfileNameInput("");
    setDeleteAll(false);
    setSubmitError(null);
    setIsSubmitting(false);
    onClose();
  };

  const onConfirm = async () => {
    const apiUrl = String(data.apiUrl ?? "").trim();
    const query = data.query ?? {};

    if (!apiUrl) {
      setSubmitError("Bulk delete route is missing.");
      return;
    }

    if (!deleteAll && resolvedCount === null) {
      setSubmitError("Enter a valid number of posts to delete.");
      return;
    }

    const effectiveCount = deleteAll ? MIN_DELETE_COUNT : resolvedCount;

    if (effectiveCount === null || effectiveCount < MIN_DELETE_COUNT || effectiveCount > MAX_DELETE_COUNT) {
      setSubmitError(`Enter a number between ${MIN_DELETE_COUNT} and ${MAX_DELETE_COUNT}.`);
      return;
    }

    try {
      setSubmitError(null);
      setIsSubmitting(true);

      const url = qs.stringifyUrl({
        url: apiUrl,
        query,
      });

      const response = await axios.post(url, {
        amount: deleteAll ? undefined : effectiveCount,
        deleteAll,
        profileName: profileNameInput.trim() || undefined,
      });

      const deletedCount = Number((response.data as { deletedCount?: number } | null)?.deletedCount ?? 0);
      toast.success(`Deleted ${deletedCount} post${deletedCount === 1 ? "" : "s"}.`);

      emitLocalChatMutationForRoute(apiUrl, query);
      handleClose();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          (error.response?.data as { error?: string } | undefined)?.error ||
          error.message ||
          "Failed to bulk delete posts.";

        setSubmitError(message);
        toast.error(message);
      } else {
        setSubmitError("Failed to bulk delete posts.");
        toast.error("Failed to bulk delete posts.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={handleClose}>
      <DialogContent className="overflow-hidden bg-white p-0 text-black dark:bg-[#313338] dark:text-white">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-xl font-bold">Bulk Delete Posts</DialogTitle>
          <DialogDescription className="text-sm text-zinc-500 dark:text-zinc-300">
            Delete newest posts first. This action marks matching posts as deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 px-6 pb-2">
          <div className="mb-1 flex items-center justify-between rounded-md border border-zinc-300/60 bg-zinc-100/70 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900/60">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
              Delete all matching posts
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDeleteAll((prev) => !prev);
                setSubmitError(null);
              }}
              disabled={isSubmitting}
              className={`h-7 px-2 text-[11px] ${deleteAll ? "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25" : "bg-zinc-500/15 text-zinc-300 hover:bg-zinc-500/25"}`}
            >
              {deleteAll ? "Enabled" : "Disabled"}
            </Button>
          </div>

          <label htmlFor="bulk-delete-count" className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-300">
            Number of posts
          </label>
          <Input
            id="bulk-delete-count"
            type="number"
            min={MIN_DELETE_COUNT}
            max={MAX_DELETE_COUNT}
            step={1}
            value={countInput}
            onChange={(event) => {
              setCountInput(event.target.value);
              setSubmitError(null);
            }}
            disabled={isSubmitting || deleteAll}
            className="bg-zinc-100 dark:bg-zinc-800"
          />
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {deleteAll
              ? "Delete all mode is enabled. Amount is ignored."
              : `Allowed range: ${MIN_DELETE_COUNT}–${MAX_DELETE_COUNT}`}
          </p>

          <label htmlFor="bulk-delete-profile-name" className="pt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-300">
            Profile name (optional)
          </label>
          <Input
            id="bulk-delete-profile-name"
            type="text"
            value={profileNameInput}
            onChange={(event) => {
              setProfileNameInput(event.target.value);
              setSubmitError(null);
            }}
            disabled={isSubmitting}
            placeholder="Delete only this user's posts"
            className="bg-zinc-100 dark:bg-zinc-800"
          />
        </div>

        {submitError ? <p className="px-6 text-sm text-rose-500 dark:text-rose-400">{submitError}</p> : null}

        <DialogFooter className="bg-gray-100 px-6 py-4 dark:bg-zinc-800/60">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={() => void onConfirm()} disabled={isSubmitting}>
            {isSubmitting ? "Deleting..." : "Delete Posts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
