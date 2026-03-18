import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { appendBannerDebugEvent } from "@/lib/banner-debug";
import { resolveBannerUrl } from "@/lib/asset-url";
import { currentProfile } from "@/lib/current-profile";
import { db, server } from "@/lib/db";
import { emitInAccordSystemEvent } from "@/lib/in-accord-event-system";
import { normalizeOptionalCloudflareObjectPointer } from "@/lib/live-db-asset-pointers";
import { getServerBannerConfig, setServerBannerConfig } from "@/lib/server-banner-store";
import { getServerManagementAccess } from "@/lib/server-management-access";
import { removeServerFromAllProfileServerTabs } from "@/lib/profile-server-tabs";
import { getServerProfileSettings, setServerProfileSettings } from "@/lib/server-profile-settings-store";
import { removeServerFromServerRailFolders } from "@/lib/server-rail-layout";
import { hardDeleteServerScopedData } from "@/lib/server-hard-delete";
import { isInAccordProtectedServer } from "@/lib/server-security";
import { upsertOurBoardEntry } from "@/lib/our-board-store";

const normalizeUnchangedLegacyAsset = ({
  incomingValue,
  currentRawValue,
  currentResolvedValue,
}: {
  incomingValue: unknown;
  currentRawValue?: string | null;
  currentResolvedValue?: string | null;
}) => {
  const incoming = String(incomingValue ?? "").trim();
  if (!incoming) {
    return null;
  }

  const currentRaw = String(currentRawValue ?? "").trim();
  const currentResolved = String(currentResolvedValue ?? "").trim();

  if (incoming === currentRaw || incoming === currentResolved) {
    return currentRaw || currentResolved || null;
  }

  return null;
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

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const access = await getServerManagementAccess({ serverId, profileId: profile.id, profileRole: profile.role });
    const target = access.target;

    if (!target) {
      return new NextResponse("Server not found", { status: 404 });
    }

    if (!access.canView) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const resolvedBanner = await getServerBannerConfig(serverId);
    const profileSettings = await getServerProfileSettings(serverId);
    const resolvedBannerUrl = resolveBannerUrl(resolvedBanner?.url ?? null);

    void appendBannerDebugEvent({
      source: "api/servers/[serverId]",
      stage: "get",
      rawValue: resolvedBanner?.url ?? null,
      resolvedValue: resolvedBannerUrl,
      metadata: {
        serverId,
        profileId: profile.id,
      },
    });

    return NextResponse.json({
      ...target,
      bannerUrl: resolvedBannerUrl,
      bannerFit: resolvedBanner?.fit ?? "cover",
      bannerScale: resolvedBanner?.scale ?? 1,
      description: profileSettings.description,
      traits: profileSettings.traits,
      gamesPlayed: profileSettings.gamesPlayed,
      bannerColor: profileSettings.bannerColor,
      inviteMode: profileSettings.inviteMode,
      showChannelGroups: profileSettings.showChannelGroups,
      hideAllChannels: profileSettings.hideAllChannels,
      hiddenChannelIds: profileSettings.hiddenChannelIds,
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

    const access = await getServerManagementAccess({ serverId, profileId: profile.id, profileRole: profile.role });
    const target = access.target;

    if (!target) {
      return new NextResponse("Server not found", { status: 404 });
    }

    if (!access.canManage) {
      return new NextResponse("Only the server owner or an In-Accord administrator can delete this server.", { status: 403 });
    }

    if (isInAccordProtectedServer({ serverId: target.id, serverName: target.name })) {
      return new NextResponse("In-Accord server is protected and cannot be deleted.", { status: 403 });
    }

    await removeServerFromAllProfileServerTabs(serverId);
    await removeServerFromServerRailFolders(serverId);
    await hardDeleteServerScopedData(serverId);

    await db.delete(server).where(eq(server.id, serverId));

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
      showChannelGroups,
      hideAllChannels,
      hiddenChannelIds,
    } = await req.json();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!serverId) {
      return new NextResponse("Server ID missing", { status: 400 });
    }

    const access = await getServerManagementAccess({ serverId, profileId: profile.id, profileRole: profile.role });
    const target = access.target;

    if (!target) {
      return new NextResponse("Server not found", { status: 404 });
    }

    if (!access.canManage) {
      return new NextResponse("Only the server owner or an In-Accord administrator can update server settings.", { status: 403 });
    }

    if (
      isInAccordProtectedServer({ serverId: target.id, serverName: target.name }) &&
      String(name ?? "").trim() !== String(target.name ?? "").trim()
    ) {
      return new NextResponse("In-Accord server name is protected and cannot be renamed.", { status: 403 });
    }

    const currentBannerConfig = await getServerBannerConfig(serverId);
    const currentBannerRawUrl = currentBannerConfig?.url ?? null;
    const currentBannerResolvedUrl = resolveBannerUrl(currentBannerRawUrl);

    const resolvedName = typeof name === "string" ? name : target.name;
    const normalizedImageUrl =
      imageUrl === undefined
        ? target.imageUrl
        : normalizeOptionalCloudflareObjectPointer(imageUrl) ??
          normalizeUnchangedLegacyAsset({
            incomingValue: imageUrl,
            currentRawValue: target.imageUrl,
            currentResolvedValue: target.imageUrl,
          });
    const normalizedBannerUrl =
      bannerUrl === undefined
        ? undefined
        : normalizeOptionalCloudflareObjectPointer(bannerUrl) ??
          normalizeUnchangedLegacyAsset({
            incomingValue: bannerUrl,
            currentRawValue: currentBannerRawUrl,
            currentResolvedValue: currentBannerResolvedUrl,
          });

    if (imageUrl !== undefined && imageUrl !== null && normalizedImageUrl === null) {
      return new NextResponse("Server image must be a Cloudflare object pointer", { status: 400 });
    }

    if (bannerUrl !== undefined && bannerUrl !== null && normalizedBannerUrl === null) {
      return new NextResponse("Server banner must be a Cloudflare object pointer", { status: 400 });
    }

    const resolvedImageUrl = normalizedImageUrl ?? target.imageUrl ?? "/in-accord-steampunk-logo.png";

    await db.update(server).set({
      name: resolvedName,
      imageUrl: resolvedImageUrl,
        updatedAt: new Date(),
      }).where(eq(server.id, serverId));

    await setServerBannerConfig(serverId, {
      url: normalizedBannerUrl,
      fit: bannerFit,
      scale: typeof bannerScale === "number" ? bannerScale : Number(bannerScale),
    });

    const resolvedProfileSettings = await setServerProfileSettings(serverId, {
      description: typeof description === "string" ? description : null,
      traits: Array.isArray(traits) ? traits : [],
      gamesPlayed: Array.isArray(gamesPlayed) ? gamesPlayed : [],
      bannerColor: typeof bannerColor === "string" ? bannerColor : null,
      inviteMode: inviteMode === "approval" ? "approval" : "normal",
      showChannelGroups: typeof showChannelGroups === "boolean" ? showChannelGroups : undefined,
      hideAllChannels: typeof hideAllChannels === "boolean" ? hideAllChannels : undefined,
      hiddenChannelIds: Array.isArray(hiddenChannelIds) ? hiddenChannelIds : undefined,
    });

    const updatedServer = await db.query.server.findFirst({
      where: eq(server.id, serverId),
    });

    const resolvedBanner = await getServerBannerConfig(serverId);
    const resolvedBannerUrl = resolveBannerUrl(resolvedBanner?.url ?? null);

    void appendBannerDebugEvent({
      source: "api/servers/[serverId]",
      stage: "patch",
      rawValue: resolvedBanner?.url ?? normalizedBannerUrl ?? null,
      resolvedValue: resolvedBannerUrl,
      metadata: {
        serverId,
        profileId: profile.id,
        bannerFit: resolvedBanner?.fit ?? bannerFit ?? null,
        bannerScale: resolvedBanner?.scale ?? bannerScale ?? null,
      },
    });

    await upsertOurBoardEntry({
      serverId,
      serverName: String(name ?? target.name ?? "Untitled Server"),
      imageUrl: String(imageUrl ?? target.imageUrl ?? "").trim() || null,
      bannerUrl: resolvedBanner?.url ?? null,
      ownerProfileId: profile.id,
      ownerDisplayName:
        String((profile as { name?: string | null }).name ?? "").trim() ||
        String((profile as { email?: string | null }).email ?? "").trim() ||
        profile.id,
      ownerEmail: (profile as { email?: string | null }).email ?? null,
    });

    void emitInAccordSystemEvent({
      eventType: "SERVER_SETTINGS_UPDATED",
      scope: "server-settings",
      actorProfileId: profile.id,
      actorUserId: (profile as { userId?: string }).userId ?? null,
      serverId,
      targetId: serverId,
      metadata: {
        name: resolvedName,
        imageUrl: resolvedImageUrl,
        bannerUrl: normalizedBannerUrl,
        bannerFit,
        bannerScale,
        description: resolvedProfileSettings.description,
        traits: resolvedProfileSettings.traits,
        gamesPlayed: resolvedProfileSettings.gamesPlayed,
        bannerColor: resolvedProfileSettings.bannerColor,
        inviteMode: resolvedProfileSettings.inviteMode,
        showChannelGroups: resolvedProfileSettings.showChannelGroups,
        hideAllChannels: resolvedProfileSettings.hideAllChannels,
        hiddenChannelIds: resolvedProfileSettings.hiddenChannelIds,
      },
    }).catch((eventError) => {
      console.warn("[SERVER_ID_PATCH_EVENT]", eventError);
    });

    return NextResponse.json(
      updatedServer
        ? {
            ...updatedServer,
            bannerUrl: resolvedBannerUrl,
            bannerFit: resolvedBanner?.fit ?? "cover",
            bannerScale: resolvedBanner?.scale ?? 1,
            description: resolvedProfileSettings.description,
            traits: resolvedProfileSettings.traits,
            gamesPlayed: resolvedProfileSettings.gamesPlayed,
            bannerColor: resolvedProfileSettings.bannerColor,
            inviteMode: resolvedProfileSettings.inviteMode,
            showChannelGroups: resolvedProfileSettings.showChannelGroups,
            hideAllChannels: resolvedProfileSettings.hideAllChannels,
            hiddenChannelIds: resolvedProfileSettings.hiddenChannelIds,
          }
        : updatedServer
    );
  } catch (error) {
    console.log("[SERVER_ID_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
