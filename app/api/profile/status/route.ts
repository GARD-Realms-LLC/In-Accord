import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { normalizePresenceStatus } from "@/lib/presence-status";
import { ensureUserProfileSchema } from "@/lib/user-profile";

const normalizeCurrentGame = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 120);
};

export async function PATCH(req: Request) {
  try {
    const current = await currentProfile();

    if (!current) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { status?: string; currentGame?: string | null };
    const hasStatus = typeof body.status === "string";
    const status = hasStatus ? normalizePresenceStatus(body.status) : normalizePresenceStatus(current.presenceStatus);
    const currentGame = normalizeCurrentGame(body.currentGame);

    await ensureUserProfileSchema();

    const now = new Date();
    await db.execute(sql`
      insert into "UserProfile" ("userId", "profileName", "presenceStatus", "currentGame", "createdAt", "updatedAt")
      values (
        ${current.id},
        ${(current.profileName ?? current.realName ?? current.email ?? "User").trim().slice(0, 80) || "User"},
        ${status},
        ${currentGame},
        ${now},
        ${now}
      )
      on conflict ("userId") do update
      set "presenceStatus" = excluded."presenceStatus",
          "currentGame" = excluded."currentGame",
          "updatedAt" = excluded."updatedAt"
    `);

    return NextResponse.json({ ok: true, status, currentGame });
  } catch (error) {
    console.error("[PROFILE_STATUS_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
