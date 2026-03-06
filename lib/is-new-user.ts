const NEW_USER_WINDOW_DAYS = 6;
const NEW_USER_WINDOW_MS = NEW_USER_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export const isNewUser = (createdAt?: Date | string | null) => {
  if (!createdAt) {
    return false;
  }

  const parsed = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return Date.now() - parsed.getTime() <= NEW_USER_WINDOW_MS;
};
