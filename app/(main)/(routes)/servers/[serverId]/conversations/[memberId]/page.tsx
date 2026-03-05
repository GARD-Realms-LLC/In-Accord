import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";

import { db, member } from "@/lib/db";
import { getOrCreateConversation } from "@/lib/conversation";
import { currentProfile } from "@/lib/current-profile";
import { isBotUser } from "@/lib/is-bot-user";
import { ChatHeader } from "@/components/chat/chat-header";
// import { ChatMessages } from "@/components/chat/chat-messages";
import { ChatInput } from "@/components/chat/chat-input";
// import { MediaRoom } from "@/components/media-room";

interface MemberIdPageProps {
  params: {
    memberId: string;
    serverId: string;
  },
  searchParams: {
    video?: boolean;
  }
}

const MemberIdPage = async ({
  params,
  searchParams,
}: MemberIdPageProps) => {
  const profile = await currentProfile();

  if (!profile) {
    return redirect("/sign-in");
  }

  const currentMember = await db.query.member.findFirst({
    where: and(
      eq(member.serverId, params.serverId),
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
    where m."id" = ${params.memberId}
      and m."serverId" = ${params.serverId}
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
    return redirect(`/servers/${params.serverId}`);
  }

  const normalizedGlobalRole = (profile.role ?? "").trim().toUpperCase();
  const isInAccordAdministrator =
    normalizedGlobalRole === "ADMINISTRATOR" ||
    normalizedGlobalRole === "IN-ACCORD ADMINISTRATOR" ||
    normalizedGlobalRole === "IN_ACCORD_ADMINISTRATOR" ||
    normalizedGlobalRole === "ADMIN";
  const canBypassPresenceRestrictions = isInAccordAdministrator || currentMember.role === "ADMIN";
  const targetStatus = String(targetMemberRow.presenceStatus ?? "ONLINE").toUpperCase();

  if (targetMemberRow.profileId !== profile.id) {
    if (targetStatus === "DND") {
      return redirect(`/servers/${params.serverId}`);
    }

    if (!canBypassPresenceRestrictions && targetStatus === "INVISIBLE") {
      return redirect(`/servers/${params.serverId}`);
    }
  }

  const conversation = await getOrCreateConversation(currentMember.id, params.memberId);

  if (!conversation) {
    return redirect(`/servers/${params.serverId}`);
  }

  const { memberOne, memberTwo } = conversation;

  const otherMember = memberOne.profileId === profile.id ? memberTwo : memberOne;
  const isOtherMemberBot = isBotUser({
    name: otherMember.profile.name,
    email: otherMember.profile.email,
  });

  return ( 
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-black/20 bg-white shadow-xl shadow-black/35 dark:bg-[#313338]">
      <ChatHeader
        imageUrl={otherMember.profile.imageUrl}
        name={otherMember.profile.name}
        isBot={isOtherMemberBot}
        serverId={params.serverId}
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