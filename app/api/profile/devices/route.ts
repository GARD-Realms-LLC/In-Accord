import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import {
  clearSessionUserId,
  getCurrentSessionId,
  listActiveSessionsForUser,
  revokeOtherSessionsForUser,
  revokeSessionById,
} from "@/lib/session";

const inferDeviceName = (userAgent: string | null) => {
  const ua = String(userAgent ?? "").toLowerCase();
  if (!ua) {
    return "Unknown device";
  }

  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) {
    return "Apple mobile";
  }

  if (ua.includes("android")) {
    return "Android device";
  }

  if (ua.includes("windows")) {
    return "Windows device";
  }

  if (ua.includes("mac os") || ua.includes("macintosh")) {
    return "Mac device";
  }

  if (ua.includes("linux")) {
    return "Linux device";
  }

  return "Web device";
};

const buildPayload = async (userId: string) => {
  const currentSessionId = await getCurrentSessionId();
  const sessions = await listActiveSessionsForUser(userId);

  return {
    currentSessionId,
    sessions: sessions.map((session) => ({
      ...session,
      deviceName: inferDeviceName(session.userAgent),
      isCurrent: Boolean(currentSessionId && currentSessionId === session.sessionId),
    })),
  };
};

export async function GET() {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    return NextResponse.json(await buildPayload(profile.id));
  } catch (error) {
    console.error("[PROFILE_DEVICES_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      sessionId?: unknown;
    };

    const action = String(body.action ?? "").trim().toLowerCase();
    const sessionId = String(body.sessionId ?? "").trim();
    const currentSessionId = await getCurrentSessionId();

    if (action === "logout-others") {
      await revokeOtherSessionsForUser(profile.id, currentSessionId);
      return NextResponse.json({ ok: true, ...(await buildPayload(profile.id)) });
    }

    if (action === "revoke") {
      if (!sessionId) {
        return new NextResponse("sessionId is required", { status: 400 });
      }

      if (currentSessionId && sessionId === currentSessionId) {
        await clearSessionUserId();
        return NextResponse.json({ ok: true, loggedOut: true });
      }

      await revokeSessionById(profile.id, sessionId);
      return NextResponse.json({ ok: true, ...(await buildPayload(profile.id)) });
    }

    return new NextResponse("Invalid action", { status: 400 });
  } catch (error) {
    console.error("[PROFILE_DEVICES_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
