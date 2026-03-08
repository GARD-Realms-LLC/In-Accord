import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { Bell, MessageCircle, Phone, Search, UserPlus, Video } from "lucide-react";

import { currentProfile } from "@/lib/current-profile";
import { db, directMessage, member } from "@/lib/db";
import { getGlobalRecentDmsForProfile, markConversationRead } from "@/lib/direct-messages";
import { UserAvatar } from "@/components/user-avatar";
import { getOrCreateConversation } from "@/lib/conversation";
import { getUserProfileNameMap } from "@/lib/user-profile";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatItem } from "@/components/chat/chat-item";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatScrollBox } from "@/components/chat/chat-scroll-box";
import { ChatLiveRefresh } from "@/components/chat/chat-live-refresh";
import { ConversationTypingIndicator } from "@/components/chat/conversation-typing-indicator";
import { DirectMessageListItem } from "@/components/chat/direct-message-list-item";
import { DeleteDmConversationButton } from "@/components/chat/delete-dm-conversation-button";
import { PendingRequestItem } from "@/components/friends/pending-request-item";
import { UsersPageAutoRefresh } from "@/components/friends/users-page-auto-refresh";
import { isBotUser } from "@/lib/is-bot-user";
import { presenceStatusDotClassMap, presenceStatusLabelMap, resolveAutoPresenceStatus } from "@/lib/presence-status";
import { ensureFriendRelationsSchema } from "@/lib/friend-relations";
import { NewUserCloverBadge } from "@/components/new-user-clover-badge";
import { ProfileNameWithServerTag } from "@/components/profile-name-with-server-tag";
import { ensureMessageReactionSchema } from "@/lib/message-reactions";
import { SupportHelpControls } from "@/components/topbar/support-help-controls";
import { ThreadsToastButton } from "@/components/topbar/threads-toast-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const formatTimestamp = (value: Date) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "";
  }

  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  }>;
}

const UsersPage = async ({ searchParams }: UsersPageProps) => {
  const resolvedSearchParams = await searchParams;

  const profile = await currentProfile();

  if (!profile) {
    return redirect("/sign-in");
  }

  const recentDms = await getGlobalRecentDmsForProfile({ profileId: profile.id });

  const selectedServerId =
    typeof resolvedSearchParams?.serverId === "string"
      ? resolvedSearchParams.serverId
      : Array.isArray(resolvedSearchParams?.serverId)
        ? (resolvedSearchParams?.serverId[0] ?? "")
        : "";

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

  const normalizedPendingBucket = selectedPendingBucket.toLowerCase() === "spam" ? "spam" : "requests";
  const normalizedSource = selectedSource.toLowerCase();
  const isRailMessageRequestsActive = normalizedFilter === "pending" && normalizedSource === "rail";

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
    profileCreatedAt: Date | string | null;
    presenceStatus: string | null;
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
    profileCreatedAt: Date | string | null;
    status: ReturnType<typeof resolveAutoPresenceStatus>;
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
    isIncoming: boolean;
    isSpam: boolean;
  }> = [];

  let pendingRequestCount = 0;
  let pendingSpamCount = 0;

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
        u."account.created" as "profileCreatedAt",
        up."presenceStatus" as "presenceStatus",
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
        profileCreatedAt: row.profileCreatedAt,
        status: resolveAutoPresenceStatus(row.presenceStatus, row.presenceUpdatedAt),
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

        const messageRows = await db.query.directMessage.findMany({
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
          new Set(messageRows.map((item) => item.member.profileId).filter(Boolean))
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

        const hydratedRows = messageRows.map((item) => {
          const profileName = profileNameMap.get(item.member.profileId);
          const profileRole = profileRoleMap.get(item.member.profileId) ?? null;

          return {
            ...item,
            member: {
              ...item.member,
              profile: {
                ...item.member.profile,
                name: profileName ?? item.member.profile.name,
                role: profileRole,
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

  return (
    <div className="theme-users-shell h-full bg-[#313338] text-[#dbdee1]">
      <UsersPageAutoRefresh />
      <header
        className="theme-server-topbar fixed right-0 top-0 z-40 flex h-12 items-center overflow-hidden rounded-b-xl border-b border-border bg-background"
        style={{ left: "116px" }}
      >
        <SupportHelpControls panelTop={56} />

        <h1
          className="absolute inset-y-0 z-10 flex -translate-x-1/2 items-center truncate text-center text-sm font-bold uppercase tracking-[0.08em] text-foreground"
          style={{ left: "calc((100% - 256px) / 2)", maxWidth: "calc(100% - 592px)" }}
        >
          In-Accord
        </h1>

        <div className="absolute inset-y-0 z-20 flex items-center gap-1 text-muted-foreground" style={{ right: "308px" }}>
          <button type="button" title="Start Call" className="inline-flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-[#3f4248] hover:text-white">
            <Phone className="h-4 w-4" suppressHydrationWarning />
          </button>
          <ThreadsToastButton className="inline-flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-[#3f4248] hover:text-white" />
          <button type="button" title="Start Video" className="inline-flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-[#3f4248] hover:text-white">
            <Video className="h-4 w-4" suppressHydrationWarning />
          </button>
          <button type="button" title="Invite People" className="inline-flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-[#3f4248] hover:text-white">
            <UserPlus className="h-4 w-4" suppressHydrationWarning />
          </button>
          <button type="button" title="Notifications" className="inline-flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-[#3f4248] hover:text-white">
            <Bell className="h-4 w-4" suppressHydrationWarning />
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
                  Direct Messages
                </p>

                {recentDms.length === 0 ? (
                  <p>No recent DMs yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {recentDms.slice(0, 8).map((dm) => (
                      <DirectMessageListItem
                        key={dm.conversationId}
                        conversationId={dm.conversationId}
                        serverId={dm.serverId}
                        memberId={dm.memberId}
                        profileId={dm.profileId}
                        displayName={dm.displayName}
                        imageUrl={dm.imageUrl}
                        profileCreatedAt={dm.profileCreatedAt}
                        timestampLabel={formatTimestamp(dm.lastMessageAt)}
                        unreadCount={dm.unreadCount}
                        isActive={selectedConversation?.conversationId === dm.conversationId}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        <main className="theme-users-main-panel flex h-full flex-col overflow-hidden rounded-2xl border border-black/20 bg-[#313338] shadow-xl shadow-black/35">
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
              <button className="rounded p-1.5 hover:bg-[#3f4248]"><Video className="h-4 w-4" suppressHydrationWarning /></button>
              <button className="rounded p-1.5 hover:bg-[#3f4248]"><Phone className="h-4 w-4" suppressHydrationWarning /></button>
              <button className="rounded p-1.5 hover:bg-[#3f4248]"><UserPlus className="h-4 w-4" suppressHydrationWarning /></button>
            </div>
          </header>

          <section className="flex min-h-0 flex-1 overflow-auto p-3">
            {selectedConversation ? (
              <div className="flex h-full min-h-0 w-full flex-col gap-2">
                <div className="theme-users-chat-surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-black/20 bg-white shadow-xl shadow-black/35 dark:bg-[#313338]">
                  <ChatHeader
                    imageUrl={selectedConversation.otherMember.imageUrl}
                    name={selectedConversation.otherMember.name}
                    profileId={selectedConversation.otherMember.profileId}
                    memberId={selectedConversation.otherMember.id}
                    profileCreatedAt={selectedConversation.otherMember.createdAt}
                    isBot={selectedConversation.isOtherMemberBot}
                    serverId={selectedConversation.serverId}
                    type="conversation"
                  />

                  <div className="flex justify-end border-b border-black/20 px-3 py-1">
                    <DeleteDmConversationButton
                      conversationId={selectedConversation.conversationId}
                      serverId={selectedConversation.serverId}
                      returnToUsersRoot
                      title="Delete this DM"
                    />
                  </div>

                  <ChatScrollBox
                    className="flex-1 overflow-y-auto"
                    scrollKey={`${selectedConversation.conversationId}:${selectedConversation.messages.length}:${selectedConversation.messages[selectedConversation.messages.length - 1]?.id ?? "none"}`}
                    forceStickToBottom
                  >
                    <ChatLiveRefresh />
                    {selectedConversation.messages.length === 0 ? (
                      <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400">
                        No direct messages yet. Say hello to {selectedConversation.otherMember.name}.
                      </div>
                    ) : (
                      selectedConversation.messages.map((item) => (
                        <ChatItem
                          key={item.id}
                          id={item.id}
                          content={item.content}
                          member={item.member}
                          timestamp={new Date(item.createdAt).toLocaleString()}
                          fileUrl={item.fileUrl}
                          deleted={item.deleted}
                          currentMember={selectedConversation!.currentMember}
                          isUpdated={
                            new Date(item.updatedAt).getTime() !== new Date(item.createdAt).getTime()
                          }
                          socketUrl="/api/socket/direct-messages"
                          socketQuery={{ conversationId: selectedConversation!.conversationId }}
                          dmServerId={selectedConversation!.serverId}
                          reactionScope="direct"
                          initialReactions={selectedConversation!.reactionsByMessageId.get(item.id) ?? []}
                        />
                      ))
                    )}
                  </ChatScrollBox>
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
                                <UserAvatar src={friend.imageUrl ?? undefined} className="h-8 w-8" />
                                <span
                                  className={`absolute -bottom-0.5 -right-0.5 inline-flex h-2.5 w-2.5 rounded-full border border-[#111214] ${presenceStatusDotClassMap[friend.status]}`}
                                  aria-hidden="true"
                                />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-white flex items-center gap-2">
                                  <ProfileNameWithServerTag
                                    name={friend.displayName}
                                    profileId={friend.profileId}
                                    memberId={friend.memberId}
                                    showNameplate
                                  />
                                  <NewUserCloverBadge createdAt={friend.profileCreatedAt} className="text-xs" />
                                </p>
                                <p className="truncate text-xs text-[#949ba4]">
                                  {presenceStatusLabelMap[friend.status]}
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

        <aside
          className="theme-users-right-rail self-start min-h-0 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl shadow-black/20 dark:shadow-black/35"
          style={{ height: "calc(100% - 94px)" }}
        >
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
                        <UserAvatar src={friend.imageUrl ?? undefined} className="h-7 w-7" />
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 inline-flex h-2.5 w-2.5 rounded-full border border-[#111214] ${presenceStatusDotClassMap[friend.status]}`}
                          aria-hidden="true"
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-foreground flex items-center gap-2">
                          <ProfileNameWithServerTag
                            name={friend.displayName}
                            profileId={friend.profileId}
                            memberId={friend.memberId}
                            showNameplate
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
                      aria-label={`Open DM with ${friend.displayName}`}
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
