import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { currentProfile } from "@/lib/current-profile";
import { channel, ChannelType, db, member, message } from "@/lib/db";
import { computeChannelPermissionForRole, resolveMemberContext } from "@/lib/channel-permissions";
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

const resolveDisplayName = (profile: Awaited<ReturnType<typeof currentProfile>>) => {
  const profileName = typeof profile?.profileName === "string" ? profile.profileName.trim() : "";
  const realName = typeof profile?.realName === "string" ? profile.realName.trim() : "";
  const fallbackName = typeof profile?.name === "string" ? profile.name.trim() : "";
  const email = typeof profile?.email === "string" ? profile.email.trim() : "";

  return profileName || realName || fallbackName || email || "Someone";
};

const postVoiceJoinNotification = async ({
  req,
  serverId,
  voiceChannelId,
  voiceChannelName,
  actorMemberId,
  actorDisplayName,
}: {
  req: Request;
  serverId: string;
  voiceChannelId: string;
  voiceChannelName: string;
  actorMemberId: string;
  actorDisplayName: string;
}) => {
  const defaultChannelResult = await db.execute(sql`
      select c."id" as "id"
      from "Channel" c
      where c."serverId" = ${serverId}
        and c."type" = ${ChannelType.TEXT}
      order by
        case
          when lower(trim(coalesce(c."name", ''))) = 'general' then 0
          when coalesce(c."isSystem", false) = true then 1
          else 2
        end asc,
        c."sortOrder" asc nulls last,
        c."createdAt" asc,
        c."id" asc
      limit 1
    `);

  const defaultChannelId =
    (defaultChannelResult as unknown as { rows?: Array<{ id: string }> }).rows?.[0]?.id ?? null;

  if (!defaultChannelId) {
    return;
  }

  const safeVoiceChannelName = String(voiceChannelName ?? "Voice").trim() || "Voice";
  const safeActorName = String(actorDisplayName ?? "Someone").trim() || "Someone";

  const content = `🔊 ${safeActorName} joined voice channel "${safeVoiceChannelName}". [[JOIN_CHANNEL:${serverId}:${voiceChannelId}]]`;
  const now = new Date();

  await db.insert(message).values({
    id: uuidv4(),
    content,
    fileUrl: null,
    memberId: actorMemberId,
    channelId: defaultChannelId,
    threadId: null,
    deleted: false,
    createdAt: now,
    updatedAt: now,
  });
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

    const permissions = await computeChannelPermissionForRole({
      serverId,
      channelId,
      role: currentMember.role,
      isServerOwner: memberContext?.isServerOwner ?? false,
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

    const permissions = await computeChannelPermissionForRole({
      serverId,
      channelId,
      role: currentMember.role,
      isServerOwner: memberContext?.isServerOwner ?? false,
    });

    if (!permissions.allowConnect) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    await ensureVoiceStateSchema();

    const previousVoiceState = await getMemberVoiceState({
      serverId,
      memberId: currentMember.id,
    });

    await upsertVoiceState({
      serverId,
      channelId,
      memberId: currentMember.id,
      isMuted: Boolean(body?.isMuted),
      isDeafened: Boolean(body?.isDeafened),
      isCameraOn: Boolean(body?.isCameraOn),
      isSpeaking: Boolean(body?.isSpeaking),
    });
    await pruneStaleVoiceStates();

    const didJoinOrSwitch = !previousVoiceState || previousVoiceState.channelId !== channelId;

    if (didJoinOrSwitch) {
      await postVoiceJoinNotification({
        req,
        serverId,
        voiceChannelId: channelId,
        voiceChannelName: currentChannel.name,
        actorMemberId: currentMember.id,
        actorDisplayName: resolveDisplayName(profile),
      }).catch((notificationError) => {
        console.error("[VOICE_STATE_POST_NOTIFICATION]", notificationError);
      });
    }

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

    await ensureVoiceStateSchema();
    await clearVoiceState({
      serverId,
      memberId: currentMember.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[VOICE_STATE_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
