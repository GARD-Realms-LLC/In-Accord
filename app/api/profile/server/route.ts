import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import {
  DEFAULT_PROFILE_NAME_STYLE,
  isProfileNameStyleValue,
  normalizeProfileNameStyleValue,
} from "@/lib/profile-name-styles";
import { ensureUserServerProfileSchema } from "@/lib/user-server-profile";

type MemberServerRow = {
  serverId: string;
  serverName: string;
  profileName: string | null;
  profileNameStyle: string | null;
  comment: string | null;
  nameplateLabel: string | null;
  nameplateColor: string | null;
  nameplateImageUrl: string | null;
  avatarDecorationUrl: string | null;
  bannerUrl: string | null;
};

const buildResponse = async (
  userId: string,
  globalDefaults: {
    profileName: string | null;
    profileNameStyle: string | null;
    comment: string | null;
    nameplateLabel: string | null;
    nameplateColor: string | null;
    nameplateImageUrl: string | null;
    avatarDecorationUrl: string | null;
    bannerUrl: string | null;
  }
) => {
  await ensureUserServerProfileSchema();

  const result = await db.execute(sql`
    select
      s."id" as "serverId",
      s."name" as "serverName",
      usp."profileName" as "profileName",
      usp."profileNameStyle" as "profileNameStyle",
      usp."comment" as "comment",
      usp."nameplateLabel" as "nameplateLabel",
      usp."nameplateColor" as "nameplateColor",
      usp."nameplateImageUrl" as "nameplateImageUrl",
      usp."avatarDecorationUrl" as "avatarDecorationUrl",
      usp."bannerUrl" as "bannerUrl"
    from "Member" m
    inner join "Server" s on s."id" = m."serverId"
    left join "UserServerProfile" usp
      on usp."userId" = m."profileId"
      and usp."serverId" = m."serverId"
    where m."profileId" = ${userId}
    order by lower(s."name") asc
  `);

  const servers = ((result as unknown as { rows?: MemberServerRow[] }).rows ?? []).map((row) => ({
    serverId: row.serverId,
    serverName: row.serverName,
    profileName: row.profileName,
    profileNameStyle: row.profileNameStyle,
    comment: row.comment,
    nameplateLabel: row.nameplateLabel,
    nameplateColor: row.nameplateColor,
    nameplateImageUrl: row.nameplateImageUrl,
    avatarDecorationUrl: row.avatarDecorationUrl,
    bannerUrl: row.bannerUrl,
    effectiveProfileName: row.profileName ?? globalDefaults.profileName,
    effectiveProfileNameStyle:
      row.profileNameStyle && isProfileNameStyleValue(row.profileNameStyle)
        ? normalizeProfileNameStyleValue(row.profileNameStyle)
        : globalDefaults.profileNameStyle && isProfileNameStyleValue(globalDefaults.profileNameStyle)
        ? normalizeProfileNameStyleValue(globalDefaults.profileNameStyle)
        : DEFAULT_PROFILE_NAME_STYLE,
    effectiveComment: row.comment ?? globalDefaults.comment,
    effectiveNameplateLabel: row.nameplateLabel ?? globalDefaults.nameplateLabel,
    effectiveNameplateColor: row.nameplateColor ?? globalDefaults.nameplateColor,
    effectiveNameplateImageUrl: row.nameplateImageUrl ?? globalDefaults.nameplateImageUrl,
    effectiveAvatarDecorationUrl: row.avatarDecorationUrl ?? globalDefaults.avatarDecorationUrl,
    effectiveBannerUrl: row.bannerUrl ?? globalDefaults.bannerUrl,
  }));

  return { servers };
};

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      await buildResponse(profile.id, {
        profileName: profile.name ?? null,
        profileNameStyle: profile.profileNameStyle ?? null,
        comment: profile.comment ?? null,
        nameplateLabel: profile.nameplateLabel ?? null,
        nameplateColor: profile.nameplateColor ?? null,
        nameplateImageUrl: (profile as { nameplateImageUrl?: string | null }).nameplateImageUrl ?? null,
        avatarDecorationUrl: profile.avatarDecorationUrl ?? null,
        bannerUrl: profile.bannerUrl ?? null,
      })
    );
  } catch (error) {
    console.error("[PROFILE_SERVER_GET]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      serverId?: unknown;
      profileName?: unknown;
      profileNameStyle?: unknown;
      comment?: unknown;
      nameplateLabel?: unknown;
      nameplateColor?: unknown;
      nameplateImageUrl?: unknown;
      avatarDecorationUrl?: unknown;
      bannerUrl?: unknown;
    };

    const serverId = String(body.serverId ?? "").trim();
    const profileName = typeof body.profileName === "string" ? body.profileName.trim() : "";
    const profileNameStyle = typeof body.profileNameStyle === "string" ? body.profileNameStyle.trim() : "";
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";
    const nameplateLabel = typeof body.nameplateLabel === "string" ? body.nameplateLabel.trim() : "";
    const nameplateColor = typeof body.nameplateColor === "string" ? body.nameplateColor.trim() : "";
    const nameplateImageUrl = typeof body.nameplateImageUrl === "string" ? body.nameplateImageUrl.trim() : "";
    const avatarDecorationUrl = typeof body.avatarDecorationUrl === "string" ? body.avatarDecorationUrl.trim() : "";
    const bannerUrl = typeof body.bannerUrl === "string" ? body.bannerUrl.trim() : "";

    if (!serverId) {
      return NextResponse.json({ error: "serverId is required." }, { status: 400 });
    }

    if (profileName.length > 80) {
      return NextResponse.json(
        { error: "Profile name must be 80 characters or fewer." },
        { status: 400 }
      );
    }

    if (profileNameStyle.length > 0 && !isProfileNameStyleValue(profileNameStyle)) {
      return NextResponse.json(
        { error: "Profile name style is invalid." },
        { status: 400 }
      );
    }

    if (comment.length > 280) {
      return NextResponse.json(
        { error: "Comment must be 280 characters or fewer." },
        { status: 400 }
      );
    }

    if (nameplateLabel.length > 40) {
      return NextResponse.json(
        { error: "Nameplate label must be 40 characters or fewer." },
        { status: 400 }
      );
    }

    if (nameplateColor.length > 0 && !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(nameplateColor)) {
      return NextResponse.json(
        { error: "Nameplate color must be a valid hex color." },
        { status: 400 }
      );
    }

    if (nameplateImageUrl.length > 2048) {
      return NextResponse.json(
        { error: "Nameplate image URL is too long." },
        { status: 400 }
      );
    }

    await ensureUserServerProfileSchema();

    const membership = await db.execute(sql`
      select "id"
      from "Member"
      where "profileId" = ${profile.id}
        and "serverId" = ${serverId}
      limit 1
    `);

    const isMember = Boolean(
      (membership as unknown as { rows?: Array<{ id: string }> }).rows?.[0]?.id
    );

    if (!isMember) {
      return NextResponse.json({ error: "You are not a member of that server." }, { status: 403 });
    }

    const normalizedProfileName = profileName.length > 0 ? profileName : null;
    const normalizedProfileNameStyle =
      profileNameStyle.length > 0 ? normalizeProfileNameStyleValue(profileNameStyle) : null;
    const normalizedComment = comment.length > 0 ? comment : null;
    const normalizedNameplateLabel = nameplateLabel.length > 0 ? nameplateLabel : null;
    const normalizedNameplateColor = normalizedNameplateLabel ? (nameplateColor.length > 0 ? nameplateColor : "#5865f2") : null;
    const normalizedNameplateImageUrl = nameplateImageUrl.length > 0 ? nameplateImageUrl : null;
    const normalizedAvatarDecorationUrl = avatarDecorationUrl.length > 0 ? avatarDecorationUrl : null;
    const normalizedBannerUrl = bannerUrl.length > 0 ? bannerUrl : null;

    if (
      !normalizedProfileName &&
      !normalizedProfileNameStyle &&
      !normalizedComment &&
      !normalizedNameplateLabel &&
      !normalizedNameplateImageUrl &&
      !normalizedAvatarDecorationUrl &&
      !normalizedBannerUrl
    ) {
      await db.execute(sql`
        delete from "UserServerProfile"
        where "userId" = ${profile.id}
          and "serverId" = ${serverId}
      `);
    } else {
      await db.execute(sql`
        insert into "UserServerProfile" (
          "userId",
          "serverId",
          "profileName",
          "profileNameStyle",
          "comment",
          "nameplateLabel",
          "nameplateColor",
          "nameplateImageUrl",
          "avatarDecorationUrl",
          "bannerUrl",
          "createdAt",
          "updatedAt"
        )
        values (
          ${profile.id},
          ${serverId},
          ${normalizedProfileName},
          ${normalizedProfileNameStyle},
          ${normalizedComment},
          ${normalizedNameplateLabel},
          ${normalizedNameplateColor},
          ${normalizedNameplateImageUrl},
          ${normalizedAvatarDecorationUrl},
          ${normalizedBannerUrl},
          now(),
          now()
        )
        on conflict ("userId", "serverId") do update
        set "profileName" = excluded."profileName",
          "profileNameStyle" = excluded."profileNameStyle",
          "comment" = excluded."comment",
            "nameplateLabel" = excluded."nameplateLabel",
            "nameplateColor" = excluded."nameplateColor",
            "nameplateImageUrl" = excluded."nameplateImageUrl",
            "avatarDecorationUrl" = excluded."avatarDecorationUrl",
            "bannerUrl" = excluded."bannerUrl",
            "updatedAt" = excluded."updatedAt"
      `);
    }

    return NextResponse.json({
      ok: true,
      serverId,
      profileName: normalizedProfileName,
      profileNameStyle: normalizedProfileNameStyle,
      comment: normalizedComment,
      nameplateLabel: normalizedNameplateLabel,
      nameplateColor: normalizedNameplateColor,
      nameplateImageUrl: normalizedNameplateImageUrl,
      avatarDecorationUrl: normalizedAvatarDecorationUrl,
      bannerUrl: normalizedBannerUrl,
      ...(await buildResponse(profile.id, {
        profileName: profile.name ?? null,
        profileNameStyle: profile.profileNameStyle ?? null,
        comment: profile.comment ?? null,
        nameplateLabel: profile.nameplateLabel ?? null,
        nameplateColor: profile.nameplateColor ?? null,
        nameplateImageUrl: (profile as { nameplateImageUrl?: string | null }).nameplateImageUrl ?? null,
        avatarDecorationUrl: profile.avatarDecorationUrl ?? null,
        bannerUrl: profile.bannerUrl ?? null,
      })),
    });
  } catch (error) {
    console.error("[PROFILE_SERVER_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
