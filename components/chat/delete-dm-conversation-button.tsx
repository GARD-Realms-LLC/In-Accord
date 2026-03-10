"use client";

import { Trash2 } from "lucide-react";

interface DeleteDmConversationButtonProps {
  conversationId: string;
  serverId: string;
  returnToUsersRoot?: boolean;
  title?: string;
}

export const DeleteDmConversationButton = ({ title = "Delete PM" }: DeleteDmConversationButtonProps) => {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-rose-400 transition hover:bg-rose-500/10 hover:text-rose-300"
      title={title}
      aria-label={title}
    >
      <Trash2 className="h-3.5 w-3.5" suppressHydrationWarning />
      <span>Delete</span>
    </button>
  );
};
