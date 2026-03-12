import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { db, member, MemberRole, server } from "@/lib/db";
import { currentProfile } from "@/lib/current-profile";
import { recordServerInviteUse } from "@/lib/server-invite-store";
import { isServerIntegrationBotBanned } from "@/lib/server-integration-bot-store";
import {
  isChannelInviteUsable,
  recordChannelInviteUse,
  resolveChannelInviteByCode,
} from "@/lib/channel-invite-store";
import { isServerInviteApprovalRequired } from "@/lib/server-profile-settings-store";
import { buildChannelPath, buildServerPath } from "@/lib/route-slugs";

export const dynamic = "force-dynamic";

interface InviteCodeProps {
  params: Promise<{
    inviteCode?: string;
  }>;
}

const InviteCodePage = async ({ params }: InviteCodeProps) => {
  const { inviteCode } = await params;

  const profile = await currentProfile();
  if (!profile) {
    return redirect("/sign-in");
  }

  if (!inviteCode) {
    return redirect("/invite/invalid?reason=invalid");
  }

  const existingServer = await db
    .select({ id: server.id, name: server.name })
    .from(server)
    .innerJoin(
      member,
      and(eq(member.serverId, server.id), eq(member.profileId, profile.id))
    )
    .where(eq(server.inviteCode, inviteCode))
    .limit(1);

  if (existingServer[0]) {
    return redirect(buildServerPath(existingServer[0]));
  }

  const channelInviteMatch = await resolveChannelInviteByCode(inviteCode);
  if (channelInviteMatch) {
    if (await isServerInviteApprovalRequired(channelInviteMatch.serverId)) {
      return redirect(`/invite/invalid?reason=approval-required&code=${encodeURIComponent(inviteCode)}`);
    }

    const isBanned = await isServerIntegrationBotBanned(channelInviteMatch.serverId, profile.id);
    if (isBanned) {
      return redirect(`/invite/invalid?reason=banned&code=${encodeURIComponent(inviteCode)}`);
    }

    const inviteState = isChannelInviteUsable(channelInviteMatch.invite);
    if (!inviteState.ok) {
      return redirect(
        `/invite/invalid?reason=${encodeURIComponent(inviteState.reason)}&code=${encodeURIComponent(inviteCode)}`
      );
    }

    const existingChannelServerMembership = await db.query.member.findFirst({
      where: and(eq(member.serverId, channelInviteMatch.serverId), eq(member.profileId, profile.id)),
      columns: { id: true },
    });

    if (!existingChannelServerMembership) {
      const now = new Date();
      await db.insert(member).values({
        id: uuidv4(),
        profileId: profile.id,
        serverId: channelInviteMatch.serverId,
        role: MemberRole.GUEST,
        createdAt: now,
        updatedAt: now,
      });
    }

    await recordChannelInviteUse({
      channelId: channelInviteMatch.channelId,
      serverId: channelInviteMatch.serverId,
      code: inviteCode,
    });

    return redirect(
      buildChannelPath({
        server: { id: channelInviteMatch.serverId, name: channelInviteMatch.serverName },
        channel: { id: channelInviteMatch.channelId, name: channelInviteMatch.channelName },
      })
    );
  }

  const inviteServer = await db.query.server.findFirst({
    where: eq(server.inviteCode, inviteCode),
  });

  if (inviteServer) {
    if (await isServerInviteApprovalRequired(inviteServer.id)) {
      return redirect(`/invite/invalid?reason=approval-required&code=${encodeURIComponent(inviteCode)}`);
    }

    const isBanned = await isServerIntegrationBotBanned(inviteServer.id, profile.id);
    if (isBanned) {
      return redirect(`/invite/invalid?reason=banned&code=${encodeURIComponent(inviteCode)}`);
    }

    const now = new Date();
    await db.insert(member).values({
      id: uuidv4(),
      profileId: profile.id,
      serverId: inviteServer.id,
      role: MemberRole.GUEST,
      createdAt: now,
      updatedAt: now,
    });

    await recordServerInviteUse(inviteServer.id, inviteCode, profile.id);
  }

  if (inviteServer) {
    return redirect(buildServerPath({ id: inviteServer.id, name: inviteServer.name }));
  }

  return redirect(`/invite/invalid?reason=invalid&code=${encodeURIComponent(inviteCode)}`);
};

export default InviteCodePage;