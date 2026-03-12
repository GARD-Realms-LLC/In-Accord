import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import { beginSmsAuthSetup, disableSmsAuth, getSmsAuthStatus, verifySmsAuthSetup } from "@/lib/sms-auth";

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = await getSmsAuthStatus(profile.id);
    return NextResponse.json(status);
  } catch (error) {
    console.error("[PROFILE_SMS_AUTH_GET]", error);
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
      phoneNumber?: string;
      code?: string;
    };

    const action = String(body.action ?? "").trim().toLowerCase();

    if (action === "begin") {
      const result = await beginSmsAuthSetup({
        userId: profile.id,
        phoneNumber: String(body.phoneNumber ?? ""),
      });

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      const status = await getSmsAuthStatus(profile.id);
      return NextResponse.json(status);
    }

    if (action === "verify") {
      const result = await verifySmsAuthSetup({
        userId: profile.id,
        code: String(body.code ?? ""),
      });

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      const status = await getSmsAuthStatus(profile.id);
      return NextResponse.json(status);
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Error";
    console.error("[PROFILE_SMS_AUTH_POST]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await disableSmsAuth(profile.id);
    const status = await getSmsAuthStatus(profile.id);
    return NextResponse.json(status);
  } catch (error) {
    console.error("[PROFILE_SMS_AUTH_DELETE]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
