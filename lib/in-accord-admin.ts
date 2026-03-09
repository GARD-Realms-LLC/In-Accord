const IN_ACCORD_ADMIN_ROLE_ALIASES = new Set([
  "ADMIN",
  "ADMINISTRATOR",
]);

const IN_ACCORD_DEVELOPER_ROLE_ALIASES = new Set([
  "DEVELOPER",
]);

const IN_ACCORD_MODERATOR_ROLE_ALIASES = new Set([
  "MODERATOR",
  "MOD",
]);

const IN_ACCORD_PARENT_ROLE_ALIASES = new Set([
  "PARENT",
  "PARENT_ROLE",
  "FAMILY",
  "FAMILY_ROLE",
]);

export const normalizeInAccordRole = (role: string | null | undefined) =>
  (role ?? "").trim().toUpperCase();

export const isInAccordDeveloper = (role: string | null | undefined) => {
  const normalizedRole = normalizeInAccordRole(role);
  return IN_ACCORD_DEVELOPER_ROLE_ALIASES.has(normalizedRole);
};

export const isInAccordModerator = (role: string | null | undefined) => {
  const normalizedRole = normalizeInAccordRole(role);
  return IN_ACCORD_MODERATOR_ROLE_ALIASES.has(normalizedRole);
};

export const isInAccordAdministrator = (role: string | null | undefined) => {
  const normalizedRole = normalizeInAccordRole(role);
  return IN_ACCORD_ADMIN_ROLE_ALIASES.has(normalizedRole);
};

export const isInAccordParent = (role: string | null | undefined) => {
  const normalizedRole = normalizeInAccordRole(role);
  return IN_ACCORD_PARENT_ROLE_ALIASES.has(normalizedRole);
};

export const hasInAccordAdministrativeAccess = (role: string | null | undefined) =>
  isInAccordAdministrator(role) || isInAccordDeveloper(role) || isInAccordModerator(role);

export const getInAccordStaffLabel = (role: string | null | undefined) => {
  if (isInAccordAdministrator(role)) {
    return "Administrator";
  }

  if (isInAccordDeveloper(role)) {
    return "Developer";
  }

  if (isInAccordModerator(role)) {
    return "Moderator";
  }

  return null;
};
