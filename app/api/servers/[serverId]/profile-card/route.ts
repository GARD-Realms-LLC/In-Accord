import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { resolveAvatarUrl, resolveBannerUrl } from "@/lib/asset-url";
import { db, member, server } from "@/lib/db";
import { getServerBannerConfig } from "@/lib/server-banner-store";

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

    const membership = await db.query.member.findFirst({
      where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
    });

    if (!membership) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const result = await db.execute(sql`
      select
        s."id" as "id",
        s."name" as "name",
        s."imageUrl" as "imageUrl",
        s."inviteCode" as "inviteCode",
        s."profileId" as "ownerId",
        u."name" as "ownerName",
        u."email" as "ownerEmail",
        s."createdAt" as "createdAt",
        s."updatedAt" as "updatedAt",
        (
        select count(*)
          from "Member" m
          where m."serverId" = s."id"
        ) as "memberCount",
        (
        select count(*)
          from "Channel" c
          where c."serverId" = s."id"
        ) as "channelCount"
      from "Server" s
      left join "Users" u on u."userId" = s."profileId"
      where s."id" = ${serverId}
      limit 1
    `);

    const row = (result as unknown as {
      rows: Array<{
        id: string;
        name: string | null;
        imageUrl: string | null;
        inviteCode: string | null;
        ownerId: string | null;
        ownerName: string | null;
        ownerEmail: string | null;
        createdAt: Date | string | null;
        updatedAt: Date | string | null;
        memberCount: number | string | null;
        channelCount: number | string | null;
      }>;
    }).rows?.[0];

    if (!row) {
      return new NextResponse("Not found", { status: 404 });
    }

    let bannerConfig: Awaited<ReturnType<typeof getServerBannerConfig>> | null = null;
    try {
      bannerConfig = await getServerBannerConfig(serverId);
    } catch (error) {
      console.error("[SERVER_PROFILE_CARD_BANNER]", serverId, error);
    }

    return NextResponse.json({
      id: row.id,
      name: row.name ?? "Untitled Server",
      imageUrl: resolveAvatarUrl(row.imageUrl) ?? "/in-accord-steampunk-logo.png",
      bannerUrl: resolveBannerUrl(bannerConfig?.url ?? null),
      inviteCode: row.inviteCode ?? "",
      ownerId: row.ownerId ?? "",
      ownerName: row.ownerName ?? row.ownerEmail ?? row.ownerId ?? "Unknown Owner",
      ownerEmail: row.ownerEmail ?? "",
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      memberCount: Number(row.memberCount ?? 0),
      channelCount: Number(row.channelCount ?? 0),
    });
  } catch (error) {
    console.error("[SERVER_PROFILE_CARD_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
