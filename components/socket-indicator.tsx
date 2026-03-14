"use client";

import { useSocket } from "@/components/providers/socket-provider";
import { Badge } from "@/components/ui/badge";

export const SocketIndicator = () => {
  const { isConnected, statusMessage } = useSocket();
  
  if (!isConnected) {
    return (
      <Badge variant="outline" className="max-w-full border-none bg-yellow-600 text-white">
        <span className="truncate">{statusMessage}</span>
      </Badge>
    );
  }

  return null;
};
