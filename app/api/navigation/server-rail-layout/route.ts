import { NextResponse } from "next/server";

import { currentProfile } from "@/lib/current-profile";
import {
  getServerRailFolders,
  normalizeServerRailFolders,
  upsertServerRailFolders,
} from "@/lib/server-rail-layout";

export async function GET() {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const folders = await getServerRailFolders();
    return NextResponse.json({ folders });
  } catch (error) {
    console.error("[SERVER_RAIL_LAYOUT_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const profile = await currentProfile();

    if (!profile) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      folders?: unknown;
    };

    const folders = normalizeServerRailFolders(body.folders);

    await upsertServerRailFolders(folders);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[SERVER_RAIL_LAYOUT_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
