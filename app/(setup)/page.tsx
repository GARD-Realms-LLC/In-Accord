import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { initialProfile } from "@/lib/initial-profile";
import { db, member, server } from "@/lib/db";
import { InitialModal } from "@/components/modals/initial-modal";

const SetupPage = async () => {
  const profile = await initialProfile();

  if (!profile) {
    return redirect("/");
  }

  const firstServer = await db
    .select({ id: server.id })
    .from(server)
    .innerJoin(
      member,
      and(eq(member.serverId, server.id), eq(member.profileId, profile.id))
    )
    .limit(1);

  if (firstServer[0]) {
    return redirect(`/servers/${firstServer[0].id}`);
  }

  return <InitialModal />;
};

export default SetupPage;
