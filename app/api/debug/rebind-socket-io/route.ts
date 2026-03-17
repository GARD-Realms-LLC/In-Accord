import { NextResponse } from "next/server";

import { ensureRealtimeEventBridgeStarted } from "@/lib/realtime-events-server";
import { getRealtimeServer, setRealtimeServer } from "@/lib/realtime-server";
import { registerSocketHandlers } from "@/lib/socket-io-runtime";

export async function POST() {
  const io = getRealtimeServer();

  if (!io) {
    return NextResponse.json(
      {
        ok: false,
        rebound: false,
        reason: "socket-server-unavailable",
      },
      { status: 503 }
    );
  }

  setRealtimeServer(io);
  void ensureRealtimeEventBridgeStarted().catch((error) => {
    console.error("[SOCKET_IO_REBIND_BRIDGE]", error);
  });
  registerSocketHandlers(io);

  return NextResponse.json({
    ok: true,
    rebound: true,
    at: Date.now(),
  });
}
