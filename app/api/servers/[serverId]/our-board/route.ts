import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, server } from "@/lib/db";
import { updateOurBoardEntryByServerId, upsertOurBoardEntry } from "@/lib/our-board-store";
import { getServerBannerConfig } from "@/lib/server-banner-store";

export async function GET(_request: Request, { params }: { params: Promise<{ serverId: string }> }) {
  try {
    const { serverId } = await params;
    const normalizedServerId = String(serverId ?? "").trim();

    if (!normalizedServerId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const targetServer = await db.query.server.findFirst({
      where: eq(server.id, normalizedServerId),
    });

    if (!targetServer) {
      return new NextResponse("Server not found", { status: 404 });
    }

    const isServerOwner = String(targetServer.profileId ?? "").trim() === profile.id;
    if (!isServerOwner) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const ownerResult = await db.execute(sql`
      select
        coalesce(nullif(trim(u."name"), ''), nullif(trim(u."email"), ''), ${targetServer.profileId}) as "ownerDisplayName",
        u."email" as "ownerEmail"
      from "Users" u
      where u."userId" = ${targetServer.profileId}
      limit 1
    `);

    const ownerRow = (ownerResult as unknown as {
      rows?: Array<{ ownerDisplayName: string | null; ownerEmail: string | null }>;
    }).rows?.[0];

    const serverBanner = await getServerBannerConfig(targetServer.id);

    const ensuredEntry = await upsertOurBoardEntry({
      serverId: targetServer.id,
      serverName: String(targetServer.name ?? "Untitled Server"),
      imageUrl: String(targetServer.imageUrl ?? "").trim() || null,
      bannerUrl: serverBanner?.url ?? null,
      ownerProfileId: String(targetServer.profileId ?? "").trim(),
      ownerDisplayName: String(ownerRow?.ownerDisplayName ?? targetServer.profileId ?? "Unknown Owner"),
      ownerEmail: ownerRow?.ownerEmail ?? null,
    });

    const channelRows = await db
      .select({ id: channel.id, name: channel.name, type: channel.type })
      .from(channel)
      .where(eq(channel.serverId, normalizedServerId));

    const channels = channelRows
      .map((item) => ({
        id: String(item.id ?? "").trim(),
        name: String(item.name ?? "").trim(),
        type: String(item.type ?? "").trim(),
      }))
      .filter((item) => item.id.length > 0 && item.name.length > 0)
      .sort((left, right) => left.name.localeCompare(right.name));

    return NextResponse.json({ entry: ensuredEntry, channels });
  } catch (error) {
    console.error("[SERVER_OUR_BOARD_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ serverId: string }> }) {
  try {
    const { serverId } = await params;
    const normalizedServerId = String(serverId ?? "").trim();

    if (!normalizedServerId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const targetServer = await db.query.server.findFirst({
      where: eq(server.id, normalizedServerId),
    });

    if (!targetServer) {
      return new NextResponse("Server not found", { status: 404 });
    }

    const isServerOwner = String(targetServer.profileId ?? "").trim() === profile.id;
    if (!isServerOwner) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      listed?: boolean;
      description?: string;
      tags?: unknown;
      bumpChannelId?: string | null;
    };

    const ownerResult = await db.execute(sql`
      select
        coalesce(nullif(trim(u."name"), ''), nullif(trim(u."email"), ''), ${targetServer.profileId}) as "ownerDisplayName",
        u."email" as "ownerEmail"
      from "Users" u
      where u."userId" = ${targetServer.profileId}
      limit 1
    `);

    const ownerRow = (ownerResult as unknown as {
      rows?: Array<{ ownerDisplayName: string | null; ownerEmail: string | null }>;
    }).rows?.[0];

    const serverBanner = await getServerBannerConfig(targetServer.id);

    await upsertOurBoardEntry({
      serverId: targetServer.id,
      serverName: String(targetServer.name ?? "Untitled Server"),
      imageUrl: String(targetServer.imageUrl ?? "").trim() || null,
      bannerUrl: serverBanner?.url ?? null,
      ownerProfileId: String(targetServer.profileId ?? "").trim(),
      ownerDisplayName: String(ownerRow?.ownerDisplayName ?? targetServer.profileId ?? "Unknown Owner"),
      ownerEmail: ownerRow?.ownerEmail ?? null,
    });

    const bumpChannelIdRaw = String(body.bumpChannelId ?? "").trim();
    const bumpChannelId = bumpChannelIdRaw.length > 0 ? bumpChannelIdRaw : null;

    if (bumpChannelId) {
      const channelExists = await db.query.channel.findFirst({
        where: and(eq(channel.id, bumpChannelId), eq(channel.serverId, normalizedServerId)),
      });

      if (!channelExists) {
        return new NextResponse("Selected bump channel is invalid.", { status: 400 });
      }
    }

    const updated = await updateOurBoardEntryByServerId({
      serverId: normalizedServerId,
      patch: {
        listed: typeof body.listed === "boolean" ? body.listed : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        tags: Array.isArray(body.tags) ? body.tags : undefined,
        bannerUrl: serverBanner?.url ?? null,
        bumpChannelId,
      },
    });

    return NextResponse.json({ entry: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update In-Aboard.";
    if (message === "Forbidden") {
      return new NextResponse("Forbidden", { status: 403 });
    }

    console.error("[SERVER_OUR_BOARD_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
