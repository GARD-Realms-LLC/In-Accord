import { ChannelType } from "@/lib/db";

const EXCLUDED_DEFAULT_CHANNEL_NAMES = new Set([
  "rules",
  "inabord",
  "inaboard",
  "ourguide",
  "ourevents",
  "outevents",
  "ourmembers",
  "ourboosters",
  "invites",
  "ourstage",
]);

type ServerChannelCandidate = {
  id: string;
  name: string;
  type: ChannelType;
};

const normalizeDefaultChannelName = (value: string) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
};

const isExcludedDefaultChannelName = (name: string) => {
  return EXCLUDED_DEFAULT_CHANNEL_NAMES.has(normalizeDefaultChannelName(name));
};

export const pickDefaultServerChannel = <T extends ServerChannelCandidate>(channels: T[]) => {
  const visibleTextChannels = channels.filter(
    (item) => item.type === ChannelType.TEXT || item.type === ChannelType.ANNOUNCEMENT
  );
  const preferredTextChannel = visibleTextChannels.find((item) => !isExcludedDefaultChannelName(item.name));

  if (preferredTextChannel) {
    return preferredTextChannel;
  }

  return visibleTextChannels[0] ?? channels[0] ?? null;
};