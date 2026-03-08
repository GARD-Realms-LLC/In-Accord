import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { normalizePresenceStatus } from "@/lib/presence-status";
import { ensureServerTagSchema, serverTagIconOptions } from "@/lib/server-tags";
import { getUserServerProfile } from "@/lib/user-server-profile";
import { getUserPreferences } from "@/lib/user-preferences";
import { getUserBanner } from "@/lib/user-banner-store";
import {
  DEFAULT_PROFILE_NAME_STYLE,
  isProfileNameStyleValue,
  normalizeProfileNameStyleValue,
} from "@/lib/profile-name-styles";
import { resolveProfileIcons } from "@/lib/profile-icons";
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
    let memberServerId: string | null = null;
    let memberServerName: string | null = null;

    if (memberId) {
      const membershipResult = await db.execute(sql`
        select
          m."id" as "id",
          m."serverId" as "serverId",
          s."name" as "serverName"
        from "Member" m
        inner join "Server" s on s."id" = m."serverId"
        where m."id" = ${memberId}
          and m."profileId" = ${profileId}
        limit 1
      `);

      const membership = (membershipResult as unknown as {
        rows?: Array<{
          id: string;
          serverId: string;
          serverName: string;
        }>;
      }).rows?.[0];

      if (!membership) {
        return new NextResponse("Forbidden", { status: 403 });
      }

      memberServerId = membership.serverId;
      memberServerName = membership.serverName;
    }

    await ensureUserProfileSchema();
    await ensureServerTagSchema();

    const result = await db.execute(sql`
      select
        u."userId" as "id",
        u."name" as "realName",
        up."profileName" as "profileName",
        up."profileNameStyle" as "profileNameStyle",
        up."nameplateLabel" as "nameplateLabel",
        up."nameplateColor" as "nameplateColor",
        up."nameplateImageUrl" as "nameplateImageUrl",
        up."pronouns" as "pronouns",
        up."comment" as "comment",
        up."avatarDecorationUrl" as "avatarDecorationUrl",
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
        profileNameStyle: string | null;
        nameplateLabel: string | null;
        nameplateColor: string | null;
        nameplateImageUrl: string | null;
        pronouns: string | null;
        comment: string | null;
        avatarDecorationUrl: string | null;
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
    const serverProfile = memberServerId
      ? await getUserServerProfile(profileId, memberServerId)
      : null;
    const preferences = await getUserPreferences(profileId);

    let selectedServerTag: {
      serverId: string;
      serverName: string;
      tagCode: string;
      iconKey: string;
      iconEmoji: string;
    } | null = null;

    if (preferences.selectedServerTagServerId) {
      const selectedTagResult = await db.execute(sql`
        select
          st."serverId" as "serverId",
          s."name" as "serverName",
          st."tagCode" as "tagCode",
          st."iconKey" as "iconKey"
        from "ServerTag" st
        inner join "Server" s on s."id" = st."serverId"
        inner join "Member" m on m."serverId" = st."serverId" and m."profileId" = ${profileId}
        where st."serverId" = ${preferences.selectedServerTagServerId}
        limit 1
      `);

      const selectedTagRow = (selectedTagResult as unknown as {
        rows: Array<{
          serverId: string;
          serverName: string;
          tagCode: string;
          iconKey: string;
        }>;
      }).rows?.[0];

      if (selectedTagRow) {
        selectedServerTag = {
          serverId: selectedTagRow.serverId,
          serverName: selectedTagRow.serverName,
          tagCode: selectedTagRow.tagCode,
          iconKey: selectedTagRow.iconKey,
          iconEmoji: serverTagIconOptions.find((item) => item.key === selectedTagRow.iconKey)?.emoji ?? "🏷️",
        };
      }
    }

    return NextResponse.json({
      id: row.id,
      realName: row.realName,
      profileName: row.profileName,
      profileNameStyle: row.profileNameStyle,
      profileIcons: resolveProfileIcons({
        userId: row.id,
        role: row.role,
        email: row.email,
        createdAt: row.createdAt,
      }),
      nameplateLabel: row.nameplateLabel,
      nameplateColor: row.nameplateColor,
      nameplateImageUrl: row.nameplateImageUrl,
      effectiveNameplateLabel: serverProfile?.nameplateLabel ?? row.nameplateLabel,
      effectiveNameplateColor: serverProfile?.nameplateColor ?? row.nameplateColor,
      effectiveNameplateImageUrl: serverProfile?.nameplateImageUrl ?? row.nameplateImageUrl,
      pronouns: row.pronouns,
      comment: serverProfile?.comment ?? row.comment,
      avatarDecorationUrl: row.avatarDecorationUrl,
      effectiveAvatarDecorationUrl: serverProfile?.avatarDecorationUrl ?? row.avatarDecorationUrl,
      effectiveProfileName: serverProfile?.profileName ?? row.profileName,
      effectiveProfileNameStyle:
        serverProfile?.profileNameStyle && isProfileNameStyleValue(serverProfile.profileNameStyle)
          ? normalizeProfileNameStyleValue(serverProfile.profileNameStyle)
          : row.profileNameStyle && isProfileNameStyleValue(row.profileNameStyle)
          ? normalizeProfileNameStyleValue(row.profileNameStyle)
          : DEFAULT_PROFILE_NAME_STYLE,
      bannerUrl: row.bannerUrl ?? fallbackBanner,
      effectiveBannerUrl: serverProfile?.bannerUrl ?? row.bannerUrl ?? fallbackBanner,
      serverProfile: memberServerId
        ? {
            serverId: memberServerId,
            serverName: memberServerName,
            profileName: serverProfile?.profileName ?? null,
            profileNameStyle: serverProfile?.profileNameStyle ?? null,
            comment: serverProfile?.comment ?? null,
            nameplateLabel: serverProfile?.nameplateLabel ?? null,
            nameplateColor: serverProfile?.nameplateColor ?? null,
            nameplateImageUrl: serverProfile?.nameplateImageUrl ?? null,
            avatarDecorationUrl: serverProfile?.avatarDecorationUrl ?? null,
            bannerUrl: serverProfile?.bannerUrl ?? null,
          }
        : null,
      selectedServerTag,
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
