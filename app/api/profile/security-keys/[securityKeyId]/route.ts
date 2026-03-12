import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { deleteSecurityKeyForUser, listSecurityKeysForUser } from "@/lib/security-key";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ securityKeyId: string }> }
) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const securityKeyId = String(resolvedParams.securityKeyId ?? "").trim();

    const result = await deleteSecurityKeyForUser({
      userId: profile.id,
      securityKeyId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const keys = await listSecurityKeysForUser(profile.id);
    return NextResponse.json({ keys });
  } catch (error) {
    console.error("[PROFILE_SECURITY_KEYS_DELETE]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
