import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { ensureUserProfileSchema } from "@/lib/user-profile";

type RecentLoginRow = {
  userId: string;
  name: string | null;
  email: string | null;
  role: string | null;
  lastLogin: Date | string | null;
};

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    await ensureUserProfileSchema();

    const summaryResult = await db.execute(sql`
      select
        (select count(*)::int from "Users") as "totalUsers",
        (
          select count(*)::int
          from "Users" u
          where upper(trim(coalesce(u."role", ''))) in (
            'MODERATOR',
            'MOD'
          )
        ) as "adminUsers",
        (
          select count(*)::int
          from "Users" u
          where u."lastLogin" is null
        ) as "neverLoggedIn",
        (
          select count(*)::int
          from "Users" u
          where u."lastLogin" is null or u."lastLogin" < now() - interval '30 days'
        ) as "inactive30d",
        (
          select count(*)::int
          from "Server" s
          left join "Users" u on u."userId" = s."profileId"
          where s."profileId" is null or u."userId" is null
        ) as "serversWithoutValidOwner"
    `);

    const summaryRow = (summaryResult as unknown as {
      rows?: Array<{
        totalUsers: number | string | null;
        adminUsers: number | string | null;
        neverLoggedIn: number | string | null;
        inactive30d: number | string | null;
        serversWithoutValidOwner: number | string | null;
      }>;
    }).rows?.[0];

    const recentLoginsResult = await db.execute(sql`
      select
        u."userId" as "userId",
        coalesce(nullif(trim(up."profileName"), ''), nullif(trim(u."name"), ''), u."email", u."userId") as "name",
        u."email" as "email",
        u."role" as "role",
        u."lastLogin" as "lastLogin"
      from "Users" u
      left join "UserProfile" up on up."userId" = u."userId"
      order by u."lastLogin" desc nulls last
      limit 25
    `);

    const recentLogins = ((recentLoginsResult as unknown as { rows?: RecentLoginRow[] }).rows ?? []).map((row) => ({
      userId: row.userId,
      name: row.name ?? row.userId,
      email: row.email ?? "",
      role: row.role ?? "USER",
      lastLogin: row.lastLogin ? new Date(row.lastLogin).toISOString() : null,
    }));

    return NextResponse.json({
      summary: {
        totalUsers: Number(summaryRow?.totalUsers ?? 0),
        adminUsers: Number(summaryRow?.adminUsers ?? 0),
        neverLoggedIn: Number(summaryRow?.neverLoggedIn ?? 0),
        inactive30d: Number(summaryRow?.inactive30d ?? 0),
        serversWithoutValidOwner: Number(summaryRow?.serversWithoutValidOwner ?? 0),
      },
      recentLogins,
    });
  } catch (error) {
    console.error("[ADMIN_SECURITY_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
