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
import { isInAccordAdministrator } from "@/lib/in-accord-admin";
import { getInAccordRoles, normalizeRoleKey } from "@/lib/in-accord-roles";
import { isImmutableAccountUserId } from "@/lib/account-security";
import { ADMINISTRATOR_ROLE_KEY } from "@/lib/account-security-constants";
import { isBotUser } from "@/lib/is-bot-user";
import { ensureInAccordRoleSchema } from "@/lib/in-accord-roles";
import { isInAccordProtectedServer } from "@/lib/server-security";
import { removeServerFromAllProfileServerTabs } from "@/lib/profile-server-tabs";
import { removeServerFromServerRailFolders } from "@/lib/server-rail-layout";
import { hardDeleteServerScopedData } from "@/lib/server-hard-delete";

type UserRow = {
  userId: string;
  realName: string | null;
  profileName: string | null;
  pronouns: string | null;
  comment: string | null;
  bannerUrl: string | null;
  presenceStatus: string | null;
  currentGame: string | null;
  email: string | null;
  role: string | null;
  phone: string | null;
  dateOfBirth: Date | string | null;
  imageUrl: string | null;
  joinedAt: Date | string | null;
  lastLogin: Date | string | null;
  ownedServerCount: number | string | null;
  joinedServerCount: number | string | null;
};

const normalizeDateOfBirthInput = (value: string): string | null => {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return "INVALID";
  }

  const [yearPart, monthPart, dayPart] = trimmed.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return "INVALID";
  }

  return trimmed;
};

const toDateOnlyString = (value: Date | string | null) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return value.toISOString().slice(0, 10);
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
};

const normalizeManagedUserRole = (role: unknown) => normalizeRoleKey(role);

const resolveAllowedRoleSet = async () => {
  const roles = await getInAccordRoles();
  return new Set(roles.map((role) => role.roleKey));
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
        up."pronouns" as "pronouns",
        up."comment" as "comment",
        up."bannerUrl" as "bannerUrl",
        up."presenceStatus" as "presenceStatus",
        nullif(trim(to_jsonb(up)->>'currentGame'), '') as "currentGame",
        u."email" as "email",
        u."role" as "role",
        u."phone" as "phone",
        u."dob" as "dateOfBirth",
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
      pronouns: row.pronouns ?? null,
      comment: row.comment ?? null,
      bannerUrl: row.bannerUrl ?? null,
      presenceStatus: normalizePresenceStatus(row.presenceStatus),
      currentGame: row.currentGame ?? null,
      email: row.email ?? "",
      role: normalizeManagedUserRole(row.role) ?? "USER",
      phoneNumber: row.phone ?? "",
      dateOfBirth: toDateOnlyString(row.dateOfBirth),
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
      return new NextResponse("Invalid role value.", { status: 400 });
    }

    const allowedRoles = await resolveAllowedRoleSet();
    if (!allowedRoles.has(role)) {
      return new NextResponse("Role is not available in managed roles.", { status: 400 });
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
      phoneNumber?: string | null;
      dateOfBirth?: string | null;
      action?: string;
    } | null;

    const action = String(body?.action ?? "").trim().toLowerCase();

    if (action === "assignbotsrole") {
      await ensureInAccordRoleSchema();

      await db.execute(sql`
        insert into "InAccordRole" ("roleKey", "roleLabel", "isSystem")
        values (${"BOTS"}, ${"Bots"}, false)
        on conflict ("roleKey") do update
        set "roleLabel" = excluded."roleLabel",
            "updatedAt" = now()
      `);

      const usersResult = await db.execute(sql`
        select "userId", "role", "name", "email"
        from "Users"
      `);

      const allUsers = (usersResult as unknown as {
        rows?: Array<{
          userId: string;
          role: string | null;
          name: string | null;
          email: string | null;
        }>;
      }).rows ?? [];

      let updatedCount = 0;

      for (const row of allUsers) {
        const isBotAccount = isBotUser({
          role: row.role,
          name: row.name,
          email: row.email,
        });

        if (!isBotAccount) {
          continue;
        }

        const currentRole = normalizeManagedUserRole(row.role) ?? "USER";
        if (currentRole === "BOTS") {
          continue;
        }

        await db.execute(sql`
          update "Users"
          set "role" = ${"BOTS"}
          where "userId" = ${row.userId}
        `);
        updatedCount += 1;
      }

      return NextResponse.json({ ok: true, updatedCount, role: "BOTS" });
    }

    const userId = String(body?.userId ?? "").trim();
    const roleProvided = Boolean(body && Object.prototype.hasOwnProperty.call(body, "role"));
    const phoneNumberProvided = Boolean(body && Object.prototype.hasOwnProperty.call(body, "phoneNumber"));
    const dateOfBirthProvided = Boolean(body && Object.prototype.hasOwnProperty.call(body, "dateOfBirth"));

    const role = roleProvided ? normalizeManagedUserRole(body?.role) : null;
    const phoneNumber = phoneNumberProvided
      ? String(body?.phoneNumber ?? "").trim()
      : "";
    const normalizedDateOfBirth = dateOfBirthProvided
      ? normalizeDateOfBirthInput(typeof body?.dateOfBirth === "string" ? body.dateOfBirth : "")
      : null;

    if (!userId) {
      return new NextResponse("userId is required", { status: 400 });
    }

    if (!roleProvided && !phoneNumberProvided && !dateOfBirthProvided) {
      return new NextResponse("At least one field must be provided: role, phoneNumber, or dateOfBirth", { status: 400 });
    }

    if (roleProvided && !role) {
      return new NextResponse("Invalid role value.", { status: 400 });
    }

    if (roleProvided && role) {
      const allowedRoles = await resolveAllowedRoleSet();
      if (!allowedRoles.has(role)) {
        return new NextResponse("Role is not available in managed roles.", { status: 400 });
      }
    }

    if (phoneNumberProvided && phoneNumber.length > 32) {
      return new NextResponse("Phone number must be 32 characters or less.", { status: 400 });
    }

    if (dateOfBirthProvided && normalizedDateOfBirth === "INVALID") {
      return new NextResponse("Date Of Birth must be a valid date in YYYY-MM-DD format.", { status: 400 });
    }

    if (dateOfBirthProvided && !isInAccordAdministrator(profile.role)) {
      return new NextResponse("Only Administrators can edit Date Of Birth.", { status: 403 });
    }

    if (userId === profile.id && role === "USER") {
      return new NextResponse("You cannot downgrade your own account to USER.", { status: 400 });
    }

    const existingResult = await db.execute(sql`
      select "userId", "email", "role"
      from "Users"
      where "userId" = ${userId}
      limit 1
    `);

    const existingRow = (existingResult as unknown as {
      rows?: Array<{ userId: string; email: string | null; role: string | null }>;
    }).rows?.[0];

    if (!existingRow) {
      return new NextResponse("User not found", { status: 404 });
    }

    const existingRole = normalizeManagedUserRole(existingRow.role) ?? "USER";

    if (roleProvided && role) {
      if (isImmutableAccountUserId(userId) && role !== ADMINISTRATOR_ROLE_KEY) {
        return new NextResponse(
          `Protected account ${userId} must always keep ${ADMINISTRATOR_ROLE_KEY} role.`,
          { status: 403 }
        );
      }

      if (existingRole === ADMINISTRATOR_ROLE_KEY && role !== ADMINISTRATOR_ROLE_KEY) {
        return new NextResponse("Administrator role cannot be removed from a user account.", { status: 403 });
      }
    }

    if (phoneNumberProvided || dateOfBirthProvided) {
      await db.execute(sql`
        alter table "Users"
        add column if not exists "phone" varchar(32)
      `);

      await db.execute(sql`
        alter table "Users"
        add column if not exists "dob" date
      `);
    }

    if (roleProvided && role) {
      await db.execute(sql`
        update "Users"
        set "role" = ${role}
        where "userId" = ${userId}
      `);
    }

    if (phoneNumberProvided) {
      await db.execute(sql`
        update "Users"
        set "phone" = ${phoneNumber || null}
        where "userId" = ${userId}
      `);
    }

    if (dateOfBirthProvided) {
      await db.execute(sql`
        update "Users"
        set "dob" = ${normalizedDateOfBirth}
        where "userId" = ${userId}
      `);
    }

    const updatedResult = await db.execute(sql`
      select "role", "phone", "dob" as "dateOfBirth"
      from "Users"
      where "userId" = ${userId}
      limit 1
    `);

    const updatedRow = (updatedResult as unknown as {
      rows?: Array<{
        role: string | null;
        phone: string | null;
        dateOfBirth: Date | string | null;
      }>;
    }).rows?.[0];

    const normalizedUpdatedRole = normalizeManagedUserRole(updatedRow?.role) ?? "USER";

    return NextResponse.json({
      ok: true,
      user: {
        userId,
        email: existingRow.email ?? "",
        role: normalizedUpdatedRole,
        phoneNumber: updatedRow?.phone ?? "",
        dateOfBirth: toDateOnlyString(updatedRow?.dateOfBirth ?? null),
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

    if (isImmutableAccountUserId(userId)) {
      return new NextResponse("This core account is protected and cannot be deleted.", { status: 403 });
    }

    if (userId === profile.id) {
      return new NextResponse("You cannot delete your own account from admin.", { status: 400 });
    }

    await ensureLocalAuthSchema();
    await ensureUserProfileSchema();

    const userCheckResult = await db.execute(sql`
      select "userId", "role", "name", "email"
      from "Users"
      where "userId" = ${userId}
      limit 1
    `);
    const userRows = (userCheckResult as unknown as {
      rows: Array<{
        userId: string;
        role: string | null;
        name: string | null;
        email: string | null;
      }>;
    }).rows;
    const userRow = userRows?.[0];
    if (!userRow) {
      return new NextResponse("User not found", { status: 404 });
    }

    const ownedServersResult = await db.execute(sql`
      select "id", "name"
      from "Server"
      where "profileId" = ${userId}
    `);

    const ownedServers = (ownedServersResult as unknown as {
      rows?: Array<{ id: string | null; name: string | null }>;
    }).rows ?? [];

    for (const ownedServer of ownedServers) {
      const ownedServerId = String(ownedServer.id ?? "").trim();
      if (!ownedServerId) {
        continue;
      }

      if (
        isInAccordProtectedServer({
          serverId: ownedServerId,
          serverName: ownedServer.name,
        })
      ) {
        return new NextResponse("This user owns a protected In-Accord server and cannot be deleted.", {
          status: 403,
        });
      }
    }

    await db.execute(sql`
      delete from "Member"
      where "profileId" = ${userId}
    `);

    for (const ownedServer of ownedServers) {
      const ownedServerId = String(ownedServer.id ?? "").trim();
      if (!ownedServerId) {
        continue;
      }

      await removeServerFromAllProfileServerTabs(ownedServerId);
      await removeServerFromServerRailFolders(ownedServerId);
      await hardDeleteServerScopedData(ownedServerId);

      await db.execute(sql`
        delete from "Server"
        where "id" = ${ownedServerId}
          and "profileId" = ${userId}
      `);
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
