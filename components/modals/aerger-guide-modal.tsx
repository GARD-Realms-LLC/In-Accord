"use client";

import { useModal } from "@/hooks/use-modal-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const AergerGuideModal = () => {
  const { isOpen, onClose, type, data } = useModal();
  const isModalOpen = isOpen && type === "aergerGuide";
  const guideLabel = "Our Guide";

  return (
    <Dialog open={isModalOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[86vh] overflow-hidden border-0 bg-[#313338] p-0 text-white shadow-2xl sm:max-w-155 [&>button]:hidden">
        <DialogHeader className="border-b border-black/20 px-6 pb-4 pt-5 text-left">
          <DialogTitle className="text-xl font-semibold text-white">{guideLabel}</DialogTitle>
          <DialogDescription className="text-sm text-zinc-300">
            {guideLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-6 py-5 text-sm text-zinc-200">
          <p className="rounded-md border border-zinc-700 bg-[#1e1f22] px-3 py-2">
            Welcome! Use this guide to get started quickly in the server.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-zinc-300">
            <li>Check Events for upcoming activities.</li>
            <li>Use Stage for announcements and presentations.</li>
            <li>Join voice/video channels from the rail for live sessions.</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
};
