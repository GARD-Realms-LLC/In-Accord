"use client";

import { useModal } from "@/hooks/use-modal-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, Copy, RefreshCw } from "lucide-react";
import { useOrigin } from "@/hooks/use-origin";
import { useState } from "react";
import axios from "axios";

export const InviteModal = () => {
  const { onOpen, isOpen, onClose, type, data } = useModal();
  const origin = useOrigin();

  const { server } = data;
  const [copied, setCopied] = useState(false);
  const [isLoading, setLoading] = useState(false);

  const initeUrl = `${origin}/invite/${server?.inviteCode}`;

  const isModalOpen = isOpen && type === "invite";

  const onCopy = () => {
    navigator.clipboard.writeText(initeUrl);
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 1000);
  };

  const onNew = async () => {
    try {
      setLoading(true);
      const response = await axios.patch(
        `/api/servers/${server?.id}/invite-code`
      );
      onOpen("invite", { server: response.data });
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={onClose}>
      <DialogContent className="overflow-hidden bg-white p-0 text-black dark:bg-[#313338] dark:text-white">
        <DialogHeader className="pt-8 px-6">
          <DialogTitle className="text-2xl text-center font-bold">
            Invite friends
          </DialogTitle>
        </DialogHeader>
        <div className="p-6">
          <Label
            className="uppercase text-xs font-bold 
          text-zinc-500 dark:text-secondary/70"
          >
            Sever Invite Link
          </Label>
          <div className="flex items-center mt-2 gap-x-2">
            <Input
              disabled={isLoading}
              className="bg-zinc-300/50 border-0 focus-visible:ring-0 
              text-black focus-visible:ring-offset-0 dark:bg-zinc-700/50 dark:text-zinc-100"
              value={initeUrl}
              readOnly
            />
            <Button disabled={isLoading} onClick={onCopy} size="icon">
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <Button
            onClick={onNew}
            disabled={isLoading}
            variant="link"
            size="sm"
            className="mt-4 text-xs text-zinc-500 dark:text-zinc-300"
          >
            Generate a new link
            <RefreshCw className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
