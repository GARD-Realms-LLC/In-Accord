"use client";

import { useEffect, useState } from "react";

const PROBE_ROLES = ["gamma", "alpha", "epsilon", "beta", "delta"] as const;

export default function WebRtcMeetingPanelProbePage() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setVersion(params.get("v") ?? String(Date.now()));
  }, []);

  if (!version) {
    return <main className="min-h-screen bg-black" />;
  }

  return (
    <main className="min-h-screen bg-black px-4 py-4 text-zinc-100">
      <div className="mb-3">
        <h1 className="text-lg font-semibold">Actual meeting panel probe</h1>
        <p className="text-sm text-zinc-400">
          Five isolated iframe clients mount the real meeting panel component in a scrambled join order and report live transport state.
        </p>
      </div>

      <div className="grid min-h-[85vh] grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        {PROBE_ROLES.map((role) => (
          <iframe
            key={role}
            title={`meeting-panel-probe-${role}`}
            src={`/webrtc-panel-probe/client?role=${encodeURIComponent(role)}&v=${encodeURIComponent(version)}`}
            className="h-full min-h-[72vh] w-full rounded-lg border border-zinc-700 bg-zinc-950"
          />
        ))}
      </div>
    </main>
  );
}