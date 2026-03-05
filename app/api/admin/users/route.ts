import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { ensureUserProfileSchema } from "@/lib/user-profile";

type UserRow = {
  userId: string;
  realName: string | null;
  profileName: string | null;
  bannerUrl: string | null;
  email: string | null;
  role: string | null;
  imageUrl: string | null;
  joinedAt: Date | string | null;
  lastLogin: Date | string | null;
  ownedServerCount: number | string | null;
  joinedServerCount: number | string | null;
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

    await ensureUserProfileSchema();

    const usersResult = await db.execute(sql`
      select
        u."userId" as "userId",
        u."name" as "realName",
        up."profileName" as "profileName",
        up."bannerUrl" as "bannerUrl",
        u."email" as "email",
        u."role" as "role",
        coalesce(u."avatarUrl", u."avatar", u."icon") as "imageUrl",
        u."account.created" as "joinedAt",
        u."lastLogin" as "lastLogin"
        ,(
          select count(*)::int
          from "Server" s
          where s."profileId" = u."userId"
        ) as "ownedServerCount"
        ,(
          select count(distinct m."serverId")::int
          from "Member" m
          left join "Server" s2 on s2."id" = m."serverId"
          where m."profileId" = u."userId"
            and (s2."profileId" is null or s2."profileId" <> u."userId")
        ) as "joinedServerCount"
      from "Users" u
      left join "UserProfile" up on up."userId" = u."userId"
      where exists (
        select 1
        from "Member" m
        where m."profileId" = u."userId"
      )
      order by coalesce(u."name", u."email", u."userId") asc
    `);

    const rows = (usersResult as unknown as { rows: UserRow[] }).rows ?? [];

    const users = rows.map((row) => ({
      id: row.userId,
      userId: row.userId,
      name: row.realName ?? row.email ?? "User",
      profileName: row.profileName ?? null,
      bannerUrl: row.bannerUrl ?? null,
      email: row.email ?? "",
      role: row.role ?? "USER",
      imageUrl: row.imageUrl ?? "/in-accord-steampunk-logo.png",
      joinedAt: row.joinedAt ? new Date(row.joinedAt).toISOString() : null,
      lastLogin: row.lastLogin ? new Date(row.lastLogin).toISOString() : null,
      ownedServerCount: Number(row.ownedServerCount ?? 0),
      joinedServerCount: Number(row.joinedServerCount ?? 0),
    }));

    return NextResponse.json({ users });
  } catch (error) {
    console.error("[ADMIN_USERS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
