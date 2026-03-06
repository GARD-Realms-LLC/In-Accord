"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[APP_ERROR_BOUNDARY]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#313338] p-6 text-white">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#1e1f22] p-6 shadow-xl">
        <h2 className="text-lg font-bold">Something went wrong</h2>
        <p className="mt-2 text-sm text-zinc-300">
          We hit an unexpected error. Try again, and if it keeps happening, refresh the page.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md bg-[#5865f2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#4752c4]"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/5"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
