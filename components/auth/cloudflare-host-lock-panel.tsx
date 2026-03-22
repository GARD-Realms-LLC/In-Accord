"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cloud, LockKeyhole } from "lucide-react";

type CloudflareHostLockPanelProps = {
  nextTarget: string;
};

export const CloudflareHostLockPanel = ({ nextTarget }: CloudflareHostLockPanelProps) => {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const unlock = async () => {
    if (isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);
      setMessage(null);

      const response = await fetch("/api/cloudflare-host-lock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pin }),
      });

      if (!response.ok) {
        const errorText = (await response.text()) || "Unlock failed.";
        setMessage(errorText);
        return;
      }

      router.replace(nextTarget);
      router.refresh();
    } catch {
      setMessage("Unlock failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0d12] px-4 py-10 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#11141b] p-6 shadow-2xl shadow-black/40">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 p-3 text-cyan-300">
            <Cloud className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Cloudflare hosting required</h1>
            <p className="text-sm text-[#aeb4bf]">This build is locked to Cloudflare-routed hosting.</p>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#171b24] p-4 text-sm text-[#cfd5df]">
          <p>
            If you need to disable this lock on this browser, enter the PIN below.
          </p>
          <p className="mt-2 text-xs text-[#8f98a8]">
            After unlock, this browser can continue to the requested page until the bypass expires or is cleared.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[#8f98a8]">
            Unlock PIN
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0f1218] px-3 py-2">
            <LockKeyhole className="h-4 w-4 text-[#8f98a8]" />
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              type="password"
              inputMode="numeric"
              placeholder="Enter PIN"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#6f7785]"
            />
          </div>

          {message ? <p className="text-sm text-rose-300">{message}</p> : null}

          <button
            type="button"
            onClick={() => void unlock()}
            disabled={isSubmitting}
            className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/15 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Unlocking..." : "Unlock with PIN"}
          </button>
        </div>
      </div>
    </main>
  );
};
