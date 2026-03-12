import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, member, server } from "@/lib/db";
import { emitInAccordSystemEvent } from "@/lib/in-accord-event-system";
import {
  deleteServerScheduledEvent,
  updateServerScheduledEvent,
} from "@/lib/server-scheduled-events-store";

const canManageServerEvents = async (profileId: string, serverId: string) => {
  const membership = await db.query.member.findFirst({
    where: and(eq(member.serverId, serverId), eq(member.profileId, profileId)),
  });

  const ownerServer = await db.query.server.findFirst({
    where: and(eq(server.id, serverId), eq(server.profileId, profileId)),
  });

  return {
    isMember: Boolean(membership),
    isOwner: Boolean(ownerServer),
  };
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ serverId: string; eventId: string }> }
) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId, eventId } = await params;
    if (!serverId || !eventId) {
      return new NextResponse("Missing required identifiers", { status: 400 });
    }

    const access = await canManageServerEvents(profile.id, serverId);
    if (!access.isMember) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    if (!access.isOwner) {
      return new NextResponse("Only the server owner can update scheduled entries.", { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      title?: unknown;
      description?: unknown;
      startsAt?: unknown;
    };

    const updated = await updateServerScheduledEvent({
      serverId,
      eventId,
      ...(body.title !== undefined ? { title: String(body.title ?? "") } : {}),
      ...(body.description !== undefined
        ? { description: body.description == null ? null : String(body.description ?? "") }
        : {}),
      ...(body.startsAt !== undefined ? { startsAt: String(body.startsAt ?? "") } : {}),
    });

    if (!updated) {
      return new NextResponse("Scheduled event not found.", { status: 404 });
    }

    await emitInAccordSystemEvent({
      eventType: "SERVER_SCHEDULED_EVENT_UPDATED",
      scope: "server-settings",
      actorProfileId: profile.id,
      actorUserId: (profile as { userId?: string }).userId ?? null,
      serverId,
      targetId: updated.id,
      metadata: {
        title: updated.title,
        startsAt: updated.startsAt,
      },
    });

    return NextResponse.json({ ok: true, event: updated });
  } catch (error) {
    console.error("[SERVERS_SCHEDULED_EVENTS_EVENT_PATCH]", error);
    return new NextResponse(error instanceof Error ? error.message : "Internal Error", { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ serverId: string; eventId: string }> }
) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId, eventId } = await params;
    if (!serverId || !eventId) {
      return new NextResponse("Missing required identifiers", { status: 400 });
    }

    const access = await canManageServerEvents(profile.id, serverId);
    if (!access.isMember) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    if (!access.isOwner) {
      return new NextResponse("Only the server owner can delete scheduled entries.", { status: 403 });
    }

    await deleteServerScheduledEvent({
      serverId,
      eventId,
    });

    await emitInAccordSystemEvent({
      eventType: "SERVER_SCHEDULED_EVENT_DELETED",
      scope: "server-settings",
      actorProfileId: profile.id,
      actorUserId: (profile as { userId?: string }).userId ?? null,
      serverId,
      targetId: eventId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[SERVERS_SCHEDULED_EVENTS_EVENT_DELETE]", error);
    return new NextResponse(error instanceof Error ? error.message : "Internal Error", { status: 500 });
  }
}
