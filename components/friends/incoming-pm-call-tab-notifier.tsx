"use client";

import { useEffect, useRef } from "react";

interface IncomingPmCallTabNotifierProps {
  incomingCallCount: number;
}

export const IncomingPmCallTabNotifier = ({ incomingCallCount }: IncomingPmCallTabNotifierProps) => {
  const baseTitleRef = useRef<string>("");

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    if (!baseTitleRef.current) {
      baseTitleRef.current = document.title || "In-Accord";
    }

    const baseTitle = baseTitleRef.current;

    if (incomingCallCount > 0) {
      const badge = incomingCallCount > 9 ? "9+" : String(incomingCallCount);
      const label = incomingCallCount === 1 ? "Incoming Call" : "Incoming Calls";
      document.title = `(${badge}) ${label} • ${baseTitle}`;
      return;
    }

    document.title = baseTitle;
  }, [incomingCallCount]);

  useEffect(() => {
    return () => {
      if (typeof document !== "undefined" && baseTitleRef.current) {
        document.title = baseTitleRef.current;
      }
    };
  }, []);

  return null;
};
