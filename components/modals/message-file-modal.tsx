"use client";

import axios from "axios";
import qs from "query-string";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/file-upload";
import { useModal } from "@/hooks/use-modal-store";
import {
  emitLocalChatConfirmedMessageForRoute,
  type LocalChatMutationMessage,
} from "@/lib/chat-live-events";
import { buildQuotedContent } from "@/lib/message-quotes";

export const MessageFileModal = () => {
  const { isOpen, onClose, type, data } = useModal();
  const [fileUrl, setFileUrl] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isModalOpen = isOpen && type === "messageFile";

  const handleClose = () => {
    setFileUrl("");
    setSubmitError(null);
    setIsSubmitting(false);
    onClose();
  };

  const onSubmit = async () => {
    const apiUrl = String(data.apiUrl ?? "").trim();
    const query = data.query ?? {};
    const normalizedFileUrl = String(fileUrl ?? "").trim();

    if (!apiUrl) {
      setSubmitError("Message route is missing.");
      return;
    }

    if (!normalizedFileUrl) {
      setSubmitError("Upload a file before sending.");
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const url = qs.stringifyUrl({
        url: apiUrl,
        query,
      });

      const clientMutationId = crypto.randomUUID();

      const response = await axios.post<LocalChatMutationMessage>(url, {
        content: buildQuotedContent("[attachment]", null),
        fileUrl: normalizedFileUrl,
        clientMutationId,
      });

      if (response.data?.id) {
        emitLocalChatConfirmedMessageForRoute(apiUrl, query, {
          clientMutationId,
          message: response.data,
        });
      }

      handleClose();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          (error.response?.data as { error?: string } | undefined)?.error ||
          error.message ||
          "Failed to send file.";

        setSubmitError(message);
      } else {
        setSubmitError("Failed to send file.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={handleClose}>
      <DialogContent className="overflow-hidden bg-white p-0 text-black dark:bg-[#313338] dark:text-white">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-xl font-bold">Add Files to Chat</DialogTitle>
          <DialogDescription className="text-sm text-zinc-500 dark:text-zinc-300">
            Upload an image or PDF and send it to this chat.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-4">
          <FileUpload
            endpoint="messageFile"
            value={fileUrl}
            onChange={(value) => {
              setFileUrl(String(value ?? ""));
              setSubmitError(null);
            }}
          />

          {submitError ? <p className="text-sm text-rose-500 dark:text-rose-400">{submitError}</p> : null}
        </div>

        <DialogFooter className="bg-gray-100 px-6 py-4 dark:bg-zinc-800/60">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={() => void onSubmit()} disabled={isSubmitting || !fileUrl.trim()}>
            {isSubmitting ? "Sending..." : "Send File"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
