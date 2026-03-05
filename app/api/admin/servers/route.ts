import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { getServerBannerConfig } from "@/lib/server-banner-store";

type ServerRow = {
  id: string;
  name: string;
  imageUrl: string | null;
  inviteCode: string | null;
  profileId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  memberCount: number | string | null;
  channelCount: number | string | null;
};

const isInAccordAdministrator = (role: string | null | undefined) => {
  const normalizedRole = (role ?? "").trim().toUpperCase();
  return (
    normalizedRole === "ADMINISTRATOR" ||
    normalizedRole === "IN-ACCORD ADMINISTRATOR" ||
    normalizedRole === "IN_ACCORD_ADMINISTRATOR" ||
    normalizedRole === "ADMIN"
  );
};

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!isInAccordAdministrator(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const serversResult = await db.execute(sql`
      select
        s."id" as "id",
        s."name" as "name",
        s."imageUrl" as "imageUrl",
        s."inviteCode" as "inviteCode",
        s."profileId" as "profileId",
        u."name" as "ownerName",
        u."email" as "ownerEmail",
        s."createdAt" as "createdAt",
        s."updatedAt" as "updatedAt",
        (
          select count(*)::int
          from "Member" m
          where m."serverId" = s."id"
        ) as "memberCount",
        (
          select count(*)::int
          from "Channel" c
          where c."serverId" = s."id"
        ) as "channelCount"
      from "Server" s
      left join "Users" u on u."userId" = s."profileId"
      order by coalesce(s."name", s."id") asc
    `);

    const rows = (serversResult as unknown as { rows: ServerRow[] }).rows ?? [];

    const servers = await Promise.all(
      rows.map(async (row) => {
        const bannerConfig = await getServerBannerConfig(row.id);
        return {
          id: row.id,
          name: row.name ?? "Untitled Server",
          imageUrl: row.imageUrl ?? "/in-accord-steampunk-logo.png",
          bannerUrl: bannerConfig?.url ?? null,
          inviteCode: row.inviteCode ?? "",
          ownerId: row.profileId ?? "",
          ownerName: row.ownerName ?? row.ownerEmail ?? row.profileId ?? "Unknown Owner",
          ownerEmail: row.ownerEmail ?? "",
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
          updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
          memberCount: Number(row.memberCount ?? 0),
          channelCount: Number(row.channelCount ?? 0),
        };
      })
    );

    return NextResponse.json({ servers });
  } catch (error) {
    console.error("[ADMIN_SERVERS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
