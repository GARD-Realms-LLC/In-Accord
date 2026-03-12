"use client";

import { useMemo } from "react";

import { useModal } from "@/hooks/use-modal-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const BoostersModal = () => {
  const { isOpen, onClose, type, data } = useModal();
  const isModalOpen = isOpen && type === "boosters";
  const serverName = String(data.server?.name ?? "").trim();

  const boosterCount = useMemo(() => {
    const raw = (data as { boosterCount?: unknown }).boosterCount;
    const parsed = Number(raw ?? 0);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  }, [data]);

  return (
    <Dialog open={isModalOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[86vh] overflow-hidden border-0 bg-[#313338] p-0 text-white shadow-2xl sm:max-w-155 [&>button]:hidden">
        <DialogHeader className="border-b border-black/20 px-6 pb-4 pt-5 text-left">
          <DialogTitle className="text-xl font-semibold text-white">Boosters</DialogTitle>
          <DialogDescription className="text-sm text-zinc-300">
            {serverName ? `${serverName} • ${boosterCount} booster${boosterCount === 1 ? "" : "s"}` : `${boosterCount} booster${boosterCount === 1 ? "" : "s"}`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5 text-sm text-zinc-200">
          {boosterCount === 0 ? (
            <p className="rounded-md border border-zinc-700 bg-[#1e1f22] px-3 py-2 text-zinc-300">
              No boosters yet.
            </p>
          ) : (
            <p className="rounded-md border border-zinc-700 bg-[#1e1f22] px-3 py-2 text-zinc-300">
              Booster details panel is enabled.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
