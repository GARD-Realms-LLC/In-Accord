import { getDecryptedOtherBotToken, getUserPreferences, updateOtherBotCommands } from "@/lib/user-preferences";

type DiscordApplicationCommand = {
  id?: string;
  name?: string;
  type?: number;
};

export const importOtherBotCommandsForOwner = async ({
  ownerProfileId,
  botId,
}: {
  ownerProfileId: string;
  botId: string;
}): Promise<{ importedCount: number; commands: string[]; botName: string }> => {
  const normalizedOwnerProfileId = String(ownerProfileId ?? "").trim();
  const normalizedBotId = String(botId ?? "").trim();

  if (!normalizedOwnerProfileId) {
    throw new Error("Missing owner profile id.");
  }

  if (!normalizedBotId) {
    throw new Error("Missing bot id.");
  }

  const preferences = await getUserPreferences(normalizedOwnerProfileId);
  const bot = preferences.OtherBots.find((item) => item.id === normalizedBotId);

  if (!bot) {
    throw new Error("Bot not found.");
  }

  const token = await getDecryptedOtherBotToken(normalizedOwnerProfileId, normalizedBotId);

  if (!token) {
    throw new Error("This bot has no stored token. Edit the bot and save a valid token first.");
  }

  const applicationId = bot.applicationId.trim();
  if (!applicationId) {
    throw new Error("Bot is missing an Application ID.");
  }

  const response = await fetch(`https://discord.com/api/v10/applications/${applicationId}/commands`, {
    headers: {
      Authorization: `Bot ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const fallback = response.status === 401 ? "Discord rejected the bot token." : "Discord command import failed.";
    const detail = await response.text().catch(() => "");
    throw new Error(detail.trim().length > 0 ? `${fallback} (${detail.slice(0, 180)})` : fallback);
  }

  const payload = (await response.json().catch(() => [])) as unknown;
  const commands = Array.isArray(payload)
    ? payload
        .filter((item): item is DiscordApplicationCommand => Boolean(item) && typeof item === "object")
        .filter((item) => item.type === 1 || typeof item.type !== "number")
        .map((item) => (typeof item.name === "string" ? item.name : ""))
        .filter((name) => name.trim().length > 0)
    : [];

  const updatedBot = await updateOtherBotCommands(normalizedOwnerProfileId, normalizedBotId, commands);

  if (!updatedBot) {
    throw new Error("No valid slash commands were found to import for this bot.");
  }

  return {
    importedCount: updatedBot.commands.length,
    commands: updatedBot.commands,
    botName: updatedBot.name,
  };
};
