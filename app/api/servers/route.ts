import { v4 as uuidv4 } from "uuid";
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";

import { appendBannerDebugEvent } from "@/lib/banner-debug";
import { resolveBannerUrl } from "@/lib/asset-url";
import { currentProfile } from "@/lib/current-profile";
import { channel, ChannelType, db, MemberRole, member, server } from "@/lib/db";
import { getServerBannerConfig, setServerBannerConfig } from "@/lib/server-banner-store";
import { appendServerInviteHistory } from "@/lib/server-invite-store";
import { upsertOurBoardEntry } from "@/lib/our-board-store";
import { createServerScheduledEvent } from "@/lib/server-scheduled-events-store";
import {
  ensureRulesChannelForServer,
  ensureStageChannelForServer,
  ensureSystemChannelSchema,
} from "@/lib/system-channels";

export async function POST(req: Request) {
  try {
    const { name, imageUrl, bannerUrl, bannerFit, bannerScale } = await req.json();
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorize", { status: 401 });
    }

    const serverId = uuidv4();
    const inviteCode = uuidv4();
    const now = new Date();

    await ensureSystemChannelSchema();

    await db.transaction(async (tx) => {
      const resolvedImageUrl =
        typeof imageUrl === "string" && imageUrl.trim().length > 0
          ? imageUrl
          : "/in-accord-steampunk-logo.png";

      await tx.insert(server).values({
        id: serverId,
        profileId: profile.id,
        name,
        imageUrl: resolvedImageUrl,
        inviteCode,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(channel).values({
        id: uuidv4(),
        name: "general",
        type: ChannelType.TEXT,
        profileId: profile.id,
        serverId,
        createdAt: now,
        updatedAt: now,
      });

      await tx.execute(sql`
        update "Channel"
        set "isSystem" = true
        where "serverId" = ${serverId}
          and lower(trim(coalesce("name", ''))) = 'general'
      `);

      await tx.execute(sql`
        insert into "Channel" (
          "id",
          "name",
          "type",
          "profileId",
          "serverId",
          "channelGroupId",
          "isSystem",
          "createdAt",
          "updatedAt"
        )
        values (
          ${uuidv4()},
          ${"rules"},
          ${ChannelType.TEXT},
          ${profile.id},
          ${serverId},
          ${null},
          ${true},
          ${now},
          ${now}
        )
      `);

      await tx.execute(sql`
        insert into "Channel" (
          "id",
          "name",
          "type",
          "profileId",
          "serverId",
          "channelGroupId",
          "isSystem",
          "createdAt",
          "updatedAt"
        )
        values (
          ${uuidv4()},
          ${"stage"},
          ${ChannelType.VIDEO},
          ${profile.id},
          ${serverId},
          ${null},
          ${true},
          ${now},
          ${now}
        )
      `);

      await tx.insert(member).values({
        id: uuidv4(),
        profileId: profile.id,
        serverId,
        role: MemberRole.ADMIN,
        createdAt: now,
        updatedAt: now,
      });

      await setServerBannerConfig(serverId, {
        url: bannerUrl,
        fit: bannerFit,
        scale: typeof bannerScale === "number" ? bannerScale : Number(bannerScale),
      });

      await appendServerInviteHistory(serverId, {
        code: inviteCode,
        source: "created",
        createdByProfileId: profile.id,
        createdAt: now.toISOString(),
      });
    });

    const createdServer = await db.query.server.findFirst({
      where: eq(server.id, serverId),
    });

    // Final safety for idempotency/race conditions: ensures exactly one rules channel.
    await ensureRulesChannelForServer(serverId, profile.id);
    await ensureStageChannelForServer(serverId, profile.id);

    const defaultEventStartAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await createServerScheduledEvent({
      serverId,
      title: "Our Events",
      description: "Our Events are ready — schedule and manage activities for your server.",
      startsAt: defaultEventStartAt,
      frequency: "ONCE",
      createdByProfileId: profile.id,
    });

    await upsertOurBoardEntry({
      serverId,
      serverName: String(createdServer?.name ?? name ?? "Untitled Server"),
      imageUrl: String(createdServer?.imageUrl ?? imageUrl ?? "").trim() || "/in-accord-steampunk-logo.png",
      ownerProfileId: profile.id,
      ownerDisplayName: String(profile.name ?? profile.email ?? profile.id),
      ownerEmail: profile.email ?? null,
    });

    const resolvedBanner = await getServerBannerConfig(serverId);
    const resolvedBannerUrl = resolveBannerUrl(resolvedBanner?.url ?? null);

    void appendBannerDebugEvent({
      source: "api/servers",
      stage: "post-create",
      rawValue: resolvedBanner?.url ?? null,
      resolvedValue: resolvedBannerUrl,
      metadata: {
        serverId,
        ownerProfileId: profile.id,
      },
    });

    return NextResponse.json(
      createdServer
        ? {
            ...createdServer,
            bannerUrl: resolvedBannerUrl,
            bannerFit: resolvedBanner?.fit ?? "cover",
            bannerScale: resolvedBanner?.scale ?? 1,
          }
        : createdServer
    )

  } catch (error) {
    console.log("[SERVERS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}