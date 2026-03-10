import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import {
  ensureFamilyAccountSchema,
  getFamilyLifecycleState,
  normalizeFamilyLinkStateLabel,
  autoConvertFamilyAccountIfNeeded,
} from "@/lib/family-accounts";
import { isInAccordAdministrator, isInAccordParent } from "@/lib/in-accord-admin";
import { ensureLocalAuthSchema } from "@/lib/local-auth";
import { hashPassword } from "@/lib/password";
import { getNextIncrementalUserId } from "@/lib/user-id";
import { ensureUserProfileSchema } from "@/lib/user-profile";

const hasSchoolCenterAccess = (role: string | null | undefined) => {
  return isInAccordAdministrator(role) || isInAccordParent(role);
};

const normalizeDateOfBirthInput = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const normalized = trimmed.replace(/\//g, "-");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const [yearPart, monthPart, dayPart] = normalized.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return normalized;
};

const normalizeIds = (value: string | null) => {
  if (!value) {
    return [] as string[];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 50);
};

type SchoolMemberRow = {
  userId: string;
  dateOfBirth: string | null;
  familyParentUserId: string | null;
};

type ExistingAccountRow = {
  userId: string;
  familyParentUserId: string | null;
};

const serializeMemberState = (memberUserId: string, dateOfBirth: string | null, familyParentUserId: string | null) => {
  const lifecycle = getFamilyLifecycleState(dateOfBirth, familyParentUserId);

  return {
    memberUserId,
    age: lifecycle.age,
    isFamilyLinked: lifecycle.isFamilyLinked,
    showFamilyIcon: lifecycle.showFamilyIcon,
    canConvertToNormal: lifecycle.canConvertToNormal,
    state: normalizeFamilyLinkStateLabel(lifecycle),
  };
};

export async function GET(request: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasSchoolCenterAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    await ensureFamilyAccountSchema();

    const { searchParams } = new URL(request.url);
    const ids = normalizeIds(searchParams.get("ids"));

    if (ids.length === 0) {
      return NextResponse.json({ members: [] });
    }

    const result = await db.execute(sql`
      select
        u."userId" as "userId",
        nullif(trim(to_jsonb(u)->>'dob'), '') as "dateOfBirth",
        nullif(trim(to_jsonb(u)->>'familyParentUserId'), '') as "familyParentUserId"
      from "Users" u
      where u."userId" in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    `);

    const rows = (result as unknown as { rows?: SchoolMemberRow[] }).rows ?? [];

    const members = await Promise.all(
      rows.map(async (row) => {
        const normalized = await autoConvertFamilyAccountIfNeeded(
          row.userId,
          row.dateOfBirth,
          row.familyParentUserId
        );

        return serializeMemberState(
          row.userId,
          row.dateOfBirth,
          normalized.familyParentUserId
        );
      })
    );

    return NextResponse.json({ members });
  } catch (error) {
    console.error("[SCHOOL_CENTER_MEMBERS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasSchoolCenterAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      childName?: string;
      accountIdentifier?: string;
      childEmail?: string;
      childPassword?: string;
      childPhone?: string;
      childDateOfBirth?: string;
    } | null;

    const childName = String(body?.childName ?? "").trim();
    const accountIdentifier = String(body?.accountIdentifier ?? "").trim();
    const childEmail = String(body?.childEmail ?? "").trim().toLowerCase();
    const childPassword = String(body?.childPassword ?? "");
    const childPhone = String(body?.childPhone ?? "").trim();
    const childDateOfBirth = normalizeDateOfBirthInput(body?.childDateOfBirth);

    if (!childName || !accountIdentifier || !childEmail || !childPassword || !childPhone || !childDateOfBirth) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    if (!/^\S+@\S+\.\S+$/.test(childEmail)) {
      return new NextResponse("Enter a valid email address", { status: 400 });
    }

    if (childPassword.length < 8) {
      return new NextResponse("Password must be at least 8 characters", { status: 400 });
    }

    await ensureFamilyAccountSchema();
    await ensureLocalAuthSchema();
    await ensureUserProfileSchema();

    await db.execute(sql`
      alter table "Users"
      add column if not exists "phone" varchar(32)
    `);

    await db.execute(sql`
      alter table "Users"
      add column if not exists "dob" date
    `);

    const existingEmailResult = await db.execute(sql`
      select "userId"
      , nullif(trim(to_jsonb("Users")->>'familyParentUserId'), '') as "familyParentUserId"
      from "Users"
      where lower(coalesce("email", '')) = ${childEmail}
      limit 1
    `);

    const existingEmail = (existingEmailResult as unknown as { rows?: ExistingAccountRow[] }).rows?.[0];
    if (existingEmail) {
      if (existingEmail.familyParentUserId === profile.id) {
        return new NextResponse("A school account with this email already exists in your School Center", { status: 409 });
      }

      return new NextResponse("Email already in use", { status: 409 });
    }

    const existingProfileNameResult = await db.execute(sql`
      select
        u."userId" as "userId",
        nullif(trim(to_jsonb(u)->>'familyParentUserId'), '') as "familyParentUserId"
      from "UserProfile" up
      inner join "Users" u on u."userId" = up."userId"
      where lower(trim(coalesce(up."profileName", ''))) = lower(${accountIdentifier})
      limit 1
    `);

    const existingProfileName = (existingProfileNameResult as unknown as { rows?: ExistingAccountRow[] }).rows?.[0];
    if (existingProfileName) {
      if (existingProfileName.familyParentUserId === profile.id) {
        return new NextResponse("A school account with this profile name already exists in your School Center", { status: 409 });
      }

      return new NextResponse("Profile name already in use", { status: 409 });
    }

    const userId = await getNextIncrementalUserId();
    const now = new Date();

    await db.execute(sql`
      insert into "Users" (
        "userId",
        "name",
        "email",
        "phone",
        "dob",
        "familyParentUserId",
        "avatarUrl",
        "role",
        "account.created",
        "lastLogin"
      )
      values (
        ${userId},
        ${childName.slice(0, 60)},
        ${childEmail},
        ${childPhone.slice(0, 32)},
        ${childDateOfBirth},
        ${profile.id},
        ${"/in-accord-steampunk-logo.png"},
        ${"USER"},
        ${now},
        ${now}
      )
    `);

    await db.execute(sql`
      insert into "UserProfile" ("userId", "profileName", "presenceStatus", "createdAt", "updatedAt")
      values (${userId}, ${accountIdentifier.slice(0, 160)}, ${"ONLINE"}, ${now}, ${now})
      on conflict ("userId") do update
      set "profileName" = excluded."profileName",
          "updatedAt" = excluded."updatedAt"
    `);

    const passwordHash = await hashPassword(childPassword);
    await db.execute(sql`
      insert into "LocalCredential" ("userId", "passwordHash", "createdAt", "updatedAt")
      values (${userId}, ${passwordHash}, ${now}, ${now})
      on conflict ("userId") do update
      set "passwordHash" = excluded."passwordHash",
          "updatedAt" = excluded."updatedAt"
    `);

    const lifecycle = getFamilyLifecycleState(childDateOfBirth, profile.id);

    return NextResponse.json({
      ok: true,
      memberUserId: userId,
      lifecycle: {
        age: lifecycle.age,
        isFamilyLinked: lifecycle.isFamilyLinked,
        showFamilyIcon: lifecycle.showFamilyIcon,
        canConvertToNormal: lifecycle.canConvertToNormal,
        state: normalizeFamilyLinkStateLabel(lifecycle),
      },
    });
  } catch (error) {
    console.error("[SCHOOL_CENTER_MEMBERS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!hasSchoolCenterAccess(profile.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      memberUserId?: string;
      action?: "convert-to-normal";
    } | null;

    const memberUserId = String(body?.memberUserId ?? "").trim();
    const action = body?.action;

    if (!memberUserId || action !== "convert-to-normal") {
      return new NextResponse("Invalid request", { status: 400 });
    }

    await ensureFamilyAccountSchema();

    const result = await db.execute(sql`
      select
        u."userId" as "userId",
        nullif(trim(to_jsonb(u)->>'dob'), '') as "dateOfBirth",
        nullif(trim(to_jsonb(u)->>'familyParentUserId'), '') as "familyParentUserId"
      from "Users" u
      where u."userId" = ${memberUserId}
      limit 1
    `);

    const member = (result as unknown as { rows?: SchoolMemberRow[] }).rows?.[0];

    if (!member) {
      return new NextResponse("School member account not found", { status: 404 });
    }

    if (member.familyParentUserId !== profile.id && !isInAccordAdministrator(profile.role)) {
      return new NextResponse("Only the creating school account can convert this member", { status: 403 });
    }

    const normalized = await autoConvertFamilyAccountIfNeeded(
      member.userId,
      member.dateOfBirth,
      member.familyParentUserId
    );

    if (!normalized.lifecycle.canConvertToNormal || !normalized.familyParentUserId) {
      return new NextResponse("This account is not eligible for conversion yet", { status: 400 });
    }

    await db.execute(sql`
      update "Users"
      set "familyParentUserId" = null
      where "userId" = ${memberUserId}
    `);

    const lifecycle = getFamilyLifecycleState(member.dateOfBirth, null);

    return NextResponse.json({
      ok: true,
      memberUserId,
      lifecycle: {
        age: lifecycle.age,
        isFamilyLinked: lifecycle.isFamilyLinked,
        showFamilyIcon: lifecycle.showFamilyIcon,
        canConvertToNormal: lifecycle.canConvertToNormal,
        state: normalizeFamilyLinkStateLabel(lifecycle),
      },
    });
  } catch (error) {
    console.error("[SCHOOL_CENTER_MEMBERS_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
