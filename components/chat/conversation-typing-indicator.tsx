"use client";

interface ConversationTypingIndicatorProps {
  conversationId: string;
}

export const ConversationTypingIndicator = ({ conversationId }: ConversationTypingIndicatorProps) => {
  if (!conversationId) {
    return null;
  }

  return <div className="px-4 pt-2 text-xs text-zinc-500 dark:text-zinc-400" />;
};
