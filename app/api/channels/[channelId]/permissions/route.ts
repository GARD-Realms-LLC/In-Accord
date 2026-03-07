import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, member } from "@/lib/db";
import { MemberRole } from "@/lib/db/types";
import {
  channelRolePermissionMatrix,
  resolveMemberContext,
  upsertChannelRolePermissions,
} from "@/lib/channel-permissions";

type Params = {
  params: Promise<{
    channelId: string;
  }>;
};

export async function GET(req: Request, { params }: Params) {
  try {
    const { channelId: rawChannelId } = await params;

    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const serverId = String(searchParams.get("serverId") ?? "").trim();
    const channelId = String(rawChannelId ?? "").trim();

    if (!serverId || !channelId) {
      return new NextResponse("Server ID and channel ID are required", { status: 400 });
    }

    const currentMember = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
      columns: { id: true },
    });

    if (!currentMember) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const existingChannel = await db.query.channel.findFirst({
      where: and(eq(channel.id, channelId), eq(channel.serverId, serverId)),
      columns: { id: true },
    });

    if (!existingChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    const permissions = await channelRolePermissionMatrix({ serverId, channelId });
    return NextResponse.json({ permissions });
  } catch (error) {
    console.error("[CHANNEL_PERMISSIONS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { channelId: rawChannelId } = await params;

    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as
      | {
          serverId?: string;
          permissions?: Partial<
            Record<
              MemberRole,
              Partial<{ allowView: boolean; allowSend: boolean; allowConnect: boolean }>
            >
          >;
        }
      | null;

    const serverId = String(body?.serverId ?? "").trim();
    const channelId = String(rawChannelId ?? "").trim();

    if (!serverId || !channelId) {
      return new NextResponse("Server ID and channel ID are required", { status: 400 });
    }

    const existingChannel = await db.query.channel.findFirst({
      where: and(eq(channel.id, channelId), eq(channel.serverId, serverId)),
      columns: { id: true },
    });

    if (!existingChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    const context = await resolveMemberContext({ profileId: profile.id, serverId });
    if (!context) {
      return new NextResponse("Member not found", { status: 404 });
    }

    if (!context.isServerOwner && context.role === MemberRole.GUEST) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const normalized: Record<MemberRole, { allowView: boolean; allowSend: boolean; allowConnect: boolean }> = {
      [MemberRole.ADMIN]: {
        allowView: body?.permissions?.ADMIN?.allowView ?? true,
        allowSend: body?.permissions?.ADMIN?.allowSend ?? true,
        allowConnect: body?.permissions?.ADMIN?.allowConnect ?? true,
      },
      [MemberRole.MODERATOR]: {
        allowView: body?.permissions?.MODERATOR?.allowView ?? true,
        allowSend: body?.permissions?.MODERATOR?.allowSend ?? true,
        allowConnect: body?.permissions?.MODERATOR?.allowConnect ?? true,
      },
      [MemberRole.GUEST]: {
        allowView: body?.permissions?.GUEST?.allowView ?? true,
        allowSend: body?.permissions?.GUEST?.allowSend ?? true,
        allowConnect: body?.permissions?.GUEST?.allowConnect ?? true,
      },
    };

    await upsertChannelRolePermissions({
      serverId,
      channelId,
      permissions: normalized,
    });

    return NextResponse.json({ ok: true, permissions: normalized });
  } catch (error) {
    console.error("[CHANNEL_PERMISSIONS_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
