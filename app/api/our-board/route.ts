import { NextResponse } from "next/server";

import {
  getOurBoardEntryByManageToken,
  listPublicOurBoardEntries,
} from "@/lib/our-board-store";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const manageToken = String(searchParams.get("token") ?? "").trim();

    const entries = await listPublicOurBoardEntries();

    if (!manageToken) {
      return NextResponse.json({ entries, managed: null });
    }

    const managed = await getOurBoardEntryByManageToken(manageToken);
    return NextResponse.json({ entries, managed });
  } catch (error) {
    console.error("[OUR_BOARD_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    return new NextResponse("Owner-only management is available in Server Settings → In-Aboard.", { status: 403 });
  } catch (error) {
    console.error("[OUR_BOARD_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
