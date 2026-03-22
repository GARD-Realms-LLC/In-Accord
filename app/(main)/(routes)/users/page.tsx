import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { BarChart3, Bell, Bug, MessageCircle, Phone, RotateCcw, Search, UserPlus, Video, X } from "lucide-react";

import { currentProfile } from "@/lib/current-profile";
import { db, directMessage, member } from "@/lib/db";
import { getGlobalRecentDmsForProfile, markConversationRead } from "@/lib/direct-messages";
import { UserAvatar } from "@/components/user-avatar";
import { getOrCreateConversation } from "@/lib/conversation";
import { getUserProfileNameMap } from "@/lib/user-profile";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatInput } from "@/components/chat/chat-input";
import { ConversationTypingIndicator } from "@/components/chat/conversation-typing-indicator";
import { LiveRecentDmsRail } from "@/components/chat/live-recent-dms-rail";
import { LiveDirectMessagesPane } from "@/components/chat/live-direct-messages-pane";
import { DeleteDmConversationButton } from "@/components/chat/delete-dm-conversation-button";
import { PrivateMessageAudioCallPanel } from "@/components/chat/private-message-audio-call-panel";
import { PrivateMessageVideoCallPanel } from "@/components/chat/private-message-video-call-panel";
import { PendingRequestItem } from "@/components/friends/pending-request-item";
import { IncomingPmCallTabNotifier } from "@/components/friends/incoming-pm-call-tab-notifier";
import { isBotUser } from "@/lib/is-bot-user";
import { formatPresenceStatusLabel, presenceStatusDotClassMap, resolveAutoPresenceStatus } from "@/lib/presence-status";
import { ensureFriendRelationsSchema } from "@/lib/friend-relations";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { NewUserCloverBadge } from "@/components/new-user-clover-badge";
import { ProfileNameWithServerTag } from "@/components/profile-name-with-server-tag";
import { ensureMessageReactionSchema } from "@/lib/message-reactions";
import { SupportHelpControls } from "@/components/topbar/support-help-controls";
import { ThreadsToastButton } from "@/components/topbar/threads-toast-button";
import {
  acceptPrivateMessageCall,
  createPrivateMessageCallRequest,
  denyPrivateMessageCall,
  endPrivateMessageCall,
  ensurePrivateMessageCallSchema,
  expireStalePrivateMessageCallRequests,
  findLatestPrivateMessageCall,
  findLatestPrivateMessageCallEvent,
  PRIVATE_MESSAGE_CALL_REQUEST_TIMEOUT_SECONDS,
} from "@/lib/private-message-calls";
import type { Member, Profile } from "@/lib/db/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const formatTimestamp = (value: Date) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "";
  }

  return value.toISOString();
};

interface UsersPageProps {
  searchParams: Promise<{
    serverId?: string | string[];
    memberId?: string | string[];
    view?: string | string[];
    filter?: string | string[];
    q?: string | string[];
    pendingBucket?: string | string[];
    source?: string | string[];
    pmRequest?: string | string[];
    pmCallAction?: string | string[];
    pmCallId?: string | string[];
    pmCallNotice?: string | string[];
  }>;
}

type DirectMessageRow = {
  id: string;
  content: string;
  fileUrl: string | null;
  deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  member: Member & {
    profile: Profile;
  };
};

const UsersPage = async ({ searchParams }: UsersPageProps) => {
  const resolvedSearchParams = await searchParams;

  const profile = await currentProfile();

  if (!profile) {
    return redirect("/sign-in");
  }

  const selectedServerId =
    typeof resolvedSearchParams?.serverId === "string"
      ? resolvedSearchParams.serverId
      : Array.isArray(resolvedSearchParams?.serverId)
        ? (resolvedSearchParams?.serverId[0] ?? "")
        : "";

  const recentDms = await getGlobalRecentDmsForProfile({
    profileId: profile.id,
    selectedServerId: selectedServerId || null,
    recentWindowDays: 30,
  });

  const selectedMemberId =
    typeof resolvedSearchParams?.memberId === "string"
      ? resolvedSearchParams.memberId
      : Array.isArray(resolvedSearchParams?.memberId)
        ? (resolvedSearchParams?.memberId[0] ?? "")
        : "";

  const selectedView =
    typeof resolvedSearchParams?.view === "string"
      ? resolvedSearchParams.view
      : Array.isArray(resolvedSearchParams?.view)
        ? (resolvedSearchParams?.view[0] ?? "friends")
        : "friends";

  const isFriendsView = selectedView.toLowerCase() === "friends";

  const selectedFilter =
    typeof resolvedSearchParams?.filter === "string"
      ? resolvedSearchParams.filter
      : Array.isArray(resolvedSearchParams?.filter)
        ? (resolvedSearchParams?.filter[0] ?? "all")
        : "all";

  const normalizedFilter = selectedFilter.toLowerCase();

  const searchQuery =
    typeof resolvedSearchParams?.q === "string"
      ? resolvedSearchParams.q
      : Array.isArray(resolvedSearchParams?.q)
        ? (resolvedSearchParams?.q[0] ?? "")
        : "";

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const selectedPendingBucket =
    typeof resolvedSearchParams?.pendingBucket === "string"
      ? resolvedSearchParams.pendingBucket
      : Array.isArray(resolvedSearchParams?.pendingBucket)
        ? (resolvedSearchParams?.pendingBucket[0] ?? "requests")
        : "requests";

  const selectedSource =
    typeof resolvedSearchParams?.source === "string"
      ? resolvedSearchParams.source
      : Array.isArray(resolvedSearchParams?.source)
        ? (resolvedSearchParams?.source[0] ?? "")
        : "";

  const selectedPmRequest =
    typeof resolvedSearchParams?.pmRequest === "string"
      ? resolvedSearchParams.pmRequest
      : Array.isArray(resolvedSearchParams?.pmRequest)
        ? (resolvedSearchParams?.pmRequest[0] ?? "")
        : "";

  const selectedPmCallAction =
    typeof resolvedSearchParams?.pmCallAction === "string"
      ? resolvedSearchParams.pmCallAction
      : Array.isArray(resolvedSearchParams?.pmCallAction)
        ? (resolvedSearchParams?.pmCallAction[0] ?? "")
        : "";

  const selectedPmCallId =
    typeof resolvedSearchParams?.pmCallId === "string"
      ? resolvedSearchParams.pmCallId
      : Array.isArray(resolvedSearchParams?.pmCallId)
        ? (resolvedSearchParams?.pmCallId[0] ?? "")
        : "";

  const selectedPmCallNotice =
    typeof resolvedSearchParams?.pmCallNotice === "string"
      ? resolvedSearchParams.pmCallNotice
      : Array.isArray(resolvedSearchParams?.pmCallNotice)
        ? (resolvedSearchParams?.pmCallNotice[0] ?? "")
        : "";

  const normalizedPendingBucket = selectedPendingBucket.toLowerCase() === "spam" ? "spam" : "requests";
  const normalizedSource = selectedSource.toLowerCase();
  const isRailMessageRequestsActive = normalizedFilter === "pending" && normalizedSource === "rail";
  const isIncomingCallsRailActive = normalizedSource === "incoming-calls";

  const activeListLabel =
    normalizedFilter === "online"
      ? "Online List"
      : normalizedFilter === "all"
        ? "All Friends List"
        : normalizedFilter === "pending"
          ? "Pending Friends List"
          : normalizedFilter === "blocked"
            ? "Blocked List"
            : normalizedFilter === "add-friend"
              ? "Add Friend List"
              : "Friends List";

  const friendsTabHref = (tab: "online" | "all" | "pending" | "blocked" | "add-friend") => {
    const base = `/users?view=friends&filter=${tab}`;
    const pendingBucketQuery = tab === "pending" ? `&pendingBucket=${normalizedPendingBucket}` : "";
    return `${base}${pendingBucketQuery}`;
  };

  type FriendListRow = {
    memberId: string | null;
    serverId: string | null;
    profileId: string;
    displayName: string;
    email: string | null;
    imageUrl: string | null;
    avatarDecorationUrl: string | null;
    profileCreatedAt: Date | string | null;
    presenceStatus: string | null;
    currentGame: string | null;
    presenceUpdatedAt: Date | string | null;
    hasConversation: boolean;
    isFriend: boolean;
    isBlocked: boolean;
  };

  type UsersPageFriendRow = {
    profileId: string;
    memberId: string | null;
    serverId: string | null;
    displayName: string;
    email: string | null;
    imageUrl: string | null;
    avatarDecorationUrl: string | null;
    profileCreatedAt: Date | string | null;
    status: ReturnType<typeof resolveAutoPresenceStatus>;
    currentGame: string | null;
    hasConversation: boolean;
    isFriend: boolean;
    isBlocked: boolean;
  };

  let filteredFriends: UsersPageFriendRow[] = [];

  let allResolvedFriends: UsersPageFriendRow[] = [];

  let pendingRequests: Array<{
    requestId: string;
    profileId: string;
    displayName: string;
    email: string | null;
    imageUrl: string | null;
    avatarDecorationUrl: string | null;
    isIncoming: boolean;
    isSpam: boolean;
  }> = [];

  let pendingRequestCount = 0;
  let pendingSpamCount = 0;

  type IncomingPmCallRequestRow = {
    id: string;
    conversationId: string;
    serverId: string;
    callType: "AUDIO" | "VIDEO";
    callerMemberId: string;
    callerProfileId: string;
    callerDisplayName: string;
    callerImageUrl: string | null;
    callerAvatarDecorationUrl: string | null;
    createdAt: Date | string;
  };

  let incomingPmCallRequests: IncomingPmCallRequestRow[] = [];

  if (
    isFriendsView &&
    (normalizedFilter === "online" || normalizedFilter === "all" || normalizedFilter === "pending" || normalizedFilter === "blocked" || normalizedFilter === "add-friend")
  ) {
    await ensureFriendRelationsSchema();

    const usersResult = await db.execute(sql`
      with self_members as (
        select m."id" as "id"
        from "Member" m
        where m."profileId" = ${profile.id}
      ),
      normalized_friend_requests as (
        select
          fr."id" as "id",
          upper(trim(coalesce(fr."status", ''))) as "status",
          coalesce(reqm."profileId", fr."requesterProfileId") as "requesterProfileId",
          coalesce(recm."profileId", fr."recipientProfileId") as "recipientProfileId",
          fr."createdAt" as "createdAt"
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
      ),
      candidate_profiles as (
        select distinct m."profileId" as "profileId"
        from "Member" m
        where m."profileId" <> ${profile.id}

        union

        select fe."bProfileId" as "profileId"
        from friend_edges fe
        where fe."aProfileId" = ${profile.id}

        union

        select fe."aProfileId" as "profileId"
        from friend_edges fe
        where fe."bProfileId" = ${profile.id}

        union

        select bp."blockedProfileId" as "profileId"
        from "BlockedProfile" bp
        where bp."profileId" = ${profile.id}
      ),
      candidate_members as (
        select
          cp."profileId" as "profileId",
          (
            select m."id"
            from "Member" m
            where m."profileId" = cp."profileId"
            order by m."createdAt" asc
            limit 1
          ) as "memberId",
          (
            select m."serverId"
            from "Member" m
            where m."profileId" = cp."profileId"
            order by m."createdAt" asc
            limit 1
          ) as "serverId"
        from candidate_profiles cp
      )
      select
        cm."memberId" as "memberId",
        cm."serverId" as "serverId",
        cm."profileId" as "profileId",
        coalesce(nullif(trim(up."profileName"), ''), u."name", u."email", 'User') as "displayName",
        u."email" as "email",
        coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
        up."avatarDecorationUrl" as "avatarDecorationUrl",
        u."account.created" as "profileCreatedAt",
        up."presenceStatus" as "presenceStatus",
        nullif(trim(to_jsonb(up)->>'currentGame'), '') as "currentGame",
        up."updatedAt" as "presenceUpdatedAt",
        exists (
          select 1
          from "Conversation" c
          inner join "Member" om
            on (
              c."memberOneId" in (select "id" from self_members)
              and om."id" = c."memberTwoId"
            )
            or (
              c."memberTwoId" in (select "id" from self_members)
              and om."id" = c."memberOneId"
            )
          where om."profileId" = cm."profileId"
        ) as "hasConversation",
        exists (
          select 1
          from friend_edges fe
          where (
              (fe."aProfileId" = ${profile.id} and fe."bProfileId" = cm."profileId")
              or
              (fe."bProfileId" = ${profile.id} and fe."aProfileId" = cm."profileId")
            )
        ) as "isFriend",
        exists (
          select 1
          from "BlockedProfile" bp
          where bp."profileId" = ${profile.id}
            and bp."blockedProfileId" = cm."profileId"
        ) as "isBlocked"
      from candidate_members cm
      left join "Users" u on u."userId" = cm."profileId"
      left join "UserProfile" up on up."userId" = cm."profileId"
      order by coalesce(nullif(trim(up."profileName"), ''), u."name", u."email", cm."profileId") asc
    `);

    const rows = (usersResult as unknown as { rows: FriendListRow[] }).rows ?? [];

    const resolvedCandidates: UsersPageFriendRow[] = rows
      .map((row) => ({
        profileId: row.profileId,
        memberId: row.memberId ?? null,
        serverId: row.serverId ?? null,
        displayName: row.displayName,
        email: row.email,
        imageUrl: row.imageUrl,
        avatarDecorationUrl: row.avatarDecorationUrl ?? null,
        profileCreatedAt: row.profileCreatedAt,
        status: resolveAutoPresenceStatus(row.presenceStatus, row.presenceUpdatedAt),
        currentGame: row.currentGame ?? null,
        hasConversation: Boolean(row.hasConversation),
        isFriend: Boolean(row.isFriend),
        isBlocked: Boolean(row.isBlocked),
      }));

    const acceptedFriends = resolvedCandidates.filter((row) => row.isFriend);

    allResolvedFriends = acceptedFriends;

    filteredFriends =
      normalizedFilter === "online"
        ? acceptedFriends.filter(
            (row) =>
              !row.isBlocked &&
              row.status !== "OFFLINE" &&
              row.status !== "INVISIBLE"
          )
        : normalizedFilter === "blocked"
          ? resolvedCandidates.filter((row) => row.isBlocked)
        : normalizedFilter === "add-friend"
          ? resolvedCandidates.filter((row) => !row.isFriend && !row.isBlocked)
        : normalizedFilter === "pending"
          ? resolvedCandidates.filter((row) => !row.isFriend && !row.isBlocked)
          : acceptedFriends;

    if (normalizedSearchQuery) {
      filteredFriends = filteredFriends.filter((row) => {
        const haystack = `${row.displayName} ${row.email ?? ""}`.toLowerCase();
        return haystack.includes(normalizedSearchQuery);
      });
    }

    if (normalizedFilter === "pending") {
      const pendingResult = await db.execute(sql`
        with normalized_friend_requests as (
          select
            fr."id" as "id",
            upper(trim(coalesce(fr."status", ''))) as "status",
            coalesce(reqm."profileId", fr."requesterProfileId") as "requesterProfileId",
            coalesce(recm."profileId", fr."recipientProfileId") as "recipientProfileId",
            fr."createdAt" as "createdAt"
          from "FriendRequest" fr
          left join "Member" reqm on reqm."id" = fr."requesterProfileId"
          left join "Member" recm on recm."id" = fr."recipientProfileId"
        )
        select
          nfr."id" as "requestId",
          case
            when nfr."requesterProfileId" = ${profile.id} then nfr."recipientProfileId"
            else nfr."requesterProfileId"
          end as "profileId",
          (nfr."recipientProfileId" = ${profile.id}) as "isIncoming",
          coalesce(
            nullif(trim(up."profileName"), ''),
            u."name",
            u."email",
            'User'
          ) as "displayName",
          u."email" as "email",
          coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
          up."avatarDecorationUrl" as "avatarDecorationUrl",
          exists (
            select 1
            from "BlockedProfile" bp
            where bp."profileId" = ${profile.id}
              and bp."blockedProfileId" = case
                when nfr."requesterProfileId" = ${profile.id} then nfr."recipientProfileId"
                else nfr."requesterProfileId"
              end
          ) as "isSpam"
        from normalized_friend_requests nfr
        left join "Users" u
          on u."userId" = case
            when nfr."requesterProfileId" = ${profile.id} then nfr."recipientProfileId"
            else nfr."requesterProfileId"
          end
        left join "UserProfile" up on up."userId" = u."userId"
        where nfr."status" = 'PENDING'
          and (nfr."requesterProfileId" = ${profile.id} or nfr."recipientProfileId" = ${profile.id})
        order by nfr."createdAt" desc
      `);

      const pendingRows = (pendingResult as unknown as {
        rows: Array<{
          requestId: string;
          profileId: string;
          isIncoming: boolean;
          displayName: string;
          email: string | null;
          imageUrl: string | null;
          avatarDecorationUrl: string | null;
          isSpam: boolean;
        }>;
      }).rows ?? [];

      pendingRequestCount = pendingRows.filter((row) => !row.isSpam).length;
      pendingSpamCount = pendingRows.filter((row) => row.isSpam).length;

      pendingRequests = pendingRows.filter((row) => {
        if (!normalizedSearchQuery) {
          return true;
        }

        const haystack = `${row.displayName} ${row.email ?? ""}`.toLowerCase();
        return haystack.includes(normalizedSearchQuery);
      });
    }
  }

  await ensurePrivateMessageCallSchema();
  await expireStalePrivateMessageCallRequests();

  const incomingPmCallRequestsResult = await db.execute(sql`
    select
      c."id" as "id",
      c."conversationId" as "conversationId",
      c."serverId" as "serverId",
      upper(trim(coalesce(c."callType", 'AUDIO'))) as "callType",
      c."callerMemberId" as "callerMemberId",
      caller."profileId" as "callerProfileId",
      coalesce(nullif(trim(caller_up."profileName"), ''), caller_u."name", caller_u."email", caller."profileId") as "callerDisplayName",
      coalesce(caller_u."avatarUrl", caller_u."avatar", caller_u."icon") as "callerImageUrl",
      caller_up."avatarDecorationUrl" as "callerAvatarDecorationUrl",
      c."createdAt" as "createdAt"
    from "PrivateMessageCall" c
    inner join "Member" callee on callee."id" = c."calleeMemberId"
    inner join "Member" caller on caller."id" = c."callerMemberId"
    left join "Users" caller_u on caller_u."userId" = caller."profileId"
    left join "UserProfile" caller_up on caller_up."userId" = caller."profileId"
    where callee."profileId" = ${profile.id}
      and upper(trim(coalesce(c."status", ''))) = 'REQUESTED'
      and coalesce(c."calleeAccepted", false) = false
    order by c."updatedAt" desc
    limit 20
  `);

  incomingPmCallRequests = ((incomingPmCallRequestsResult as unknown as {
    rows?: IncomingPmCallRequestRow[];
  }).rows ?? []).map((row) => ({
    ...row,
    callType: String(row.callType).toUpperCase() === "VIDEO" ? "VIDEO" : "AUDIO",
  }));

  const onlineFriendsForRail = allResolvedFriends
    .filter(
      (row) =>
        !row.isBlocked &&
        row.status !== "OFFLINE" &&
        row.status !== "INVISIBLE"
    )
    .slice(0, 8);

  let selectedConversation:
    | {
        serverId: string;
        conversationId: string;
        currentMember: NonNullable<Awaited<ReturnType<typeof db.query.member.findFirst>>>;
        otherMember: {
          id: string;
          profileId: string;
          name: string;
          imageUrl: string;
          avatarDecorationUrl: string | null;
          email: string;
          createdAt: Date | string | null;
        };
        isOtherMemberBot: boolean;
        messages: Array<any>;
        reactionsByMessageId: Map<string, Array<{ emoji: string; count: number }>>;
      }
    | null = null;

  if (selectedServerId && selectedMemberId) {
    const currentMember = await db.query.member.findFirst({
      where: and(eq(member.serverId, selectedServerId), eq(member.profileId, profile.id)),
    });

    if (currentMember) {
      const conversation = await getOrCreateConversation(currentMember.id, selectedMemberId);

      if (conversation) {
        await markConversationRead({
          profileId: profile.id,
          conversationId: conversation.id,
        });

        const otherMemberData =
          conversation.memberOne.profileId === profile.id ? conversation.memberTwo : conversation.memberOne;

        const messageRows: DirectMessageRow[] = await db.query.directMessage.findMany({
          where: eq(directMessage.conversationId, conversation.id),
          orderBy: [asc(directMessage.createdAt)],
          with: {
            member: {
              with: {
                profile: true,
              },
            },
          },
        });

        await ensureMessageReactionSchema();

        const reactionRows = messageRows.length
          ? await db.execute(sql`
              select "messageId", "emoji", "count"
              from "MessageReaction"
              where "scope" = 'direct'
                and "messageId" in (${sql.join(
                  messageRows.map((item) => sql`${item.id}`),
                  sql`, `
                )})
            `)
          : { rows: [] };

        const reactionMap = new Map<string, Array<{ emoji: string; count: number }>>();
        for (const row of ((reactionRows as unknown as {
          rows?: Array<{ messageId: string; emoji: string; count: number }>;
        }).rows ?? [])) {
          const bucket = reactionMap.get(row.messageId) ?? [];
          bucket.push({ emoji: row.emoji, count: Number(row.count ?? 0) });
          reactionMap.set(row.messageId, bucket);
        }

        const profileNameMap = await getUserProfileNameMap(
          messageRows.map((item) => item.member.profileId)
        );

        const uniqueMessageProfileIds = Array.from(
          new Set([
            ...messageRows.map((item) => item.member.profileId).filter(Boolean),
            otherMemberData.profileId,
          ])
        );

        const profileRoleRows = uniqueMessageProfileIds.length
          ? await db.execute(sql`
              select "userId", "role"
              from "Users"
              where "userId" in (${sql.join(uniqueMessageProfileIds.map((id) => sql`${id}`), sql`, `)})
            `)
          : { rows: [] };

        const profileRoleMap = new Map<string, string | null>(
          ((profileRoleRows as unknown as {
            rows?: Array<{ userId: string; role: string | null }>;
          }).rows ?? []).map((row) => [row.userId, row.role ?? null])
        );

        const profileDecorationRows = uniqueMessageProfileIds.length
          ? await db.execute(sql`
              select "userId", "avatarDecorationUrl"
              from "UserProfile"
              where "userId" in (${sql.join(uniqueMessageProfileIds.map((id) => sql`${id}`), sql`, `)})
            `)
          : { rows: [] };

        const profileDecorationMap = new Map<string, string | null>(
          ((profileDecorationRows as unknown as {
            rows?: Array<{ userId: string; avatarDecorationUrl: string | null }>;
          }).rows ?? []).map((row) => [row.userId, row.avatarDecorationUrl ?? null])
        );

        const hydratedRows = messageRows.map((item) => {
          const profileName = profileNameMap.get(item.member.profileId);
          const profileRole = profileRoleMap.get(item.member.profileId) ?? null;
          const profileAvatarDecorationUrl = profileDecorationMap.get(item.member.profileId) ?? null;

          return {
            ...item,
            member: {
              ...item.member,
              profile: {
                ...item.member.profile,
                name: profileName ?? item.member.profile.name,
                role: profileRole,
                avatarDecorationUrl: profileAvatarDecorationUrl,
              },
            },
          };
        });

        selectedConversation = {
          serverId: selectedServerId,
          conversationId: conversation.id,
          currentMember,
          otherMember: {
            id: otherMemberData.id,
            profileId: otherMemberData.profileId,
            name: otherMemberData.profile.name,
            imageUrl: otherMemberData.profile.imageUrl,
            avatarDecorationUrl: profileDecorationMap.get(otherMemberData.profileId) ?? null,
            email: otherMemberData.profile.email,
            createdAt: otherMemberData.profile.createdAt,
          },
          isOtherMemberBot: isBotUser({
            name: otherMemberData.profile.name,
            email: otherMemberData.profile.email,
          }),
          messages: hydratedRows,
          reactionsByMessageId: reactionMap,
        };
      }
    }
  }

  const selectedPmBaseHref = selectedConversation
    ? `/users?serverId=${encodeURIComponent(selectedConversation.serverId)}&memberId=${encodeURIComponent(selectedConversation.otherMember.id)}`
    : "/users";

  let activePrivateMessageCall: Awaited<ReturnType<typeof findLatestPrivateMessageCall>> | null = null;
  let latestPrivateMessageCallEvent: Awaited<ReturnType<typeof findLatestPrivateMessageCallEvent>> | null = null;

  if (selectedConversation) {
    const normalizedPmCallAction = String(selectedPmCallAction).trim().toLowerCase();
    const normalizedPmCallId = String(selectedPmCallId).trim();

    if (normalizedPmCallAction === "request-audio" || normalizedPmCallAction === "request-video") {
      await createPrivateMessageCallRequest({
        conversationId: selectedConversation.conversationId,
        serverId: selectedConversation.serverId,
        callerMemberId: selectedConversation.currentMember.id,
        calleeMemberId: selectedConversation.otherMember.id,
        callType: normalizedPmCallAction === "request-video" ? "VIDEO" : "AUDIO",
      });

      redirect(selectedPmBaseHref);
    }

    if (normalizedPmCallAction === "accept" && normalizedPmCallId) {
      await acceptPrivateMessageCall({
        callId: normalizedPmCallId,
        memberId: selectedConversation.currentMember.id,
      });

      redirect(selectedPmBaseHref);
    }

    if (normalizedPmCallAction === "deny" && normalizedPmCallId) {
      await denyPrivateMessageCall({
        callId: normalizedPmCallId,
        memberId: selectedConversation.currentMember.id,
      });

      redirect(selectedPmBaseHref);
    }

    if (normalizedPmCallAction === "hangup" && normalizedPmCallId) {
      await endPrivateMessageCall({
        callId: normalizedPmCallId,
        memberId: selectedConversation.currentMember.id,
      });

      redirect(selectedPmBaseHref);
    }

    activePrivateMessageCall = await findLatestPrivateMessageCall(selectedConversation.conversationId);
    latestPrivateMessageCallEvent = await findLatestPrivateMessageCallEvent(selectedConversation.conversationId);
  }

  const isPmAudioCallActive =
    Boolean(activePrivateMessageCall) &&
    String(activePrivateMessageCall?.status).toUpperCase() === "ACTIVE" &&
    String(activePrivateMessageCall?.callType).toUpperCase() === "AUDIO";
  const isPmVideoCallActive =
    Boolean(activePrivateMessageCall) &&
    String(activePrivateMessageCall?.status).toUpperCase() === "ACTIVE" &&
    String(activePrivateMessageCall?.callType).toUpperCase() === "VIDEO";
  const isPmRequestPending =
    Boolean(selectedConversation) && ["1", "true", "yes"].includes(String(selectedPmRequest).trim().toLowerCase());

  const isCallRequested =
    Boolean(activePrivateMessageCall) &&
    String(activePrivateMessageCall?.status).toUpperCase() === "REQUESTED";
  const isCurrentUserCaller =
    Boolean(activePrivateMessageCall) &&
    selectedConversation?.currentMember.id === activePrivateMessageCall?.callerMemberId;
  const currentUserAcceptedCallRequest = Boolean(
    activePrivateMessageCall &&
    (
      (isCurrentUserCaller && activePrivateMessageCall.callerAccepted) ||
      (!isCurrentUserCaller && activePrivateMessageCall.calleeAccepted)
    )
  );
  const otherUserAcceptedCallRequest = Boolean(
    activePrivateMessageCall &&
    (
      (isCurrentUserCaller && activePrivateMessageCall.calleeAccepted) ||
      (!isCurrentUserCaller && activePrivateMessageCall.callerAccepted)
    )
  );

  const isPmAudioCallRequestPending =
    Boolean(isCallRequested) &&
    String(activePrivateMessageCall?.callType).toUpperCase() === "AUDIO";
  const isPmVideoCallRequestPending =
    Boolean(isCallRequested) &&
    String(activePrivateMessageCall?.callType).toUpperCase() === "VIDEO";

  const callRequestAgeSeconds =
    isCallRequested && activePrivateMessageCall?.createdAt
      ? Math.max(
          0,
          Math.floor((Date.now() - new Date(activePrivateMessageCall.createdAt).getTime()) / 1000)
        )
      : 0;
  const callRequestRemainingSeconds = Math.max(
    0,
    PRIVATE_MESSAGE_CALL_REQUEST_TIMEOUT_SECONDS - callRequestAgeSeconds
  );

  const isLatestCallTerminal =
    Boolean(latestPrivateMessageCallEvent) &&
    ["DENIED", "CANCELLED", "ENDED"].includes(
      String(latestPrivateMessageCallEvent?.status).toUpperCase()
    );
  const latestCallEventAgeMinutes = latestPrivateMessageCallEvent?.updatedAt
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(latestPrivateMessageCallEvent.updatedAt).getTime()) / 60000)
      )
    : Number.POSITIVE_INFINITY;
  const noticeHiddenToken = String(selectedPmCallNotice).trim().toLowerCase();
  const activeNoticeToken = latestPrivateMessageCallEvent?.id
    ? `hidden-${String(latestPrivateMessageCallEvent.id).toLowerCase()}`
    : "";

  const shouldShowRecentCallNotice =
    !isPmRequestPending &&
    !isPmAudioCallActive &&
    !isPmVideoCallActive &&
    !isCallRequested &&
    isLatestCallTerminal &&
    latestCallEventAgeMinutes <= 5 &&
    (!activeNoticeToken || noticeHiddenToken !== activeNoticeToken);
  const latestCallTypeLabel =
    String(latestPrivateMessageCallEvent?.callType).toUpperCase() === "VIDEO"
      ? "video"
      : "audio";
  const latestCallStatusLabel = String(latestPrivateMessageCallEvent?.status).toUpperCase();
  const recentCallNoticeText =
    latestCallStatusLabel === "DENIED"
      ? `${selectedConversation?.otherMember.name ?? "The user"} declined the ${latestCallTypeLabel} call.`
      : latestCallStatusLabel === "CANCELLED"
        ? `Missed ${latestCallTypeLabel} call request (timed out or canceled).`
        : `${latestCallTypeLabel.charAt(0).toUpperCase()}${latestCallTypeLabel.slice(1)} call ended.`;

  const requestPmAudioCallHref = `${selectedPmBaseHref}&pmCallAction=request-audio`;
  const requestPmVideoCallHref = `${selectedPmBaseHref}&pmCallAction=request-video`;
  const dismissPmCallNoticeHref = latestPrivateMessageCallEvent?.id
    ? `${selectedPmBaseHref}&pmCallNotice=hidden-${encodeURIComponent(latestPrivateMessageCallEvent.id)}`
    : `${selectedPmBaseHref}&pmCallNotice=hidden`;
  const retrySameTypeHref = latestCallTypeLabel === "video" ? requestPmVideoCallHref : requestPmAudioCallHref;
  const acceptPmCallHref = activePrivateMessageCall
    ? `${selectedPmBaseHref}&pmCallAction=accept&pmCallId=${encodeURIComponent(activePrivateMessageCall.id)}`
    : selectedPmBaseHref;
  const stopPmCallHref = activePrivateMessageCall
    ? `${selectedPmBaseHref}&pmCallAction=hangup&pmCallId=${encodeURIComponent(activePrivateMessageCall.id)}`
    : selectedPmBaseHref;
  const denyPmCallHref = activePrivateMessageCall
    ? `${selectedPmBaseHref}&pmCallAction=deny&pmCallId=${encodeURIComponent(activePrivateMessageCall.id)}`
    : selectedPmBaseHref;
  const acceptPmHref = selectedPmBaseHref;
  const denyPmHref = "/users?view=friends";
  const incomingPmCallCount = incomingPmCallRequests.length;
  const firstIncomingPmCallHref = incomingPmCallRequests[0]
    ? `/users?serverId=${encodeURIComponent(incomingPmCallRequests[0].serverId)}&memberId=${encodeURIComponent(incomingPmCallRequests[0].callerMemberId)}&source=incoming-calls`
    : "/users?view=friends";
  const currentUserPresenceStatus = resolveAutoPresenceStatus(profile.presenceStatus, profile.updatedAt);
  const showPmVideoSplitLayout = !isPmRequestPending && isPmVideoCallActive;
  const canSeeInvisibleBoxes = hasInAccordAdministrativeAccess(profile.role);
  const initialRecentDmItems = recentDms.map((dm) => ({
    conversationId: dm.conversationId,
    serverId: dm.serverId,
    memberId: dm.memberId,
    profileId: dm.profileId,
    displayName: dm.displayName,
    imageUrl: dm.imageUrl,
    avatarDecorationUrl: dm.avatarDecorationUrl,
    profileCreatedAt: dm.profileCreatedAt ? new Date(dm.profileCreatedAt).toISOString() : null,
    timestampLabel: formatTimestamp(dm.lastMessageAt),
    lastMessageAt: new Date(dm.lastMessageAt).toISOString(),
    unreadCount: dm.unreadCount,
  }));
  const initialConversationMessages = selectedConversation
    ? selectedConversation.messages.map((item) => ({
        id: item.id,
        content: item.content,
        member: item.member,
        fileUrl: item.fileUrl,
        deleted: item.deleted,
        timestamp: formatTimestamp(new Date(item.createdAt)),
        isUpdated: new Date(item.updatedAt).getTime() !== new Date(item.createdAt).getTime(),
      }))
    : [];
  const initialConversationReactions = selectedConversation
    ? Object.fromEntries(Array.from(selectedConversation.reactionsByMessageId.entries()))
    : {};

  return (
    <div className="theme-users-shell h-full bg-[#313338] text-[#dbdee1]">
      <IncomingPmCallTabNotifier incomingCallCount={incomingPmCallCount} />
      <header
        className="theme-server-topbar fixed right-0 top-0 z-40 flex h-12 items-center overflow-hidden rounded-b-xl border-b border-border bg-background"
        style={{ left: "116px" }}
      >
        <SupportHelpControls panelTop={56} showInvisibleBoxes={canSeeInvisibleBoxes} />

        <h1
          className="absolute inset-y-0 z-10 flex -translate-x-1/2 items-center truncate text-center text-sm font-bold uppercase tracking-[0.08em] text-foreground"
          style={{ left: "calc((100% - 256px) / 2)", maxWidth: "calc(100% - 592px)" }}
        >
          In-Accord
        </h1>

        <div className="absolute inset-y-0 z-20 flex items-center gap-1 text-muted-foreground" style={{ right: "308px" }}>
          {selectedConversation ? (
            <Link
              href={isPmAudioCallActive ? stopPmCallHref : requestPmAudioCallHref}
              title={isPmAudioCallActive ? "End PM Audio Call" : "Start PM Audio Call"}
              aria-label={isPmAudioCallActive ? "End PM Audio Call" : "Start PM Audio Call"}
              className={`inline-flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-[#3f4248] hover:text-white ${
                isPmAudioCallActive ? "bg-[#248046] text-white" : ""
              }`}
            >
              <Phone className="h-4 w-4" suppressHydrationWarning />
            </Link>
          ) : (
            <button
              type="button"
              title="Select a PM to start an audio call"
              aria-label="Select a PM to start an audio call"
              disabled
              className="inline-flex h-8 w-8 items-center justify-center rounded opacity-50"
            >
              <Phone className="h-4 w-4" suppressHydrationWarning />
            </button>
          )}
          <ThreadsToastButton className="inline-flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-[#3f4248] hover:text-white" />
          {selectedConversation ? (
            <Link
              href={isPmVideoCallActive ? stopPmCallHref : requestPmVideoCallHref}
              title={isPmVideoCallActive ? "End PM Video Call" : "Start PM Video Call"}
              aria-label={isPmVideoCallActive ? "End PM Video Call" : "Start PM Video Call"}
              className={`inline-flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-[#3f4248] hover:text-white ${
                isPmVideoCallActive ? "bg-[#5865f2] text-white" : ""
              }`}
            >
              <Video className="h-4 w-4" suppressHydrationWarning />
            </Link>
          ) : (
            <button
              type="button"
              title="Select a PM to start a video call"
              aria-label="Select a PM to start a video call"
              disabled
              className="inline-flex h-8 w-8 items-center justify-center rounded opacity-50"
            >
              <Video className="h-4 w-4" suppressHydrationWarning />
            </button>
          )}
          <button type="button" title="Invite People" className="inline-flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-[#3f4248] hover:text-white">
            <UserPlus className="h-4 w-4" suppressHydrationWarning />
          </button>
          <Link
            href={firstIncomingPmCallHref}
            title={incomingPmCallCount > 0 ? `${incomingPmCallCount} incoming PM call request${incomingPmCallCount === 1 ? "" : "s"}` : "Notifications"}
            aria-label={incomingPmCallCount > 0 ? `${incomingPmCallCount} incoming PM call request${incomingPmCallCount === 1 ? "" : "s"}` : "Notifications"}
            className="relative inline-flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-[#3f4248] hover:text-white"
          >
            <Bell className="h-4 w-4" suppressHydrationWarning />
            {incomingPmCallCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-4 text-white">
                {incomingPmCallCount > 9 ? "9+" : incomingPmCallCount}
              </span>
            ) : null}
          </Link>
          <button type="button" title="Bug Reports" className="inline-flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-[#3f4248] hover:text-white">
            <Bug className="h-4 w-4" suppressHydrationWarning />
          </button>
        </div>

        <div
          className="absolute inset-y-0 z-20 flex items-center"
          style={{ right: "62.5px" }}
        >
          <div className="theme-server-search-shell w-40.75 rounded-md border border-border bg-card/90">
            <div className="flex h-8 items-center px-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" suppressHydrationWarning />
              <input
                type="text"
                placeholder="Search"
                aria-label="Search home"
                className="ml-2 w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>
          </div>
        </div>
      </header>

      <div className="grid box-border h-full w-full grid-cols-[240px_1fr_288px] gap-2 p-2 pt-14">

        <aside
          className="theme-users-left-rail self-start min-h-0 overflow-y-auto rounded-2xl border border-black/20 bg-[#2b2d31] p-2.5 shadow-xl shadow-black/35"
          style={{ height: "calc(100% - 92px)" }}
        >
          <div className="flex h-full flex-col">
            <div>
              <div className="mb-2 rounded-md bg-[#1e1f22] px-3 py-2 text-sm font-semibold text-[#f2f3f5]">
                <div className="flex items-center justify-between">
                  <span>Find or start a conversation</span>
                  <Search className="h-4 w-4 text-[#949ba4]" suppressHydrationWarning />
                </div>
              </div>

              <nav className="mb-4 space-y-1">
                <Link
                  href="/users?view=friends"
                  className={`block w-full rounded-md px-2.5 py-2 text-left text-sm font-medium transition ${
                    isRailMessageRequestsActive
                      ? "text-[#b5bac1] hover:bg-[#3f4248] hover:text-[#f2f3f5]"
                      : "bg-[#404249] text-white"
                  }`}
                >
                  Friends
                </Link>
                <Link
                  href="/users?view=friends&filter=pending&pendingBucket=requests&source=rail"
                  className={`block w-full rounded-md px-2.5 py-2 text-left text-sm transition ${
                    isRailMessageRequestsActive
                      ? "bg-[#3f4248] text-[#f2f3f5]"
                      : "text-[#b5bac1] hover:bg-[#3f4248] hover:text-[#f2f3f5]"
                  }`}
                >
                  Message Requests
                </Link>
              </nav>

              <div className="mt-4 rounded-md bg-[#1e1f22] p-3 text-xs text-[#949ba4]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#b5bac1]">
                  Private Messages
                </p>

                <LiveRecentDmsRail
                  initialItems={initialRecentDmItems}
                  profileId={profile.id}
                  selectedConversationId={selectedConversation?.conversationId ?? null}
                  selectedServerId={selectedServerId || null}
                />
              </div>
            </div>
          </div>
        </aside>

        <div className="flex h-full min-h-0 flex-col gap-2">
        <main className="theme-users-main-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-black/20 bg-[#313338] shadow-xl shadow-black/35">
          <header className="theme-users-main-header flex h-12 items-center justify-between border-b border-black/20 px-4">
            <div className="flex items-center gap-3">
              <MessageCircle className="h-5 w-5 text-[#b5bac1]" suppressHydrationWarning />
              <span className="text-sm font-bold text-white">
                {selectedConversation
                  ? selectedConversation.otherMember.name
                  : isFriendsView && normalizedFilter === "pending"
                    ? "Pending Friends List"
                    : "Friends"}
              </span>
              {!selectedConversation && isFriendsView ? (
                <>
                  <span className="h-5 w-px bg-white/15" />
                  {normalizedFilter === "pending" ? (
                    <span className="rounded bg-[#5865f2] px-2 py-0.5 text-xs text-white">
                      Total Pending: {pendingRequestCount + pendingSpamCount}
                    </span>
                  ) : null}
                  <Link
                    href={friendsTabHref("online")}
                    className={`rounded px-2 py-0.5 text-xs ${normalizedFilter === "online" ? "bg-[#5865f2] text-white" : "bg-[#3f4248] text-[#dcddde]"}`}
                  >
                    Online
                  </Link>
                  <Link
                    href={friendsTabHref("all")}
                    className={`rounded px-2 py-0.5 text-xs ${normalizedFilter === "all" ? "bg-[#5865f2] text-white" : "bg-[#3f4248] text-[#dcddde]"}`}
                  >
                    All
                  </Link>
                  <Link
                    href={friendsTabHref("pending")}
                    className={`rounded px-2 py-0.5 text-xs ${normalizedFilter === "pending" ? "bg-[#5865f2] text-white" : "bg-[#3f4248] text-[#dcddde]"}`}
                  >
                    Pending
                  </Link>
                  <Link
                    href={friendsTabHref("blocked")}
                    className={`rounded px-2 py-0.5 text-xs ${normalizedFilter === "blocked" ? "bg-[#5865f2] text-white" : "bg-[#3f4248] text-[#dcddde]"}`}
                  >
                    Blocked
                  </Link>
                  <Link
                    href={friendsTabHref("add-friend")}
                    className={`rounded px-2 py-0.5 text-xs font-semibold ${normalizedFilter === "add-friend" ? "bg-[#1f8b4c] text-white" : "bg-[#248046] text-white hover:bg-[#1f8b4c]"}`}
                  >
                    Add Friend
                  </Link>
                </>
              ) : null}
            </div>
            <div className="flex items-center gap-2 text-[#b5bac1]">
              {selectedConversation ? (
                <Link
                  href={isPmVideoCallActive ? stopPmCallHref : requestPmVideoCallHref}
                  title={isPmVideoCallActive ? "End PM Video Call" : "Start PM Video Call"}
                  aria-label={isPmVideoCallActive ? "End PM Video Call" : "Start PM Video Call"}
                  className={`rounded p-1.5 hover:bg-[#3f4248] ${isPmVideoCallActive ? "bg-[#5865f2] text-white" : ""}`}
                >
                  <Video className="h-4 w-4" suppressHydrationWarning />
                </Link>
              ) : (
                <button
                  type="button"
                  title="Select a PM to start a video call"
                  aria-label="Select a PM to start a video call"
                  disabled
                  className="rounded p-1.5 opacity-50"
                >
                  <Video className="h-4 w-4" suppressHydrationWarning />
                </button>
              )}
              {selectedConversation ? (
                <Link
                  href={isPmAudioCallActive ? stopPmCallHref : requestPmAudioCallHref}
                  title={isPmAudioCallActive ? "End PM Audio Call" : "Start PM Audio Call"}
                  aria-label={isPmAudioCallActive ? "End PM Audio Call" : "Start PM Audio Call"}
                  className={`rounded p-1.5 hover:bg-[#3f4248] ${isPmAudioCallActive ? "bg-[#248046] text-white" : ""}`}
                >
                  <Phone className="h-4 w-4" suppressHydrationWarning />
                </Link>
              ) : (
                <button
                  type="button"
                  title="Select a PM to start an audio call"
                  aria-label="Select a PM to start an audio call"
                  disabled
                  className="rounded p-1.5 opacity-50"
                >
                  <Phone className="h-4 w-4" suppressHydrationWarning />
                </button>
              )}
              <button className="rounded p-1.5 hover:bg-[#3f4248]"><UserPlus className="h-4 w-4" suppressHydrationWarning /></button>
            </div>
          </header>

          <section className="flex min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">
            {selectedConversation ? (
              <div className="flex h-full min-h-0 w-full flex-col gap-2">
                {isPmRequestPending ? (
                  <div className="rounded-xl border border-indigo-400/35 bg-indigo-500/10 p-3">
                    <p className="text-sm font-semibold text-indigo-100">Private Message Request</p>
                    <p className="mt-1 text-xs text-indigo-100/90">
                      {selectedConversation.otherMember.name} wants to PM you. Accept or deny before opening chat.
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Link
                        href={acceptPmHref}
                        className="inline-flex h-8 items-center rounded-md border border-emerald-400/40 bg-emerald-500/20 px-3 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
                      >
                        Accept PM
                      </Link>
                      <Link
                        href={denyPmHref}
                        className="inline-flex h-8 items-center rounded-md border border-rose-400/40 bg-rose-500/20 px-3 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/30"
                      >
                        Deny PM
                      </Link>
                    </div>
                  </div>
                ) : null}

                {!isPmRequestPending && (isPmAudioCallRequestPending || isPmVideoCallRequestPending) ? (
                  <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 p-3">
                    <p className="text-sm font-semibold text-amber-100">
                      {isPmAudioCallRequestPending ? "PM Audio Call Request" : "PM Video Call Request"}
                    </p>
                    <p className="mt-1 text-xs text-amber-100/90">
                      {currentUserAcceptedCallRequest
                        ? `Waiting for ${selectedConversation.otherMember.name} to accept the ${isPmAudioCallRequestPending ? "audio" : "video"} call.`
                        : isCurrentUserCaller
                          ? `You started a ${isPmAudioCallRequestPending ? "PM audio" : "PM video"} call request. Accept to join your own request.`
                          : `${selectedConversation.otherMember.name} is requesting a ${isPmAudioCallRequestPending ? "PM audio" : "PM video"} call. Accept to join.`}
                    </p>
                    <p className="mt-1 text-[11px] text-amber-200/90">
                      Ringing... request expires in {callRequestRemainingSeconds}s.
                    </p>
                    {currentUserAcceptedCallRequest && otherUserAcceptedCallRequest ? (
                      <p className="mt-1 text-[11px] text-emerald-200">Both parties accepted. Connecting call...</p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2">
                      {!currentUserAcceptedCallRequest ? (
                        <Link
                          href={acceptPmCallHref}
                          className="inline-flex h-8 items-center rounded-md border border-emerald-400/40 bg-emerald-500/20 px-3 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
                        >
                          Accept
                        </Link>
                      ) : null}
                      <Link
                        href={denyPmCallHref}
                        className="inline-flex h-8 items-center rounded-md border border-rose-400/40 bg-rose-500/20 px-3 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/30"
                      >
                        {currentUserAcceptedCallRequest ? "Cancel" : "Deny"}
                      </Link>
                    </div>
                  </div>
                ) : null}

                {shouldShowRecentCallNotice ? (
                  <div className="rounded-xl border border-zinc-400/35 bg-zinc-500/10 p-3">
                    <p className="text-sm font-semibold text-zinc-100">Recent PM Call</p>
                    <p className="mt-1 text-xs text-zinc-200/90">{recentCallNoticeText}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Link
                        href={requestPmAudioCallHref}
                        className="inline-flex h-8 items-center rounded-md border border-emerald-400/40 bg-emerald-500/20 px-3 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
                      >
                        <Phone className="mr-1.5 h-3.5 w-3.5" suppressHydrationWarning />
                        Call back (Audio)
                      </Link>
                      <Link
                        href={requestPmVideoCallHref}
                        className="inline-flex h-8 items-center rounded-md border border-indigo-400/40 bg-indigo-500/20 px-3 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-500/30"
                      >
                        <Video className="mr-1.5 h-3.5 w-3.5" suppressHydrationWarning />
                        Call back (Video)
                      </Link>
                      <Link
                        href={retrySameTypeHref}
                        className="inline-flex h-8 items-center rounded-md border border-amber-400/40 bg-amber-500/20 px-3 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/30"
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" suppressHydrationWarning />
                        Retry {latestCallTypeLabel === "video" ? "Video" : "Audio"}
                      </Link>
                      <Link
                        href={dismissPmCallNoticeHref}
                        className="inline-flex h-8 items-center rounded-md border border-zinc-400/40 bg-zinc-600/20 px-3 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-600/30"
                      >
                        <X className="mr-1.5 h-3.5 w-3.5" suppressHydrationWarning />
                        Dismiss
                      </Link>
                    </div>
                  </div>
                ) : null}

                {!isPmRequestPending ? (
                  <>
                    <PrivateMessageAudioCallPanel
                      isActive={isPmAudioCallActive}
                      participantName={selectedConversation.otherMember.name}
                      conversationId={selectedConversation.conversationId}
                      hangupHref={stopPmCallHref}
                    />

                    {!showPmVideoSplitLayout ? (
                      <PrivateMessageVideoCallPanel
                        isActive={isPmVideoCallActive}
                        participantName={selectedConversation.otherMember.name}
                        conversationId={selectedConversation.conversationId}
                        hangupHref={stopPmCallHref}
                      />
                    ) : null}
                  </>
                ) : null}

                {showPmVideoSplitLayout ? (
                  <div className="grid min-h-0 flex-1 grid-rows-2 gap-2">
                    <PrivateMessageVideoCallPanel
                      isActive={isPmVideoCallActive}
                      participantName={selectedConversation.otherMember.name}
                      conversationId={selectedConversation.conversationId}
                      hangupHref={stopPmCallHref}
                      className="min-h-0"
                    />

                    <div className="theme-users-chat-surface flex min-h-0 flex-col overflow-hidden rounded-3xl border border-black/20 bg-white shadow-xl shadow-black/35 dark:bg-[#313338]">
                      <ChatHeader
                        imageUrl={selectedConversation.otherMember.imageUrl}
                        avatarDecorationUrl={selectedConversation.otherMember.avatarDecorationUrl}
                        name={selectedConversation.otherMember.name}
                        profileId={selectedConversation.otherMember.profileId}
                        memberId={selectedConversation.otherMember.id}
                        profileCreatedAt={selectedConversation.otherMember.createdAt}
                        isBot={selectedConversation.isOtherMemberBot}
                        serverId={selectedConversation.serverId}
                        type="conversation"
                        videoCallHref={isPmVideoCallActive ? stopPmCallHref : requestPmVideoCallHref}
                        isVideoCallActive={isPmVideoCallActive}
                      />

                      <div className="flex justify-end border-b border-black/20 px-3 py-1">
                        <DeleteDmConversationButton
                          conversationId={selectedConversation.conversationId}
                          serverId={selectedConversation.serverId}
                          returnToUsersRoot
                          title="Delete this PM"
                        />
                      </div>

                      <LiveDirectMessagesPane
                        initialMessages={initialConversationMessages}
                        initialReactionsByMessageId={initialConversationReactions}
                        currentMember={selectedConversation.currentMember}
                        currentProfile={profile}
                        conversationId={selectedConversation.conversationId}
                        serverId={selectedConversation.serverId}
                        className="flex-1 overflow-y-auto"
                        otherMemberName={selectedConversation.otherMember.name}
                      />

                      <div className="theme-users-chat-bar w-full max-w-full border-t border-black/20 bg-white shadow-lg shadow-black/25 dark:bg-[#313338]">
                        <ConversationTypingIndicator conversationId={selectedConversation.conversationId} />
                        <ChatInput
                          name={selectedConversation.otherMember.name}
                          type="conversation"
                          apiUrl="/api/socket/direct-messages"
                          conversationId={selectedConversation.conversationId}
                          query={{ conversationId: selectedConversation.conversationId }}
                          mentionUsers={[
                            {
                              id: profile.id,
                              label: profile.name ?? "You",
                            },
                            {
                              id: selectedConversation.otherMember.id,
                              label: selectedConversation.otherMember.name,
                            },
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="theme-users-chat-surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-black/20 bg-white shadow-xl shadow-black/35 dark:bg-[#313338]">
                      <ChatHeader
                        imageUrl={selectedConversation.otherMember.imageUrl}
                        avatarDecorationUrl={selectedConversation.otherMember.avatarDecorationUrl}
                        name={selectedConversation.otherMember.name}
                        profileId={selectedConversation.otherMember.profileId}
                        memberId={selectedConversation.otherMember.id}
                        profileCreatedAt={selectedConversation.otherMember.createdAt}
                        isBot={selectedConversation.isOtherMemberBot}
                        serverId={selectedConversation.serverId}
                        type="conversation"
                        videoCallHref={isPmVideoCallActive ? stopPmCallHref : requestPmVideoCallHref}
                        isVideoCallActive={isPmVideoCallActive}
                      />

                      <div className="flex justify-end border-b border-black/20 px-3 py-1">
                        <DeleteDmConversationButton
                          conversationId={selectedConversation.conversationId}
                          serverId={selectedConversation.serverId}
                          returnToUsersRoot
                          title="Delete this PM"
                        />
                      </div>

                      <LiveDirectMessagesPane
                        initialMessages={initialConversationMessages}
                        initialReactionsByMessageId={initialConversationReactions}
                        currentMember={selectedConversation.currentMember}
                        currentProfile={profile}
                        conversationId={selectedConversation.conversationId}
                        serverId={selectedConversation.serverId}
                        className="flex-1 overflow-y-auto"
                        otherMemberName={selectedConversation.otherMember.name}
                      />
                    </div>

                    <div className="theme-users-chat-bar w-full max-w-full rounded-2xl border border-black/20 bg-white shadow-lg shadow-black/25 dark:bg-[#313338]">
                      <ConversationTypingIndicator conversationId={selectedConversation.conversationId} />
                      <ChatInput
                        name={selectedConversation.otherMember.name}
                        type="conversation"
                        apiUrl="/api/socket/direct-messages"
                        conversationId={selectedConversation.conversationId}
                        query={{ conversationId: selectedConversation.conversationId }}
                        mentionUsers={[
                          {
                            id: profile.id,
                            label: profile.name ?? "You",
                          },
                          {
                            id: selectedConversation.otherMember.id,
                            label: selectedConversation.otherMember.name,
                          },
                        ]}
                      />
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="w-full">
                {isFriendsView && (normalizedFilter === "online" || normalizedFilter === "all" || normalizedFilter === "pending" || normalizedFilter === "blocked" || normalizedFilter === "add-friend") ? (
                  <div className="rounded-xl border border-black/20 bg-[#2b2d31] p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#b5bac1]">
                      {activeListLabel}
                    </p>

                    <form method="GET" className="mb-3 flex items-center gap-2">
                      <input type="hidden" name="view" value="friends" />
                      <input type="hidden" name="filter" value={normalizedFilter} />
                      <div className="relative w-full">
                        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#949ba4]" suppressHydrationWarning />
                        <input
                          name="q"
                          defaultValue={searchQuery}
                          placeholder={`Search ${normalizedFilter.replace("-", " ")} users`}
                          className="h-8 w-full rounded-md border border-black/20 bg-[#1e1f22] pl-8 pr-3 text-xs text-white placeholder:text-[#7f8690] outline-none focus:border-[#5865f2]/70"
                        />
                      </div>
                      <button
                        type="submit"
                        className="h-8 rounded-md bg-[#3f4248] px-2 text-xs font-semibold text-white hover:bg-[#4a4d55]"
                      >
                        Search
                      </button>
                    </form>

                    {normalizedFilter === "pending" ? (
                      pendingRequests.length === 0 ? (
                        <p className="text-sm text-[#b5bac1]">None</p>
                      ) : (
                        <div className="space-y-1">
                          {pendingRequests.map((request) => (
                            <PendingRequestItem
                              key={request.requestId}
                              requestId={request.requestId}
                              profileId={request.profileId}
                              displayName={request.displayName}
                              email={request.email}
                              imageUrl={request.imageUrl}
                              avatarDecorationUrl={request.avatarDecorationUrl}
                              isIncoming={request.isIncoming}
                              isSpam={request.isSpam}
                            />
                          ))}
                        </div>
                      )
                    ) : filteredFriends.length === 0 ? (
                      <p className="text-sm text-[#b5bac1]">
                        None
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {filteredFriends.map((friend) => {
                          const canOpenDm = Boolean(friend.serverId && friend.memberId);
                          const rowContent = (
                            <>
                              <span className="relative inline-flex h-8 w-8 shrink-0">
                                <UserAvatar src={friend.imageUrl ?? undefined} decorationSrc={friend.avatarDecorationUrl} className="h-8 w-8" />
                                <span
                                  className={`absolute -bottom-0.5 -left-0.5 inline-flex h-2.5 w-2.5 rounded-full border border-[#111214] ${presenceStatusDotClassMap[friend.status]}`}
                                  aria-hidden="true"
                                />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-white flex items-center gap-2">
                                  <ProfileNameWithServerTag
                                    name={friend.displayName}
                                    profileId={friend.profileId}
                                    memberId={friend.memberId}
                                    containerClassName="w-full min-w-0"
                                    nameClassName="min-w-0 truncate text-xs text-[#dbdee1]"
                                    showNameplate
                                    nameplateSize="compact"
                                    stretchTagUnderPlate
                                  />
                                  <NewUserCloverBadge createdAt={friend.profileCreatedAt} className="text-xs" />
                                </p>
                                <p className="truncate text-xs text-[#949ba4]">
                                  {formatPresenceStatusLabel(friend.status, { showGameIcon: Boolean(friend.currentGame?.trim()) })}
                                  {friend.email ? ` • ${friend.email}` : ""}
                                </p>
                              </div>
                            </>
                          );

                          if (!canOpenDm) {
                            return (
                              <div
                                key={`friend-${friend.profileId}`}
                                className="flex items-center gap-2 rounded-md px-2 py-2 opacity-90"
                                title="No shared server yet"
                              >
                                {rowContent}
                              </div>
                            );
                          }

                          return (
                            <Link
                              key={`friend-${friend.profileId}`}
                              href={`/users?serverId=${encodeURIComponent(friend.serverId!)}&memberId=${encodeURIComponent(friend.memberId!)}`}
                              className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-[#3f4248]"
                            >
                              {rowContent}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full" />
                )}
              </div>
            )}
          </section>
        </main>

          <div className="theme-users-bottom-rail mx-auto flex h-24 w-full items-center rounded-2xl border border-black/20 bg-card px-0 shadow-xl shadow-black/20 dark:shadow-black/35">
            <div className="relative flex w-full items-center justify-center">
              <div
                className="absolute left-0 z-10 inline-flex h-10 w-10 items-center justify-center rounded-r-lg bg-linear-to-br from-indigo-500/85 via-violet-500/80 to-fuchsia-500/80 text-white shadow-md shadow-indigo-900/30"
                aria-label="Statistics"
                title="Statistics"
              >
                <BarChart3 className="h-5 w-5" suppressHydrationWarning />
              </div>

              <div className="absolute left-1/2 z-10 flex min-w-0 -translate-x-1/2 items-center gap-2 rounded-lg bg-background/60 px-2 py-1.5">
                <span
                  className="mr-1 inline-flex h-20 w-1.5 rounded-full bg-indigo-400/90"
                  aria-hidden="true"
                />
                <span className="relative inline-flex h-8 w-8 shrink-0">
                  <UserAvatar src={profile.imageUrl ?? undefined} decorationSrc={profile.avatarDecorationUrl ?? null} className="h-8 w-8" />
                  <span
                    className={`absolute -bottom-0.5 -left-0.5 inline-flex h-2.5 w-2.5 rounded-full border border-[#111214] ${presenceStatusDotClassMap[currentUserPresenceStatus]}`}
                    aria-hidden="true"
                  />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">
                    <ProfileNameWithServerTag
                      name={profile.name}
                      profileId={profile.id}
                      containerClassName="w-full min-w-0"
                      nameClassName="min-w-0 truncate text-xs text-[#dbdee1]"
                      showNameplate
                      nameplateSize="compact"
                      stretchTagUnderPlate
                    />
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>

        <aside
          className="theme-users-right-rail self-start min-h-0 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl shadow-black/20 dark:shadow-black/35"
          style={{ height: "calc(100% - 94px)" }}
        >
          <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Incoming Calls</h3>
          <div className="mt-3 rounded-lg bg-muted/60 p-3">
            {incomingPmCallRequests.length === 0 ? (
              <p className="text-xs text-muted-foreground">No incoming PM call requests right now.</p>
            ) : (
              <div className="space-y-2">
                {incomingPmCallRequests.slice(0, 6).map((request) => {
                  const baseHref = `/users?serverId=${encodeURIComponent(request.serverId)}&memberId=${encodeURIComponent(request.callerMemberId)}&source=incoming-calls`;
                  const acceptHref = `${baseHref}&pmCallAction=accept&pmCallId=${encodeURIComponent(request.id)}`;
                  const denyHref = `${baseHref}&pmCallAction=deny&pmCallId=${encodeURIComponent(request.id)}`;
                  const openDmHref = baseHref;
                  const callTypeLabel = request.callType === "VIDEO" ? "Video" : "Audio";
                  const requestAgeSeconds = Math.max(
                    0,
                    Math.floor((Date.now() - new Date(request.createdAt).getTime()) / 1000)
                  );
                  const requestRemainingSeconds = Math.max(
                    0,
                    PRIVATE_MESSAGE_CALL_REQUEST_TIMEOUT_SECONDS - requestAgeSeconds
                  );
                  const countdownClassName =
                    requestRemainingSeconds <= 10
                      ? "text-rose-300"
                      : requestRemainingSeconds <= 20
                        ? "text-amber-300/90"
                        : "text-emerald-300/90";
                  const isCountdownCritical = requestRemainingSeconds <= 10;

                  return (
                    <div
                      key={`incoming-call-${request.id}`}
                      className={`rounded-md border bg-background/75 p-2 ${
                        isIncomingCallsRailActive ? "border-indigo-400/70" : "border-border/70"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <UserAvatar src={request.callerImageUrl ?? undefined} decorationSrc={request.callerAvatarDecorationUrl} className="h-7 w-7" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-foreground">{request.callerDisplayName}</p>
                          <p className="text-[10px] text-muted-foreground">Incoming {callTypeLabel} PM call</p>
                          <p className={`inline-flex items-center gap-1 text-[10px] ${countdownClassName}`}>
                            {isCountdownCritical ? (
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" aria-hidden="true" />
                            ) : null}
                            Expires in {requestRemainingSeconds}s
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <Link
                          href={acceptHref}
                          className="inline-flex h-7 items-center rounded-md border border-emerald-400/40 bg-emerald-500/20 px-2 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
                        >
                          Accept
                        </Link>
                        <Link
                          href={denyHref}
                          className="inline-flex h-7 items-center rounded-md border border-rose-400/40 bg-rose-500/20 px-2 text-[11px] font-semibold text-rose-100 transition hover:bg-rose-500/30"
                        >
                          Deny
                        </Link>
                        <Link
                          href={openDmHref}
                          className="inline-flex h-7 items-center rounded-md border border-indigo-400/40 bg-indigo-500/20 px-2 text-[11px] font-semibold text-indigo-100 transition hover:bg-indigo-500/30"
                        >
                          Open DM
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Active Now</h3>
          <div className="mt-4 rounded-lg bg-muted/60 p-4 text-center">
            <p className="text-sm font-semibold text-foreground">It&apos;s quiet for now...</p>
            <p className="mt-2 text-xs text-muted-foreground whitespace-normal wrap-break-word">
              When activity picks up, it will appear here.
            </p>
          </div>

          <div className="mt-4 rounded-lg bg-muted/60 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Online Friends ({onlineFriendsForRail.length})
            </p>

            {onlineFriendsForRail.length === 0 ? (
              <p className="text-xs text-muted-foreground">No online friends right now.</p>
            ) : (
              <div className="space-y-1.5">
                {onlineFriendsForRail.map((friend) => {
                  const canOpenDm = Boolean(friend.serverId && friend.memberId);
                  const rowContent = (
                    <>
                      <span className="relative inline-flex h-7 w-7 shrink-0">
                        <UserAvatar src={friend.imageUrl ?? undefined} decorationSrc={friend.avatarDecorationUrl} className="h-7 w-7" />
                        <span
                          className={`absolute -bottom-0.5 -left-0.5 inline-flex h-2.5 w-2.5 rounded-full border border-[#111214] ${presenceStatusDotClassMap[friend.status]}`}
                          aria-hidden="true"
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-foreground flex items-center gap-2">
                          <ProfileNameWithServerTag
                            name={friend.displayName}
                            profileId={friend.profileId}
                            memberId={friend.memberId}
                            containerClassName="w-full min-w-0"
                            nameClassName="min-w-0 truncate text-xs text-[#dbdee1]"
                            showNameplate
                            nameplateSize="compact"
                            stretchTagUnderPlate
                          />
                          <NewUserCloverBadge createdAt={friend.profileCreatedAt} className="text-[11px]" />
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">Online</p>
                      </div>
                    </>
                  );

                  if (!canOpenDm) {
                    return (
                      <div
                        key={`online-rail-${friend.profileId}`}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-foreground"
                        title="No shared server yet"
                      >
                        {rowContent}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={`online-rail-${friend.profileId}`}
                      href={`/users?serverId=${encodeURIComponent(friend.serverId!)}&memberId=${encodeURIComponent(friend.memberId!)}`}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-foreground transition hover:bg-accent"
                      aria-label={`Open PM with ${friend.displayName}`}
                    >
                      {rowContent}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default UsersPage;
