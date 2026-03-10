"use client";

import { useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BotCommandsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botName: string;
  commands: string[];
};

export const BotCommandsDialog = ({
  open,
  onOpenChange,
  botName,
  commands,
}: BotCommandsDialogProps) => {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return commands;
    }

    return commands.filter((item) => item.toLowerCase().includes(normalized));
  }, [commands, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings-theme-scope border-black/30 bg-[#1e1f22] text-[#dbdee1] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{botName} Commands</DialogTitle>
          <DialogDescription className="text-[#949ba4]">
            Showing {filtered.length} of {commands.length} command{commands.length === 1 ? "" : "s"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commands"
            className="h-9 w-full rounded-md border border-black/25 bg-[#1a1b1e] px-3 text-sm text-white outline-none placeholder:text-[#7f8690]"
          />

          <div className="max-h-95 space-y-1 overflow-y-auto rounded-md border border-white/10 bg-black/20 p-2">
            {filtered.length === 0 ? (
              <p className="px-2 py-2 text-xs text-[#949ba4]">No commands match your search.</p>
            ) : (
              filtered.map((command) => (
                <div
                  key={`bot-command-${command}`}
                  className="rounded-md border border-white/10 bg-[#1a1b1e] px-2.5 py-1.5 text-xs text-[#dbdee1]"
                >
                  /{command}
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
