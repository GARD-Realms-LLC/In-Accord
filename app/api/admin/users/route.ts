import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import { ensureLocalAuthSchema } from "@/lib/local-auth";
import { hashPassword } from "@/lib/password";
import { normalizePresenceStatus } from "@/lib/presence-status";
import { getNextIncrementalUserId } from "@/lib/user-id";
import { ensureUserProfileSchema } from "@/lib/user-profile";

type UserRow = {
  userId: string;
  realName: string | null;
  profileName: string | null;
  bannerUrl: string | null;
  presenceStatus: string | null;
  email: string | null;
  role: string | null;
  imageUrl: string | null;
  joinedAt: Date | string | null;
  lastLogin: Date | string | null;
  ownedServerCount: number | string | null;
  joinedServerCount: number | string | null;
};

const normalizeManagedUserRole = (role: unknown) => {
  const normalized = String(role ?? "USER").trim().toUpperCase();

  if (normalized === "USER") {
    return "USER";
  }

  if (
    normalized === "ADMIN" ||
    normalized === "ADMINISTRATOR"
  ) {
    return "ADMINISTRATOR";
  }

  if (normalized === "DEVELOPER") {
    return "DEVELOPER";
  }

  if (
    normalized === "MODERATOR" ||
    normalized === "MOD"
  ) {
    return "MODERATOR";
  }

  return null;
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

    const usersResult = await db.execute(sql`
      select
        u."userId" as "userId",
        u."name" as "realName",
        up."profileName" as "profileName",
        up."bannerUrl" as "bannerUrl",
        up."presenceStatus" as "presenceStatus",
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
      order by coalesce(u."name", u."email", u."userId") asc
    `);

    const rows = (usersResult as unknown as { rows: UserRow[] }).rows ?? [];

    const users = rows.map((row) => ({
      id: row.userId,
      userId: row.userId,
      name: row.profileName ?? row.realName ?? row.email ?? "User",
      profileName: row.profileName ?? null,
      bannerUrl: row.bannerUrl ?? null,
      presenceStatus: normalizePresenceStatus(row.presenceStatus),
      email: row.email ?? "",
      role: normalizeManagedUserRole(row.role) ?? "USER",
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

export async function POST(request: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
    } | null;

    const name = String(body?.name ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const role = normalizeManagedUserRole(body?.role);

    if (!name || !email || !password) {
      return new NextResponse("Name, email and password are required", { status: 400 });
    }

    if (password.length < 8) {
      return new NextResponse("Password must be at least 8 characters", { status: 400 });
    }

    if (!role) {
      return new NextResponse("Invalid role. Allowed roles: USER, ADMINISTRATOR, DEVELOPER, MODERATOR", { status: 400 });
    }

    await ensureLocalAuthSchema();
    await ensureUserProfileSchema();

    const existingResult = await db.execute(sql`
      select "userId"
      from "Users"
      where lower(coalesce("email", '')) = ${email}
      limit 1
    `);
    const existingRows = (existingResult as unknown as { rows: Array<{ userId: string }> }).rows;
    if (existingRows?.[0]) {
      return new NextResponse("Email already in use", { status: 409 });
    }

    const userId = await getNextIncrementalUserId();
    const now = new Date();
    const normalizedRole = role;

    await db.execute(sql`
      insert into "Users" (
        "userId",
        "name",
        "email",
        "avatarUrl",
        "role",
        "account.created",
        "lastLogin"
      )
      values (
        ${userId},
        ${null},
        ${email},
        ${"/in-accord-steampunk-logo.png"},
        ${normalizedRole},
        ${now},
        ${now}
      )
    `);

    await db.execute(sql`
      insert into "UserProfile" ("userId", "profileName", "presenceStatus", "createdAt", "updatedAt")
      values (${userId}, ${name}, ${"ONLINE"}, ${now}, ${now})
      on conflict ("userId") do update
      set "profileName" = excluded."profileName",
          "updatedAt" = excluded."updatedAt"
    `);

    const passwordHash = await hashPassword(password);
    await db.execute(sql`
      insert into "LocalCredential" ("userId", "passwordHash", "createdAt", "updatedAt")
      values (${userId}, ${passwordHash}, ${now}, ${now})
      on conflict ("userId") do update
      set "passwordHash" = excluded."passwordHash",
          "updatedAt" = excluded."updatedAt"
    `);

    return NextResponse.json({
      ok: true,
      user: {
        id: userId,
        userId,
        name,
        email,
        role: normalizedRole,
      },
    });
  } catch (error) {
    console.error("[ADMIN_USERS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      userId?: string;
      role?: string;
    } | null;

    const userId = String(body?.userId ?? "").trim();
    const role = normalizeManagedUserRole(body?.role);

    if (!userId) {
      return new NextResponse("userId is required", { status: 400 });
    }

    if (!role) {
      return new NextResponse("Invalid role. Allowed roles: USER, ADMINISTRATOR, DEVELOPER, MODERATOR", { status: 400 });
    }

    if (userId === profile.id && role === "USER") {
      return new NextResponse("You cannot downgrade your own account to USER.", { status: 400 });
    }

    const existingResult = await db.execute(sql`
      select "userId", "email"
      from "Users"
      where "userId" = ${userId}
      limit 1
    `);

    const existingRow = (existingResult as unknown as {
      rows?: Array<{ userId: string; email: string | null }>;
    }).rows?.[0];

    if (!existingRow) {
      return new NextResponse("User not found", { status: 404 });
    }

    await db.execute(sql`
      update "Users"
      set "role" = ${role}
      where "userId" = ${userId}
    `);

    return NextResponse.json({
      ok: true,
      user: {
        userId,
        email: existingRow.email ?? "",
        role,
      },
    });
  } catch (error) {
    console.error("[ADMIN_USERS_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasInAccordAdministrativeAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = String(searchParams.get("userId") ?? "").trim();

    if (!userId) {
      return new NextResponse("userId is required", { status: 400 });
    }

    if (userId === profile.id) {
      return new NextResponse("You cannot delete your own account from admin.", { status: 400 });
    }

    await ensureLocalAuthSchema();
    await ensureUserProfileSchema();

    const userCheckResult = await db.execute(sql`
      select "userId"
      from "Users"
      where "userId" = ${userId}
      limit 1
    `);
    const userRows = (userCheckResult as unknown as { rows: Array<{ userId: string }> }).rows;
    if (!userRows?.[0]) {
      return new NextResponse("User not found", { status: 404 });
    }

    const usageResult = await db.execute(sql`
      select
        (
          select count(*)::int
          from "Server" s
          where s."profileId" = ${userId}
        ) as "ownedServerCount",
        (
          select count(*)::int
          from "Member" m
          where m."profileId" = ${userId}
        ) as "memberCount"
    `);

    const usageRow = (usageResult as unknown as {
      rows: Array<{
        ownedServerCount: number | string | null;
        memberCount: number | string | null;
      }>;
    }).rows?.[0];

    const ownedServerCount = Number(usageRow?.ownedServerCount ?? 0);
    const memberCount = Number(usageRow?.memberCount ?? 0);

    if (ownedServerCount > 0 || memberCount > 0) {
      return new NextResponse(
        "User cannot be deleted because they are linked to servers or memberships.",
        { status: 409 }
      );
    }

    await db.execute(sql`
      delete from "LocalCredential"
      where "userId" = ${userId}
    `);

    await db.execute(sql`
      delete from "UserProfile"
      where "userId" = ${userId}
    `);

    await db.execute(sql`
      delete from "Users"
      where "userId" = ${userId}
    `);

    return NextResponse.json({ ok: true, userId });
  } catch (error) {
    console.error("[ADMIN_USERS_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
