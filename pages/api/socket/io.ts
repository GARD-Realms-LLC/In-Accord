import { Server as NetServer } from "http";
import { NextApiRequest } from "next";

const { Server: ServerIO } = require("socket.io");

import { ensureRealtimeEventBridgeStarted } from "@/lib/realtime-events-server";
import { setRealtimeServer } from "@/lib/realtime-server";
import { registerSocketHandlers } from "@/lib/socket-io-runtime";
import { NextApiResponseServerIO } from "@/types";

export const config = {
  api: {
    bodyParser: false,
  },
};

const ioHandler = (req: NextApiRequest, res: NextApiResponseServerIO) => {
  if (!res.socket.server.io) {
    const path = "/api/socket/io";
    const httpServer: NetServer = res.socket.server as any;
    const io = new ServerIO(httpServer, {
      path: path,
      // @ts-ignore
      addTrailingSlash: false,
      cors: {
        origin: true,
        credentials: true,
      },
    });
    setRealtimeServer(io);
    void ensureRealtimeEventBridgeStarted().catch((error) => {
      console.error("[SOCKET_IO_REALTIME_BRIDGE]", error);
    });
    registerSocketHandlers(io);
    res.socket.server.io = io;
  } else {
    setRealtimeServer(res.socket.server.io);
    void ensureRealtimeEventBridgeStarted().catch((error) => {
      console.error("[SOCKET_IO_REALTIME_BRIDGE]", error);
    });
    registerSocketHandlers(res.socket.server.io);
  }

  res.end();
};

export default ioHandler;
