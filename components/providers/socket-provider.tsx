"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io as ClientIO } from "socket.io-client";

type ConnectionQuality = "connected" | "slow" | "disconnected";

type SocketContextType = {
  socket: any | null;
  isConnected: boolean;
  connectionQuality: ConnectionQuality;
  statusMessage: string;
  targetUrl: string;
};

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  connectionQuality: "disconnected",
  statusMessage: "Realtime disconnected — reconnecting...",
  targetUrl: "/api/socket/io",
});

const normalizeHttpOrigin = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }

    return parsed.origin.replace(/\/$/, "");
  } catch {
    return "";
  }
};

const getWindowHttpOrigin = () => {
  if (typeof window === "undefined") {
    return "";
  }

  return normalizeHttpOrigin(window.location.href);
};

export const useSocket = () => {
  return useContext(SocketContext);
};

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSlowNetwork, setIsSlowNetwork] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState<string>("/api/socket/io");
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketRef = useRef<any | null>(null);

  useEffect(() => {
    let isDisposed = false;

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

    const connectSocket = async () => {
      const resolvedOrigin =
        getWindowHttpOrigin() ||
        normalizeHttpOrigin(process.env.NEXT_PUBLIC_SITE_URL);

      const resolvedTargetUrl = resolvedOrigin ? `${resolvedOrigin}/api/socket/io` : "/api/socket/io";

      if (isDisposed) {
        return;
      }

      setTargetUrl(resolvedTargetUrl);

      try {
        await fetch(resolvedTargetUrl, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
      } catch (bootstrapError) {
        console.error("[SOCKET_PROVIDER_BOOTSTRAP]", bootstrapError);
      }

      const socketInstance = new (ClientIO as any)(resolvedOrigin || undefined, {
        path: "/api/socket/io",
        addTrailingSlash: false,
        transports: ["polling", "websocket"],
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      socketInstance.on("connect", () => {
        clearDisconnectTimer();
        setIsConnected(true);
        setLastError(null);
      });

      socketInstance.on("disconnect", () => {
        markDisconnectedWithDelay();
      });

      socketInstance.on("connect_error", (error: { message?: string } | undefined) => {
        const message = String(error?.message ?? "").trim();
        setLastError(message || "Socket connection failed");
        markDisconnectedWithDelay();
      });

      if (isDisposed) {
        socketInstance.disconnect();
        return;
      }

      socketRef.current = socketInstance;
      setSocket(socketInstance);
    };

    void connectSocket();

    return () => {
      isDisposed = true;
      clearDisconnectTimer();
      networkInfo?.removeEventListener?.("change", updateNetworkQuality);
      socketRef.current?.disconnect?.();
      socketRef.current = null;
    };
  }, []);

  const connectionQuality: ConnectionQuality = !isConnected
    ? "disconnected"
    : isSlowNetwork
      ? "slow"
      : "connected";

  const statusMessage =
    connectionQuality === "connected"
      ? isSlowNetwork
        ? "Realtime connected — network looks slow."
        : "Realtime connected."
      : `Realtime disconnected — could not reach ${targetUrl}${lastError ? ` (${lastError})` : ""}`;

  return (
    <SocketContext.Provider value={{ socket, isConnected, connectionQuality, statusMessage, targetUrl }}>
      {children}
    </SocketContext.Provider>
  );
};
