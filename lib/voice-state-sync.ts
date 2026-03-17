export const VOICE_STATE_SYNC_EVENT = "inaccord:voice-state-sync";

const INACCORD_VOICE_STATE_KEY = "__INACCORD_VOICE_STATE__";

export type VoiceStateSyncDetail = {
  active?: boolean;
  isMuted?: boolean;
  isDeafened?: boolean;
  isVideoChannel?: boolean;
  isCameraOn?: boolean;
  isStreaming?: boolean;
  streamLabel?: string | null;
};

declare global {
  interface Window {
    __INACCORD_VOICE_STATE__?: VoiceStateSyncDetail;
  }
}

export const getCachedVoiceState = (): VoiceStateSyncDetail | null => {
  if (typeof window === "undefined") {
    return null;
  }

  return window[INACCORD_VOICE_STATE_KEY] ?? null;
};

export const publishVoiceState = (detail: VoiceStateSyncDetail) => {
  if (typeof window === "undefined") {
    return;
  }

  window[INACCORD_VOICE_STATE_KEY] = detail;
  window.dispatchEvent(new CustomEvent(VOICE_STATE_SYNC_EVENT, { detail }));
};