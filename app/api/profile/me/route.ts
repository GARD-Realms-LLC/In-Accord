import { NextResponse } from "next/server";

import { appendBannerDebugEvent } from "@/lib/banner-debug";
import { resolveBannerUrl } from "@/lib/asset-url";
import { currentProfile } from "@/lib/current-profile";
import { hasSucceededPatronage } from "@/lib/patronage";
import { resolveProfileIcons } from "@/lib/profile-icons";

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const isPatron = await hasSucceededPatronage(profile.id);
    const resolvedBannerUrl = resolveBannerUrl(profile.bannerUrl);

    void appendBannerDebugEvent({
      source: "api/profile/me",
      stage: "response",
      rawValue: profile.bannerUrl,
      resolvedValue: resolvedBannerUrl,
      metadata: {
        profileId: profile.id,
      },
    });

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
      profileEffectUrl: (profile as { profileEffectUrl?: string | null }).profileEffectUrl ?? null,
      phoneNumber: profile.phoneNumber ?? null,
      dateOfBirth: profile.dateOfBirth ?? null,
      bannerUrl: resolvedBannerUrl,
      presenceStatus: profile.presenceStatus ?? "ONLINE",
      currentGame: profile.currentGame ?? null,
      role: profile.role ?? null,
      profileIcons: resolveProfileIcons({
        userId: profile.id,
        role: profile.role,
        email: profile.email,
        createdAt: profile.createdAt,
        dateOfBirth: profile.dateOfBirth,
        familyParentUserId: profile.familyParentUserId,
        isPatron,
      }),
      email: profile.email,
      imageUrl: profile.imageUrl,
    });
  } catch (error) {
    console.error("[PROFILE_ME_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
