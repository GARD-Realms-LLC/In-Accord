import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { isInAccordAdministrator } from "@/lib/in-accord-admin";

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

export async function PATCH(req: Request) {
  try {
    const current = await currentProfile();

    if (!current) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { dateOfBirth?: string | null };
    const normalizedDateOfBirth = normalizeDateOfBirthInput(
      typeof body.dateOfBirth === "string" ? body.dateOfBirth : ""
    );

    if (normalizedDateOfBirth === "INVALID") {
      return NextResponse.json(
        { error: "Date Of Birth must be a valid date in YYYY-MM-DD format." },
        { status: 400 }
      );
    }

    const hasExistingDateOfBirth = Boolean(current.dateOfBirth);
    const canOverrideExistingDateOfBirth = isInAccordAdministrator(current.role);

    if (hasExistingDateOfBirth && !canOverrideExistingDateOfBirth) {
      return NextResponse.json(
        { error: "Date Of Birth is locked after first save. Only an Administrator can edit it." },
        { status: 403 }
      );
    }

    await db.execute(sql`
      alter table "Users"
      add column if not exists "dob" date
    `);

    await db.execute(sql`
      update "Users"
      set "dob" = ${normalizedDateOfBirth}
      where "userId" = ${current.id}
    `);

    return NextResponse.json({ ok: true, dateOfBirth: normalizedDateOfBirth });
  } catch (error) {
    console.error("[PROFILE_DOB_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
