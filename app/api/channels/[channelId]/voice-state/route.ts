import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, ChannelType, db, member } from "@/lib/db";
import { computeChannelPermissionForMember, resolveMemberContext } from "@/lib/channel-permissions";
import {
  clearVoiceState,
  ensureVoiceStateSchema,
  getMemberVoiceState,
  listActiveVoiceMembersForChannel,
  pruneStaleVoiceStates,
  upsertVoiceState,
} from "@/lib/voice-states";

const resolveServerId = (req: Request) => {
  const { searchParams } = new URL(req.url);
  return searchParams.get("serverId")?.trim() ?? "";
};

const normalizeStreamLabel = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().slice(0, 255);
  return normalized.length ? normalized : null;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { channelId } = await params;
    const serverId = resolveServerId(req);

    if (!channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const currentMember = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
    });

    if (!currentMember) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const currentChannel = await db.query.channel.findFirst({
      where: and(eq(channel.id, channelId), eq(channel.serverId, serverId)),
    });

    if (!currentChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    await ensureVoiceStateSchema();
    await pruneStaleVoiceStates();

    const memberContext = await resolveMemberContext({
      profileId: profile.id,
      serverId,
    });

    if (!memberContext) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const permissions = await computeChannelPermissionForMember({
      serverId,
      channelId,
      memberContext,
    });

    if (!permissions.allowView) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const activeMembers = await listActiveVoiceMembersForChannel({
      serverId,
      channelId,
    });

    const ownVoiceState = await getMemberVoiceState({
      serverId,
      memberId: currentMember.id,
    });

    return NextResponse.json({
      channelType: currentChannel.type,
      connectedMembers: activeMembers,
      currentMemberChannelId: ownVoiceState?.channelId ?? null,
      connected: ownVoiceState?.channelId === channelId,
    });
  } catch (error) {
    console.error("[VOICE_STATE_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { channelId } = await params;
    const serverId = resolveServerId(req);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    if (!channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const currentMember = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
    });

    if (!currentMember) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const currentChannel = await db.query.channel.findFirst({
      where: and(eq(channel.id, channelId), eq(channel.serverId, serverId)),
    });

    if (!currentChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    if (currentChannel.type !== ChannelType.AUDIO && currentChannel.type !== ChannelType.VIDEO) {
      return new NextResponse("Voice state is only available on audio/video channels", { status: 400 });
    }

    const memberContext = await resolveMemberContext({
      profileId: profile.id,
      serverId,
    });

    if (!memberContext) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const permissions = await computeChannelPermissionForMember({
      serverId,
      channelId,
      memberContext,
    });

    if (!permissions.allowConnect) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    await ensureVoiceStateSchema();

    await upsertVoiceState({
      serverId,
      channelId,
      memberId: currentMember.id,
      isMuted: Boolean(body?.isMuted),
      isDeafened: Boolean(body?.isDeafened),
      isCameraOn: Boolean(body?.isCameraOn),
      isStreaming: Boolean(body?.isStreaming),
      streamLabel: normalizeStreamLabel(body?.streamLabel),
      isSpeaking: Boolean(body?.isSpeaking),
    });
    await pruneStaleVoiceStates();

    // Voice join notifications are intentionally disabled to prevent channel spam.

    return NextResponse.json({
      ok: true,
      channelId,
      serverId,
      memberId: currentMember.id,
    });
  } catch (error) {
    console.error("[VOICE_STATE_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { channelId } = await params;
    const serverId = resolveServerId(req);

    if (!channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const currentMember = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
    });

    if (!currentMember) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const currentChannel = await db.query.channel.findFirst({
      where: and(eq(channel.id, channelId), eq(channel.serverId, serverId)),
    });

    if (!currentChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const targetMemberId = String(searchParams.get("targetMemberId") ?? "").trim();

    await ensureVoiceStateSchema();

    if (targetMemberId && targetMemberId !== currentMember.id) {
      if (currentChannel.profileId !== profile.id) {
        return new NextResponse("Forbidden", { status: 403 });
      }

      await clearVoiceState({
        serverId,
        memberId: targetMemberId,
      });
    } else {
      await clearVoiceState({
        serverId,
        memberId: currentMember.id,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[VOICE_STATE_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { channelId } = await params;
    const serverId = resolveServerId(req);

    if (!channelId) {
      return new NextResponse("Channel ID missing", { status: 400 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const targetMemberId = String(body?.targetMemberId ?? "").trim();
    const action = String(body?.action ?? "").trim().toLowerCase();

    if (!targetMemberId) {
      return new NextResponse("targetMemberId is required", { status: 400 });
    }

    if (!["mute", "unmute", "kick", "hidevideo", "showvideo", "hidestream", "showstream"].includes(action)) {
      return new NextResponse("Invalid action", { status: 400 });
    }

    const currentMember = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
    });

    if (!currentMember) {
      return new NextResponse("Member not found", { status: 404 });
    }

    const currentChannel = await db.query.channel.findFirst({
      where: and(eq(channel.id, channelId), eq(channel.serverId, serverId)),
    });

    if (!currentChannel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    if (currentChannel.profileId !== profile.id) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    if (action === "kick") {
      await clearVoiceState({
        serverId,
        memberId: targetMemberId,
      });

      return NextResponse.json({ ok: true, action });
    }

    const targetVoiceState = await getMemberVoiceState({
      serverId,
      memberId: targetMemberId,
    });

    if (!targetVoiceState) {
      return new NextResponse("Target member is not connected", { status: 404 });
    }

    await upsertVoiceState({
      serverId,
      channelId: targetVoiceState.channelId,
      memberId: targetMemberId,
      isMuted: action === "mute" ? true : action === "unmute" ? false : targetVoiceState.isMuted,
      isDeafened: targetVoiceState.isDeafened,
      isCameraOn: action === "hidevideo" ? false : action === "showvideo" ? true : targetVoiceState.isCameraOn,
      isStreaming: action === "hidestream" ? false : action === "showstream" ? true : targetVoiceState.isStreaming,
      streamLabel: action === "hidestream" ? null : targetVoiceState.streamLabel,
      isSpeaking: action === "mute" ? false : targetVoiceState.isSpeaking,
    });

    return NextResponse.json({ ok: true, action });
  } catch (error) {
    console.error("[VOICE_STATE_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
