import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { db, member, MemberRole, server } from "@/lib/db";
import { currentProfile } from "@/lib/current-profile";
import { recordServerInviteUse } from "@/lib/server-invite-store";
import { isServerIntegrationBotBanned } from "@/lib/server-integration-bot-store";
import { buildServerPath } from "@/lib/route-slugs";

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
    return redirect("/");
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

  const inviteServer = await db.query.server.findFirst({
    where: eq(server.inviteCode, inviteCode),
  });

  if (inviteServer) {
    const isBanned = await isServerIntegrationBotBanned(inviteServer.id, profile.id);
    if (isBanned) {
      return redirect("/");
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

  return redirect("/");
};

export default InviteCodePage;