import { v4 as uuidv4 } from "uuid";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, ChannelType, db, MemberRole, member, server } from "@/lib/db";
import { getServerBannerConfig, setServerBannerConfig } from "@/lib/server-banner-store";

export async function POST(req: Request) {
  try {
    const { name, imageUrl, bannerUrl, bannerFit, bannerScale } = await req.json();
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorize", { status: 401 });
    }

    const serverId = uuidv4();
    const now = new Date();

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
        inviteCode: uuidv4(),
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
    });

    const createdServer = await db.query.server.findFirst({
      where: eq(server.id, serverId),
    });

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