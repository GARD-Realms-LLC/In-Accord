import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import {
  getUserTransparentBackgroundSettings,
  setUserTransparentBackgroundSettings,
} from "@/lib/user-transparent-background-store";

export async function GET() {
  try {
    const current = await currentProfile();

    if (!current) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await getUserTransparentBackgroundSettings(current.id);
    return NextResponse.json(settings);
  } catch (error) {
    console.error("[PROFILE_TRANSPARENT_BACKGROUND_GET]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const current = await currentProfile();

    if (!current) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      selectedBackground?: string | null;
      uploadedBackgrounds?: unknown;
    };

    const selectedBackground =
      typeof body.selectedBackground === "string"
        ? body.selectedBackground.trim() || null
        : null;

    const uploadedBackgrounds = Array.isArray(body.uploadedBackgrounds)
      ? body.uploadedBackgrounds
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      : [];

    const settings = await setUserTransparentBackgroundSettings(current.id, {
      selectedBackground,
      uploadedBackgrounds,
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("[PROFILE_TRANSPARENT_BACKGROUND_PATCH]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
