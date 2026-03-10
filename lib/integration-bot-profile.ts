const normalizeBotSegment = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);

export const makeIntegrationBotProfileId = (ownerProfileId: string, botConfigId: string) => {
  const normalizedOwner = normalizeBotSegment(ownerProfileId);
  const normalizedBot = normalizeBotSegment(botConfigId);
  return `botcfg_${normalizedOwner}_${normalizedBot}`.slice(0, 180);
};

export const getIntegrationBotProfilePrefix = (ownerProfileId: string) => {
  const normalizedOwner = normalizeBotSegment(ownerProfileId);
  return `botcfg_${normalizedOwner}_`;
};

export const isOwnedIntegrationBotProfile = (ownerProfileId: string, profileId: string) => {
  const prefix = getIntegrationBotProfilePrefix(ownerProfileId);
  return String(profileId ?? "").startsWith(prefix);
};
