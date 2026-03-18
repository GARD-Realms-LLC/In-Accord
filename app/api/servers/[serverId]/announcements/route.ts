import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { ensureAnnouncementChannelSchema } from "@/lib/announcement-channels";
import { currentProfile } from "@/lib/current-profile";
import { channel, ChannelType, db, member, MemberRole, server } from "@/lib/db";
import {
  ensureServerAnnouncementSettingsSchema,
  getServerAnnouncementSettings,
  setServerAnnouncementSettings,
} from "@/lib/server-announcement-settings";

type AnnouncementRouteBody = {
  communityEnabled?: unknown;
  announcementChannelId?: unknown;
  guidelines?: unknown;
  createAnnouncementChannel?: unknown;
};

const normalizeAnnouncementChannelId = (value: unknown) => {
  if (value === null) {
    return null;
  }

  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
};

const buildUniqueAnnouncementName = async (serverId: string) => {
  const channels = await db.query.channel.findMany({
    where: eq(channel.serverId, serverId),
    columns: { name: true },
  });

  const usedNames = new Set(
    channels.map((item) => String(item.name ?? "").trim().toLowerCase()).filter(Boolean)
  );

  let candidate = "announcements";
  let suffix = 2;

  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `announcements-${suffix}`;
    suffix += 1;
  }

  return candidate;
};

const getAnnouncementChannels = async (serverId: string) => {
  const channels = await db.query.channel.findMany({
    where: and(eq(channel.serverId, serverId), eq(channel.type, ChannelType.ANNOUNCEMENT)),
    columns: {
      id: true,
      name: true,
      type: true,
      createdAt: true,
    },
    orderBy: (channelTable, { asc }) => [asc(channelTable.createdAt)],
  });

  return channels.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
  }));
};

const getManagerContext = async (serverId: string, profileId: string) => {
  const ownerServer = await db.query.server.findFirst({
    where: and(eq(server.id, serverId), eq(server.profileId, profileId)),
    columns: { id: true },
  });

  const requesterMembership = await db.query.member.findFirst({
    where: and(eq(member.serverId, serverId), eq(member.profileId, profileId)),
    columns: { id: true, role: true },
  });

  const canManage =
    Boolean(ownerServer) ||
    requesterMembership?.role === MemberRole.ADMIN ||
    requesterMembership?.role === MemberRole.MODERATOR;

  return {
    ownerServer,
    requesterMembership,
    canManage,
  };
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const normalizedServerId = String(serverId ?? "").trim();
    if (!normalizedServerId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    await ensureAnnouncementChannelSchema();
    await ensureServerAnnouncementSettingsSchema();

    const { requesterMembership, canManage } = await getManagerContext(normalizedServerId, profile.id);

    if (!requesterMembership) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const settings = await getServerAnnouncementSettings(normalizedServerId);
    const channels = await getAnnouncementChannels(normalizedServerId);

    return NextResponse.json({
      canManage,
      settings,
      channels,
    });
  } catch (error) {
    console.log("[SERVERS_SERVER_ID_ANNOUNCEMENTS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const normalizedServerId = String(serverId ?? "").trim();
    if (!normalizedServerId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    await ensureAnnouncementChannelSchema();
    await ensureServerAnnouncementSettingsSchema();

    const { canManage } = await getManagerContext(normalizedServerId, profile.id);
    if (!canManage) {
      return new NextResponse("Only moderators or server managers can update announcements.", { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as AnnouncementRouteBody;
    const shouldCreateAnnouncementChannel = body.createAnnouncementChannel === true;

    let channels = await getAnnouncementChannels(normalizedServerId);
    let requestedAnnouncementChannelId = normalizeAnnouncementChannelId(body.announcementChannelId);

    if (shouldCreateAnnouncementChannel) {
      const channelName = await buildUniqueAnnouncementName(normalizedServerId);
      const now = new Date();
      const createdChannelId = uuidv4();

      await db.insert(channel).values({
        id: createdChannelId,
        name: channelName,
        type: ChannelType.ANNOUNCEMENT,
        profileId: profile.id,
        serverId: normalizedServerId,
        createdAt: now,
        updatedAt: now,
      });

      channels = await getAnnouncementChannels(normalizedServerId);
      if (!requestedAnnouncementChannelId) {
        requestedAnnouncementChannelId = createdChannelId;
      }
    }

    const validAnnouncementChannelIds = new Set(channels.map((item) => item.id));
    if (requestedAnnouncementChannelId && !validAnnouncementChannelIds.has(requestedAnnouncementChannelId)) {
      return new NextResponse("Announcement channel not found in this server.", { status: 404 });
    }

    const nextSettings = await setServerAnnouncementSettings(normalizedServerId, {
      communityEnabled: body.communityEnabled === true,
      announcementChannelId: requestedAnnouncementChannelId,
      guidelines: typeof body.guidelines === "string" ? body.guidelines : undefined,
    });

    return NextResponse.json({
      canManage: true,
      settings: nextSettings,
      channels,
    });
  } catch (error) {
    console.log("[SERVERS_SERVER_ID_ANNOUNCEMENTS_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
