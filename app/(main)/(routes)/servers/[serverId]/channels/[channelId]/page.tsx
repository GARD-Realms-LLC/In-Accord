import { redirect } from "next/navigation";
import { ChannelType } from "@/lib/db";
import { and, asc, eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatItem } from "@/components/chat/chat-item";
// import { MediaRoom } from "@/components/media-room";
import { channel, db, member, message } from "@/lib/db";
import { computeChannelPermissionForRole } from "@/lib/channel-permissions";
import { resolveMemberContext } from "@/lib/channel-permissions";
import { getUserProfileNameMap } from "@/lib/user-profile";

interface ChannelIdPageProps {
  params: {
    serverId: string;
    channelId: string;
  };
}

const ChannelIdPage = async ({ params }: ChannelIdPageProps) => {
  const profile = await currentProfile();

  if (!profile) {
    return redirect("/sign-in");
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

  const memberContext = await resolveMemberContext({
    profileId: profile.id,
    serverId: params.serverId,
  });

  const channelPermissions = await computeChannelPermissionForRole({
    serverId: params.serverId,
    channelId: currentChannel.id,
    role: currentMember.role,
    isServerOwner: memberContext?.isServerOwner ?? false,
  });

  if (!channelPermissions.allowView) {
    redirect(`/servers/${params.serverId}`);
  }

  const channelMessages = await db.query.message.findMany({
    where: eq(message.channelId, currentChannel.id),
    orderBy: [asc(message.createdAt)],
    with: {
      member: {
        with: {
          profile: true,
        },
      },
    },
  });

  const profileNameMap = await getUserProfileNameMap(
    channelMessages.map((item) => item.member.profileId)
  );

  const hydratedChannelMessages = channelMessages.map((item) => {
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-black/20 bg-white shadow-xl shadow-black/35 dark:bg-[#313338]">
        <ChatHeader
          name={currentChannel.name}
          serverId={currentChannel.serverId}
          type="channel"
        />

        {currentChannel.type === ChannelType.TEXT ? (
          <div className="flex-1 overflow-y-auto">
            {hydratedChannelMessages.length === 0 ? (
              <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400">
                No messages yet. Start the conversation in #{currentChannel.name}.
              </div>
            ) : (
              hydratedChannelMessages.map((item) => (
                <ChatItem
                  key={item.id}
                  id={item.id}
                  content={item.content}
                  member={item.member}
                  timestamp={new Date(item.createdAt).toLocaleString()}
                  fileUrl={item.fileUrl}
                  deleted={item.deleted}
                  currentMember={currentMember}
                  isUpdated={new Date(item.updatedAt).getTime() !== new Date(item.createdAt).getTime()}
                  socketUrl="/api/socket/messages"
                  socketQuery={{
                    channelId: currentChannel.id,
                    serverId: currentChannel.serverId,
                  }}
                />
              ))
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
            This channel type does not use text chat.
          </div>
        )}
      </div>

      {currentChannel.type === ChannelType.TEXT ? (
        <div className="w-[calc(100vw-584px)] max-w-full rounded-2xl border border-black/20 bg-white shadow-lg shadow-black/25 dark:bg-[#313338]">
          <ChatInput
            name={currentChannel.name}
            type="channel"
            apiUrl="/api/socket/messages"
            query={{
              channelId: currentChannel.id,
              serverId: currentChannel.serverId,
            }}
            disabled={!channelPermissions.allowSend}
          />
        </div>
      ) : null}
    </div>
  );
};

export default ChannelIdPage;
