import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { resolveProfileIcons } from "@/lib/profile-icons";

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    return NextResponse.json({
      id: profile.id,
      name: profile.name,
      realName: profile.realName ?? null,
      profileName: profile.profileName ?? null,
      profileNameStyle: profile.profileNameStyle ?? null,
      nameplateLabel: profile.nameplateLabel ?? null,
      nameplateColor: profile.nameplateColor ?? null,
      nameplateImageUrl: (profile as { nameplateImageUrl?: string | null }).nameplateImageUrl ?? null,
      pronouns: profile.pronouns ?? null,
      comment: profile.comment ?? null,
      avatarDecorationUrl: profile.avatarDecorationUrl ?? null,
      phoneNumber: profile.phoneNumber ?? null,
      dateOfBirth: profile.dateOfBirth ?? null,
      bannerUrl: profile.bannerUrl ?? null,
      presenceStatus: profile.presenceStatus ?? "ONLINE",
      role: profile.role ?? null,
      profileIcons: resolveProfileIcons({
        userId: profile.id,
        role: profile.role,
        email: profile.email,
        createdAt: profile.createdAt,
        dateOfBirth: profile.dateOfBirth,
        familyParentUserId: profile.familyParentUserId,
      }),
      email: profile.email,
      imageUrl: profile.imageUrl,
    });
  } catch (error) {
    console.error("[PROFILE_ME_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
