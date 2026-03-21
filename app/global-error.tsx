"use client";

import { useEffect, useState } from "react";

import {
  hardReloadForStaleBuild,
  isStaleBuildErrorMessage,
} from "@/lib/stale-build-reload";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const isStaleBuildError = isStaleBuildErrorMessage(error?.message);

  useEffect(() => {
    if (!isStaleBuildError) {
      return;
    }

    hardReloadForStaleBuild();
  }, [isStaleBuildError]);

  const onCopyCrashReport = async () => {
    const report = [
      "In-Accord Fatal Crash Report",
      `Timestamp: ${new Date().toISOString()}`,
      `Route: ${typeof window !== "undefined" ? window.location.href : "unknown"}`,
      `Reason: ${error?.message || "Something went wrong at the application level."}`,
      error?.digest ? `Digest: ${error.digest}` : null,
      error?.stack ? `Stack:\n${error.stack}` : null,
      `User Agent: ${typeof navigator !== "undefined" ? navigator.userAgent : "unknown"}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      await navigator.clipboard.writeText(report);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  return (
    <html lang="en">
      <body className="bg-[#313338] text-white">
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#1e1f22] p-6 shadow-xl">
            <h2 className="text-lg font-bold">A fatal error occurred</h2>
            <p className="mt-2 text-sm text-zinc-300">Crash reason:</p>
            <div className="mt-2 rounded-md border border-white/10 bg-black/20 p-3 text-xs text-zinc-200 whitespace-pre-wrap wrap-break-word">
              <p>{error?.message || "Something went wrong at the application level."}</p>
              {error?.digest ? <p className="mt-1">Digest: {error.digest}</p> : null}
            </div>
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
                onClick={() => {
                  if (!hardReloadForStaleBuild()) {
                    window.location.reload();
                  }
                }}
                className="rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/5"
              >
                {isStaleBuildError ? "Reload latest build" : "Refresh"}
              </button>
              <button
                type="button"
                onClick={() => void onCopyCrashReport()}
                className="rounded-md border border-amber-300/25 px-3 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-300/10"
              >
                Copy crash report
              </button>
            </div>
            {copyStatus === "copied" ? (
              <p className="mt-2 text-xs text-emerald-300">Crash report copied.</p>
            ) : null}
            {copyStatus === "failed" ? (
              <p className="mt-2 text-xs text-rose-300">Could not copy crash report.</p>
            ) : null}
          </div>
        </div>
      </body>
    </html>
  );
}
