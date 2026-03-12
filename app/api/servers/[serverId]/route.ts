import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, server } from "@/lib/db";
import { emitInAccordSystemEvent } from "@/lib/in-accord-event-system";
import { getServerBannerConfig, setServerBannerConfig } from "@/lib/server-banner-store";
import { getServerProfileSettings, setServerProfileSettings } from "@/lib/server-profile-settings-store";
import { isInAccordProtectedServer } from "@/lib/server-security";

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

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const target = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
    });

    if (!target) {
      return new NextResponse("Server not found", { status: 404 });
    }

    const resolvedBanner = await getServerBannerConfig(serverId);
    const profileSettings = await getServerProfileSettings(serverId);

    return NextResponse.json({
      ...target,
      bannerUrl: resolvedBanner?.url ?? null,
      bannerFit: resolvedBanner?.fit ?? "cover",
      bannerScale: resolvedBanner?.scale ?? 1,
      description: profileSettings.description,
      traits: profileSettings.traits,
      gamesPlayed: profileSettings.gamesPlayed,
      bannerColor: profileSettings.bannerColor,
      inviteMode: profileSettings.inviteMode,
    });
  } catch (error) {
    console.log("[SERVER_ID_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;

    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const target = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
    });

    if (!target) {
      return new NextResponse("Server not found", { status: 404 });
    }

    if (isInAccordProtectedServer({ serverId: target.id, serverName: target.name })) {
      return new NextResponse("In-Accord server is protected and cannot be deleted.", { status: 403 });
    }

    await db.delete(server).where(
      and(eq(server.id, serverId), eq(server.profileId, profile.id))
    );

    void emitInAccordSystemEvent({
      eventType: "SERVER_SETTINGS_DELETED",
      scope: "server-settings",
      actorProfileId: profile.id,
      actorUserId: (profile as { userId?: string }).userId ?? null,
      serverId,
      targetId: serverId,
      metadata: {
        serverName: target.name,
      },
    }).catch((eventError) => {
      console.warn("[SERVER_ID_DELETE_EVENT]", eventError);
    });

    return NextResponse.json(target);
  } catch (error) {
    console.log("[SERVER_ID_DELETE]", error);
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
    const {
      name,
      imageUrl,
      bannerUrl,
      bannerFit,
      bannerScale,
      description,
      traits,
      gamesPlayed,
      bannerColor,
      inviteMode,
    } = await req.json();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const target = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
    });

    if (!target) {
      return new NextResponse("Server not found", { status: 404 });
    }

    if (
      isInAccordProtectedServer({ serverId: target.id, serverName: target.name }) &&
      String(name ?? "").trim() !== String(target.name ?? "").trim()
    ) {
      return new NextResponse("In-Accord server name is protected and cannot be renamed.", { status: 403 });
    }

    await db.update(server).set({
        name,
        imageUrl,
        updatedAt: new Date(),
      }).where(and(eq(server.id, serverId), eq(server.profileId, profile.id)));

    await setServerBannerConfig(serverId, {
      url: bannerUrl,
      fit: bannerFit,
      scale: typeof bannerScale === "number" ? bannerScale : Number(bannerScale),
    });

    const resolvedProfileSettings = await setServerProfileSettings(serverId, {
      description: typeof description === "string" ? description : null,
      traits: Array.isArray(traits) ? traits : [],
      gamesPlayed: Array.isArray(gamesPlayed) ? gamesPlayed : [],
      bannerColor: typeof bannerColor === "string" ? bannerColor : null,
      inviteMode: typeof inviteMode === "string" ? inviteMode : "normal",
    });

    const updatedServer = await db.query.server.findFirst({
      where: and(eq(server.id, serverId), eq(server.profileId, profile.id)),
    });

    const resolvedBanner = await getServerBannerConfig(serverId);

    void emitInAccordSystemEvent({
      eventType: "SERVER_SETTINGS_UPDATED",
      scope: "server-settings",
      actorProfileId: profile.id,
      actorUserId: (profile as { userId?: string }).userId ?? null,
      serverId,
      targetId: serverId,
      metadata: {
        name,
        imageUrl,
        bannerUrl,
        bannerFit,
        bannerScale,
        description: resolvedProfileSettings.description,
        traits: resolvedProfileSettings.traits,
        gamesPlayed: resolvedProfileSettings.gamesPlayed,
        bannerColor: resolvedProfileSettings.bannerColor,
        inviteMode: resolvedProfileSettings.inviteMode,
      },
    }).catch((eventError) => {
      console.warn("[SERVER_ID_PATCH_EVENT]", eventError);
    });

    return NextResponse.json(
      updatedServer
        ? {
            ...updatedServer,
            bannerUrl: resolvedBanner?.url ?? null,
            bannerFit: resolvedBanner?.fit ?? "cover",
            bannerScale: resolvedBanner?.scale ?? 1,
            description: resolvedProfileSettings.description,
            traits: resolvedProfileSettings.traits,
            gamesPlayed: resolvedProfileSettings.gamesPlayed,
            bannerColor: resolvedProfileSettings.bannerColor,
            inviteMode: resolvedProfileSettings.inviteMode,
          }
        : updatedServer
    );
  } catch (error) {
    console.log("[SERVER_ID_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
