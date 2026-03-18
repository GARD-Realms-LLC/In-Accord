import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, db } from "@/lib/db";
import {
  createDefaultServerCountingState,
  getServerCountingSnapshot,
  normalizeServerCountingSettings,
  saveServerCountingSnapshot,
} from "@/lib/server-counting";
import { getServerManagementAccess } from "@/lib/server-management-access";

type Params = {
  params: Promise<{
    serverId: string;
  }>;
};

export async function GET(_req: Request, { params }: Params) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId: rawServerId } = await params;
    const serverId = String(rawServerId ?? "").trim();

    if (!serverId) {
      return new NextResponse("Server ID is required", { status: 400 });
    }

    const access = await getServerManagementAccess({
      serverId,
      profileId: profile.id,
      profileRole: profile.role,
    });

    if (!access.target) {
      return new NextResponse("Server not found", { status: 404 });
    }

    if (!access.canView) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const snapshot = await getServerCountingSnapshot({ serverId });
    const countingChannels = await db.query.channel.findMany({
      where: and(eq(channel.serverId, serverId), eq(channel.type, "TEXT" as typeof channel.$inferSelect.type)),
      columns: {
        id: true,
        name: true,
        type: true,
      },
      orderBy: (channels, { asc }) => [asc(channels.name), asc(channels.createdAt)],
    });

    return NextResponse.json({
      canManageCounting: access.canManage,
      settings: snapshot.countingSettings,
      state: snapshot.countingState,
      channels: countingChannels,
    });
  } catch (error) {
    console.error("[SERVER_COUNTING_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serverId: rawServerId } = await params;
    const serverId = String(rawServerId ?? "").trim();
    const body = (await req.json().catch(() => null)) as
      | {
          settings?: unknown;
          resetProgress?: boolean;
        }
      | null;

    if (!serverId) {
      return new NextResponse("Server ID is required", { status: 400 });
    }

    const access = await getServerManagementAccess({
      serverId,
      profileId: profile.id,
      profileRole: profile.role,
    });

    if (!access.target) {
      return new NextResponse("Server not found", { status: 404 });
    }

    if (!access.canManage) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const snapshot = await getServerCountingSnapshot({ serverId });
    const nextSettings = normalizeServerCountingSettings(body?.settings);
    const normalizedChannelId = nextSettings.channelId;

    if (nextSettings.enabled && !normalizedChannelId) {
      return new NextResponse("Choose a counting channel before enabling counting.", { status: 400 });
    }

    if (normalizedChannelId) {
      const channelRow = await db.execute(sql`
        select "id"
        from "Channel"
        where "id" = ${normalizedChannelId}
          and "serverId" = ${serverId}
          and "type" = 'TEXT'
        limit 1
      `);

      const matchedChannel = (channelRow as unknown as { rows?: Array<{ id: string }> }).rows?.[0];
      if (!matchedChannel) {
        return new NextResponse("Selected counting channel must be a text channel in this server.", { status: 400 });
      }
    }

    const resetRequired =
      body?.resetProgress === true ||
      snapshot.countingSettings.enabled !== nextSettings.enabled ||
      snapshot.countingSettings.channelId !== nextSettings.channelId ||
      snapshot.countingSettings.startingNumber !== nextSettings.startingNumber ||
      snapshot.countingSettings.preventConsecutiveTurns !== nextSettings.preventConsecutiveTurns;

    const nextState = resetRequired
      ? createDefaultServerCountingState(nextSettings)
      : snapshot.countingState;

    await saveServerCountingSnapshot({
      serverId,
      parsedSettings: snapshot.parsedSettings,
      countingSettings: nextSettings,
      countingState: nextState,
    });

    const countingChannels = await db.query.channel.findMany({
      where: and(eq(channel.serverId, serverId), eq(channel.type, "TEXT" as typeof channel.$inferSelect.type)),
      columns: {
        id: true,
        name: true,
        type: true,
      },
      orderBy: (channels, { asc }) => [asc(channels.name), asc(channels.createdAt)],
    });

    return NextResponse.json({
      ok: true,
      settings: nextSettings,
      state: nextState,
      channels: countingChannels,
    });
  } catch (error) {
    console.error("[SERVER_COUNTING_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}