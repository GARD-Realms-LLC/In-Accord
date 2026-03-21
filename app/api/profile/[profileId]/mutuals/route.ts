import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { currentProfile } from "@/lib/current-profile";
import { ensureFriendRelationsSchema } from "@/lib/friend-relations";
import { resolveAvatarUrl } from "@/lib/asset-url";
import { ensureUserProfileSchema } from "@/lib/user-profile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MutualServerCardItem = {
  id: string;
  name: string;
  imageUrl: string;
};

type MutualFriendCardItem = {
  profileId: string;
  memberId: string | null;
  serverId: string | null;
  displayName: string;
  email: string | null;
  imageUrl: string;
};

type DirectFriendStatus = "self" | "friends" | "not_friends";

const toSafePercent = (numerator: number, denominator: number) => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
};

const resolveNormalizedProfileId = async (value: string) => {
  const trimmedValue = String(value ?? "").trim();
  if (!trimmedValue) {
    return "";
  }

  const memberResult = await db.execute(sql`
    select
      m."profileId" as "profileId"
    from "Member" m
    where m."id" = ${trimmedValue}
    order by
      m."createdAt" asc,
      m."id" asc
    limit 1
  `);

  const normalizedMemberProfileId = String((memberResult as unknown as {
    rows?: Array<{ profileId: string | null }>;
  }).rows?.[0]?.profileId ?? "").trim();

  if (normalizedMemberProfileId) {
    return normalizedMemberProfileId;
  }

  const userResult = await db.execute(sql`
    select u."userId" as "profileId"
    from "Users" u
    where u."userId" = ${trimmedValue}
    limit 1
  `);

  const resolvedUserProfileId = String((userResult as unknown as {
    rows?: Array<{ profileId: string | null }>;
  }).rows?.[0]?.profileId ?? "").trim();

  if (resolvedUserProfileId) {
    return resolvedUserProfileId;
  }

  const memberProfileResult = await db.execute(sql`
    select m."profileId" as "profileId"
    from "Member" m
    where m."profileId" = ${trimmedValue}
    order by m."createdAt" asc, m."id" asc
    limit 1
  `);

  return String((memberProfileResult as unknown as {
    rows?: Array<{ profileId: string | null }>;
  }).rows?.[0]?.profileId ?? trimmedValue).trim();
};

const resolveProfileIdFromMemberId = async (memberId: string) => {
  const trimmedMemberId = String(memberId ?? "").trim();
  if (!trimmedMemberId) {
    return "";
  }

  const memberResult = await db.execute(sql`
    select m."profileId" as "profileId"
    from "Member" m
    where m."id" = ${trimmedMemberId}
    limit 1
  `);

  return String((memberResult as unknown as {
    rows?: Array<{ profileId: string | null }>;
  }).rows?.[0]?.profileId ?? "").trim();
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ profileId: string }> }
) {
  try {
    const { profileId: rawProfileId } = await params;
    const { searchParams } = new URL(req.url);
    const targetMemberId = searchParams.get("memberId")?.trim() ?? "";
    const explicitViewerMemberId = searchParams.get("viewerMemberId")?.trim() ?? "";
    const explicitViewerProfileId = searchParams.get("viewerProfileId")?.trim() ?? "";
    let resolvedViewerProfileId = "";

    if (explicitViewerMemberId) {
      const viewerMemberResult = await db.execute(sql`
        select
          m."profileId" as "profileId"
        from "Member" m
        where m."id" = ${explicitViewerMemberId}
        limit 1
      `);

      resolvedViewerProfileId = String((viewerMemberResult as unknown as {
        rows?: Array<{ profileId: string | null }>;
      }).rows?.[0]?.profileId ?? "").trim();
    }

    if (!resolvedViewerProfileId && explicitViewerProfileId) {
      resolvedViewerProfileId = await resolveNormalizedProfileId(explicitViewerProfileId);
    }

    const profile = resolvedViewerProfileId || explicitViewerProfileId ? null : await currentProfile();
    const viewerProfileId = resolvedViewerProfileId || String(profile?.userId ?? profile?.id ?? "").trim();
    const rawTargetProfileId = String(rawProfileId ?? "").trim();
    const targetProfileIdFromMemberId = targetMemberId
      ? await resolveProfileIdFromMemberId(targetMemberId)
      : "";
    const profileId = targetProfileIdFromMemberId
      || (rawTargetProfileId ? await resolveNormalizedProfileId(rawTargetProfileId) : "");

    if (!viewerProfileId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!profileId) {
      return new NextResponse("Profile ID missing", { status: 400 });
    }

    const isSelfProfile = viewerProfileId === profileId;

    await ensureFriendRelationsSchema();
    await ensureUserProfileSchema();

    const mutualServersResult = isSelfProfile ? { rows: [{ count: 0 }] } : await db.execute(sql`
      with normalized_members as (
        select
          m."id" as "memberId",
          m."serverId" as "serverId",
          m."createdAt" as "createdAt",
          m."profileId" as "normalizedProfileId"
        from "Member" m
      )
      select count(distinct self_member."serverId")::int as "count"
      from normalized_members self_member
      inner join normalized_members other_member
        on other_member."serverId" = self_member."serverId"
      where self_member."normalizedProfileId" = ${viewerProfileId}
        and other_member."normalizedProfileId" = ${profileId}
    `);

    const rawMutualServersCount = Number((mutualServersResult as unknown as {
      rows?: Array<{ count: number | string | null }>;
    }).rows?.[0]?.count ?? 0);

    const mutualServersListResult = isSelfProfile ? { rows: [] } : await db.execute(sql`
      with normalized_members as (
        select
          m."id" as "memberId",
          m."serverId" as "serverId",
          m."createdAt" as "createdAt",
          m."profileId" as "normalizedProfileId"
        from "Member" m
      )
      select distinct
        s."id" as "id",
        s."name" as "name",
        s."imageUrl" as "imageUrl"
      from normalized_members self_member
      inner join normalized_members other_member
        on other_member."serverId" = self_member."serverId"
      inner join "Server" s
        on s."id" = self_member."serverId"
      where self_member."normalizedProfileId" = ${viewerProfileId}
        and other_member."normalizedProfileId" = ${profileId}
      order by s."name" asc
    `);

    const mutualServers = ((mutualServersListResult as unknown as {
      rows?: Array<{ id: string; name: string; imageUrl: string | null }>;
    }).rows ?? []).map((item): MutualServerCardItem => ({
      id: item.id,
      name: item.name,
      imageUrl: resolveAvatarUrl(item.imageUrl) ?? "/in-accord-steampunk-logo.png",
    }));

    const directFriendshipResult = isSelfProfile ? { rows: [{ isDirectFriend: false }] } : await db.execute(sql`
      with normalized_friend_requests as (
        select
          upper(trim(coalesce(fr."status", ''))) as "status",
          coalesce(reqm."profileId", fr."requesterProfileId") as "requesterProfileId",
          coalesce(recm."profileId", fr."recipientProfileId") as "recipientProfileId"
        from "FriendRequest" fr
        left join "Member" reqm on reqm."id" = fr."requesterProfileId"
        left join "Member" recm on recm."id" = fr."recipientProfileId"
      )
      select exists(
        select 1
        from normalized_friend_requests nfr
        where nfr."status" = 'ACCEPTED'
          and (
            (nfr."requesterProfileId" = ${viewerProfileId} and nfr."recipientProfileId" = ${profileId})
            or
            (nfr."requesterProfileId" = ${profileId} and nfr."recipientProfileId" = ${viewerProfileId})
          )
      ) as "isDirectFriend"
    `);

    const isDirectFriend = !isSelfProfile && Boolean((directFriendshipResult as unknown as {
      rows?: Array<{ isDirectFriend: boolean | string | number | null }>;
    }).rows?.[0]?.isDirectFriend);
    const directFriendStatus: DirectFriendStatus = isSelfProfile
      ? "self"
      : isDirectFriend
        ? "friends"
        : "not_friends";

    const mutualFriendsResult = isSelfProfile ? { rows: [{ count: 0 }] } : await db.execute(sql`
      with normalized_friend_requests as (
        select
          upper(trim(coalesce(fr."status", ''))) as "status",
          coalesce(reqm."profileId", fr."requesterProfileId") as "requesterProfileId",
          coalesce(recm."profileId", fr."recipientProfileId") as "recipientProfileId"
        from "FriendRequest" fr
        left join "Member" reqm on reqm."id" = fr."requesterProfileId"
        left join "Member" recm on recm."id" = fr."recipientProfileId"
      ),
      friend_edges as (
        select
          nfr."requesterProfileId" as "aProfileId",
          nfr."recipientProfileId" as "bProfileId"
        from normalized_friend_requests nfr
        where nfr."status" = 'ACCEPTED'
          and nfr."requesterProfileId" <> nfr."recipientProfileId"
      ),
      self_friends as (
        select fe."bProfileId" as "friendProfileId"
        from friend_edges fe
        where fe."aProfileId" = ${viewerProfileId}

        union

        select fe."aProfileId" as "friendProfileId"
        from friend_edges fe
        where fe."bProfileId" = ${viewerProfileId}
      ),
      target_friends as (
        select fe."bProfileId" as "friendProfileId"
        from friend_edges fe
        where fe."aProfileId" = ${profileId}

        union

        select fe."aProfileId" as "friendProfileId"
        from friend_edges fe
        where fe."bProfileId" = ${profileId}
      )
      select count(distinct sf."friendProfileId")::int as "count"
      from self_friends sf
      inner join target_friends tf
        on tf."friendProfileId" = sf."friendProfileId"
      where sf."friendProfileId" not in (${viewerProfileId}, ${profileId})
    `);

    const rawMutualFriendsCount = Number((mutualFriendsResult as unknown as {
      rows?: Array<{ count: number | string | null }>;
    }).rows?.[0]?.count ?? 0);

    const mutualFriendsListResult = isSelfProfile ? { rows: [] } : await db.execute(sql`
      with normalized_friend_requests as (
        select
          upper(trim(coalesce(fr."status", ''))) as "status",
          coalesce(reqm."profileId", fr."requesterProfileId") as "requesterProfileId",
          coalesce(recm."profileId", fr."recipientProfileId") as "recipientProfileId"
        from "FriendRequest" fr
        left join "Member" reqm on reqm."id" = fr."requesterProfileId"
        left join "Member" recm on recm."id" = fr."recipientProfileId"
      ),
      friend_edges as (
        select
          nfr."requesterProfileId" as "aProfileId",
          nfr."recipientProfileId" as "bProfileId"
        from normalized_friend_requests nfr
        where nfr."status" = 'ACCEPTED'
          and nfr."requesterProfileId" <> nfr."recipientProfileId"
      ),
      self_friends as (
        select fe."bProfileId" as "friendProfileId"
        from friend_edges fe
        where fe."aProfileId" = ${viewerProfileId}

        union

        select fe."aProfileId" as "friendProfileId"
        from friend_edges fe
        where fe."bProfileId" = ${viewerProfileId}
      ),
      target_friends as (
        select fe."bProfileId" as "friendProfileId"
        from friend_edges fe
        where fe."aProfileId" = ${profileId}

        union

        select fe."aProfileId" as "friendProfileId"
        from friend_edges fe
        where fe."bProfileId" = ${profileId}
      ),
      normalized_members as (
        select
          m."id" as "memberId",
          m."serverId" as "serverId",
          m."createdAt" as "createdAt",
          m."profileId" as "normalizedProfileId"
        from "Member" m
      )
      select distinct
        u."userId" as "profileId",
        (
          select nm."memberId"
          from normalized_members nm
          where nm."normalizedProfileId" = u."userId"
          order by nm."createdAt" asc
          limit 1
        ) as "memberId",
        (
          select nm."serverId"
          from normalized_members nm
          where nm."normalizedProfileId" = u."userId"
          order by nm."createdAt" asc
          limit 1
        ) as "serverId",
        coalesce(nullif(trim(up."profileName"), ''), u."name", u."email", 'User') as "displayName",
        u."email" as "email",
        coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl"
      from self_friends sf
      inner join target_friends tf
        on tf."friendProfileId" = sf."friendProfileId"
      inner join "Users" u
        on u."userId" = sf."friendProfileId"
      left join "UserProfile" up
        on up."userId" = u."userId"
      where sf."friendProfileId" not in (${viewerProfileId}, ${profileId})
      order by "displayName" asc, "profileId" asc
    `);

    const mutualFriends = ((mutualFriendsListResult as unknown as {
      rows?: Array<{
        profileId: string;
        memberId: string | null;
        serverId: string | null;
        displayName: string;
        email: string | null;
        imageUrl: string | null;
      }>;
    }).rows ?? []).map((item): MutualFriendCardItem => ({
      profileId: item.profileId,
      memberId: item.memberId,
      serverId: item.serverId,
      displayName: item.displayName,
      email: item.email,
      imageUrl: resolveAvatarUrl(item.imageUrl) ?? "/in-accord-steampunk-logo.png",
    }));

    const targetServerCountResult = isSelfProfile ? { rows: [{ count: 0 }] } : await db.execute(sql`
      with normalized_members as (
        select
          m."serverId" as "serverId",
          m."profileId" as "normalizedProfileId"
        from "Member" m
      )
      select count(distinct nm."serverId")::int as "count"
      from normalized_members nm
      where nm."normalizedProfileId" = ${profileId}
    `);

    const targetServerCount = Number((targetServerCountResult as unknown as {
      rows?: Array<{ count: number | string | null }>;
    }).rows?.[0]?.count ?? 0);

    const mutualServersCount = mutualServers.length || rawMutualServersCount;
    const mutualFriendsCount = mutualFriends.length || rawMutualFriendsCount;
    const mutualServersPercent = toSafePercent(mutualServersCount, targetServerCount);

    return NextResponse.json(
      {
        isDirectFriend,
        directFriendStatus,
        mutualServersPercent,
        mutualServersCount,
        mutualFriendsCount,
        mutualServers,
        mutualFriends,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("[PROFILE_MUTUALS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
