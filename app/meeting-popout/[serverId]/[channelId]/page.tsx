import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, member } from "@/lib/db";
import { ChannelType } from "@/lib/db/types";
import { resolveMemberContext, computeChannelPermissionForRole } from "@/lib/channel-permissions";
import { pruneStaleVoiceStates, listActiveVoiceMembersForChannel } from "@/lib/voice-states";
import { VoiceStateSession } from "@/components/server/voice-state-session";
import { VideoChannelMeetingPanel } from "@/components/server/video-channel-meeting-panel";
import { resolveChannelRouteContext, resolveServerRouteContext } from "@/lib/route-slug-resolver";
import { buildChannelPath } from "@/lib/route-slugs";

type MeetingPopoutPageProps = {
  params: Promise<{
    serverId: string;
    channelId: string;
  }>;
  searchParams: Promise<{
    live?: string;
  }>;
};

const MeetingPopoutPage = async ({ params, searchParams }: MeetingPopoutPageProps) => {
  const { serverId: serverParam, channelId: channelParam } = await params;
  const resolvedSearchParams = await searchParams;

  const profile = await currentProfile();
  if (!profile) {
    return redirect("/sign-in");
  }

  const resolvedServer = await resolveServerRouteContext({
    profileId: profile.id,
    serverParam,
  });

  if (!resolvedServer) {
    return redirect("/");
  }

  const serverId = resolvedServer.id;

  const resolvedChannel = await resolveChannelRouteContext({
    serverId,
    channelParam,
  });

  if (!resolvedChannel) {
    return redirect(`/servers/${resolvedServer.segment}`);
  }

  const channelId = resolvedChannel.id;
  const canonicalChannelPath = buildChannelPath({
    server: { id: serverId, name: resolvedServer.name },
    channel: { id: channelId, name: resolvedChannel.name },
  });

  const currentChannel = await db.query.channel.findFirst({
    where: and(eq(channel.id, channelId), eq(channel.serverId, serverId)),
  });

  const currentMember = await db.query.member.findFirst({
    where: and(eq(member.serverId, serverId), eq(member.profileId, profile.id)),
  });

  if (!currentChannel || !currentMember) {
    return redirect("/");
  }

  const meetingOwnerProfileId = currentChannel.profileId;

  if (currentChannel.type !== ChannelType.VIDEO) {
    return redirect(
      buildChannelPath({
        server: { id: serverId, name: resolvedServer.name },
        channel: { id: currentChannel.id, name: currentChannel.name },
      })
    );
  }

  const memberContext = await resolveMemberContext({
    profileId: profile.id,
    serverId,
  });

  const channelPermissions = await computeChannelPermissionForRole({
    serverId,
    channelId: currentChannel.id,
    role: currentMember.role,
    isServerOwner: memberContext?.isServerOwner ?? false,
  });

  if (!channelPermissions.allowView) {
    return redirect(`/servers/${resolvedServer.segment}`);
  }

  const isLiveSessionRequested = String(resolvedSearchParams?.live ?? "true").toLowerCase() === "true";

  await pruneStaleVoiceStates();

  const connectedVoiceMembers = await listActiveVoiceMembersForChannel({
    serverId,
    channelId: currentChannel.id,
  });

  const isLiveSession = channelPermissions.allowConnect && isLiveSessionRequested;

  return (
    <div className="fixed inset-0 z-200 bg-[#0f1013] p-2">
      <VoiceStateSession
        serverId={serverId}
        channelId={currentChannel.id}
        active={isLiveSession}
        isVideoChannel
        showUi={false}
      />

      <VideoChannelMeetingPanel
        serverId={serverId}
        channelId={currentChannel.id}
        channelPath={canonicalChannelPath}
        meetingPopoutPath={`/meeting-popout/${encodeURIComponent(resolvedServer.segment)}/${encodeURIComponent(resolvedChannel.segment)}`}
        meetingName={currentChannel.name}
        canConnect={channelPermissions.allowConnect}
        isLiveSession={isLiveSession}
        isPopoutView
        hideParticipantsSidebar={false}
        hideParticipantStrip
        currentProfileId={profile.id}
        meetingCreatorProfileId={meetingOwnerProfileId}
        connectedMembers={connectedVoiceMembers.map((item) => ({
          memberId: item.memberId,
          profileId: item.profileId,
          displayName: item.displayName,
          profileImageUrl: item.profileImageUrl,
          isMuted: item.isMuted,
          isCameraOn: item.isCameraOn,
          isSpeaking: item.isSpeaking,
        }))}
        availableMembers={[]}
      />
    </div>
  );
};

export default MeetingPopoutPage;
