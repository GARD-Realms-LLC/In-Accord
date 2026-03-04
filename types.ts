import { Server as NetServer, Socket } from "net";
import { NextApiResponse } from "next";
import { Server as SocketIOServer } from "socket.io";
import { type Member, type Profile, type Server } from "@/lib/db/types";

export type ServerWithMembersWithProfiles = Server & {
  members: (Member & { profile: Profile })[];
};

export type NextApiResponseServerIO = NextApiResponse & {
  socket: Socket & {
    server: NetServer & {
      io: SocketIOServer;
    };
  };
};
