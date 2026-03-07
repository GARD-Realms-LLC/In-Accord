import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, member } from "@/lib/db";
import { normalizePresenceStatus } from "@/lib/presence-status";
import { getUserBanner } from "@/lib/user-banner-store";
import { ensureUserProfileSchema } from "@/lib/user-profile";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ profileId: string }> }
) {
  try {
    const { profileId: rawProfileId } = await params;

    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const profileId = rawProfileId?.trim();
    if (!profileId) {
      return new NextResponse("Profile ID missing", { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("memberId")?.trim();

    if (memberId) {
      const membership = await db.query.member.findFirst({
        where: sql`${member.id} = ${memberId} and ${member.profileId} = ${profileId}`,
      });

      if (!membership) {
        return new NextResponse("Forbidden", { status: 403 });
      }
    }

    await ensureUserProfileSchema();

    const result = await db.execute(sql`
      select
        u."userId" as "id",
        u."name" as "realName",
        up."profileName" as "profileName",
        up."bannerUrl" as "bannerUrl",
        up."presenceStatus" as "presenceStatus",
        u."role" as "role",
        u."email" as "email",
        coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
        u."account.created" as "createdAt",
        u."lastLogin" as "lastLogonAt"
      from "Users" u
      left join "UserProfile" up on up."userId" = u."userId"
      where u."userId" = ${profileId}
      limit 1
    `);

    const row = (result as unknown as {
      rows: Array<{
        id: string;
        realName: string | null;
        profileName: string | null;
        bannerUrl: string | null;
        presenceStatus: string | null;
        role: string | null;
        email: string | null;
        imageUrl: string | null;
        createdAt: Date | string | null;
        lastLogonAt: Date | string | null;
      }>;
    }).rows?.[0];

    if (!row) {
      return new NextResponse("Not found", { status: 404 });
    }

    const fallbackBanner = await getUserBanner(profileId);

    return NextResponse.json({
      id: row.id,
      realName: row.realName,
      profileName: row.profileName,
      bannerUrl: row.bannerUrl ?? fallbackBanner,
      presenceStatus: normalizePresenceStatus(row.presenceStatus),
      role: row.role,
      email: row.email ?? "",
      imageUrl: row.imageUrl ?? "/in-accord-steampunk-logo.png",
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      lastLogonAt: row.lastLogonAt ? new Date(row.lastLogonAt).toISOString() : null,
    });
  } catch (error) {
    console.error("[PROFILE_CARD_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
