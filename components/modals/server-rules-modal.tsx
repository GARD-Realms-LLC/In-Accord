"use client";

import { useRouter } from "next/navigation";

import { useModal } from "@/hooks/use-modal-store";
import { buildChannelPath } from "@/lib/route-slugs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const ServerRulesModal = () => {
  const router = useRouter();
  const { isOpen, onClose, type, data } = useModal();
  const isModalOpen = isOpen && type === "serverRules";

  const serverId = String(data.server?.id ?? "").trim();
  const serverName = String(data.server?.name ?? "").trim();
  const channelId = String(data.channel?.id ?? "").trim();
  const channelName = String(data.channel?.name ?? "rules").trim() || "rules";
  const rulesLabel = "Our Rules";

  const canOpenChannel = serverId.length > 0 && channelId.length > 0;

  const onOpenChannel = () => {
    if (!canOpenChannel || !serverName) {
      return;
    }

    router.push(
      buildChannelPath({
        server: { id: serverId, name: serverName },
        channel: { id: channelId, name: channelName },
      })
    );
    onClose();
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[86vh] overflow-hidden border-0 bg-[#313338] p-0 text-white shadow-2xl sm:max-w-155 [&>button]:hidden">
        <DialogHeader className="border-b border-black/20 px-6 pb-4 pt-5 text-left">
          <DialogTitle className="text-xl font-semibold text-white">{rulesLabel}</DialogTitle>
          <DialogDescription className="text-sm text-zinc-300">
            {rulesLabel} channel
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-6 py-5 text-sm text-zinc-200">
          <p className="rounded-md border border-zinc-700 bg-[#1e1f22] px-3 py-2">
            Open the {rulesLabel} channel popup shortcut.
          </p>

          <div>
            <button
              type="button"
              onClick={onOpenChannel}
              disabled={!canOpenChannel}
              className="inline-flex h-9 items-center rounded-md border border-indigo-400/40 bg-indigo-500/20 px-3 text-xs font-semibold uppercase tracking-[0.06em] text-indigo-100 transition hover:bg-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Open {rulesLabel} Channel
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
