import { redirectToSignIn } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { channel, db, member, server } from "@/lib/db";

interface ServerIdPageProps {
  params: {
    serverId: string;
  }
}

const ServerIdPage = async ({ params }: ServerIdPageProps) => {
  const profile = await currentProfile();

  if (!profile) {
    return redirectToSignIn();
  }

  const access = await db
    .select({ id: server.id })
    .from(server)
    .innerJoin(
      member,
      and(
        eq(member.serverId, server.id),
        eq(member.profileId, profile.id),
        eq(server.id, params.serverId)
      )
    )
    .limit(1);

  if (!access[0]) {
    return redirect("/");
  }

  const initialChannel = await db
    .select({ id: channel.id, name: channel.name })
    .from(channel)
    .where(and(eq(channel.serverId, params.serverId), eq(channel.name, "general")))
    .orderBy(asc(channel.createdAt))
    .limit(1);

  if (initialChannel[0]?.name !== "general") {
    return null;
  }

  return redirect(`/servers/${params.serverId}/channels/${initialChannel[0]?.id}`);
}
 
export default ServerIdPage;