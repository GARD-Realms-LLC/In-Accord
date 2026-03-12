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
import { Check, Copy, RefreshCw, Trash2 } from "lucide-react";
import { useOrigin } from "@/hooks/use-origin";
import { useEffect, useState } from "react";
import axios from "axios";

type ServerInviteItem = {
  code: string;
  createdAt: string;
  source: "created" | "regenerated";
  createdByProfileId?: string;
  createdByName?: string | null;
  createdByEmail?: string | null;
  usedCount?: number;
};

export const InviteModal = () => {
  const { onOpen, isOpen, onClose, type, data } = useModal();
  const origin = useOrigin();

  const { server } = data;
  const [copied, setCopied] = useState(false);
  const [isLoading, setLoading] = useState(false);
  const [inviteItems, setInviteItems] = useState<ServerInviteItem[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [actionInviteCode, setActionInviteCode] = useState<string | null>(null);

  const inviteUrl = `${origin}/invite/${server?.inviteCode}`;

  const isModalOpen = isOpen && type === "invite";

  const loadInvites = async () => {
    const serverId = String(server?.id ?? "").trim();
    if (!serverId) {
      setInviteItems([]);
      return;
    }

    try {
      setIsLoadingInvites(true);
      setInviteError(null);

      const response = await axios.get<{ invites?: ServerInviteItem[] }>(`/api/servers/${serverId}/invites`);
      const items = Array.isArray(response.data.invites) ? response.data.invites : [];
      setInviteItems(items);
    } catch (error) {
      setInviteItems([]);
      if (axios.isAxiosError(error)) {
        const message =
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          error.message ||
          "Failed to load invites.";
        setInviteError(message);
      } else {
        setInviteError("Failed to load invites.");
      }
    } finally {
      setIsLoadingInvites(false);
    }
  };

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    void loadInvites();
  }, [isModalOpen, server?.id]);

  const onCopy = () => {
    navigator.clipboard.writeText(inviteUrl);
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
      await loadInvites();
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const onCopyInvite = async (code: string) => {
    const normalizedCode = String(code ?? "").trim();
    if (!normalizedCode) {
      return;
    }

    await navigator.clipboard.writeText(`${origin}/invite/${normalizedCode}`);
  };

  const onDeleteInvite = async (code: string) => {
    const serverId = String(server?.id ?? "").trim();
    const normalizedCode = String(code ?? "").trim();

    if (!serverId || !normalizedCode) {
      return;
    }

    try {
      setActionInviteCode(normalizedCode);
      setInviteError(null);

      await axios.delete(`/api/servers/${serverId}/invites`, {
        data: { code: normalizedCode },
      });

      await loadInvites();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (typeof error.response?.data === "string" ? error.response.data : "") ||
          error.message ||
          "Failed to delete invite.";
        setInviteError(message);
      } else {
        setInviteError("Failed to delete invite.");
      }
    } finally {
      setActionInviteCode(null);
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
            Server Invite Link ({inviteItems.length} total)
          </Label>
          <div className="flex items-center mt-2 gap-x-2">
            <Input
              disabled={isLoading}
              className="bg-zinc-300/50 border-0 focus-visible:ring-0 
              text-black focus-visible:ring-offset-0 dark:bg-zinc-700/50 dark:text-zinc-100"
              value={inviteUrl}
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

          <div className="mt-4 rounded-md border border-zinc-700/60 bg-zinc-100/60 p-3 dark:bg-[#1e1f22]">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-600 dark:text-zinc-300">
              Invite List
            </p>

            {isLoadingInvites ? (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Loading invites...</p>
            ) : inviteError ? (
              <p className="mt-2 text-xs text-rose-500 dark:text-rose-400">{inviteError}</p>
            ) : inviteItems.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">No invites found.</p>
            ) : (
              <ul className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
                {inviteItems.map((item) => {
                  const createdAt = new Date(item.createdAt);
                  const createdLabel = Number.isFinite(createdAt.getTime())
                    ? createdAt.toLocaleString()
                    : "Unknown";

                  return (
                    <li key={`${item.code}-${item.createdAt}`} className="rounded border border-zinc-300/70 bg-white/70 px-2.5 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/50">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-zinc-800 dark:text-zinc-100">{item.code}</p>
                          <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">
                            Created {createdLabel}
                            {item.createdByName ? ` by ${item.createdByName}` : ""}
                            {typeof item.usedCount === "number" ? ` · Uses: ${item.usedCount}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => void onCopyInvite(item.code)}
                            title="Copy invite link"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-rose-500 hover:text-rose-600"
                            onClick={() => void onDeleteInvite(item.code)}
                            disabled={actionInviteCode === item.code}
                            title="Delete invite"
                          >
                            {actionInviteCode === item.code ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
