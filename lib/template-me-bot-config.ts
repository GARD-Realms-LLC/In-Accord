import { getUserPreferences, updateUserPreferences, type OtherBotConfig } from "@/lib/user-preferences";

export const TEMPLATE_ME_BOT_NAME = "Template Me Bot";
export const TEMPLATE_ME_BOT_FALLBACK_APPLICATION_ID = "000000000000000000";

const normalizeTemplateBotName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/["'`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

const createConfigId = () => `cfg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const sortTemplateCandidates = (left: OtherBotConfig, right: OtherBotConfig) => {
  const leftTokenUpdated = new Date(left.tokenUpdatedAt ?? 0).getTime();
  const rightTokenUpdated = new Date(right.tokenUpdatedAt ?? 0).getTime();

  const safeLeftTokenUpdated = Number.isNaN(leftTokenUpdated) ? 0 : leftTokenUpdated;
  const safeRightTokenUpdated = Number.isNaN(rightTokenUpdated) ? 0 : rightTokenUpdated;
  if (safeLeftTokenUpdated !== safeRightTokenUpdated) {
    return safeRightTokenUpdated - safeLeftTokenUpdated;
  }

  const leftCreated = new Date(left.createdAt ?? 0).getTime();
  const rightCreated = new Date(right.createdAt ?? 0).getTime();
  const safeLeftCreated = Number.isNaN(leftCreated) ? 0 : leftCreated;
  const safeRightCreated = Number.isNaN(rightCreated) ? 0 : rightCreated;

  return safeRightCreated - safeLeftCreated;
};

export const isTemplateMeBotName = (value: unknown) => normalizeTemplateBotName(value) === "template me bot";

export const ensureTemplateMeBotConfigForUser = async (userId: string): Promise<OtherBotConfig> => {
  const preferences = await getUserPreferences(userId);
  const allBots = [...preferences.OtherBots];
  const templateBots = allBots.filter((item) => isTemplateMeBotName(item.name));

  if (templateBots.length === 0) {
    const created: OtherBotConfig = {
      id: createConfigId(),
      name: TEMPLATE_ME_BOT_NAME,
      applicationId: TEMPLATE_ME_BOT_FALLBACK_APPLICATION_ID,
      botUserId: "",
      tokenHint: "",
      commands: ["help", "ping", "echo"],
      permissions: [],
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    await updateUserPreferences(userId, {
      OtherBots: [...allBots, created],
    });

    return created;
  }

  const [primary] = [...templateBots].sort(sortTemplateCandidates);
  let hasChanges = false;

  const nextBots = allBots
    .filter((item) => !isTemplateMeBotName(item.name) || item.id === primary.id)
    .map((item) => {
      if (item.id !== primary.id) {
        return item;
      }

      const nextName = TEMPLATE_ME_BOT_NAME;
      if (item.name === nextName) {
        return item;
      }

      hasChanges = true;
      return {
        ...item,
        name: nextName,
      };
    });

  if (nextBots.length !== allBots.length) {
    hasChanges = true;
  }

  if (hasChanges) {
    await updateUserPreferences(userId, { OtherBots: nextBots });
    const updatedPrimary = nextBots.find((item) => item.id === primary.id);
    if (updatedPrimary) {
      return updatedPrimary;
    }
  }

  return primary;
};