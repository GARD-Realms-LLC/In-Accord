import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { buildServerPath } from "@/lib/route-slugs";

const ServersIndexPage = async () => {
  const profile = await currentProfile();

  if (!profile) {
    return redirect("/sign-in");
  }

  const firstServerResult = await db.execute(sql`
    select
      s."id" as "id",
      s."name" as "name"
    from "Server" s
    where trim(s."profileId") = trim(${profile.id})
       or exists (
         select 1
         from "Member" m
         where m."serverId" = s."id"
           and trim(m."profileId") = trim(${profile.id})
       )
    order by s."createdAt" asc, s."id" asc
    limit 1
  `);

  const firstServer = ((firstServerResult as unknown as {
    rows?: Array<{ id: string | null; name: string | null }>;
  }).rows ?? []).map((row) => ({
    id: String(row.id ?? "").trim(),
    name: String(row.name ?? "").trim(),
  }));

  if (firstServer[0]?.id) {
    return redirect(buildServerPath(firstServer[0]));
  }

  return redirect("/users");
};

export default ServersIndexPage;
