import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { normalizeOptionalCloudflareObjectPointer } from "@/lib/live-db-asset-pointers";
import { ensureUserProfileSchema } from "@/lib/user-profile";

export async function PATCH(req: Request) {
  try {
    const current = await currentProfile();

    if (!current) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { profileEffectUrl?: string | null };
    const normalizedProfileEffectUrl = normalizeOptionalCloudflareObjectPointer(body.profileEffectUrl);

    if (body.profileEffectUrl !== null && body.profileEffectUrl !== undefined && normalizedProfileEffectUrl === null) {
      return NextResponse.json({ error: "profileEffectUrl must be a Cloudflare object pointer" }, { status: 400 });
    }

    const fallbackProfileName = (current.profileName ?? current.realName ?? current.email ?? "User")
      .trim()
      .slice(0, 80) || "User";

    await ensureUserProfileSchema();

    const now = new Date();
    await db.execute(sql`
      insert into "UserProfile" (
        "userId",
        "profileName",
        "profileEffectUrl",
        "createdAt",
        "updatedAt"
      )
      values (
        ${current.id},
        ${fallbackProfileName},
        ${normalizedProfileEffectUrl},
        ${now},
        ${now}
      )
      on conflict ("userId") do update
      set "profileEffectUrl" = excluded."profileEffectUrl",
          "updatedAt" = excluded."updatedAt"
    `);

    return NextResponse.json({ ok: true, profileEffectUrl: normalizedProfileEffectUrl });
  } catch (error) {
    console.error("[PROFILE_EFFECT_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
