"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io as ClientIO } from "socket.io-client";

type ConnectionQuality = "connected" | "slow" | "disconnected";

type SocketContextType = {
  socket: any | null;
  isConnected: boolean;
  connectionQuality: ConnectionQuality;
};

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  connectionQuality: "disconnected",
});

export const useSocket = () => {
  return useContext(SocketContext);
};

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSlowNetwork, setIsSlowNetwork] = useState(false);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearDisconnectTimer = () => {
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
    };

    const markDisconnectedWithDelay = () => {
      clearDisconnectTimer();
      disconnectTimerRef.current = setTimeout(() => {
        setIsConnected(false);
      }, 3000);
    };

    const socketInstance = new (ClientIO as any)(
      process.env.NEXT_PUBLIC_SITE_URL!,
      {
        path: "/api/socket/io",
        addTrailingSlash: false,
      }
    );

    socketInstance.on("connect", () => {
      clearDisconnectTimer();
      setIsConnected(true);
    });

    socketInstance.on("disconnect", () => {
      markDisconnectedWithDelay();
    });

    socketInstance.on("connect_error", () => {
      markDisconnectedWithDelay();
    });

    setSocket(socketInstance);

    const networkInfo =
      typeof navigator !== "undefined"
        ? ((navigator as any).connection ??
          (navigator as any).mozConnection ??
          (navigator as any).webkitConnection)
        : null;

    const updateNetworkQuality = () => {
      if (!networkInfo) {
        setIsSlowNetwork(false);
        return;
      }

      const effectiveType = String(networkInfo.effectiveType ?? "");
      const downlink = Number(networkInfo.downlink ?? 0);
      const rtt = Number(networkInfo.rtt ?? 0);
      const saveData = Boolean(networkInfo.saveData);

      const slowByType = effectiveType.includes("2g") || effectiveType.includes("3g");
      const slowByLatency = Number.isFinite(rtt) && rtt > 300;
      const slowByBandwidth = Number.isFinite(downlink) && downlink > 0 && downlink < 1.5;

      setIsSlowNetwork(saveData || slowByType || slowByLatency || slowByBandwidth);
    };

    updateNetworkQuality();
    networkInfo?.addEventListener?.("change", updateNetworkQuality);

    return () => {
      clearDisconnectTimer();
      networkInfo?.removeEventListener?.("change", updateNetworkQuality);
      socketInstance.disconnect();
    };
  }, []);

  const connectionQuality: ConnectionQuality = !isConnected
    ? "disconnected"
    : isSlowNetwork
      ? "slow"
      : "connected";

  return (
    <SocketContext.Provider value={{ socket, isConnected, connectionQuality }}>
      {children}
    </SocketContext.Provider>
  );
};
