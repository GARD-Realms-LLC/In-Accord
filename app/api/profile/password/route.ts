import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, localCredential } from "@/lib/db";
import { ensureLocalAuthSchema } from "@/lib/local-auth";
import { hashPassword, verifyPassword } from "@/lib/password";

export async function PATCH(req: Request) {
  try {
    const current = await currentProfile();

    if (!current) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureLocalAuthSchema();

    const body = (await req.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };

    const currentPassword = String(body.currentPassword ?? "").trim();
    const newPassword = String(body.newPassword ?? "").trim();

    if (!currentPassword) {
      return NextResponse.json({ error: "Current password is required." }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters." },
        { status: 400 }
      );
    }

    if (newPassword === currentPassword) {
      return NextResponse.json(
        { error: "New password must be different from current password." },
        { status: 400 }
      );
    }

    const credential = await db.query.localCredential.findFirst({
      where: eq(localCredential.userId, current.id),
    });

    if (!credential) {
      return NextResponse.json(
        { error: "Local password login is not configured for this account." },
        { status: 404 }
      );
    }

    const validCurrentPassword = await verifyPassword(
      currentPassword,
      credential.passwordHash
    );

    if (!validCurrentPassword) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    const passwordHash = await hashPassword(newPassword);

    await db
      .update(localCredential)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(localCredential.userId, current.id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PROFILE_PASSWORD_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
