import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";

export async function PATCH(req: Request) {
  try {
    const current = await currentProfile();

    if (!current) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { phoneNumber?: string | null };
    const phoneNumberInput = typeof body.phoneNumber === "string" ? body.phoneNumber.trim() : "";

    if (phoneNumberInput.length > 32) {
      return NextResponse.json(
        { error: "Phone Number must be 32 characters or fewer." },
        { status: 400 }
      );
    }

    const normalizedPhoneNumber = phoneNumberInput.length > 0 ? phoneNumberInput : null;

    await db.execute(sql`
      alter table "Users"
      add column if not exists "phone" varchar(32)
    `);

    await db.execute(sql`
      update "Users"
      set "phone" = ${normalizedPhoneNumber}
      where "userId" = ${current.id}
    `);

    return NextResponse.json({ ok: true, phoneNumber: normalizedPhoneNumber });
  } catch (error) {
    console.error("[PROFILE_PHONE_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
