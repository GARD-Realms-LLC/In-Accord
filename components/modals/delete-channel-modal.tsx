"use client";

import qs from "query-string";
import axios from "axios";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { useModal } from "@/hooks/use-modal-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buildServerPath } from "@/lib/route-slugs";

export const DeleteChannelModal = () => {
  const { isOpen, onClose, type, data } = useModal();
  const router = useRouter();

  const isModalOpen = isOpen && type === "deleteChannel";
  const { server, channel } = data;

  const [isLoading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onConfirm = async () => {
    try {
      setSubmitError(null);
      setLoading(true);
      const url = qs.stringifyUrl({
        url: `/api/channels/${channel?.id}`,
        query: {
          serverId: server?.id
        }
      });

      await axios.delete(url);

      onClose();
      if (server?.id) {
        window.location.assign(
          server?.name
            ? buildServerPath({ id: server.id, name: server.name })
            : `/servers/${server.id}`
        );
        return;
      }

      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          (error.response?.data as { error?: string } | undefined)?.error ||
          error.message ||
          "Failed to delete channel";
        setSubmitError(message);
      } else {
        setSubmitError("Failed to delete channel");
      }
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={onClose}>
      <DialogContent className="overflow-hidden bg-white p-0 text-black dark:bg-[#313338] dark:text-white">
        <DialogHeader className="pt-8 px-6">
          <DialogTitle className="text-2xl text-center font-bold">
            Delete Channel
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="text-center text-zinc-500 dark:text-zinc-300">
          Are you sure you want to do this? <br />
          <span className="font-semibold text-indigo-500">
            #{channel?.name}
          </span>{" "}
          will be permanently deleted.
        </DialogDescription>
        {submitError ? (
          <p className="px-6 text-center text-sm text-rose-500 dark:text-rose-400">{submitError}</p>
        ) : null}
        <DialogFooter className="bg-gray-100 px-6 py-4 dark:bg-zinc-800/60">
          <div className="flex items-center justify-between w-full">
            <Button disabled={isLoading} onClick={onClose} variant="ghost">
              Cancel
            </Button>
            <Button disabled={isLoading} onClick={onConfirm} variant="primary">
              Confirm
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
