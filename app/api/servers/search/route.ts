import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";

type SearchRow = {
  id: string;
  name: string;
  imageUrl: string | null;
  inviteCode: string;
  ownerName: string | null;
  memberCount: number | string | null;
  isMember: boolean | null;
};

export async function GET(request: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = String(searchParams.get("query") ?? "").trim().toLowerCase();

    const result = await db.execute(sql`
      select
        s."id" as "id",
        s."name" as "name",
        s."imageUrl" as "imageUrl",
        s."inviteCode" as "inviteCode",
        owner."name" as "ownerName",
        (
          select count(*)::int
          from "Member" mcount
          where mcount."serverId" = s."id"
        ) as "memberCount",
        exists (
          select 1
          from "Member" mm
          where mm."serverId" = s."id"
            and mm."profileId" = ${profile.id}
        ) as "isMember"
      from "Server" s
      left join "Users" owner on owner."userId" = s."profileId"
      where ${query.length > 0}
        and (
          lower(coalesce(s."name", '')) like ${`%${query}%`}
          or lower(coalesce(owner."name", '')) like ${`%${query}%`}
          or lower(coalesce(owner."email", '')) like ${`%${query}%`}
          or lower(coalesce(s."inviteCode", '')) like ${`%${query}%`}
        )
        or ${query.length === 0}
      order by s."createdAt" desc
      limit 50
    `);

    const rows = (result as unknown as { rows: SearchRow[] }).rows ?? [];

    const servers = rows.map((row) => ({
      id: row.id,
      name: row.name,
      imageUrl: row.imageUrl ?? "/in-accord-steampunk-logo.png",
      inviteCode: row.inviteCode,
      ownerName: row.ownerName ?? "Unknown",
      memberCount: Number(row.memberCount ?? 0),
      isMember: Boolean(row.isMember),
    }));

    return NextResponse.json({ servers });
  } catch (error) {
    console.error("[SERVERS_SEARCH_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
