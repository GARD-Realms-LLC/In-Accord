import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, message } from "@/lib/db";
import {
  canAccessChannelAsProfile,
  ensureChannelThreadSchema,
  getThreadForMessage,
  markThreadRead,
} from "@/lib/channel-threads";
import { extractQuotedContent, getQuoteSnippetFromBody } from "@/lib/message-quotes";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const profile = await currentProfile();
    const { channelId } = await params;
    const body = (await req.json()) as {
      serverId?: string;
      sourceMessageId?: string;
      title?: string;
    };

    const serverId = String(body.serverId ?? "").trim();
    const sourceMessageId = String(body.sourceMessageId ?? "").trim();
    const requestedTitle = String(body.title ?? "").trim();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    if (!channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    if (!sourceMessageId) {
      return new NextResponse("Source message ID missing", { status: 400 });
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

    const sourceMessage = await db.query.message.findFirst({
      where: and(eq(message.id, sourceMessageId), eq(message.channelId, channelId)),
      with: {
        member: {
          with: {
            profile: true,
          },
        },
      },
    });

    if (!sourceMessage) {
      return new NextResponse("Source message not found", { status: 404 });
    }

    if (sourceMessage.threadId) {
      return new NextResponse("Cannot start a thread from a thread reply", { status: 400 });
    }

    const existing = await getThreadForMessage({
      serverId,
      channelId,
      sourceMessageId,
      viewerProfileId: profile.id,
    });

    if (existing) {
      return NextResponse.json({
        threadId: existing.id,
        sourceMessageId: existing.sourceMessageId,
        title: existing.title,
        archived: existing.archived,
        replyCount: existing.replyCount,
      });
    }

    const { body: sourceBody } = extractQuotedContent(sourceMessage.content);

    const fallbackTitle = getQuoteSnippetFromBody(sourceBody || sourceMessage.content);
    const title = (requestedTitle || fallbackTitle || "Thread")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 191) || "Thread";

    const now = new Date();
    const id = uuidv4();

    await db.execute(sql`
      insert into "ChannelThread" (
        "id",
        "serverId",
        "channelId",
        "sourceMessageId",
        "title",
        "createdByMemberId",
        "archived",
        "autoArchiveMinutes",
        "lastActivityAt",
        "createdAt",
        "updatedAt"
      )
      values (
        ${id},
        ${serverId},
        ${channelId},
        ${sourceMessageId},
        ${title},
        ${access.currentMember.id},
        false,
        1440,
        ${now},
        ${now},
        ${now}
      )
      on conflict ("sourceMessageId") do update
      set
        "updatedAt" = excluded."updatedAt"
      returning "id", "sourceMessageId", "title", "archived"
    `);

    const created = await getThreadForMessage({
      serverId,
      channelId,
      sourceMessageId,
      viewerProfileId: profile.id,
    });

    if (!created) {
      return new NextResponse("Failed to create thread", { status: 500 });
    }

    await markThreadRead({
      threadId: created.id,
      profileId: profile.id,
    });

    return NextResponse.json({
      threadId: created.id,
      sourceMessageId: created.sourceMessageId,
      title: created.title,
      archived: created.archived,
      replyCount: created.replyCount,
    });
  } catch (error) {
    console.error("[CHANNEL_THREADS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
