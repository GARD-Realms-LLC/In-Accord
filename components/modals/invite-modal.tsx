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
import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useOrigin } from "@/hooks/use-origin";
import { useState } from "react";
import axios from "axios";

export const InviteModal = () => {
  const { onOpen, isOpen, onClose, type, data } = useModal();
  const origin = useOrigin();

  const { server } = data;
  const [copied, setCopied] = useState(false);
  const [isLoading, setLoading] = useState(false);
  const [discordBotClientId, setDiscordBotClientId] = useState("");
  const [discordPermissions, setDiscordPermissions] = useState("274878024704");
  const [copiedBotUrl, setCopiedBotUrl] = useState(false);

  const initeUrl = `${origin}/invite/${server?.inviteCode}`;

  const normalizedBotClientId = discordBotClientId.trim();
  const normalizedPermissions = discordPermissions.trim();
  const isBotClientIdValid = /^\d{17,20}$/.test(normalizedBotClientId);
  const isPermissionsValid = /^\d+$/.test(normalizedPermissions);
  const discordBotInviteUrl =
    isBotClientIdValid && isPermissionsValid
      ? `https://discord.com/oauth2/authorize?client_id=${normalizedBotClientId}&scope=bot%20applications.commands&permissions=${normalizedPermissions}`
      : "";

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

  const onCopyDiscordBotInvite = async () => {
    if (!discordBotInviteUrl) {
      return;
    }

    await navigator.clipboard.writeText(discordBotInviteUrl);
    setCopiedBotUrl(true);

    setTimeout(() => {
      setCopiedBotUrl(false);
    }, 1000);
  };

  const onOpenDiscordBotInvite = () => {
    if (!discordBotInviteUrl) {
      return;
    }

    window.open(discordBotInviteUrl, "_blank", "noopener,noreferrer");
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

          <div className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-700">
            <Label
              className="uppercase text-xs font-bold
            text-zinc-500 dark:text-secondary/70"
            >
              Invite Discord Bot
            </Label>

            <div className="mt-3 space-y-3">
              <div>
                <Label className="text-[10px] uppercase font-semibold text-zinc-500 dark:text-zinc-400">
                  Discord Bot Client ID
                </Label>
                <Input
                  value={discordBotClientId}
                  onChange={(event) => setDiscordBotClientId(event.target.value)}
                  placeholder="123456789012345678"
                  className="mt-1 bg-zinc-300/50 border-0 focus-visible:ring-0 text-black focus-visible:ring-offset-0 dark:bg-zinc-700/50 dark:text-zinc-100"
                />
              </div>

              <div>
                <Label className="text-[10px] uppercase font-semibold text-zinc-500 dark:text-zinc-400">
                  Permissions Integer
                </Label>
                <Input
                  value={discordPermissions}
                  onChange={(event) => setDiscordPermissions(event.target.value)}
                  placeholder="274878024704"
                  className="mt-1 bg-zinc-300/50 border-0 focus-visible:ring-0 text-black focus-visible:ring-offset-0 dark:bg-zinc-700/50 dark:text-zinc-100"
                />
              </div>

              <div className="flex items-center gap-x-2">
                <Input
                  readOnly
                  value={discordBotInviteUrl}
                  placeholder="Discord invite URL will appear here"
                  className="bg-zinc-300/50 border-0 focus-visible:ring-0 text-black focus-visible:ring-offset-0 dark:bg-zinc-700/50 dark:text-zinc-100"
                />
                <Button
                  size="icon"
                  type="button"
                  onClick={onCopyDiscordBotInvite}
                  disabled={!discordBotInviteUrl}
                >
                  {copiedBotUrl ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              <Button
                type="button"
                onClick={onOpenDiscordBotInvite}
                disabled={!discordBotInviteUrl}
                className="w-full"
              >
                Open Discord Bot Invite
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>

              {!isBotClientIdValid && normalizedBotClientId.length > 0 ? (
                <p className="text-xs text-rose-500">Client ID must be a Discord snowflake (17-20 digits).</p>
              ) : null}
              {!isPermissionsValid && normalizedPermissions.length > 0 ? (
                <p className="text-xs text-rose-500">Permissions must be a numeric integer.</p>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
