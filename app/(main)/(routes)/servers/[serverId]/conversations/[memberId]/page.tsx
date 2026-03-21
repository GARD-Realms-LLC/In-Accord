import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";

import { db, member } from "@/lib/db";
import { getOrCreateConversation } from "@/lib/conversation";
import { currentProfile } from "@/lib/current-profile";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { isBotUser } from "@/lib/is-bot-user";
import { ChatHeader } from "@/components/chat/chat-header";
// import { ChatMessages } from "@/components/chat/chat-messages";
import { ChatInput } from "@/components/chat/chat-input";
// import { MediaRoom } from "@/components/media-room";
import { resolveServerRouteContext } from "@/lib/route-slug-resolver";
import { buildServerPath } from "@/lib/route-slugs";

interface MemberIdPageProps {
  params: Promise<{
    memberId: string;
    serverId: string;
  }>;
  searchParams: Promise<{
    video?: boolean;
  }>;
}

const MemberIdPage = async ({
  params,
  searchParams,
}: MemberIdPageProps) => {
  const { memberId, serverId: serverParam } = await params;
  const resolvedSearchParams = await searchParams;

  const profile = await currentProfile();

  if (!profile) {
    return redirect("/sign-in");
  }

  const resolvedServer = await resolveServerRouteContext({
    profileId: profile.id,
    serverParam,
    profileRole: profile.role,
  });

  if (!resolvedServer) {
    return redirect("/servers");
  }

  const serverId = resolvedServer.id;
  const serverPath = buildServerPath({ id: serverId, name: resolvedServer.name });

  const currentMember = await db.query.member.findFirst({
    where: and(
      eq(member.serverId, serverId),
      eq(member.profileId, profile.id)
    ),
  });

  if (!currentMember) {
    return redirect(serverPath);
  }

  const targetMemberResult = await db.execute(sql`
    select
      m."id" as "id",
      m."profileId" as "profileId",
      m."role" as "role",
      up."presenceStatus" as "presenceStatus"
    from "Member" m
    left join "UserProfile" up on up."userId" = m."profileId"
    where m."id" = ${memberId}
      and m."serverId" = ${serverId}
    limit 1
  `);

  const targetMemberRow = (targetMemberResult as unknown as {
    rows: Array<{
      id: string;
      profileId: string;
      role: string | null;
      presenceStatus: string | null;
    }>;
  }).rows?.[0];

  if (!targetMemberRow) {
    return redirect(serverPath);
  }

  const canBypassPresenceRestrictions = hasInAccordAdministrativeAccess(profile.role) || currentMember.role === "ADMIN";
  const targetStatus = String(targetMemberRow.presenceStatus ?? "ONLINE").toUpperCase();

  if (targetMemberRow.profileId !== profile.id) {
    if (targetStatus === "DND") {
      return redirect(serverPath);
    }

    if (!canBypassPresenceRestrictions && targetStatus === "INVISIBLE") {
      return redirect(serverPath);
    }
  }

  const conversation = await getOrCreateConversation(currentMember.id, memberId);

  if (!conversation) {
    return redirect(serverPath);
  }

  void resolvedSearchParams;

  const { memberOne, memberTwo } = conversation;

  const otherMember = memberOne.profileId === profile.id ? memberTwo : memberOne;
  const requestPmVideoCallHref = `/users?serverId=${encodeURIComponent(serverId)}&memberId=${encodeURIComponent(otherMember.id)}&pmCallAction=request-video`;
  const isOtherMemberBot = isBotUser({
    name: otherMember.profile.name,
    email: otherMember.profile.email,
  });

  return ( 
    <div className="theme-server-chat-surface flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-xl shadow-black/35">
      <ChatHeader
        imageUrl={otherMember.profile.imageUrl}
        name={otherMember.profile.name}
        profileId={otherMember.profileId}
        memberId={otherMember.id}
        isBot={isOtherMemberBot}
        profileCreatedAt={otherMember.profile.createdAt}
        serverId={serverId}
        type="conversation"
        videoCallHref={requestPmVideoCallHref}
      />
      {/* {searchParams.video && (
        <MediaRoom
          chatId={conversation.id}
          video={true}
          audio={true}
        />
      )} */}
      {/* {!searchParams.video && (
        <>
          <ChatMessages
            member={currentMember}
            name={otherMember.profile.name}
            chatId={conversation.id}
            type="conversation"
            apiUrl="/api/direct-messages"
            paramKey="conversationId"
            paramValue={conversation.id}
            socketUrl="/api/socket/direct-messages"
            socketQuery={{
              conversationId: conversation.id,
            }}
          />
          <ChatInput
            name={otherMember.profile.name}
            type="conversation"
            apiUrl="/api/socket/direct-messages"
            query={{
              conversationId: conversation.id,
            }}
          />
        </>
      )} */}
    </div>
   );
}
 
export default MemberIdPage;
