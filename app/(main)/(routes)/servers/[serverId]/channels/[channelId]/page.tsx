import { redirectToSignIn } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ChannelType } from "@/lib/db";
import { and, eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatInput } from "@/components/chat/chat-input";
// import { ChatMessages } from "@/components/chat/chat-messages";
// import { MediaRoom } from "@/components/media-room";
import { channel, db, member } from "@/lib/db";

interface ChannelIdPageProps {
  params: {
    serverId: string;
    channelId: string;
  };
}

const ChannelIdPage = async ({ params }: ChannelIdPageProps) => {
  const profile = await currentProfile();

  if (!profile) {
    return redirectToSignIn();
  }

  const currentChannel = await db.query.channel.findFirst({
    where: eq(channel.id, params.channelId),
  });

  const currentMember = await db.query.member.findFirst({
    where: and(
      eq(member.serverId, params.serverId),
      eq(member.profileId, profile.id)
    ),
  });

  if (!currentChannel || !currentMember) {
    redirect("/");
  }

  return (
    <div className="bg-white dark:bg-[#313338] flex flex-col h-full">
      <ChatHeader
        name={currentChannel.name}
        serverId={currentChannel.serverId}
        type="channel"
      />
      {/* {channel.type === ChannelType.TEXT && (
        <>
          <ChatMessages
            member={member}
            name={channel.name}
            chatId={channel.id}
            type="channel"
            apiUrl="/api/messages"
            socketUrl="/api/socket/messages"
            socketQuery={{
              channelId: channel.id,
              serverId: channel.serverId,
            }}
            paramKey="channelId"
            paramValue={channel.id}
          />
          <ChatInput
            name={channel.name}
            type="channel"
            apiUrl="/api/socket/messages"
            query={{
              channelId: channel.id,
              serverId: channel.serverId,
            }}
          />
        </>
      )}
      {channel.type === ChannelType.AUDIO && (
        <MediaRoom chatId={channel.id} video={false} audio={true} />
      )}
      {channel.type === ChannelType.VIDEO && (
        <MediaRoom chatId={channel.id} video={true} audio={true} />
      )} */}
    </div>
  );
};

export default ChannelIdPage;
