import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { hasInAccordAdministrativeAccess } from "@/lib/in-accord-admin";
import {
  ensureInAccordRoleSchema,
  formatRoleLabel,
  getInAccordRoles,
  isSystemRoleKey,
  normalizeRoleKey,
} from "@/lib/in-accord-roles";
import { ADMINISTRATOR_ROLE_KEY } from "@/lib/account-security-constants";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RoleCountRow = {
  roleKey: string;
  memberCount: number | string;
};

const roleLabelFromInput = (value: unknown, fallbackRoleKey: string) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return formatRoleLabel(fallbackRoleKey);
  }

  return trimmed.slice(0, 80);
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

    const roles = await getInAccordRoles();

    const countsResult = await db.execute(sql`
      select
        upper(trim(coalesce(u."role", 'USER'))) as "roleKey",
        count(*)::int as "memberCount"
      from "Users" u
      group by upper(trim(coalesce(u."role", 'USER')))
    `);

    const countsRows = (countsResult as unknown as { rows?: RoleCountRow[] }).rows ?? [];
    const counts = new Map<string, number>();
    for (const row of countsRows) {
      const normalizedKey = normalizeRoleKey(row.roleKey);
      if (!normalizedKey) {
        continue;
      }

      counts.set(normalizedKey, Number(row.memberCount ?? 0));
    }

    return NextResponse.json({
      roles: roles.map((role) => ({
        ...role,
        memberCount: counts.get(role.roleKey) ?? 0,
      })),
    });
  } catch (error) {
    console.error("[ADMIN_ROLES_GET]", error);
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
      roleKey?: string;
      roleLabel?: string;
    } | null;

    const roleKey = normalizeRoleKey(body?.roleKey);

    if (!roleKey) {
      return new NextResponse("Invalid role key. Use A-Z, 0-9, underscore, 2-64 chars.", { status: 400 });
    }

    if (isSystemRoleKey(roleKey)) {
      return new NextResponse("System roles already exist and cannot be added.", { status: 400 });
    }

    const roleLabel = roleLabelFromInput(body?.roleLabel, roleKey);

    await ensureInAccordRoleSchema();

    const existsResult = await db.execute(sql`
      select "roleKey"
      from "InAccordRole"
      where "roleKey" = ${roleKey}
      limit 1
    `);
    const existsRow = (existsResult as unknown as { rows?: Array<{ roleKey: string }> }).rows?.[0];
    if (existsRow) {
      return new NextResponse("Role already exists.", { status: 409 });
    }

    await db.execute(sql`
      insert into "InAccordRole" ("roleKey", "roleLabel", "isSystem")
      values (${roleKey}, ${roleLabel}, false)
    `);

    return NextResponse.json({ ok: true, role: { roleKey, roleLabel, isSystem: false } });
  } catch (error) {
    console.error("[ADMIN_ROLES_POST]", error);
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
      roleKey?: string;
      roleLabel?: string;
    } | null;

    const roleKey = normalizeRoleKey(body?.roleKey);

    if (!roleKey) {
      return new NextResponse("roleKey is required.", { status: 400 });
    }

    const roleLabel = roleLabelFromInput(body?.roleLabel, roleKey);

    await ensureInAccordRoleSchema();

    await db.execute(sql`
      update "InAccordRole"
      set "roleLabel" = ${roleLabel},
          "updatedAt" = now()
      where "roleKey" = ${roleKey}
    `);

    return NextResponse.json({ ok: true, role: { roleKey, roleLabel } });
  } catch (error) {
    console.error("[ADMIN_ROLES_PATCH]", error);
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
    const roleKey = normalizeRoleKey(searchParams.get("roleKey"));

    if (!roleKey) {
      return new NextResponse("roleKey is required.", { status: 400 });
    }

    if (roleKey === ADMINISTRATOR_ROLE_KEY) {
      return new NextResponse("Administrator role cannot be removed.", { status: 403 });
    }

    if (isSystemRoleKey(roleKey)) {
      return new NextResponse("System roles cannot be deleted.", { status: 400 });
    }

    await ensureInAccordRoleSchema();

    const usageResult = await db.execute(sql`
      select count(*)::int as count
      from "Users"
      where upper(trim(coalesce("role", 'USER'))) = ${roleKey}
    `);
    const usageCount = Number(
      (usageResult as unknown as { rows?: Array<{ count: number | string }> }).rows?.[0]?.count ?? 0
    );

    if (usageCount > 0) {
      return new NextResponse("Role is currently assigned to users. Reassign members first.", { status: 409 });
    }

    await db.execute(sql`
      delete from "InAccordRole"
      where "roleKey" = ${roleKey}
    `);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ADMIN_ROLES_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
