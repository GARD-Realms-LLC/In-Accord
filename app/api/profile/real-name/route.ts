import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, profile } from "@/lib/db";

export async function PATCH(req: Request) {
  try {
    const current = await currentProfile();

    if (!current) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { realName?: string };
    const realName = String(body.realName ?? "").trim();

    if (!realName) {
      return NextResponse.json({ error: "Real Name is required." }, { status: 400 });
    }

    if (realName.length > 80) {
      return NextResponse.json(
        { error: "Real Name must be 80 characters or fewer." },
        { status: 400 }
      );
    }

    await db
      .update(profile)
      .set({
        name: realName,
      })
      .where(eq(profile.id, current.id));

    return NextResponse.json({ ok: true, realName });
  } catch (error) {
    console.error("[PROFILE_REAL_NAME_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
