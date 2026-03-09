"use client";

import { Headphones, Mic } from "lucide-react";
import { useEffect, useState } from "react";

const VOICE_TOGGLE_MUTE_EVENT = "inaccord:voice-toggle-mute";
const VOICE_TOGGLE_DEAFEN_EVENT = "inaccord:voice-toggle-deafen";

export const UserAudioControls = () => {
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

  const onToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    window.dispatchEvent(new CustomEvent(VOICE_TOGGLE_MUTE_EVENT, { detail: { isMuted: next } }));
  };

  const onToggleDeafen = () => {
    const next = !isDeafened;
    setIsDeafened(next);
    window.dispatchEvent(new CustomEvent(VOICE_TOGGLE_DEAFEN_EVENT, { detail: { isDeafened: next } }));
  };

  useEffect(() => {
    const syncFromSession = (event: Event) => {
      const customEvent = event as CustomEvent<{ isMuted?: boolean; isDeafened?: boolean }>;
      if (typeof customEvent.detail?.isMuted === "boolean") {
        setIsMuted(customEvent.detail.isMuted);
      }
      if (typeof customEvent.detail?.isDeafened === "boolean") {
        setIsDeafened(customEvent.detail.isDeafened);
      }
    };

    window.addEventListener("inaccord:voice-state-sync", syncFromSession as EventListener);

    return () => {
      window.removeEventListener("inaccord:voice-state-sync", syncFromSession as EventListener);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        title={isMuted ? "Unmute" : "Mute"}
        onClick={onToggleMute}
        className={`rounded p-1 transition ${isMuted ? "bg-rose-500/25 text-rose-300" : "hover:bg-[#3f4248]"}`}
      >
        <Mic className="h-3.5 w-3.5" suppressHydrationWarning />
      </button>
      <button
        type="button"
        title={isDeafened ? "Undeafen" : "Deafen"}
        onClick={onToggleDeafen}
        className={`rounded p-1 transition ${isDeafened ? "bg-rose-500/25 text-rose-300" : "hover:bg-[#3f4248]"}`}
      >
        <Headphones className="h-3.5 w-3.5" suppressHydrationWarning />
      </button>
    </>
  );
};
