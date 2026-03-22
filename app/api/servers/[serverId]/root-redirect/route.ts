import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { resolveServerRootRedirectPath } from "@/lib/server-root-redirect";

export async function GET(
  request: Request,
  context: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await context.params;
  const profile = await currentProfile();

  if (!profile) {
    return NextResponse.redirect(new URL("/sign-in", request.url), 307);
  }

  const redirectPath = await resolveServerRootRedirectPath({
    profileId: profile.id,
    profileRole: profile.role,
    serverParam: serverId,
  });

  if (!redirectPath) {
    return NextResponse.redirect(new URL("/servers", request.url), 307);
  }

  return NextResponse.redirect(new URL(redirectPath, request.url), 307);
}