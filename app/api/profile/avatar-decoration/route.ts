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

    const body = (await req.json().catch(() => ({}))) as { avatarDecorationUrl?: string | null };
    const normalizedAvatarDecorationUrl = normalizeOptionalCloudflareObjectPointer(body.avatarDecorationUrl);

    if (
      body.avatarDecorationUrl !== null &&
      body.avatarDecorationUrl !== undefined &&
      normalizedAvatarDecorationUrl === null
    ) {
      return NextResponse.json({ error: "avatarDecorationUrl must be a Cloudflare object pointer" }, { status: 400 });
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
        "avatarDecorationUrl",
        "createdAt",
        "updatedAt"
      )
      values (
        ${current.id},
        ${fallbackProfileName},
        ${normalizedAvatarDecorationUrl},
        ${now},
        ${now}
      )
      on conflict ("userId") do update
      set "avatarDecorationUrl" = excluded."avatarDecorationUrl",
          "updatedAt" = excluded."updatedAt"
    `);

    return NextResponse.json({ ok: true, avatarDecorationUrl: normalizedAvatarDecorationUrl });
  } catch (error) {
    console.error("[PROFILE_AVATAR_DECORATION_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
