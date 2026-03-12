import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import {
  beginAuthenticatorAppSetup,
  disableAuthenticatorApp,
  getAuthenticatorAppStatus,
  verifyAuthenticatorAppSetup,
} from "@/lib/authenticator-app";

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = await getAuthenticatorAppStatus(profile.id);
    return NextResponse.json(status);
  } catch (error) {
    console.error("[PROFILE_AUTHENTICATOR_APP_GET]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: "begin" | "verify";
      code?: string;
    };

    const action = String(body.action ?? "").trim().toLowerCase();

    if (action === "begin") {
      const setup = await beginAuthenticatorAppSetup(profile.id, profile.email || profile.name || profile.id);
      return NextResponse.json(setup);
    }

    if (action === "verify") {
      const result = await verifyAuthenticatorAppSetup(profile.id, String(body.code ?? ""));
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      const status = await getAuthenticatorAppStatus(profile.id);
      return NextResponse.json(status);
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    console.error("[PROFILE_AUTHENTICATOR_APP_POST]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      code?: string;
    };

    const result = await disableAuthenticatorApp(profile.id, String(body.code ?? ""));
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const status = await getAuthenticatorAppStatus(profile.id);
    return NextResponse.json(status);
  } catch (error) {
    console.error("[PROFILE_AUTHENTICATOR_APP_DELETE]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
