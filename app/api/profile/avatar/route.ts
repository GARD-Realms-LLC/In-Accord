import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db, profile } from "@/lib/db";

export async function PATCH(req: Request) {
  try {
    const current = await currentProfile();

    if (!current) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { imageUrl } = await req.json();

    if (typeof imageUrl !== "string" || !imageUrl.trim()) {
      return new NextResponse("imageUrl is required", { status: 400 });
    }

    await db
      .update(profile)
      .set({ imageUrl })
      .where(eq(profile.id, current.id));

    return NextResponse.json({ ok: true, imageUrl });
  } catch (error) {
    console.error("[PROFILE_AVATAR_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
