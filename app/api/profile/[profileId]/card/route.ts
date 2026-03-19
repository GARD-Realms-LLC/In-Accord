import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { ensureFriendRelationsSchema } from "@/lib/friend-relations";
import {
  autoConvertFamilyAccountIfNeeded,
  ensureFamilyAccountSchema,
  normalizeFamilyLinkStateLabel,
} from "@/lib/family-accounts";
import {
  autoConvertBusinessAccountIfNeeded,
  ensureBusinessAccountSchema,
} from "@/lib/business-accounts";
import { normalizePresenceStatus } from "@/lib/presence-status";
import { ensureServerTagSchema, serverTagIconOptions } from "@/lib/server-tags";
import { getUserServerProfile } from "@/lib/user-server-profile";
import { getUserPreferences } from "@/lib/user-preferences";
import {
  DEFAULT_PROFILE_NAME_STYLE,
  isProfileNameStyleValue,
  normalizeProfileNameStyleValue,
} from "@/lib/profile-name-styles";
import { hasSucceededPatronage } from "@/lib/patronage";
import { resolveProfileIcons } from "@/lib/profile-icons";
import { ensureUserProfileSchema } from "@/lib/user-profile";
import { resolveAvatarUrl, resolveBannerUrl } from "@/lib/asset-url";
import { getFamilyLifecycleState } from "@/lib/family-lifecycle";
import { type DirectFriendStatus } from "@/lib/direct-friend-status";

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

const toSafePercent = (numerator: number, denominator: number) => {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(100, Math.round((numerator / denominator) * 100)),
  );
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

  const normalizedMemberProfileId = String(
    (
      memberResult as unknown as {
        rows?: Array<{ profileId: string | null }>;
      }
    ).rows?.[0]?.profileId ?? "",
  ).trim();

  if (normalizedMemberProfileId) {
    return normalizedMemberProfileId;
  }

  const userResult = await db.execute(sql`
    select u."userId" as "profileId"
    from "Users" u
    where u."userId" = ${trimmedValue}
    limit 1
  `);

  const resolvedUserProfileId = String(
    (
      userResult as unknown as {
        rows?: Array<{ profileId: string | null }>;
      }
    ).rows?.[0]?.profileId ?? "",
  ).trim();

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

  return String(
    (
      memberProfileResult as unknown as {
        rows?: Array<{ profileId: string | null }>;
      }
    ).rows?.[0]?.profileId ?? trimmedValue,
  ).trim();
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

  return String(
    (
      memberResult as unknown as {
        rows?: Array<{ profileId: string | null }>;
      }
    ).rows?.[0]?.profileId ?? "",
  ).trim();
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ profileId: string }> },
) {
  try {
    const { profileId: rawProfileId } = await params;
    const { searchParams } = new URL(req.url);
    const explicitViewerMemberId =
      searchParams.get("viewerMemberId")?.trim() ?? "";
    const explicitViewerProfileId =
      searchParams.get("viewerProfileId")?.trim() ?? "";
    let resolvedViewerProfileId = "";

    if (explicitViewerMemberId) {
      const viewerMemberResult = await db.execute(sql`
        select
          m."profileId" as "profileId"
        from "Member" m
        where m."id" = ${explicitViewerMemberId}
        limit 1
      `);

      resolvedViewerProfileId = String(
        (
          viewerMemberResult as unknown as {
            rows?: Array<{ profileId: string | null }>;
          }
        ).rows?.[0]?.profileId ?? "",
      ).trim();
    }

    if (!resolvedViewerProfileId && explicitViewerProfileId) {
      resolvedViewerProfileId = await resolveNormalizedProfileId(
        explicitViewerProfileId,
      );
    }

    const profile =
      resolvedViewerProfileId || explicitViewerProfileId
        ? null
        : await currentProfile();

    const memberId = searchParams.get("memberId")?.trim() ?? "";
    const rawTargetProfileId = rawProfileId?.trim() ?? "";
    const targetProfileIdFromMemberId = memberId
      ? await resolveProfileIdFromMemberId(memberId)
      : "";
    const profileId =
      targetProfileIdFromMemberId ||
      (rawTargetProfileId
        ? await resolveNormalizedProfileId(rawTargetProfileId)
        : "");
    const viewerProfileId =
      resolvedViewerProfileId ||
      String(profile?.userId ?? profile?.id ?? "").trim();

    if (!profileId) {
      return new NextResponse("Profile ID missing", { status: 400 });
    }

    if (!viewerProfileId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const isSelfProfile = viewerProfileId === profileId;
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

      const membership = (
        membershipResult as unknown as {
          rows?: Array<{
            id: string;
            serverId: string;
            serverName: string;
          }>;
        }
      ).rows?.[0];

      if (membership) {
        memberServerId = membership.serverId;
        memberServerName = membership.serverName;
      }
    }

    await ensureUserProfileSchema();
    await ensureFamilyAccountSchema();
    await ensureBusinessAccountSchema();
    await ensureServerTagSchema();
    await ensureFriendRelationsSchema();

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
        up."businessRole" as "businessRole",
        up."businessSection" as "businessSection",
        up."comment" as "comment",
        up."avatarDecorationUrl" as "avatarDecorationUrl",
        up."profileEffectUrl" as "profileEffectUrl",
        up."bannerUrl" as "bannerUrl",
        up."presenceStatus" as "presenceStatus",
        nullif(trim(to_jsonb(up)->>'currentGame'), '') as "currentGame",
        nullif(trim(to_jsonb(u)->>'dob'), '') as "dateOfBirth",
        nullif(trim(to_jsonb(u)->>'familyParentUserId'), '') as "familyParentUserId",
        nullif(trim(to_jsonb(u)->>'businessParentUserId'), '') as "businessParentUserId",
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

    const row = (
      result as unknown as {
        rows: Array<{
          id: string;
          realName: string | null;
          profileName: string | null;
          profileNameStyle: string | null;
          nameplateLabel: string | null;
          nameplateColor: string | null;
          nameplateImageUrl: string | null;
          pronouns: string | null;
          businessRole: string | null;
          businessSection: string | null;
          comment: string | null;
          avatarDecorationUrl: string | null;
          profileEffectUrl: string | null;
          bannerUrl: string | null;
          presenceStatus: string | null;
          currentGame: string | null;
          dateOfBirth: string | null;
          familyParentUserId: string | null;
          businessParentUserId: string | null;
          role: string | null;
          email: string | null;
          imageUrl: string | null;
          createdAt: Date | string | null;
          lastLogonAt: Date | string | null;
        }>;
      }
    ).rows?.[0];

    if (!row) {
      return new NextResponse("Not found", { status: 404 });
    }

    const mutualServersResult = isSelfProfile
      ? { rows: [{ count: 0 }] }
      : await db.execute(sql`
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

    const rawMutualServersCount = Number(
      (
        mutualServersResult as unknown as {
          rows?: Array<{ count: number | string | null }>;
        }
      ).rows?.[0]?.count ?? 0,
    );

    const mutualServersListResult = isSelfProfile
      ? { rows: [] }
      : await db.execute(sql`
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

    const mutualServers = (
      (
        mutualServersListResult as unknown as {
          rows?: Array<{ id: string; name: string; imageUrl: string | null }>;
        }
      ).rows ?? []
    ).map(
      (item): MutualServerCardItem => ({
        id: item.id,
        name: item.name,
        imageUrl:
          resolveAvatarUrl(item.imageUrl) ?? "/in-accord-steampunk-logo.png",
      }),
    );

    const directFriendshipResult = isSelfProfile
      ? {
          rows: [
            {
              isDirectFriend: false,
              hasOutgoingPending: false,
              hasIncomingPending: false,
            },
          ],
        }
      : await db.execute(sql`
      with normalized_friend_requests as (
        select
          upper(trim(coalesce(fr."status", ''))) as "status",
          coalesce(reqm."profileId", fr."requesterProfileId") as "requesterProfileId",
          coalesce(recm."profileId", fr."recipientProfileId") as "recipientProfileId"
        from "FriendRequest" fr
        left join "Member" reqm on reqm."id" = fr."requesterProfileId"
        left join "Member" recm on recm."id" = fr."recipientProfileId"
      )
      select
        exists(
          select 1
          from normalized_friend_requests nfr
          where nfr."status" = 'ACCEPTED'
            and (
              (nfr."requesterProfileId" = ${viewerProfileId} and nfr."recipientProfileId" = ${profileId})
              or
              (nfr."requesterProfileId" = ${profileId} and nfr."recipientProfileId" = ${viewerProfileId})
            )
        ) as "isDirectFriend",
        exists(
          select 1
          from normalized_friend_requests nfr
          where nfr."status" = 'PENDING'
            and nfr."requesterProfileId" = ${viewerProfileId}
            and nfr."recipientProfileId" = ${profileId}
        ) as "hasOutgoingPending",
        exists(
          select 1
          from normalized_friend_requests nfr
          where nfr."status" = 'PENDING'
            and nfr."requesterProfileId" = ${profileId}
            and nfr."recipientProfileId" = ${viewerProfileId}
        ) as "hasIncomingPending"
    `);

    const directFriendshipRow = (
      directFriendshipResult as unknown as {
        rows?: Array<{
          isDirectFriend: boolean | string | number | null;
          hasOutgoingPending: boolean | string | number | null;
          hasIncomingPending: boolean | string | number | null;
        }>;
      }
    ).rows?.[0];
    const isDirectFriend =
      !isSelfProfile && Boolean(directFriendshipRow?.isDirectFriend);
    const hasOutgoingPending =
      !isSelfProfile && Boolean(directFriendshipRow?.hasOutgoingPending);
    const hasIncomingPending =
      !isSelfProfile && Boolean(directFriendshipRow?.hasIncomingPending);
    const directFriendStatus: DirectFriendStatus = isSelfProfile
      ? "self"
      : isDirectFriend
        ? "friends"
        : hasIncomingPending
          ? "incoming_pending"
          : hasOutgoingPending
            ? "outgoing_pending"
            : "not_friends";

    const mutualFriendsResult = isSelfProfile
      ? { rows: [{ count: 0 }] }
      : await db.execute(sql`
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

    const rawMutualFriendsCount = Number(
      (
        mutualFriendsResult as unknown as {
          rows?: Array<{ count: number | string | null }>;
        }
      ).rows?.[0]?.count ?? 0,
    );

    const mutualFriendsListResult = isSelfProfile
      ? { rows: [] }
      : await db.execute(sql`
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

    const mutualFriends = (
      (
        mutualFriendsListResult as unknown as {
          rows?: Array<{
            profileId: string;
            memberId: string | null;
            serverId: string | null;
            displayName: string;
            email: string | null;
            imageUrl: string | null;
          }>;
        }
      ).rows ?? []
    ).map(
      (item): MutualFriendCardItem => ({
        profileId: item.profileId,
        memberId: item.memberId,
        serverId: item.serverId,
        displayName: item.displayName,
        email: item.email,
        imageUrl:
          resolveAvatarUrl(item.imageUrl) ?? "/in-accord-steampunk-logo.png",
      }),
    );

    const targetServerCountResult = isSelfProfile
      ? { rows: [{ count: 0 }] }
      : await db.execute(sql`
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

    const targetServerCount = Number(
      (
        targetServerCountResult as unknown as {
          rows?: Array<{ count: number | string | null }>;
        }
      ).rows?.[0]?.count ?? 0,
    );

    const mutualServersCount = mutualServers.length || rawMutualServersCount;
    const mutualFriendsCount = mutualFriends.length || rawMutualFriendsCount;
    const mutualServersPercent = toSafePercent(
      mutualServersCount,
      targetServerCount,
    );

    let lifecycle = getFamilyLifecycleState(
      row.dateOfBirth,
      row.familyParentUserId,
    );
    let businessLifecycle = getFamilyLifecycleState(
      row.dateOfBirth,
      row.businessParentUserId,
    );
    let isPatron = false;
    let serverProfile: Awaited<ReturnType<typeof getUserServerProfile>> = null;
    let preferences: Awaited<ReturnType<typeof getUserPreferences>> | null =
      null;

    try {
      const normalizedFamily = await autoConvertFamilyAccountIfNeeded(
        row.id,
        row.dateOfBirth,
        row.familyParentUserId,
      );
      lifecycle = normalizedFamily.lifecycle;
    } catch (error) {
      console.error("[PROFILE_CARD_FAMILY_NORMALIZE]", error);
    }

    try {
      const normalizedBusiness = await autoConvertBusinessAccountIfNeeded(
        row.id,
        row.dateOfBirth,
        row.businessParentUserId,
      );
      businessLifecycle = normalizedBusiness.lifecycle;
    } catch (error) {
      console.error("[PROFILE_CARD_BUSINESS_NORMALIZE]", error);
    }

    try {
      isPatron = await hasSucceededPatronage(row.id);
    } catch (error) {
      console.error("[PROFILE_CARD_PATRONAGE]", error);
    }

    if (memberServerId) {
      try {
        serverProfile = await getUserServerProfile(profileId, memberServerId);
      } catch (error) {
        console.error("[PROFILE_CARD_SERVER_PROFILE]", error);
      }
    }

    try {
      preferences = await getUserPreferences(profileId);
    } catch (error) {
      console.error("[PROFILE_CARD_PREFERENCES]", error);
    }

    let selectedServerTag: {
      serverId: string;
      serverName: string;
      tagCode: string;
      iconKey: string;
      iconEmoji: string;
    } | null = null;

    if (preferences?.selectedServerTagServerId) {
      try {
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

        const selectedTagRow = (
          selectedTagResult as unknown as {
            rows: Array<{
              serverId: string;
              serverName: string;
              tagCode: string;
              iconKey: string;
            }>;
          }
        ).rows?.[0];

        if (selectedTagRow) {
          selectedServerTag = {
            serverId: selectedTagRow.serverId,
            serverName: selectedTagRow.serverName,
            tagCode: selectedTagRow.tagCode,
            iconKey: selectedTagRow.iconKey,
            iconEmoji:
              serverTagIconOptions.find(
                (item) => item.key === selectedTagRow.iconKey,
              )?.emoji ?? "🏷️",
          };
        }
      } catch (error) {
        console.error("[PROFILE_CARD_SELECTED_SERVER_TAG]", error);
      }
    }

    return NextResponse.json(
      {
        id: row.id,
        realName: row.realName,
        profileName: row.profileName,
        profileNameStyle: row.profileNameStyle,
        profileIcons: resolveProfileIcons({
          userId: row.id,
          role: row.role,
          email: row.email,
          createdAt: row.createdAt,
          dateOfBirth: row.dateOfBirth,
          familyParentUserId: lifecycle.isFamilyLinked
            ? String(row.familyParentUserId ?? "").trim() || null
            : null,
          isPatron,
        }),
        familyLifecycle: {
          isFamilyLinked: lifecycle.isFamilyLinked,
          showFamilyIcon: lifecycle.showFamilyIcon,
          canConvertToNormal: lifecycle.canConvertToNormal,
          age: lifecycle.age,
          state: normalizeFamilyLinkStateLabel(lifecycle),
        },
        businessLifecycle: {
          isBusinessLinked: businessLifecycle.isFamilyLinked,
          showBusinessIcon: businessLifecycle.showFamilyIcon,
          canConvertToNormal: businessLifecycle.canConvertToNormal,
          age: businessLifecycle.age,
          state: normalizeFamilyLinkStateLabel(businessLifecycle),
        },
        nameplateLabel: row.nameplateLabel,
        nameplateColor: row.nameplateColor,
        nameplateImageUrl: row.nameplateImageUrl,
        effectiveNameplateLabel:
          serverProfile?.nameplateLabel ?? row.nameplateLabel,
        effectiveNameplateColor:
          serverProfile?.nameplateColor ?? row.nameplateColor,
        effectiveNameplateImageUrl:
          serverProfile?.nameplateImageUrl ?? row.nameplateImageUrl,
        pronouns: row.pronouns,
        businessRole: row.businessRole,
        businessSection: row.businessSection,
        comment: serverProfile?.comment ?? row.comment,
        avatarDecorationUrl: row.avatarDecorationUrl,
        profileEffectUrl: row.profileEffectUrl,
        effectiveImageUrl:
          resolveAvatarUrl(serverProfile?.imageUrl ?? row.imageUrl) ??
          "/in-accord-steampunk-logo.png",
        effectiveAvatarDecorationUrl:
          serverProfile?.avatarDecorationUrl ?? row.avatarDecorationUrl,
        effectiveProfileEffectUrl:
          serverProfile?.profileEffectUrl ?? row.profileEffectUrl,
        effectiveProfileName: serverProfile?.profileName ?? row.profileName,
        effectiveProfileNameStyle:
          serverProfile?.profileNameStyle &&
          isProfileNameStyleValue(serverProfile.profileNameStyle)
            ? normalizeProfileNameStyleValue(serverProfile.profileNameStyle)
            : row.profileNameStyle &&
                isProfileNameStyleValue(row.profileNameStyle)
              ? normalizeProfileNameStyleValue(row.profileNameStyle)
              : DEFAULT_PROFILE_NAME_STYLE,
        bannerUrl: resolveBannerUrl(row.bannerUrl ?? null),
        effectiveBannerUrl: resolveBannerUrl(
          serverProfile?.bannerUrl ?? row.bannerUrl ?? null,
        ),
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
              imageUrl: resolveAvatarUrl(serverProfile?.imageUrl ?? null),
              avatarDecorationUrl: serverProfile?.avatarDecorationUrl ?? null,
              profileEffectUrl: serverProfile?.profileEffectUrl ?? null,
              bannerUrl: resolveBannerUrl(serverProfile?.bannerUrl ?? null),
            }
          : null,
        selectedServerTag,
        presenceStatus: normalizePresenceStatus(row.presenceStatus),
        currentGame: row.currentGame ?? null,
        role: row.role,
        email: row.email ?? "",
        imageUrl:
          resolveAvatarUrl(row.imageUrl) ?? "/in-accord-steampunk-logo.png",
        isDirectFriend,
        directFriendStatus,
        mutualServersPercent,
        mutualServersCount,
        mutualFriendsCount,
        mutualServers,
        mutualFriends,
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
        lastLogonAt: row.lastLogonAt
          ? new Date(row.lastLogonAt).toISOString()
          : null,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  } catch (error) {
    console.error("[PROFILE_CARD_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
