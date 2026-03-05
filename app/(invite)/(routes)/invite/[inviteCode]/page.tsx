import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { db, member, MemberRole, server } from "@/lib/db";
import { currentProfile } from "@/lib/current-profile";

interface InviteCodeProps {
  params: {
    inviteCode: string;
  }
}

const InviteCodePage = async ({ params }: InviteCodeProps) => {
  const profile = await currentProfile();
  if (!profile) {
    return redirect("/sign-in");
  }

  if (!params.inviteCode) {
    return redirect("/");
  }

  const existingServer = await db
    .select({ id: server.id })
    .from(server)
    .innerJoin(
      member,
      and(eq(member.serverId, server.id), eq(member.profileId, profile.id))
    )
    .where(eq(server.inviteCode, params.inviteCode))
    .limit(1);

  if (existingServer[0]) {
    return redirect(`/servers/${existingServer[0].id}`);
  }

  const inviteServer = await db.query.server.findFirst({
    where: eq(server.inviteCode, params.inviteCode),
  });

  if (inviteServer) {
    const now = new Date();
    await db.insert(member).values({
      id: uuidv4(),
      profileId: profile.id,
      serverId: inviteServer.id,
      role: MemberRole.GUEST,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (inviteServer) {
    return redirect(`/servers/${inviteServer.id}`);
  }

  return null;
}

export default InviteCodePage;