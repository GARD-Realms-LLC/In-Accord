import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, db } from "@/lib/db";
import {
  canAccessChannelAsProfile,
  ensureChannelThreadSchema,
  updateThreadSettings,
} from "@/lib/channel-threads";

export async function PATCH(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ channelId: string; threadId: string }>;
  }
) {
  try {
    const profile = await currentProfile();
    const { channelId, threadId } = await params;
    const body = (await req.json()) as {
      serverId?: string;
      archived?: boolean;
      autoArchiveMinutes?: number;
    };

    const serverId = String(body.serverId ?? "").trim();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId || !channelId || !threadId) {
      return new NextResponse("Missing context", { status: 400 });
    }

    await ensureChannelThreadSchema();

    const currentChannel = await db.query.channel.findFirst({
      where: and(eq(channel.id, channelId), eq(channel.serverId, serverId)),
    });

    if (!currentChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    const access = await canAccessChannelAsProfile({
      profileId: profile.id,
      serverId,
      channelId,
    });

    if (!access.allowed || !access.currentMember) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    if (!access.permissions?.allowSend) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const threadRowResult = await db.execute(sql`
      select "id"
      from "ChannelThread"
      where "id" = ${threadId}
        and "channelId" = ${channelId}
        and "serverId" = ${serverId}
      limit 1
    `);

    const threadRow = (threadRowResult as unknown as { rows?: Array<{ id: string }> }).rows?.[0];

    if (!threadRow) {
      return new NextResponse("Thread not found", { status: 404 });
    }

    await updateThreadSettings({
      threadId,
      archived: typeof body.archived === "boolean" ? body.archived : undefined,
      autoArchiveMinutes:
        typeof body.autoArchiveMinutes === "number" ? body.autoArchiveMinutes : undefined,
    });

    const updatedResult = await db.execute(sql`
      select
        "id",
        "title",
        "archived",
        "autoArchiveMinutes",
        "lastActivityAt",
        "updatedAt"
      from "ChannelThread"
      where "id" = ${threadId}
      limit 1
    `);

    const updated = (updatedResult as unknown as {
      rows?: Array<{
        id: string;
        title: string;
        archived: boolean;
        autoArchiveMinutes: number;
        lastActivityAt: Date | string;
        updatedAt: Date | string;
      }>;
    }).rows?.[0];

    return NextResponse.json({
      thread: updated
        ? {
            id: updated.id,
            title: updated.title,
            archived: Boolean(updated.archived),
            autoArchiveMinutes: Number(updated.autoArchiveMinutes ?? 1440),
            lastActivityAt: new Date(updated.lastActivityAt),
            updatedAt: new Date(updated.updatedAt),
          }
        : null,
    });
  } catch (error) {
    console.error("[CHANNEL_THREAD_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
