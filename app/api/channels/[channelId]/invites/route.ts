import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, member, profile, server } from "@/lib/db";
import { MemberRole } from "@/lib/db/types";
import {
  createChannelInvite,
  deleteChannelInvite,
  getChannelSettingsAndInvites,
} from "@/lib/channel-invite-store";

type Params = {
  params: Promise<{
    channelId: string;
  }>;
};

const canManageInvites = async (profileId: string, serverId: string) => {
  const isServerOwner = await db.query.server.findFirst({
    where: and(eq(server.id, serverId), eq(server.profileId, profileId)),
    columns: { id: true },
  });

  if (isServerOwner) {
    return true;
  }

  const managingMember = await db.query.member.findFirst({
    where: and(
      eq(member.serverId, serverId),
      eq(member.profileId, profileId),
      inArray(member.role, [MemberRole.ADMIN, MemberRole.MODERATOR])
    ),
    columns: { id: true },
  });

  return Boolean(managingMember);
};

export async function GET(req: Request, { params }: Params) {
  try {
    const { channelId: rawChannelId } = await params;
    const currentUser = await currentProfile();
    if (!currentUser) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const serverId = String(searchParams.get("serverId") ?? "").trim();
    const channelId = String(rawChannelId ?? "").trim();

    if (!serverId || !channelId) {
      return new NextResponse("Server ID and channel ID are required", { status: 400 });
    }

    const membership = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, currentUser.id)),
      columns: { id: true },
    });

    const isOwner = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, currentUser.id)),
      columns: { id: true },
    });

    if (!membership && !isOwner) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const channelRow = await db.execute(sql`
      select "id"
      from "Channel"
      where "id" = ${channelId}
        and "serverId" = ${serverId}
      limit 1
    `);

    const existingChannel = (channelRow as unknown as { rows?: Array<{ id: string }> }).rows?.[0];
    if (!existingChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    const { invites } = await getChannelSettingsAndInvites(channelId, serverId);

    const creatorIds = Array.from(
      new Set(invites.map((item) => item.createdByProfileId).filter((id): id is string => Boolean(id)))
    );

    const creators = await Promise.all(
      creatorIds.map(async (creatorId) => {
        const creatorProfile = await db.query.profile.findFirst({
          where: eq(profile.id, creatorId),
          columns: { id: true, name: true, email: true, imageUrl: true },
        });

        return {
          id: creatorId,
          name: creatorProfile?.name ?? null,
          email: creatorProfile?.email ?? null,
          imageUrl: creatorProfile?.imageUrl ?? null,
        };
      })
    );

    const creatorById = new Map(creators.map((item) => [item.id, item]));

    const enrichedInvites = invites.map((inviteItem) => {
      const creator = inviteItem.createdByProfileId
        ? creatorById.get(inviteItem.createdByProfileId)
        : null;

      return {
        ...inviteItem,
        createdByName: creator?.name ?? null,
        createdByEmail: creator?.email ?? null,
        createdByImageUrl: creator?.imageUrl ?? null,
      };
    });

    return NextResponse.json({
      channelId,
      inviteCount: enrichedInvites.length,
      invites: enrichedInvites,
    });
  } catch (error) {
    console.log("[CHANNEL_INVITES_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { channelId: rawChannelId } = await params;
    const currentUser = await currentProfile();
    if (!currentUser) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      serverId?: string;
      maxUses?: unknown;
      expiresInHours?: unknown;
    };
    const serverId = String(body.serverId ?? "").trim();
    const channelId = String(rawChannelId ?? "").trim();

    if (!serverId || !channelId) {
      return new NextResponse("Server ID and channel ID are required", { status: 400 });
    }

    const canManage = await canManageInvites(currentUser.id, serverId);
    if (!canManage) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const maxUsesInput =
      typeof body.maxUses === "number"
        ? body.maxUses
        : typeof body.maxUses === "string"
          ? Number(body.maxUses.trim())
          : Number.NaN;

    const expiresInHoursInput =
      typeof body.expiresInHours === "number"
        ? body.expiresInHours
        : typeof body.expiresInHours === "string"
          ? Number(body.expiresInHours.trim())
          : Number.NaN;

    const nextInvite = await createChannelInvite({
      channelId,
      serverId,
      createdByProfileId: currentUser.id,
      maxUses: Number.isFinite(maxUsesInput) ? maxUsesInput : null,
      expiresInHours: Number.isFinite(expiresInHoursInput) ? expiresInHoursInput : null,
    });

    return NextResponse.json({ success: true, invite: nextInvite });
  } catch (error) {
    console.log("[CHANNEL_INVITES_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { channelId: rawChannelId } = await params;
    const currentUser = await currentProfile();
    if (!currentUser) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { serverId?: string; code?: string };
    const serverId = String(body.serverId ?? "").trim();
    const channelId = String(rawChannelId ?? "").trim();
    const code = String(body.code ?? "").trim();

    if (!serverId || !channelId || !code) {
      return new NextResponse("Server ID, channel ID and invite code are required", { status: 400 });
    }

    const canManage = await canManageInvites(currentUser.id, serverId);
    if (!canManage) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const deleted = await deleteChannelInvite({
      channelId,
      serverId,
      code,
    });

    if (!deleted) {
      return new NextResponse("Invite not found", { status: 404 });
    }

    return NextResponse.json({ success: true, deletedCode: code });
  } catch (error) {
    console.log("[CHANNEL_INVITES_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
