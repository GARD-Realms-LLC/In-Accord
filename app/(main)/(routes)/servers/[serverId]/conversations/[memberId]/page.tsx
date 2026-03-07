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
  const { memberId, serverId } = await params;
  const resolvedSearchParams = await searchParams;

  const profile = await currentProfile();

  if (!profile) {
    return redirect("/sign-in");
  }

  const currentMember = await db.query.member.findFirst({
    where: and(
      eq(member.serverId, serverId),
      eq(member.profileId, profile.id)
    ),
  });

  if (!currentMember) {
    return redirect("/");
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
    return redirect(`/servers/${serverId}`);
  }

  const canBypassPresenceRestrictions = hasInAccordAdministrativeAccess(profile.role) || currentMember.role === "ADMIN";
  const targetStatus = String(targetMemberRow.presenceStatus ?? "ONLINE").toUpperCase();

  if (targetMemberRow.profileId !== profile.id) {
    if (targetStatus === "DND") {
      return redirect(`/servers/${serverId}`);
    }

    if (!canBypassPresenceRestrictions && targetStatus === "INVISIBLE") {
      return redirect(`/servers/${serverId}`);
    }
  }

  const conversation = await getOrCreateConversation(currentMember.id, memberId);

  if (!conversation) {
    return redirect(`/servers/${serverId}`);
  }

  void resolvedSearchParams;

  const { memberOne, memberTwo } = conversation;

  const otherMember = memberOne.profileId === profile.id ? memberTwo : memberOne;
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