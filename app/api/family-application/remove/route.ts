import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { currentProfile } from "@/lib/current-profile";
import { db } from "@/lib/db";
import { isInAccordParent } from "@/lib/in-accord-admin";
import { getUserPreferences, updateUserPreferences } from "@/lib/user-preferences";

export async function PATCH() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const preferences = await getUserPreferences(profile.id);
    const status = String(preferences.familyCenter.familyApplicationStatus ?? "").trim();
    const isApproved = /approved|aproved/i.test(status);

    if (!isApproved) {
      return NextResponse.json(
        { error: "Family account is not approved, so there is nothing to remove." },
        { status: 400 }
      );
    }

    let nextRole = profile.role ?? "USER";

    if (isInAccordParent(profile.role)) {
      nextRole = "USER";
      await db.execute(sql`
        update "Users"
        set "role" = ${nextRole}
        where "userId" = ${profile.userId}
      `);
    }

    const nextFamilyCenter = {
      ...preferences.familyCenter,
      familyDesignation: "",
      familyApplicationStatus: "",
      familyApplicationSubmittedAt: "",
      familyApplicationFiles: [],
      familyMembers: [],
    };

    const updatedPreferences = await updateUserPreferences(profile.id, {
      familyCenter: nextFamilyCenter,
    });

    return NextResponse.json({
      ok: true,
      role: nextRole,
      familyCenter: updatedPreferences.familyCenter,
    });
  } catch (error) {
    console.error("[FAMILY_APPLICATION_REMOVE_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
