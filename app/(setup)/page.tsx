import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { initialProfile } from "@/lib/initial-profile";
import { db, member, server } from "@/lib/db";
import { buildServerPath } from "@/lib/route-slugs";

const SetupPage = async () => {
  const profile = await initialProfile();

  if (!profile) {
    return redirect("/");
  }

  const firstServer = await db
    .select({ id: server.id, name: server.name })
    .from(server)
    .innerJoin(
      member,
      and(eq(member.serverId, server.id), eq(member.profileId, profile.id))
    )
    .limit(1);

  if (firstServer[0]) {
    return redirect(buildServerPath(firstServer[0]));
  }

  return redirect("/users");
};

export default SetupPage;
