"use client";

import { UserAvatar } from "@/components/user-avatar";

interface PendingRequestItemProps {
  requestId: string;
  displayName: string;
  email: string | null;
  imageUrl: string | null;
  isIncoming: boolean;
}

export const PendingRequestItem = ({
  requestId,
  displayName,
  email,
  imageUrl,
  isIncoming,
}: PendingRequestItemProps) => {
  return (
    <div
      className="flex items-center gap-2 rounded-md bg-[#1e1f22] px-2 py-2"
      data-request-id={requestId}
    >
      <UserAvatar src={imageUrl ?? undefined} className="h-8 w-8" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{displayName}</p>
        <p className="truncate text-xs text-[#949ba4]">
          {email ?? "No email"} • {isIncoming ? "Incoming" : "Outgoing"}
        </p>
      </div>
    </div>
  );
};
