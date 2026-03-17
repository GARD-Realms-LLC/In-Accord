import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { getGlobalRecentDmsForProfile } from "@/lib/direct-messages";

const formatTimestamp = (value: Date) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "";
  }

  return value.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
};

export async function GET(req: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const selectedServerId = String(searchParams.get("selectedServerId") ?? "").trim();

    const items = await getGlobalRecentDmsForProfile({
      profileId: profile.id,
      selectedServerId: selectedServerId || null,
      recentWindowDays: 30,
    });

    return NextResponse.json({
      items: items.map((item) => ({
        conversationId: item.conversationId,
        serverId: item.serverId,
        memberId: item.memberId,
        profileId: item.profileId,
        displayName: item.displayName,
        imageUrl: item.imageUrl,
        avatarDecorationUrl: item.avatarDecorationUrl,
        profileCreatedAt: item.profileCreatedAt ? item.profileCreatedAt.toISOString() : null,
        timestampLabel: formatTimestamp(item.lastMessageAt),
        unreadCount: item.unreadCount,
      })),
    });
  } catch (error) {
    console.error("[DIRECT_MESSAGES_RECENT_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}