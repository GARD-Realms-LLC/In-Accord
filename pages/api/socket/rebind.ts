import type { NextApiRequest, NextApiResponse } from "next";

import { ensureRealtimeEventBridgeStarted } from "@/lib/realtime-events-server";
import { getRealtimeServer, setRealtimeServer } from "@/lib/realtime-server";
import { registerSocketHandlers } from "@/lib/socket-io-runtime";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const io = getRealtimeServer();

  if (!io) {
    res.status(503).json({
      ok: false,
      rebound: false,
      reason: "socket-server-unavailable",
    });
    return;
  }

  setRealtimeServer(io);
  void ensureRealtimeEventBridgeStarted().catch((error) => {
    console.error("[SOCKET_IO_REBIND_BRIDGE]", error);
  });
  registerSocketHandlers(io);

  res.status(200).json({
    ok: true,
    rebound: true,
    at: Date.now(),
  });
}
