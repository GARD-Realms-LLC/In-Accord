"use client";

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
import { isInAccordProtectedServer } from "@/lib/server-security";

export const DeleteServerModal = () => {
  const { isOpen, onClose, type, data } = useModal();
  const router = useRouter();

  const isModalOpen = isOpen && type === "deleteServer";
  const { server } = data;
  const isProtectedInAccordServer = isInAccordProtectedServer({
    serverId: server?.id,
    serverName: server?.name,
  });

  const [isLoading, setLoading] = useState(false);

  const onConfirm = async () => {
    if (isProtectedInAccordServer) {
      return;
    }

    try {
      setLoading(true);

      await axios.delete(`/api/servers/${server?.id}`);

      onClose();
      if (typeof window !== "undefined") {
        window.location.assign("/");
        return;
      }

      router.refresh();
      router.replace("/");
    } catch (error) {
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
            Delete Server
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="text-center text-zinc-500 dark:text-zinc-300">
          {isProtectedInAccordServer
            ? "This is the protected In-Accord server and it cannot be deleted."
            : "Are you sure you want to do this?"}{" "}
          <br />
          <span className="font-semibold text-indigo-500">
            {server?.name}
          </span>{" "}
          {isProtectedInAccordServer ? "is protected." : "will be permanently deleted."}
        </DialogDescription>
        <DialogFooter className="bg-gray-100 px-6 py-4 dark:bg-zinc-800/60">
          <div className="flex items-center justify-between w-full">
            <Button disabled={isLoading} onClick={onClose} variant="ghost">
              Cancel
            </Button>
            <Button disabled={isLoading || isProtectedInAccordServer} onClick={onConfirm} variant="primary">
              {isProtectedInAccordServer ? "Protected" : "Confirm"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
