import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, member, server } from "@/lib/db";
import { emitInAccordSystemEvent } from "@/lib/in-accord-event-system";
import {
  createServerScheduledEvent,
  listServerScheduledEvents,
} from "@/lib/server-scheduled-events-store";

const getServerMembership = async (profileId: string, serverId: string) => {
  const membership = await db.query.member.findFirst({
    where: and(eq(member.serverId, serverId), eq(member.profileId, profileId)),
  });

  const ownerServer = await db.query.server.findFirst({
    where: and(eq(server.id, serverId), eq(server.profileId, profileId)),
  });

  return {
    membership,
    isOwner: Boolean(ownerServer),
  };
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId } = await params;
    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const { membership } = await getServerMembership(profile.id, serverId);
    if (!membership) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const events = await listServerScheduledEvents(serverId);

    return NextResponse.json({
      serverId,
      events,
    });
  } catch (error) {
    console.error("[SERVERS_SCHEDULED_EVENTS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId } = await params;
    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const { membership, isOwner } = await getServerMembership(profile.id, serverId);
    if (!membership) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    if (!isOwner) {
      return new NextResponse("Only the server owner can create scheduled entries.", { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      title?: unknown;
      description?: unknown;
      startsAt?: unknown;
      frequency?: unknown;
      bannerUrl?: unknown;
      channelKind?: unknown;
      channelId?: unknown;
    };

    const created = await createServerScheduledEvent({
      serverId,
      title: String(body.title ?? ""),
      description: body.description == null ? null : String(body.description ?? ""),
      startsAt: String(body.startsAt ?? ""),
      frequency: String(body.frequency ?? "ONCE"),
      bannerUrl: body.bannerUrl == null ? null : String(body.bannerUrl ?? ""),
      channelKind: body.channelKind == null ? null : String(body.channelKind ?? ""),
      channelId: body.channelId == null ? null : String(body.channelId ?? ""),
      createdByProfileId: profile.id,
    });

    if (!created) {
      return new NextResponse("Failed to create event.", { status: 500 });
    }

    await emitInAccordSystemEvent({
      eventType: "SERVER_SCHEDULED_EVENT_CREATED",
      scope: "server-settings",
      actorProfileId: profile.id,
      actorUserId: (profile as { userId?: string }).userId ?? null,
      serverId,
      targetId: created.id,
      metadata: {
        title: created.title,
        startsAt: created.startsAt,
        frequency: created.frequency,
        channelKind: created.channelKind,
        channelId: created.channelId,
      },
    });

    return NextResponse.json({
      ok: true,
      event: created,
    });
  } catch (error) {
    console.error("[SERVERS_SCHEDULED_EVENTS_POST]", error);
    return new NextResponse(error instanceof Error ? error.message : "Internal Error", { status: 500 });
  }
}
