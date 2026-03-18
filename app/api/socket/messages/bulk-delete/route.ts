import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import {
  bulkDeleteChannelMessages,
  MAX_BULK_DELETE_COUNT,
  MIN_BULK_DELETE_COUNT,
} from "@/lib/message-bulk-delete";

const resolveIds = (req: Request) => {
  const { searchParams } = new URL(req.url);
  return {
    serverId: searchParams.get("serverId")?.trim() ?? "",
    channelId: searchParams.get("channelId")?.trim() ?? "",
    threadId: searchParams.get("threadId")?.trim() ?? "",
  };
};

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId, channelId, threadId } = resolveIds(req);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const deleteAll = Boolean(body.deleteAll);
    const amount = Number.parseInt(String(body.amount ?? ""), 10);
    const profileNameFilter = String(body.profileName ?? "").trim().toLowerCase();

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    if (!deleteAll && (!Number.isFinite(amount) || amount < MIN_BULK_DELETE_COUNT || amount > MAX_BULK_DELETE_COUNT)) {
      return new NextResponse(`Amount must be between ${MIN_BULK_DELETE_COUNT} and ${MAX_BULK_DELETE_COUNT}`, { status: 400 });
    }

    const result = await bulkDeleteChannelMessages({
      serverId,
      channelId,
      threadId,
      actorProfileId: profile.id,
      actorProfileRole: profile.role,
      amount,
      deleteAll,
      profileName: profileNameFilter,
    });

    if (!result.ok) {
      return new NextResponse(result.message, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      deletedCount: result.deletedCount,
      softDeletedCount: result.softDeletedCount,
      hardDeletedCount: result.hardDeletedCount,
    });
  } catch (error) {
    console.error("[SOCKET_MESSAGES_BULK_DELETE_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
