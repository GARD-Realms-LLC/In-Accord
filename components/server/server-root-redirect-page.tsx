"use client";

import { useEffect } from "react";

interface ServerRootRedirectPageProps {
  targetPath: string;
}

export function ServerRootRedirectPage({ targetPath }: ServerRootRedirectPageProps) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.location.replace(targetPath);
  }, [targetPath]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-6 py-16 text-center text-sm text-zinc-400">
      Redirecting…
    </div>
  );
}