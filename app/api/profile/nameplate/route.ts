import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { normalizeOptionalCloudflareObjectPointer } from "@/lib/live-db-asset-pointers";
import { ensureUserProfileSchema } from "@/lib/user-profile";

const isValidHexColor = (value: string) => /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);

export async function PATCH(req: Request) {
  try {
    const current = await currentProfile();

    if (!current) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      nameplateLabel?: string | null;
      nameplateColor?: string | null;
      nameplateImageUrl?: string | null;
    };

    const normalizedLabel =
      typeof body.nameplateLabel === "string" && body.nameplateLabel.trim().length > 0
        ? body.nameplateLabel.trim()
        : null;

    if (normalizedLabel && normalizedLabel.length > 40) {
      return NextResponse.json(
        { error: "Nameplate label must be 40 characters or fewer." },
        { status: 400 }
      );
    }

    const rawColor = typeof body.nameplateColor === "string" ? body.nameplateColor.trim() : "";
    const rawImageUrl = typeof body.nameplateImageUrl === "string" ? body.nameplateImageUrl.trim() : "";

    if (rawColor.length > 0 && !isValidHexColor(rawColor)) {
      return NextResponse.json({ error: "Nameplate color must be a valid hex color." }, { status: 400 });
    }

    if (rawImageUrl.length > 2048) {
      return NextResponse.json({ error: "Nameplate image URL is too long." }, { status: 400 });
    }

    const normalizedColor = normalizedLabel ? (rawColor || "#5865f2") : null;
    const normalizedImageUrl = rawImageUrl ? normalizeOptionalCloudflareObjectPointer(rawImageUrl) : null;

    if (rawImageUrl.length > 0 && normalizedImageUrl === null) {
      return NextResponse.json({ error: "Nameplate image URL must be a Cloudflare object pointer." }, { status: 400 });
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
        "nameplateLabel",
        "nameplateColor",
        "nameplateImageUrl",
        "createdAt",
        "updatedAt"
      )
      values (
        ${current.id},
        ${fallbackProfileName},
        ${normalizedLabel},
        ${normalizedColor},
        ${normalizedImageUrl},
        ${now},
        ${now}
      )
      on conflict ("userId") do update
      set "nameplateLabel" = excluded."nameplateLabel",
          "nameplateColor" = excluded."nameplateColor",
          "nameplateImageUrl" = excluded."nameplateImageUrl",
          "updatedAt" = excluded."updatedAt"
    `);

    return NextResponse.json({
      ok: true,
      nameplateLabel: normalizedLabel,
      nameplateColor: normalizedColor,
      nameplateImageUrl: normalizedImageUrl,
    });
  } catch (error) {
    console.error("[PROFILE_NAMEPLATE_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
