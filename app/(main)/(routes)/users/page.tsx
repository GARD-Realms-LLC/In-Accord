import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { MessageCircle, Phone, Search, UserPlus, Video } from "lucide-react";

import { currentProfile } from "@/lib/current-profile";
import { db, directMessage, member } from "@/lib/db";
import { getGlobalRecentDmsForProfile, markConversationRead } from "@/lib/direct-messages";
import { UserAvatar } from "@/components/user-avatar";
import { getOrCreateConversation } from "@/lib/conversation";
import { getUserProfileNameMap } from "@/lib/user-profile";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatItem } from "@/components/chat/chat-item";
import { ChatInput } from "@/components/chat/chat-input";
import { ConversationTypingIndicator } from "@/components/chat/conversation-typing-indicator";
import { DirectMessageListItem } from "@/components/chat/direct-message-list-item";
import { DeleteDmConversationButton } from "@/components/chat/delete-dm-conversation-button";
import { PendingRequestItem } from "@/components/friends/pending-request-item";
import { isBotUser } from "@/lib/is-bot-user";
import { presenceStatusDotClassMap, presenceStatusLabelMap, resolveAutoPresenceStatus } from "@/lib/presence-status";
import { ensureFriendRelationsSchema } from "@/lib/friend-relations";

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
  searchParams?: {
    serverId?: string | string[];
    memberId?: string | string[];
    view?: string | string[];
    filter?: string | string[];
    q?: string | string[];
    pendingBucket?: string | string[];
  };
}

const UsersPage = async ({ searchParams }: UsersPageProps) => {
  const profile = await currentProfile();

  if (!profile) {
    return redirect("/sign-in");
  }

  const recentDms = await getGlobalRecentDmsForProfile({ profileId: profile.id });

  const selectedServerId =
    typeof searchParams?.serverId === "string"
      ? searchParams.serverId
      : Array.isArray(searchParams?.serverId)
        ? (searchParams?.serverId[0] ?? "")
        : "";

  const selectedMemberId =
    typeof searchParams?.memberId === "string"
      ? searchParams.memberId
      : Array.isArray(searchParams?.memberId)
        ? (searchParams?.memberId[0] ?? "")
        : "";

  const selectedView =
    typeof searchParams?.view === "string"
      ? searchParams.view
      : Array.isArray(searchParams?.view)
        ? (searchParams?.view[0] ?? "friends")
        : "friends";

  const isFriendsView = selectedView.toLowerCase() === "friends";

  const selectedFilter =
    typeof searchParams?.filter === "string"
      ? searchParams.filter
      : Array.isArray(searchParams?.filter)
        ? (searchParams?.filter[0] ?? "all")
        : "all";

  const normalizedFilter = selectedFilter.toLowerCase();

  const searchQuery =
    typeof searchParams?.q === "string"
      ? searchParams.q
      : Array.isArray(searchParams?.q)
        ? (searchParams?.q[0] ?? "")
        : "";

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const selectedPendingBucket =
    typeof searchParams?.pendingBucket === "string"
      ? searchParams.pendingBucket
      : Array.isArray(searchParams?.pendingBucket)
        ? (searchParams?.pendingBucket[0] ?? "requests")
        : "requests";

  const normalizedPendingBucket = selectedPendingBucket.toLowerCase() === "spam" ? "spam" : "requests";

  const friendsTabHref = (tab: "online" | "all" | "pending" | "blocked" | "add-friend") => {
    const base = `/users?view=friends&filter=${tab}`;
    const pendingBucketQuery = tab === "pending" ? `&pendingBucket=${normalizedPendingBucket}` : "";
    const searchQueryParam = normalizedSearchQuery ? `&q=${encodeURIComponent(searchQuery)}` : "";
    return `${base}${pendingBucketQuery}${searchQueryParam}`;
  };

  type FriendListRow = {
    memberId: string;
    serverId: string;
    profileId: string;
    displayName: string;
    email: string | null;
    imageUrl: string | null;
    presenceStatus: string | null;
    presenceUpdatedAt: Date | string | null;
    hasConversation: boolean;
    isBlocked: boolean;
  };

  let filteredFriends: Array<{
    memberId: string;
    serverId: string;
    displayName: string;
    email: string | null;
    imageUrl: string | null;
    status: ReturnType<typeof resolveAutoPresenceStatus>;
    hasConversation: boolean;
    isBlocked: boolean;
  }> = [];

  let pendingRequests: Array<{
    requestId: string;
    displayName: string;
    email: string | null;
    imageUrl: string | null;
    isIncoming: boolean;
    isSpam: boolean;
  }> = [];

  let pendingRequestCount = 0;
  let pendingSpamCount = 0;

  if (
    !selectedMemberId &&
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
      candidate_members as (
        select distinct on (m."profileId")
          m."id" as "memberId",
          m."serverId" as "serverId",
          m."profileId" as "profileId"
        from "Member" m
        where m."profileId" <> ${profile.id}
        order by m."profileId", m."createdAt" asc
      )
      select
        cm."memberId" as "memberId",
        cm."serverId" as "serverId",
        cm."profileId" as "profileId",
        coalesce(nullif(trim(up."profileName"), ''), u."name", u."email", 'User') as "displayName",
        u."email" as "email",
        coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
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

    const resolved = rows
      .map((row) => ({
        memberId: row.memberId,
        serverId: row.serverId,
        displayName: row.displayName,
        email: row.email,
        imageUrl: row.imageUrl,
        status: resolveAutoPresenceStatus(row.presenceStatus, row.presenceUpdatedAt),
        hasConversation: Boolean(row.hasConversation),
        isBlocked: Boolean(row.isBlocked),
      }));

    filteredFriends =
      normalizedFilter === "online"
        ? resolved.filter(
            (row) =>
              row.hasConversation &&
              !row.isBlocked &&
              row.status !== "OFFLINE" &&
              row.status !== "INVISIBLE"
          )
        : normalizedFilter === "blocked"
          ? resolved.filter((row) => row.isBlocked)
        : normalizedFilter === "add-friend"
          ? resolved.filter((row) => !row.hasConversation && !row.isBlocked)
        : normalizedFilter === "pending"
          ? resolved.filter((row) => !row.hasConversation && !row.isBlocked)
          : resolved.filter((row) => row.hasConversation && !row.isBlocked);

    if (normalizedSearchQuery) {
      filteredFriends = filteredFriends.filter((row) => {
        const haystack = `${row.displayName} ${row.email ?? ""}`.toLowerCase();
        return haystack.includes(normalizedSearchQuery);
      });
    }

    if (normalizedFilter === "pending") {
      const pendingResult = await db.execute(sql`
        select
          fr."id" as "requestId",
          (fr."recipientProfileId" = ${profile.id}) as "isIncoming",
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
                when fr."requesterProfileId" = ${profile.id} then fr."recipientProfileId"
                else fr."requesterProfileId"
              end
          ) as "isSpam"
        from "FriendRequest" fr
        left join "Users" u
          on u."userId" = case
            when fr."requesterProfileId" = ${profile.id} then fr."recipientProfileId"
            else fr."requesterProfileId"
          end
        left join "UserProfile" up on up."userId" = u."userId"
        where fr."status" = 'PENDING'
          and (fr."requesterProfileId" = ${profile.id} or fr."recipientProfileId" = ${profile.id})
        order by fr."createdAt" desc
      `);

      const pendingRows = (pendingResult as unknown as {
        rows: Array<{
          requestId: string;
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
        if (normalizedPendingBucket === "spam" && !row.isSpam) {
          return false;
        }

        if (normalizedPendingBucket === "requests" && row.isSpam) {
          return false;
        }

        if (!normalizedSearchQuery) {
          return true;
        }

        const haystack = `${row.displayName} ${row.email ?? ""}`.toLowerCase();
        return haystack.includes(normalizedSearchQuery);
      });
    }
  }

  let selectedConversation:
    | {
        serverId: string;
        conversationId: string;
        currentMember: NonNullable<Awaited<ReturnType<typeof db.query.member.findFirst>>>;
        otherMember: {
          id: string;
          name: string;
          imageUrl: string;
          email: string;
        };
        isOtherMemberBot: boolean;
        messages: Array<any>;
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

        const profileNameMap = await getUserProfileNameMap(
          messageRows.map((item) => item.member.profileId)
        );

        const hydratedRows = messageRows.map((item) => {
          const profileName = profileNameMap.get(item.member.profileId);
          if (!profileName) {
            return item;
          }

          return {
            ...item,
            member: {
              ...item.member,
              profile: {
                ...item.member.profile,
                name: profileName,
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
            name: otherMemberData.profile.name,
            imageUrl: otherMemberData.profile.imageUrl,
            email: otherMemberData.profile.email,
          },
          isOtherMemberBot: isBotUser({
            name: otherMemberData.profile.name,
            email: otherMemberData.profile.email,
          }),
          messages: hydratedRows,
        };
      }
    }
  }

  return (
    <div className="h-full bg-[#313338] text-[#dbdee1]">
      <div className="grid h-full w-full grid-cols-[240px_1fr_260px] gap-2 p-2">

        <aside className="rounded-2xl border border-black/20 bg-[#2b2d31] p-2.5 shadow-xl shadow-black/35">
          <div className="flex h-full flex-col">
            <div>
              <div className="mb-2 rounded-md bg-[#1e1f22] px-3 py-2 text-sm font-semibold text-[#f2f3f5]">
                <div className="flex items-center justify-between">
                  <span>Find or start a conversation</span>
                  <Search className="h-4 w-4 text-[#949ba4]" />
                </div>
              </div>

              <nav className="mb-4 space-y-1">
                <Link
                  href="/users?view=friends"
                  className="block w-full rounded-md bg-[#404249] px-2.5 py-2 text-left text-sm font-medium text-white"
                >
                  Friends
                </Link>
                <Link
                  href={friendsTabHref("pending")}
                  className={`block w-full rounded-md px-2.5 py-2 text-left text-sm transition ${
                    normalizedFilter === "pending"
                      ? "bg-[#3f4248] text-[#f2f3f5]"
                      : "text-[#b5bac1] hover:bg-[#3f4248] hover:text-[#f2f3f5]"
                  }`}
                >
                  Pending Messages
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
                        displayName={dm.displayName}
                        imageUrl={dm.imageUrl}
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

        <main className="flex h-full flex-col rounded-2xl border border-black/20 bg-[#313338] overflow-hidden shadow-xl shadow-black/35">
          <header className="flex h-12 items-center justify-between border-b border-black/20 px-4">
            <div className="flex items-center gap-3">
              <MessageCircle className="h-5 w-5 text-[#b5bac1]" />
              <span className="text-sm font-bold text-white">
                {selectedConversation
                  ? selectedConversation.otherMember.name
                  : isFriendsView && normalizedFilter === "pending"
                    ? "Message Requests"
                    : "Friends"}
              </span>
              {!selectedConversation && isFriendsView && normalizedFilter === "pending" ? (
                <>
                  <span className="h-5 w-px bg-white/15" />
                  <Link
                    href={`/users?view=friends&filter=pending&pendingBucket=requests${normalizedSearchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
                    className={`rounded px-2 py-0.5 text-xs ${normalizedPendingBucket === "requests" ? "bg-[#5865f2] text-white" : "bg-[#3f4248] text-[#dcddde]"}`}
                  >
                    Requests: {pendingRequestCount}
                  </Link>
                  <Link
                    href={`/users?view=friends&filter=pending&pendingBucket=spam${normalizedSearchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
                    className={`rounded px-2 py-0.5 text-xs ${normalizedPendingBucket === "spam" ? "bg-[#5865f2] text-white" : "bg-[#3f4248] text-[#dcddde]"}`}
                  >
                    Spam: {pendingSpamCount}
                  </Link>
                </>
              ) : null}
              {!selectedConversation && isFriendsView && normalizedFilter !== "pending" ? (
                <>
                  <span className="h-5 w-px bg-white/15" />
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
              <button className="rounded p-1.5 hover:bg-[#3f4248]"><Video className="h-4 w-4" /></button>
              <button className="rounded p-1.5 hover:bg-[#3f4248]"><Phone className="h-4 w-4" /></button>
              <button className="rounded p-1.5 hover:bg-[#3f4248]"><UserPlus className="h-4 w-4" /></button>
            </div>
          </header>

          <section className="flex min-h-0 flex-1 overflow-auto p-3">
            {selectedConversation ? (
              <div className="flex h-full min-h-0 w-full flex-col gap-2">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-black/20 bg-white shadow-xl shadow-black/35 dark:bg-[#313338]">
                  <ChatHeader
                    imageUrl={selectedConversation.otherMember.imageUrl}
                    name={selectedConversation.otherMember.name}
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

                  <div className="flex-1 overflow-y-auto">
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
                        />
                      ))
                    )}
                  </div>
                </div>

                <div className="w-full max-w-full rounded-2xl border border-black/20 bg-white shadow-lg shadow-black/25 dark:bg-[#313338]">
                  <ConversationTypingIndicator conversationId={selectedConversation.conversationId} />
                  <ChatInput
                    name={selectedConversation.otherMember.name}
                    type="conversation"
                    apiUrl="/api/socket/direct-messages"
                    conversationId={selectedConversation.conversationId}
                    query={{ conversationId: selectedConversation.conversationId }}
                  />
                </div>
              </div>
            ) : (
              <div className="w-full">
                {isFriendsView && (normalizedFilter === "online" || normalizedFilter === "all" || normalizedFilter === "pending" || normalizedFilter === "blocked" || normalizedFilter === "add-friend") ? (
                  <div className="rounded-xl border border-black/20 bg-[#2b2d31] p-3">
                    <form method="GET" className="mb-3 flex items-center gap-2">
                      <input type="hidden" name="view" value="friends" />
                      <input type="hidden" name="filter" value={normalizedFilter} />
                      {normalizedFilter === "pending" ? (
                        <input type="hidden" name="pendingBucket" value={normalizedPendingBucket} />
                      ) : null}
                      <div className="relative w-full">
                        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#949ba4]" />
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
                        <p className="text-sm text-[#b5bac1]">No pending users right now.</p>
                      ) : (
                        <div className="space-y-1">
                          {pendingRequests.map((request) => (
                            <PendingRequestItem
                              key={request.requestId}
                              requestId={request.requestId}
                              displayName={request.displayName}
                              email={request.email}
                              imageUrl={request.imageUrl}
                              isIncoming={request.isIncoming}
                            />
                          ))}
                        </div>
                      )
                    ) : filteredFriends.length === 0 ? (
                      <p className="text-sm text-[#b5bac1]">
                        {normalizedFilter === "online"
                          ? "No online users right now."
                          : normalizedFilter === "blocked"
                            ? "No blocked users right now."
                          : normalizedFilter === "add-friend"
                            ? "No users found to add right now."
                            : "No users found."}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {filteredFriends.map((friend) => (
                          <Link
                            key={friend.memberId}
                            href={`/users?serverId=${encodeURIComponent(friend.serverId)}&memberId=${encodeURIComponent(friend.memberId)}`}
                            className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-[#3f4248]"
                          >
                            <span className="relative inline-flex h-8 w-8 shrink-0">
                              <UserAvatar src={friend.imageUrl ?? undefined} className="h-8 w-8" />
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 inline-flex h-2.5 w-2.5 rounded-full border border-[#111214] ${presenceStatusDotClassMap[friend.status]}`}
                                aria-hidden="true"
                              />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-white">{friend.displayName}</p>
                              <p className="truncate text-xs text-[#949ba4]">
                                {presenceStatusLabelMap[friend.status]}
                                {friend.email ? ` • ${friend.email}` : ""}
                              </p>
                            </div>
                          </Link>
                        ))}
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

        <aside className="rounded-2xl border border-black/20 bg-[#2b2d31] p-4 shadow-xl shadow-black/35">
          <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-[#949ba4]">Active Now</h3>
          <div className="mt-4 rounded-lg bg-[#1e1f22] p-4 text-center">
            <p className="text-sm font-semibold text-white">It&apos;s quiet for now...</p>
            <p className="mt-2 text-xs text-[#b5bac1]">
              When activity picks up, it will appear here.
            </p>
          </div>

          <div className="mt-4 rounded-lg bg-[#1e1f22] p-3 text-xs text-[#b5bac1]">
            Signed in as <span className="font-semibold text-[#f2f3f5]">{profile.name}</span>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default UsersPage;
