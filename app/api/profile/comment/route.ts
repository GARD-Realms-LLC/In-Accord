import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { ensureUserProfileSchema } from "@/lib/user-profile";

export async function PATCH(req: Request) {
  try {
    const current = await currentProfile();

    if (!current) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { comment?: string | null };
    const commentInput = typeof body.comment === "string" ? body.comment.trim() : "";

    if (commentInput.length > 280) {
      return NextResponse.json(
        { error: "Comment must be 280 characters or fewer." },
        { status: 400 }
      );
    }

    await ensureUserProfileSchema();

    const now = new Date();
    const normalizedComment = commentInput.length > 0 ? commentInput : null;
    const fallbackProfileName =
      (current.profileName ?? current.realName ?? current.email ?? "User").trim().slice(0, 80) || "User";

    await db.execute(sql`
      insert into "UserProfile" ("userId", "profileName", "comment", "createdAt", "updatedAt")
      values (${current.id}, ${fallbackProfileName}, ${normalizedComment}, ${now}, ${now})
      on conflict ("userId") do update
      set "comment" = excluded."comment",
          "updatedAt" = excluded."updatedAt"
    `);

    return NextResponse.json({ ok: true, comment: normalizedComment });
  } catch (error) {
    console.error("[PROFILE_COMMENT_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
