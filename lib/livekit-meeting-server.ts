import "server-only";

export type LiveKitServerConfig = {
  url: string;
  apiKey: string;
  apiSecret: string;
};

const normalizeEnvValue = (value: string | undefined) => String(value ?? "").trim();

export const buildMeetingRoomName = (serverId: string, channelId: string) => {
  const normalizedServerId = String(serverId ?? "").trim();
  const normalizedChannelId = String(channelId ?? "").trim();
  return `in-accord:${normalizedServerId}:${normalizedChannelId}`;
};

export const getLiveKitServerConfig = (): LiveKitServerConfig => {
  const url = normalizeEnvValue(process.env.NEXT_PUBLIC_LIVEKIT_URL);
  const apiKey = normalizeEnvValue(process.env.LIVEKIT_API_KEY);
  const apiSecret = normalizeEnvValue(process.env.LIVEKIT_API_SECRET);

  if (!url || !apiKey || !apiSecret) {
    throw new Error(
      "LiveKit SFU is not configured. Set NEXT_PUBLIC_LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET."
    );
  }

  return {
    url,
    apiKey,
    apiSecret,
  };
};
