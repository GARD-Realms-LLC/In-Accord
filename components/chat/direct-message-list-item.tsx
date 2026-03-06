import Link from "next/link";

import { UserAvatar } from "@/components/user-avatar";

interface DirectMessageListItemProps {
  conversationId: string;
  serverId: string;
  memberId: string;
  displayName: string;
  imageUrl: string | null;
  timestampLabel: string;
  unreadCount: number;
  isActive?: boolean;
}

export const DirectMessageListItem = ({
  conversationId,
  serverId,
  memberId,
  displayName,
  imageUrl,
  timestampLabel,
  unreadCount,
  isActive,
}: DirectMessageListItemProps) => {
  const href = `/users?serverId=${encodeURIComponent(serverId)}&memberId=${encodeURIComponent(memberId)}`;

  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition ${
        isActive ? "bg-[#3f4248] text-white" : "text-[#dcddde] hover:bg-[#3f4248]"
      }`}
      aria-label={`Open DM with ${displayName}`}
      data-conversation-id={conversationId}
    >
      <UserAvatar src={imageUrl ?? undefined} className="h-7 w-7" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">{displayName}</p>
        <p className="truncate text-[10px] text-[#949ba4]">{timestampLabel || "No messages yet"}</p>
      </div>
      {unreadCount > 0 ? (
        <span className="rounded-full bg-[#5865f2] px-1.5 py-0.5 text-[10px] font-bold text-white">
          {unreadCount}
        </span>
      ) : null}
    </Link>
  );
};
