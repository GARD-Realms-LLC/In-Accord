import { v4 as uuidv4 } from "uuid";
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, ChannelType, db, MemberRole, member, server } from "@/lib/db";
import { getServerBannerConfig, setServerBannerConfig } from "@/lib/server-banner-store";
import { appendServerInviteHistory } from "@/lib/server-invite-store";
import { ensureRulesChannelForServer, ensureSystemChannelSchema } from "@/lib/system-channels";
import { ensureDefaultMediaChannelGroups } from "@/lib/channel-groups";

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

    await ensureDefaultMediaChannelGroups({
      serverId,
      profileId: profile.id,
    });

    const createdServer = await db.query.server.findFirst({
      where: eq(server.id, serverId),
    });

    // Final safety for idempotency/race conditions: ensures exactly one rules channel.
    await ensureRulesChannelForServer(serverId, profile.id);

    const resolvedBanner = await getServerBannerConfig(serverId);

    return NextResponse.json(
      createdServer
        ? {
            ...createdServer,
            bannerUrl: resolvedBanner?.url ?? null,
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