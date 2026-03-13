import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import {
  beginSecurityKeyRegistration,
  finishSecurityKeyRegistration,
  listSecurityKeysForUser,
} from "@/lib/security-key";

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keys = await listSecurityKeysForUser(profile.id);
    return NextResponse.json({ keys });
  } catch (error) {
    console.error("[PROFILE_SECURITY_KEYS_GET]", error);
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
      action?: "begin" | "finish";
      origin?: string;
      credential?: {
        id?: string;
        response?: {
          clientDataJSON?: string;
          transports?: string[];
        };
      };
    };

    const action = String(body.action ?? "").trim().toLowerCase();

    if (action === "begin") {
      const origin = String(body.origin ?? "").trim();
      const setup = await beginSecurityKeyRegistration({
        userId: profile.id,
        origin,
        userName: profile.email ?? profile.name ?? profile.id,
        userDisplayName: profile.name ?? profile.email ?? profile.id,
      });

      return NextResponse.json(setup);
    }

    if (action === "finish") {
      const rawTransports = body.credential?.response?.transports;
      const transports: string[] = Array.isArray(rawTransports)
        ? rawTransports.map((transport) => String(transport))
        : [];

      const result = await finishSecurityKeyRegistration({
        userId: profile.id,
        credentialId: String(body.credential?.id ?? ""),
        clientDataJSON: String(body.credential?.response?.clientDataJSON ?? ""),
        transports,
      });

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      const keys = await listSecurityKeysForUser(profile.id);
      return NextResponse.json({ keys });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    console.error("[PROFILE_SECURITY_KEYS_POST]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
